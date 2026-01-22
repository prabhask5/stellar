/**
 * Stellar Focus Extension - Background Service Worker
 * Handles focus session polling and website blocking
 * CRITICAL: Only blocks websites when ONLINE and authenticated
 */

import browser from 'webextension-polyfill';
import { type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getSession, getUser } from '../auth/supabase';
import { blockListsCache, blockedWebsitesCache, focusSessionCacheStore, type FocusSessionCache } from '../lib/storage';
import { getNetworkStatus, checkConnectivity, getSupabaseUrl } from '../lib/network';

// Polling interval for focus session status (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Track current state
let currentFocusSession: FocusSessionCache | null = null;
let isOnline = getNetworkStatus();
let pollAlarmName = 'focus-poll';

// Rate limiting to prevent excessive polling (egress optimization)
let lastPollTime = 0;
const MIN_POLL_INTERVAL_MS = 25000; // Minimum 25 seconds between polls
let realtimeHealthy = false; // Track if realtime subscriptions are working

// Real-time subscriptions
let focusSessionChannel: RealtimeChannel | null = null;
let blockListChannel: RealtimeChannel | null = null;
let blockedWebsitesChannel: RealtimeChannel | null = null;

// Initialize
browser.runtime.onInstalled.addListener(() => {
  console.log('[Stellar Focus] Extension installed');
  setupAlarm();
  init();
});

browser.runtime.onStartup.addListener(() => {
  console.log('[Stellar Focus] Browser started');
  setupAlarm();
  init();
});

// Set up polling alarm
function setupAlarm() {
  browser.alarms.create(pollAlarmName, {
    periodInMinutes: POLL_INTERVAL_MS / 60000
  });
}

// Handle alarm with rate limiting
browser.alarms.onAlarm.addListener((alarm: browser.Alarms.Alarm) => {
  if (alarm.name === pollAlarmName) {
    // Skip polling if realtime is working (egress optimization)
    if (realtimeHealthy) {
      console.log('[Stellar Focus] Skipping poll - realtime is healthy');
      return;
    }
    pollFocusSessionThrottled();
  }
});

// Throttled poll to prevent excessive requests
async function pollFocusSessionThrottled() {
  const now = Date.now();
  if (now - lastPollTime < MIN_POLL_INTERVAL_MS) {
    console.log('[Stellar Focus] Skipping poll - too soon (rate limited)');
    return;
  }
  lastPollTime = now;
  await pollFocusSession();
}

// Listen for network changes
if (typeof navigator !== 'undefined') {
  // Note: Service workers don't have window, using navigator
  // We need to use different approach for service workers
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message: { type: string }, _sender: browser.Runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  if (message.type === 'CHECK_UPDATE') {
    // Firefox handles updates automatically through AMO
    // Just return false - no manual update check available
    sendResponse({ updateAvailable: false });
    return;
  }

  if (message.type === 'BLOCK_LIST_UPDATED') {
    // Refresh block lists cache
    refreshBlockLists();
    return;
  }

  if (message.type === 'FOCUS_SESSION_UPDATED') {
    // Refresh focus session state (throttled to prevent spam)
    pollFocusSessionThrottled();
    return;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({
      isOnline,
      focusActive: currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus'
    });
    return;
  }
});

// Web navigation blocking
browser.webNavigation.onBeforeNavigate.addListener(async (details: browser.WebNavigation.OnBeforeNavigateDetailsType) => {
  // Only block main frame navigations
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const hostname = url.hostname;

  // Skip internal URLs
  if (hostname === '' || url.protocol === 'moz-extension:' || url.protocol === 'about:') return;

  // Debug: Log navigation attempts for common distracting sites
  const debugDomains = ['youtube.com', 'twitter.com', 'facebook.com', 'reddit.com', 'instagram.com'];
  const isDebugDomain = debugDomains.some(d => hostname.includes(d));

  if (isDebugDomain) {
    console.log('[Stellar Focus] Navigation to:', hostname, {
      isOnline,
      hasSession: !!currentFocusSession,
      sessionStatus: currentFocusSession?.status,
      sessionPhase: currentFocusSession?.phase
    });
  }

  // CRITICAL: Don't block if offline
  if (!isOnline) return;

  // Check if we have an active focus session
  if (!currentFocusSession || currentFocusSession.status !== 'running') return;

  // Only block during focus phase, not during breaks
  if (currentFocusSession.phase !== 'focus') return;

  // Check if the URL should be blocked
  const shouldBlock = await isDomainBlocked(hostname);

  if (isDebugDomain) {
    console.log('[Stellar Focus] Should block', hostname, ':', shouldBlock);
  }

  if (shouldBlock) {
    console.log('[Stellar Focus] 🚫 Blocking:', hostname);
    // Redirect to blocked page
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );

    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});

async function init() {
  // Check online status
  isOnline = await checkConnectivity(getSupabaseUrl());

  // Load cached focus session
  const cached = await focusSessionCacheStore.get('current');
  if (cached) {
    currentFocusSession = cached;
  }

  // Initial poll
  await pollFocusSession();

  // Load block lists
  await refreshBlockLists();

  // Set up real-time subscriptions for instant updates
  await setupRealtimeSubscriptions();
}

// Set up real-time subscriptions for instant updates
async function setupRealtimeSubscriptions() {
  if (!isOnline) return;

  const session = await getSession();
  if (!session) return;

  const user = await getUser();
  if (!user) return;

  const supabase = getSupabase();

  // Clean up existing subscriptions
  cleanupRealtimeSubscriptions();

  // Set auth token for realtime
  supabase.realtime.setAuth(session.access_token);

  const timestamp = Date.now();

  // Subscribe to focus sessions changes
  focusSessionChannel = supabase
    .channel(`sw-focus-sessions-${user.id}-${timestamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Focus session update', payload.eventType);
        // Use the payload data directly instead of making another query
        // This reduces egress since realtime already includes the data
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const session = payload.new as FocusSessionCache & { ended_at?: string | null };
          if (!session.ended_at) {
            // Active session - update cache directly
            const sessionData: FocusSessionCache = {
              id: 'current',
              user_id: session.user_id,
              phase: session.phase,
              status: session.status,
              phase_started_at: session.phase_started_at,
              focus_duration: session.focus_duration,
              break_duration: session.break_duration,
              cached_at: new Date().toISOString()
            };
            focusSessionCacheStore.put(sessionData).then(() => {
              currentFocusSession = sessionData;
              // Only refresh block lists when session starts (phase becomes focus)
              if (session.status === 'running' && session.phase === 'focus') {
                refreshBlockLists();
              }
            });
          } else {
            // Session ended
            focusSessionCacheStore.clear().then(() => {
              currentFocusSession = null;
            });
          }
        } else if (payload.eventType === 'DELETE') {
          focusSessionCacheStore.clear().then(() => {
            currentFocusSession = null;
          });
        }
      }
    )
    .subscribe((status) => {
      console.log('[Stellar Focus] Focus session subscription:', status);
      if (status === 'SUBSCRIBED') {
        realtimeHealthy = true;
        console.log('[Stellar Focus] ✅ Realtime healthy - disabling polling fallback');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeHealthy = false;
        console.log('[Stellar Focus] ❌ Realtime unhealthy - polling enabled');
      }
    });

  // Subscribe to block lists changes
  blockListChannel = supabase
    .channel(`sw-block-lists-${user.id}-${timestamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'block_lists',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Block list update', payload.eventType);
        refreshBlockLists();
      }
    )
    .subscribe((status) => {
      console.log('[Stellar Focus] Block list subscription:', status);
    });

  // Subscribe to blocked websites changes (most important for instant blocking)
  blockedWebsitesChannel = supabase
    .channel(`sw-blocked-websites-${user.id}-${timestamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'blocked_websites'
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Blocked website update', payload.eventType);
        // Refresh block lists to get the updated websites
        refreshBlockLists();
      }
    )
    .subscribe((status) => {
      console.log('[Stellar Focus] Blocked websites subscription:', status);
    });

  console.log('[Stellar Focus] Real-time subscriptions set up');
}

// Clean up real-time subscriptions
function cleanupRealtimeSubscriptions() {
  const supabase = getSupabase();

  if (focusSessionChannel) {
    supabase.removeChannel(focusSessionChannel);
    focusSessionChannel = null;
  }
  if (blockListChannel) {
    supabase.removeChannel(blockListChannel);
    blockListChannel = null;
  }
  if (blockedWebsitesChannel) {
    supabase.removeChannel(blockedWebsitesChannel);
    blockedWebsitesChannel = null;
  }
}

async function pollFocusSession() {
  // Check connectivity first
  const wasOnline = isOnline;
  isOnline = await checkConnectivity(getSupabaseUrl());

  if (!isOnline) {
    console.log('[Stellar Focus] Offline - skipping poll');
    cleanupRealtimeSubscriptions();
    return;
  }

  // Re-setup subscriptions if we just came back online
  if (!wasOnline && isOnline) {
    console.log('[Stellar Focus] Back online - setting up real-time subscriptions');
    await setupRealtimeSubscriptions();
  }

  try {
    // Check auth - no offline fallback, must be online and logged in
    const session = await getSession();
    if (!session) {
      currentFocusSession = null;
      await focusSessionCacheStore.clear();
      cleanupRealtimeSubscriptions();
      return;
    }

    const user = await getUser();
    if (!user) return;

    // Query active focus session
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && !error) {
      const session = data[0];

      // Check if focus session just started (wasn't running before, now it is)
      const wasRunning = currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus';
      const isNowRunning = session.status === 'running' && session.phase === 'focus';

      // Update cached session
      const sessionData: FocusSessionCache = {
        id: 'current',
        user_id: session.user_id,
        phase: session.phase,
        status: session.status,
        phase_started_at: session.phase_started_at,
        focus_duration: session.focus_duration,
        break_duration: session.break_duration,
        cached_at: new Date().toISOString()
      };

      await focusSessionCacheStore.put(sessionData);
      currentFocusSession = sessionData;

      // Refresh block lists when focus session starts to ensure we have latest data
      if (!wasRunning && isNowRunning) {
        console.log('[Stellar Focus] Focus session started - refreshing block lists');
        await refreshBlockLists();
      }

      console.log('[Stellar Focus] Focus session active:', session.phase, session.status);
    } else {
      // No active session
      await focusSessionCacheStore.clear();
      currentFocusSession = null;

      console.log('[Stellar Focus] No active focus session');
    }
  } catch (error) {
    console.error('[Stellar Focus] Poll error:', error);
  }
}

async function refreshBlockLists() {
  if (!isOnline) return;

  try {
    // Must be online and authenticated
    const session = await getSession();
    if (!session) return;

    const user = await getUser();
    if (!user) return;

    const supabase = getSupabase();

    // Fetch block lists
    const { data: lists, error: listsError } = await supabase
      .from('block_lists')
      .select('*')
      .eq('user_id', user.id)
      .eq('deleted', false)
      .eq('is_enabled', true);

    if (lists && !listsError) {
      // Clear and update cache
      await blockListsCache.clear();
      for (const list of lists) {
        await blockListsCache.put({
          id: list.id,
          user_id: list.user_id,
          name: list.name,
          active_days: list.active_days,
          is_enabled: list.is_enabled,
          order: list.order
        });
      }

      // Fetch blocked websites for enabled lists
      const enabledListIds = lists.map(l => l.id);

      if (enabledListIds.length > 0) {
        const { data: websites, error: websitesError } = await supabase
          .from('blocked_websites')
          .select('*')
          .in('block_list_id', enabledListIds)
          .eq('deleted', false);

        if (websites && !websitesError) {
          await blockedWebsitesCache.clear();
          for (const website of websites) {
            await blockedWebsitesCache.put({
              id: website.id,
              block_list_id: website.block_list_id,
              domain: website.domain
            });
          }
        }
      }

      console.log('[Stellar Focus] Block lists refreshed:', lists.length, 'lists');
    }
  } catch (error) {
    console.error('[Stellar Focus] Block lists refresh error:', error);
  }
}

async function isDomainBlocked(hostname: string): Promise<boolean> {
  try {
    // Normalize hostname (remove www prefix, lowercase)
    const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');

    // Get current day of week (0=Sunday, 6=Saturday)
    const currentDay = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Get all block lists and websites from cache
    const blockLists = await blockListsCache.getAll();
    const blockedWebsites = await blockedWebsitesCache.getAll();

    // Check if hostname matches any blocked domain from an active list
    for (const website of blockedWebsites) {
      // Find the block list for this website
      const list = blockLists.find(l => l.id === website.block_list_id);
      if (!list) continue;

      // Check if list is active today
      // active_days null means all days, otherwise check if current day is in the array
      if (list.active_days !== null && !list.active_days.includes(currentDay)) {
        continue; // Skip this website - list not active today
      }

      const blockedDomain = website.domain.toLowerCase().replace(/^www\./, '');

      // Exact match
      if (normalizedHostname === blockedDomain) {
        return true;
      }

      // Subdomain match (e.g., mail.google.com matches google.com)
      if (normalizedHostname.endsWith('.' + blockedDomain)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[Stellar Focus] Domain check error:', error);
    return false;
  }
}

// Initialize on load
init();
