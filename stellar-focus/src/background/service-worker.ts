/**
 * Stellar Focus Extension - Background Service Worker
 * Handles focus session polling and website blocking
 * CRITICAL: Only blocks websites when ONLINE and authenticated
 *
 * EGRESS OPTIMIZATIONS:
 * - Single consolidated realtime channel (instead of 3 separate)
 * - Explicit column selection (no SELECT *)
 * - Uses realtime payload data directly (avoids re-fetching)
 * - Uses session.user instead of separate getUser() calls
 */

import browser from 'webextension-polyfill';
import { type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getSession, resetSupabase } from '../auth/supabase';
import { isConfigured, getConfig, getGateConfig, setGateConfig, clearGateConfig, isUnlocked, setUnlocked } from '../config';
import { blockListsCache, blockedWebsitesCache, focusSessionCacheStore, type FocusSessionCache } from '../lib/storage';
import { getNetworkStatus, checkConnectivity } from '../lib/network';
import { debugLog, debugWarn, debugError, initDebugMode, setDebugModeCache } from '../lib/debug';

// Initialize debug mode from storage
initDebugMode();

// Listen for debug mode changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.stellar_debug_mode) {
    setDebugModeCache(changes.stellar_debug_mode.newValue === true);
  }
});

// Polling interval for focus session status (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Track current state
let currentFocusSession: FocusSessionCache | null = null;
let isOnline = getNetworkStatus();
const ALARM_PRIMARY = 'focus-poll';
const ALARM_SECONDARY = 'focus-poll-2';

// Rate limiting to prevent excessive polling (egress optimization)
let lastPollTime = 0;
const MIN_POLL_INTERVAL_MS = 25000; // Minimum 25 seconds between polls
let realtimeHealthy = false; // Track if realtime subscriptions are working

// Single consolidated realtime channel (egress optimization)
let realtimeChannel: RealtimeChannel | null = null;

// Track auth state change subscription to prevent listener stacking
let authStateUnsubscribe: (() => void) | null = null;

// Concurrency guards to prevent overlapping async operations that create
// orphaned WebSocket channels or duplicated state
let initRunning = false;
let setupRealtimeRunning = false;

// Track reconnection timeout so we can cancel stacked retries
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

// Explicit column definitions to reduce egress (no SELECT *)
const COLUMNS = {
  focus_sessions: 'id,user_id,phase,status,phase_started_at,focus_duration,break_duration,ended_at',
  block_lists: 'id,user_id,name,active_days,is_enabled,order,deleted',
  blocked_websites: 'id,block_list_id,domain,deleted'
} as const;

// Initialize
browser.runtime.onInstalled.addListener(async () => {
  debugLog('[Stellar Focus] Extension installed');
  const configured = await isConfigured();
  if (!configured) {
    // Open options page for first-time setup
    browser.runtime.openOptionsPage();
    return;
  }
  setupAlarm();
  init();
});

browser.runtime.onStartup.addListener(async () => {
  debugLog('[Stellar Focus] Browser started');
  const configured = await isConfigured();
  if (!configured) return;
  setupAlarm();
  init();
});

// Set up two staggered alarms to wake the event page ~every 30 seconds
// Firefox enforces a 1-minute minimum for MV3 alarms, so two alarms
// offset by 30 seconds give us wake-ups roughly every 30 seconds
function setupAlarm() {
  browser.alarms.create(ALARM_PRIMARY, {
    periodInMinutes: 1
  });
  // Second alarm offset by 30 seconds
  browser.alarms.create(ALARM_SECONDARY, {
    delayInMinutes: 0.5,
    periodInMinutes: 1
  });
}

// Handle alarm — reconnect realtime if unhealthy, always poll to catch missed updates
browser.alarms.onAlarm.addListener((alarm: browser.Alarms.Alarm) => {
  if (alarm.name === ALARM_PRIMARY || alarm.name === ALARM_SECONDARY) {
    handleAlarmWake();
  }
});

async function handleAlarmWake() {
  // Skip if not unlocked
  const unlocked = await isUnlocked();
  if (!unlocked) {
    // Re-validate gate config from RPC (catches user deletion/reset)
    await tryFetchGateConfig();
    return;
  }

  // If realtime is down, try to reconnect it
  if (!realtimeHealthy) {
    debugLog('[Stellar Focus] Alarm wake - realtime unhealthy, reconnecting');
    await setupRealtimeSubscriptions();
  }
  // Always poll to catch updates missed during any disconnection gap
  await pollFocusSessionThrottled();
}

// Throttled poll to prevent excessive requests
async function pollFocusSessionThrottled() {
  const now = Date.now();
  if (now - lastPollTime < MIN_POLL_INTERVAL_MS) {
    debugLog('[Stellar Focus] Skipping poll - too soon (rate limited)');
    return;
  }
  lastPollTime = now;
  await pollFocusSession();
}

/**
 * Try to fetch gate config from Supabase RPC.
 * If the RPC returns data, cache it and notify the popup.
 * If the RPC returns no data (user deleted/reset), clear stale cache.
 */
async function tryFetchGateConfig() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('get_extension_config');

    if (error) {
      debugWarn('[Stellar Focus] Gate config RPC error:', error.message);
      return;
    }

    if (!data || !data.email) {
      // No user exists in Supabase — clear any stale cached config
      const existing = await getGateConfig();
      if (existing) {
        debugLog('[Stellar Focus] No remote user found — clearing stale gate config');
        await clearGateConfig();
        await setUnlocked(false);
        try {
          await browser.runtime.sendMessage({ type: 'GATE_CONFIG_CLEARED' });
        } catch {
          // Popup not open
        }
      }
      return;
    }

    const gateConfig = {
      gateType: data.gateType || 'code',
      codeLength: data.codeLength || 6,
      email: data.email,
      profile: data.profile || {}
    };
    await setGateConfig(gateConfig);
    debugLog('[Stellar Focus] Gate config fetched from RPC:', gateConfig.email);

    // Notify popup if open
    try {
      await browser.runtime.sendMessage({ type: 'GATE_CONFIG_UPDATED', gateConfig });
    } catch {
      // Popup not open — that's fine
    }
  } catch (e) {
    debugWarn('[Stellar Focus] Failed to fetch gate config:', e);
  }
}

// Listen for network changes
if (typeof navigator !== 'undefined') {
  // Note: Service workers don't have window, using navigator
  // We need to use different approach for service workers
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message: { type: string }, _sender: browser.Runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  // Handle config update from options page
  if (message.type === 'CONFIG_UPDATED') {
    debugLog('[Stellar Focus] Config updated - re-initializing');
    resetSupabase();
    cleanupRealtimeSubscriptions();
    setupAlarm();
    init();
    return;
  }

  if (message.type === 'CHECK_REALTIME') {
    // Popup opened — poll for fresh data if stale, reconnect realtime if needed
    (async () => {
      if (!realtimeHealthy) {
        debugLog('[Stellar Focus] Popup opened - realtime unhealthy, reconnecting');
        setupRealtimeSubscriptions();
      }
      // Poll if data could be stale (last poll > 5 seconds ago)
      const now = Date.now();
      if (now - lastPollTime > 5000) {
        lastPollTime = now;
        await pollFocusSession();
      }
      sendResponse({ ready: true });
    })();
    return true; // Keep message channel open for async response
  }

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

  if (message.type === 'REFRESH_GATE_CONFIG') {
    debugLog('[Stellar Focus] Gate config refresh requested');
    tryFetchGateConfig();
    return;
  }

  if (message.type === 'UNLOCKED') {
    debugLog('[Stellar Focus] Extension unlocked - initializing');
    init().then(() => sendResponse({ ready: true }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'LOCKED') {
    debugLog('[Stellar Focus] Extension locked - cleaning up');
    cleanupRealtimeSubscriptions();
    currentFocusSession = null;
    focusSessionCacheStore.clear();
    return;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({
      isOnline,
      focusActive: currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus'
    });
    return;
  }

  // EGRESS OPTIMIZATION: Popup requests full focus status from service worker
  // instead of making its own Supabase queries
  if (message.type === 'GET_FOCUS_STATUS') {
    sendResponse({
      isOnline,
      realtimeHealthy,
      focusSession: currentFocusSession
    });
    return;
  }

  // EGRESS OPTIMIZATION: Popup requests block lists from service worker cache
  if (message.type === 'GET_BLOCK_LISTS') {
    blockListsCache.getAll().then(lists => {
      sendResponse({ lists });
    });
    return true; // Keep channel open for async response
  }

  // EGRESS OPTIMIZATION: Popup requests today's focus time from service worker
  // instead of making its own Supabase query
  if (message.type === 'GET_FOCUS_TIME_TODAY') {
    (async () => {
      try {
        const session = await getSession();
        if (!session?.user) {
          sendResponse({ totalMs: 0, hasRunningSession: false });
          return;
        }

        const supabase = await getSupabase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        // No user_id filter — RLS handles access (single-user app)
        const { data: sessions, error } = await supabase
          .from('focus_sessions')
          .select(COLUMNS.focus_sessions + ',started_at,elapsed_duration,deleted')
          .gte('started_at', todayStr)
          .order('created_at', { ascending: false });

        if (error) {
          debugError('[Stellar Focus] GET_FOCUS_TIME_TODAY error:', error);
          sendResponse({ totalMs: 0, hasRunningSession: false });
          return;
        }

        let totalMs = 0;
        let hasRunningSession = false;

        for (const s of (sessions as unknown as Record<string, unknown>[] || [])) {
          if (s.deleted) continue;
          totalMs += ((s.elapsed_duration as number) || 0) * 60 * 1000;
          if (!s.ended_at && s.phase === 'focus' && s.status === 'running') {
            hasRunningSession = true;
            const currentElapsed = Date.now() - new Date(s.phase_started_at as string).getTime();
            totalMs += Math.min(currentElapsed, (s.focus_duration as number) * 60 * 1000);
          }
        }

        sendResponse({ totalMs, hasRunningSession });
      } catch (err) {
        debugError('[Stellar Focus] GET_FOCUS_TIME_TODAY error:', err);
        sendResponse({ totalMs: 0, hasRunningSession: false });
      }
    })();
    return true; // Keep channel open for async response
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
    debugLog('[Stellar Focus] Navigation to:', hostname, {
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
    debugLog('[Stellar Focus] Should block', hostname, ':', shouldBlock);
  }

  if (shouldBlock) {
    debugLog('[Stellar Focus] Blocking:', hostname);
    // Redirect to blocked page
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );

    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});

async function init() {
  // Prevent overlapping init() calls (can be triggered by onInstalled, onStartup,
  // UNLOCKED message, CONFIG_UPDATED, and bottom-of-file execution concurrently)
  if (initRunning) {
    debugLog('[Stellar Focus] init() already running - skipping');
    return;
  }
  initRunning = true;

  try {
    await initInner();
  } finally {
    initRunning = false;
  }
}

async function initInner() {
  // Check config availability
  const configured = await isConfigured();
  if (!configured) {
    debugLog('[Stellar Focus] Not configured - skipping init');
    return;
  }

  // Try to fetch gate config if not cached (so popup can show PIN screen)
  const gateConfig = await getGateConfig();
  if (!gateConfig) {
    tryFetchGateConfig();
  }

  // Check if unlocked
  const unlocked = await isUnlocked();
  if (!unlocked) {
    debugLog('[Stellar Focus] Not unlocked - skipping init (alarms still running)');
    return;
  }

  const extConfig = await getConfig();
  if (!extConfig) return;

  // Check online status
  isOnline = await checkConnectivity(extConfig.supabaseUrl);

  if (!isOnline) {
    debugLog('[Stellar Focus] Offline - loading cached data only');
    const cached = await focusSessionCacheStore.get('current');
    if (cached) currentFocusSession = cached;
    return;
  }

  // Check for existing session (user signs in via popup)
  const session = await getSession();
  if (!session) {
    debugLog('[Stellar Focus] No auth session - waiting for user to sign in via popup');
    return;
  }

  // Listen for token refreshes to keep the realtime auth token current.
  // When the access token expires (~1 hour), Supabase auto-refreshes it.
  // Without this, the realtime connection silently loses auth and stops
  // receiving events filtered by RLS.
  // Unsubscribe previous listener to prevent stacking on repeated init() calls.
  if (authStateUnsubscribe) {
    authStateUnsubscribe();
    authStateUnsubscribe = null;
  }
  const supabase = await getSupabase();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
    if (event === 'TOKEN_REFRESHED' && newSession && realtimeChannel) {
      debugLog('[Stellar Focus] Token refreshed — updating realtime auth');
      supabase.realtime.setAuth(newSession.access_token);
    }
    if (event === 'SIGNED_OUT') {
      debugLog('[Stellar Focus] Signed out — cleaning up realtime');
      cleanupRealtimeSubscriptions();
    }
  });
  authStateUnsubscribe = () => subscription.unsubscribe();

  // Load cached focus session
  const cached = await focusSessionCacheStore.get('current');
  if (cached) {
    currentFocusSession = cached;
  }

  // Initial poll (update lastPollTime to prevent alarm from re-polling immediately)
  lastPollTime = Date.now();
  await pollFocusSession();

  // Load block lists
  await refreshBlockLists();

  // Set up real-time subscriptions for instant updates
  await setupRealtimeSubscriptions();
}

// Set up real-time subscriptions for instant updates
// EGRESS OPTIMIZATION: Uses single consolidated channel instead of 3 separate channels
async function setupRealtimeSubscriptions() {
  if (!isOnline) return;

  // Prevent overlapping subscription setups (can be triggered by init, alarm wake,
  // CHECK_REALTIME message, reconnection timeout, and online transition concurrently)
  if (setupRealtimeRunning) {
    debugLog('[Stellar Focus] setupRealtimeSubscriptions() already running - skipping');
    return;
  }
  setupRealtimeRunning = true;

  try {
    const supabase = await getSupabase();

    // Explicitly refresh the session to get a fresh access token.
    // getSession() returns the cached token which may be expired.
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      debugWarn('[Stellar Focus] Session refresh failed:', refreshError.message, '— falling back to cached session');
    }
    const session = refreshData?.session || (await getSession());
    if (!session) return;

    const userId = session.user?.id;
    if (!userId) return;

    // Clean up existing realtime channel (but NOT the auth state listener —
    // that's managed by init() and must survive reconnections)
    await cleanupRealtimeChannel();

  // Set auth token for realtime (must be a fresh, non-expired token)
  supabase.realtime.setAuth(session.access_token);

  const timestamp = Date.now();

  // EGRESS OPTIMIZATION: Single consolidated channel for all tables
  // Explicit user_id filters for reliable delivery (RLS-only filtering
  // requires replica identity full which may not be configured)
  realtimeChannel = supabase
    .channel(`stellar-ext-${timestamp}`)
    // Focus sessions subscription
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        debugLog('[Stellar Focus] Real-time: Focus session update', payload.eventType);
        // Use the payload data directly instead of making another query
        // This reduces egress since realtime already includes the data
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const focusSession = payload.new as FocusSessionCache & { ended_at?: string | null };
          if (!focusSession.ended_at) {
            // Active session - update cache directly
            const sessionData: FocusSessionCache = {
              id: 'current',
              user_id: focusSession.user_id,
              phase: focusSession.phase,
              status: focusSession.status,
              phase_started_at: focusSession.phase_started_at,
              focus_duration: focusSession.focus_duration,
              break_duration: focusSession.break_duration,
              cached_at: new Date().toISOString()
            };
            focusSessionCacheStore.put(sessionData).then(() => {
              currentFocusSession = sessionData;
              // Only refresh block lists when session starts (phase becomes focus)
              if (focusSession.status === 'running' && focusSession.phase === 'focus') {
                refreshBlockLists();
              }
              // Notify popup AFTER cache is updated so GET_FOCUS_STATUS returns fresh data
              notifyPopup('FOCUS_STATUS_CHANGED');
            });
          } else {
            // Session ended
            focusSessionCacheStore.clear().then(() => {
              currentFocusSession = null;
              notifyPopup('FOCUS_STATUS_CHANGED');
            });
          }
        } else if (payload.eventType === 'DELETE') {
          focusSessionCacheStore.clear().then(() => {
            currentFocusSession = null;
            notifyPopup('FOCUS_STATUS_CHANGED');
          });
        }
      }
    )
    // Block lists subscription
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'block_lists',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        debugLog('[Stellar Focus] Real-time: Block list update', payload.eventType);
        // EGRESS OPTIMIZATION: Use payload data directly instead of re-fetching
        handleBlockListRealtimeUpdate(payload);
      }
    )
    // Blocked websites subscription
    // Note: No user_id filter — blocked_websites links through block_list_id, not directly.
    // RLS policies filter at the server level. The handler additionally validates
    // that the block_list_id belongs to the user's cached block lists before processing.
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'blocked_websites'
      },
      (payload) => {
        debugLog('[Stellar Focus] Real-time: Blocked website update', payload.eventType);
        // EGRESS OPTIMIZATION: Use payload data directly instead of re-fetching
        handleBlockedWebsiteRealtimeUpdate(payload);
      }
    )
    .subscribe((status) => {
      debugLog('[Stellar Focus] Realtime subscription:', status);
      if (status === 'SUBSCRIBED') {
        realtimeHealthy = true;
        debugLog('[Stellar Focus] Realtime healthy - disabling polling fallback');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeHealthy = false;
        debugLog('[Stellar Focus] Realtime unhealthy - attempting immediate reconnection');
        // Cancel any pending reconnection to prevent stacked retries
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        // Reconnect with a short delay to avoid tight loops
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          if (!realtimeHealthy) {
            setupRealtimeSubscriptions();
            pollFocusSessionThrottled();
          }
        }, 3000);
      }
    });

    debugLog('[Stellar Focus] Real-time subscription set up (single consolidated channel)');
  } finally {
    setupRealtimeRunning = false;
  }
}

// EGRESS OPTIMIZATION: Handle block list updates directly from realtime payload
async function handleBlockListRealtimeUpdate(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
  try {
    if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && (payload.new as { deleted?: boolean })?.deleted)) {
      // Remove deleted block list from cache
      const id = (payload.old?.id || payload.new?.id) as string;
      if (id) {
        await blockListsCache.delete(id);
        // Also remove associated websites
        const websites = await blockedWebsitesCache.getAll();
        for (const website of websites) {
          if (website.block_list_id === id) {
            await blockedWebsitesCache.delete(website.id);
          }
        }
      }
    } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const list = payload.new as { id: string; user_id: string; name: string; active_days: (0|1|2|3|4|5|6)[] | null; is_enabled: boolean; order: number; deleted?: boolean };
      if (list && !list.deleted && list.is_enabled) {
        // Add/update enabled block list in cache
        await blockListsCache.put({
          id: list.id,
          user_id: list.user_id,
          name: list.name,
          active_days: list.active_days,
          is_enabled: list.is_enabled,
          order: list.order
        });
      } else if (list && (list.deleted || !list.is_enabled)) {
        // Remove disabled or deleted list from cache
        await blockListsCache.delete(list.id);
      }
    }
    // Notify popup of block list change
    notifyPopup('BLOCK_LISTS_CHANGED');
  } catch (error) {
    debugError('[Stellar Focus] Error handling block list update:', error);
    // Fall back to full refresh only on error
    refreshBlockLists();
  }
}

// EGRESS OPTIMIZATION: Handle blocked website updates directly from realtime payload
async function handleBlockedWebsiteRealtimeUpdate(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
  try {
    if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && (payload.new as { deleted?: boolean })?.deleted)) {
      // Remove deleted website from cache
      const id = (payload.old?.id || payload.new?.id) as string;
      if (id) {
        await blockedWebsitesCache.delete(id);
      }
    } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const website = payload.new as { id: string; block_list_id: string; domain: string; deleted?: boolean };
      if (website && !website.deleted) {
        // Check if the block list is in our cache (i.e., enabled)
        const blockLists = await blockListsCache.getAll();
        const parentList = blockLists.find(l => l.id === website.block_list_id);
        if (parentList) {
          // Add/update website in cache
          await blockedWebsitesCache.put({
            id: website.id,
            block_list_id: website.block_list_id,
            domain: website.domain
          });
        }
      }
    }
  } catch (error) {
    debugError('[Stellar Focus] Error handling blocked website update:', error);
    // Fall back to full refresh only on error
    refreshBlockLists();
  }
}

// Notify popup of state changes via messaging
function notifyPopup(type: string) {
  browser.runtime.sendMessage({ type }).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Clean up only the realtime channel (preserves auth state listener for reconnections)
async function cleanupRealtimeChannel() {
  realtimeHealthy = false;

  try {
    const supabase = await getSupabase();

    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  } catch {
    // Config might not be available, just clear the reference
    realtimeChannel = null;
  }
}

// Full cleanup: channel + auth state listener (used on lock/sign-out/config reset)
async function cleanupRealtimeSubscriptions() {
  await cleanupRealtimeChannel();

  if (authStateUnsubscribe) {
    authStateUnsubscribe();
    authStateUnsubscribe = null;
  }
}

async function pollFocusSession() {
  // Check config first
  const extConfig = await getConfig();
  if (!extConfig) return;

  // Check connectivity first
  const wasOnline = isOnline;
  isOnline = await checkConnectivity(extConfig.supabaseUrl);

  if (!isOnline) {
    debugLog('[Stellar Focus] Offline - skipping poll');
    // Only tear down the channel, not the auth state listener —
    // the listener must survive offline periods so TOKEN_REFRESHED
    // can update realtime auth when we reconnect
    await cleanupRealtimeChannel();
    return;
  }

  // Re-setup subscriptions if we just came back online
  if (!wasOnline && isOnline) {
    debugLog('[Stellar Focus] Back online - setting up real-time subscriptions');
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

    // EGRESS OPTIMIZATION: Use session.user instead of separate getUser() call
    const user = session.user;
    if (!user) return;

    // Query active focus session with explicit columns (egress optimization)
    // No user_id filter — RLS handles access (single-user app)
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select(COLUMNS.focus_sessions)
      .is('ended_at', null)
      .neq('status', 'stopped')
      .or('deleted.is.null,deleted.eq.false')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && !error) {
      const focusSession = data[0];

      // Check if focus session just started (wasn't running before, now it is)
      const wasRunning = currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus';
      const isNowRunning = focusSession.status === 'running' && focusSession.phase === 'focus';

      // Detect any state change for popup notification
      const hasChanged = !currentFocusSession
        || currentFocusSession.phase !== focusSession.phase
        || currentFocusSession.status !== focusSession.status;

      // Update cached session
      const sessionData: FocusSessionCache = {
        id: 'current',
        user_id: focusSession.user_id,
        phase: focusSession.phase,
        status: focusSession.status,
        phase_started_at: focusSession.phase_started_at,
        focus_duration: focusSession.focus_duration,
        break_duration: focusSession.break_duration,
        cached_at: new Date().toISOString()
      };

      await focusSessionCacheStore.put(sessionData);
      currentFocusSession = sessionData;

      // Refresh block lists when focus session starts to ensure we have latest data
      if (!wasRunning && isNowRunning) {
        debugLog('[Stellar Focus] Focus session started - refreshing block lists');
        await refreshBlockLists();
      }

      // Notify popup of state changes caught by polling
      if (hasChanged) {
        notifyPopup('FOCUS_STATUS_CHANGED');
      }

      debugLog('[Stellar Focus] Focus session active:', focusSession.phase, focusSession.status);
    } else {
      // No active session
      const hadSession = !!currentFocusSession;
      await focusSessionCacheStore.clear();
      currentFocusSession = null;

      // Notify popup if session just ended
      if (hadSession) {
        notifyPopup('FOCUS_STATUS_CHANGED');
      }

      debugLog('[Stellar Focus] No active focus session');
    }
  } catch (error) {
    debugError('[Stellar Focus] Poll error:', error);
  }
}

async function refreshBlockLists() {
  if (!isOnline) return;

  try {
    // Must be online and authenticated
    const session = await getSession();
    if (!session) return;

    // EGRESS OPTIMIZATION: Use session.user instead of separate getUser() call
    const user = session.user;
    if (!user) return;

    const supabase = await getSupabase();

    // Fetch block lists with explicit columns (egress optimization)
    // No user_id filter — RLS handles access (single-user app)
    const { data: lists, error: listsError } = await supabase
      .from('block_lists')
      .select(COLUMNS.block_lists)
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

      // Fetch blocked websites for enabled lists with explicit columns
      const enabledListIds = lists.map(l => l.id);

      if (enabledListIds.length > 0) {
        const { data: websites, error: websitesError } = await supabase
          .from('blocked_websites')
          .select(COLUMNS.blocked_websites)
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

      debugLog('[Stellar Focus] Block lists refreshed:', lists.length, 'lists');
    }
  } catch (error) {
    debugError('[Stellar Focus] Block lists refresh error:', error);
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
    debugError('[Stellar Focus] Domain check error:', error);
    return false;
  }
}

// Initialize on load (also runs after event page suspension/wake in Firefox)
setupAlarm();
init();
