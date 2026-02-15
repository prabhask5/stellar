/**
 * Stellar Focus Extension - Popup Logic
 * PIN-based auth with auto-submit, read-only view with real-time sync
 *
 * EGRESS OPTIMIZATION: Popup no longer creates its own realtime subscriptions.
 * Instead, it receives updates from the service worker via messaging.
 */

import browser from 'webextension-polyfill';
import { getConfig, getGateConfig, setGateConfig, isUnlocked, setUnlocked, type GateConfig } from '../config';
import { signInWithCredentials } from '../auth/supabase';
import { debugLog, debugWarn, debugError, initDebugMode } from '../lib/debug';

// Types
interface FocusSession {
  id: string;
  phase: 'focus' | 'break';
  status: 'running' | 'paused' | 'completed';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  elapsed_duration: number;
  started_at: string;
  ended_at: string | null;
}

interface BlockList {
  id: string;
  name: string;
  is_enabled: boolean;
  active_days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] | null;
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

// DOM Elements
const offlinePlaceholder = document.getElementById('offlinePlaceholder') as HTMLElement;
const pinSection = document.getElementById('pinSection') as HTMLElement;
const notSetUpSection = document.getElementById('notSetUpSection') as HTMLElement;
const mainSection = document.getElementById('mainSection') as HTMLElement;
const syncIndicator = document.getElementById('syncIndicator') as HTMLElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement;
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const statusDesc = document.getElementById('statusDesc') as HTMLElement;
const blockListsContainer = document.getElementById('blockLists') as HTMLElement;
const userAvatar = document.getElementById('userAvatar') as HTMLElement;
const userName = document.getElementById('userName') as HTMLElement;
const openStellarBtn = document.getElementById('openStellarBtn') as HTMLAnchorElement;
const privacyLink = document.getElementById('privacyLink') as HTMLAnchorElement;
const focusTimeValue = document.getElementById('focusTimeValue') as HTMLElement;
const activeBlockListCount = document.getElementById('activeBlockListCount') as HTMLElement;

// PIN elements
const pinAvatar = document.getElementById('pinAvatar') as HTMLElement;
const pinGreeting = document.getElementById('pinGreeting') as HTMLElement;
const pinInputGroup = document.getElementById('pinInputGroup') as HTMLElement;
const pinError = document.getElementById('pinError') as HTMLElement;
const pinLoading = document.getElementById('pinLoading') as HTMLElement;
const pinDigits = pinInputGroup?.querySelectorAll('.pin-digit') as NodeListOf<HTMLInputElement>;

// Not-configured state element
const notConfiguredEl = document.getElementById('notConfigured') as HTMLElement | null;

// State
let isOnline = navigator.onLine;
let syncStatus: SyncStatus = 'idle';
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let cachedBlockLists: BlockList[] = [];
let focusTimeInterval: ReturnType<typeof setInterval> | null = null;
let hasActiveRunningSession = false;
let currentGateConfig: GateConfig | null = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await initDebugMode();

  // Check if configured (Supabase URL + keys)
  const config = await getConfig();
  if (!config) {
    showNotConfigured();
    return;
  }

  // Set links
  if (openStellarBtn) openStellarBtn.href = config.appUrl;
  if (privacyLink) privacyLink.href = browser.runtime.getURL('privacy/privacy.html');

  // Network listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Service worker message listener
  setupServiceWorkerMessageListener();

  // Wire up common buttons
  document.getElementById('lockBtn')?.addEventListener('click', handleLock);

  // Settings button — always visible
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.classList.remove('hidden');
    settingsBtn.addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });
  }

  openStellarBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await focusOrOpenApp();
  });

  privacyLink?.addEventListener('click', (e) => {
    e.preventDefault();
    browser.tabs.create({ url: browser.runtime.getURL('privacy/privacy.html') });
    window.close();
  });

  // Open app setup button
  document.getElementById('openAppSetupBtn')?.addEventListener('click', async () => {
    await focusOrOpenApp();
  });

  // Check if already unlocked
  const unlocked = await isUnlocked();
  if (unlocked) {
    // Already unlocked — load gate config for user info and show main
    currentGateConfig = await getGateConfig();
    if (currentGateConfig) {
      updateUserInfoFromGateConfig(currentGateConfig);
    }
    showMain();
    if (isOnline) {
      // Ensure service worker has fresh data before loading
      await browser.runtime.sendMessage({ type: 'CHECK_REALTIME' }).catch(() => {});
      await loadData();
    }
    return;
  }

  // Not unlocked — check for cached gate config
  currentGateConfig = await getGateConfig();
  if (currentGateConfig) {
    showPinSection(currentGateConfig);
    return;
  }

  // No cached gate config — user needs to set up via the main app first
  showNotSetUp();

  // Ask service worker to try fetching gate config from RPC
  if (isOnline) {
    browser.runtime.sendMessage({ type: 'REFRESH_GATE_CONFIG' }).catch(() => {});
  }
}

// ============================================================
// Section visibility
// ============================================================

function hideAllSections() {
  offlinePlaceholder?.classList.add('hidden');
  pinSection?.classList.add('hidden');
  notSetUpSection?.classList.add('hidden');
  mainSection?.classList.add('hidden');
  notConfiguredEl?.classList.add('hidden');
}

function showNotConfigured() {
  hideAllSections();
  if (notConfiguredEl) {
    notConfiguredEl.classList.remove('hidden');
  }
  document.getElementById('openOptionsBtn')?.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
}

function showNotSetUp() {
  hideAllSections();
  notSetUpSection?.classList.remove('hidden');
}

function showPinSection(gateConfig: GateConfig) {
  hideAllSections();
  pinSection?.classList.remove('hidden');

  // Set avatar and greeting
  const firstName = (gateConfig.profile.firstName as string) || '';
  const initial = firstName.charAt(0).toUpperCase() || '?';
  if (pinAvatar) pinAvatar.textContent = initial;
  if (pinGreeting) {
    pinGreeting.textContent = firstName ? `Welcome back, ${firstName}` : 'Welcome back';
  }

  // Clear any previous state
  hidePinError();
  clearPinDigits();
  pinLoading?.classList.add('hidden');
  pinInputGroup?.classList.remove('hidden');

  // Setup PIN input handlers
  setupPinInputs();

  // Focus first digit
  if (pinDigits[0]) {
    setTimeout(() => pinDigits[0].focus(), 100);
  }
}

function showMain() {
  hideAllSections();
  if (!isOnline) {
    offlinePlaceholder?.classList.remove('hidden');
  } else {
    mainSection?.classList.remove('hidden');
  }
}

// ============================================================
// PIN Input Logic
// ============================================================

function setupPinInputs() {
  pinDigits.forEach((digit, index) => {
    digit.addEventListener('input', () => handlePinDigitInput(index));
    digit.addEventListener('keydown', (e) => handlePinDigitKeydown(index, e));
    digit.addEventListener('paste', (e) => handlePinPaste(e));
  });
}

function handlePinDigitInput(index: number) {
  const input = pinDigits[index];
  const value = input.value.replace(/[^0-9]/g, '');

  if (value.length > 0) {
    input.value = value.charAt(value.length - 1);
    // Update wrapper filled state
    input.closest('.pin-digit-wrapper')?.classList.add('filled');

    if (index < pinDigits.length - 1 && pinDigits[index + 1]) {
      pinDigits[index + 1].focus();
    }

    // Auto-submit when all digits are filled (with brief delay for visual feedback)
    if (index === pinDigits.length - 1) {
      const allFilled = Array.from(pinDigits).every(d => d.value.length === 1);
      if (allFilled) {
        setTimeout(() => handlePinSubmit(), 300);
      }
    }
  } else {
    input.value = '';
    input.closest('.pin-digit-wrapper')?.classList.remove('filled');
  }
}

function handlePinDigitKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    if (pinDigits[index].value === '' && index > 0) {
      pinDigits[index - 1].focus();
      pinDigits[index - 1].value = '';
      pinDigits[index - 1].closest('.pin-digit-wrapper')?.classList.remove('filled');
    } else {
      pinDigits[index].value = '';
      pinDigits[index].closest('.pin-digit-wrapper')?.classList.remove('filled');
    }
  }
}

function handlePinPaste(event: ClipboardEvent) {
  event.preventDefault();
  const pasted = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '');
  for (let i = 0; i < pinDigits.length && i < pasted.length; i++) {
    pinDigits[i].value = pasted[i];
    if (pasted[i]) {
      pinDigits[i].closest('.pin-digit-wrapper')?.classList.add('filled');
    }
  }
  const focusIndex = Math.min(pasted.length, pinDigits.length - 1);
  if (pinDigits[focusIndex]) pinDigits[focusIndex].focus();

  // Auto-submit if all digits pasted (with brief delay for visual feedback)
  if (pasted.length >= pinDigits.length) {
    const allFilled = Array.from(pinDigits).every(d => d.value.length === 1);
    if (allFilled) {
      setTimeout(() => handlePinSubmit(), 300);
    }
  }
}

function clearPinDigits() {
  pinDigits.forEach(d => {
    d.value = '';
    d.closest('.pin-digit-wrapper')?.classList.remove('filled');
  });
}

async function handlePinSubmit() {
  if (!currentGateConfig) return;

  hidePinError();

  const pin = Array.from(pinDigits).map(d => d.value).join('');
  if (pin.length !== pinDigits.length) return;

  // Show loading, hide digits
  pinInputGroup?.classList.add('hidden');
  pinLoading?.classList.remove('hidden');

  try {
    if (!isOnline) {
      // Offline — can't verify PIN without Supabase
      pinLoading?.classList.add('hidden');
      pinInputGroup?.classList.remove('hidden');
      clearPinDigits();
      showPinError('You must be online to sign in');
      if (pinDigits[0]) pinDigits[0].focus();
      return;
    }

    const { session, error } = await signInWithCredentials(currentGateConfig.email, pin);

    if (session) {
      // Success — unlock
      await setUnlocked(true);

      // Update user info and show main
      updateUserInfoFromGateConfig(currentGateConfig);
      showMain();

      // Notify service worker and wait for init to complete before loading data
      await browser.runtime.sendMessage({ type: 'UNLOCKED' }).catch(() => {});
      await loadData();
    } else {
      // Auth failed — check if user was deleted (e.g. codeLength migration reset)
      if (error === 'Invalid login credentials') {
        browser.runtime.sendMessage({ type: 'REFRESH_GATE_CONFIG' }).catch(() => {});
      }

      // Shake, clear, show error
      pinLoading?.classList.add('hidden');
      pinInputGroup?.classList.remove('hidden');

      pinInputGroup?.classList.add('shake');
      setTimeout(() => {
        pinInputGroup?.classList.remove('shake');
      }, 500);

      clearPinDigits();
      showPinError(error === 'Invalid login credentials' ? 'Incorrect code' : (error || 'Verification failed'));

      if (pinDigits[0]) pinDigits[0].focus();
    }
  } catch (e) {
    debugError('[Stellar Focus] PIN submit error:', e);
    pinLoading?.classList.add('hidden');
    pinInputGroup?.classList.remove('hidden');
    clearPinDigits();
    showPinError('Verification failed');
    if (pinDigits[0]) pinDigits[0].focus();
  }
}

function showPinError(message: string) {
  if (pinError) {
    pinError.textContent = message;
    pinError.classList.remove('hidden');
  }
}

function hidePinError() {
  pinError?.classList.add('hidden');
}

// ============================================================
// Lock
// ============================================================

async function handleLock() {
  try {
    stopFocusTimeTick();
    hasActiveRunningSession = false;
    await setUnlocked(false);

    // Notify service worker
    browser.runtime.sendMessage({ type: 'LOCKED' }).catch(() => {});

    // Show PIN section if we have config
    if (currentGateConfig) {
      showPinSection(currentGateConfig);
    } else {
      showNotSetUp();
    }
  } catch (error) {
    debugError('[Stellar Focus] Lock error:', error);
  }
}

// ============================================================
// User Info
// ============================================================

function updateUserInfoFromGateConfig(gateConfig: GateConfig) {
  const firstName = (gateConfig.profile.firstName as string) || '';
  const initial = firstName.charAt(0).toUpperCase() || '?';
  if (userAvatar) userAvatar.textContent = initial;
  const displayName = firstName || 'there';
  if (userName) userName.textContent = `Hey, ${displayName}!`;
}

// ============================================================
// Service Worker Messages
// ============================================================

function setupServiceWorkerMessageListener() {
  browser.runtime.onMessage.addListener((message: { type: string; gateConfig?: GateConfig }) => {
    if (message.type === 'FOCUS_STATUS_CHANGED') {
      debugLog('[Stellar Focus] Received focus status update from service worker');
      loadFocusStatus();
      loadFocusTimeToday();
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 800);
    }
    if (message.type === 'BLOCK_LISTS_CHANGED') {
      debugLog('[Stellar Focus] Received block lists update from service worker');
      loadBlockLists();
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 800);
    }
    if (message.type === 'GATE_CONFIG_UPDATED' && message.gateConfig) {
      debugLog('[Stellar Focus] Gate config updated from service worker');
      currentGateConfig = message.gateConfig;
      // If currently showing "not set up", switch to PIN section
      if (!notSetUpSection?.classList.contains('hidden')) {
        showPinSection(message.gateConfig);
      }
    }
    if (message.type === 'GATE_CONFIG_CLEARED') {
      debugLog('[Stellar Focus] Gate config cleared — user no longer exists');
      currentGateConfig = null;
      showNotSetUp();
    }
  });

  // Backup: listen for gate config changes in storage
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stellar_gate_config?.newValue) {
      const newConfig = changes.stellar_gate_config.newValue as GateConfig;
      if (newConfig.email && !currentGateConfig) {
        debugLog('[Stellar Focus] Gate config detected via storage change');
        currentGateConfig = newConfig;
        if (!notSetUpSection?.classList.contains('hidden')) {
          showPinSection(newConfig);
        }
      }
    }
  });
}

// ============================================================
// Online/Offline
// ============================================================

function handleOnline() {
  isOnline = true;
  const unlocked = mainSection && !mainSection.classList.contains('hidden');
  if (unlocked) {
    showMain();
    loadData();
  }
}

function handleOffline() {
  isOnline = false;
  stopFocusTimeTick();
  hasActiveRunningSession = false;
  const unlocked = mainSection && !mainSection.classList.contains('hidden');
  if (unlocked) {
    showMain(); // Will show offline placeholder
  }
}

// ============================================================
// Data Loading
// ============================================================

async function loadData() {
  try {
    await Promise.all([
      loadFocusStatus(true),
      loadBlockLists(),
      loadFocusTimeToday()
    ]);
  } catch (error) {
    debugError('Failed to load data:', error);
    setSyncStatus('error');
  }
}

let lastSessionJson: string | null = null;

async function loadFocusStatus(isInitialLoad = false) {
  if (isInitialLoad) {
    setSyncStatus('syncing');
  }

  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_FOCUS_STATUS' }) as {
      isOnline: boolean;
      realtimeHealthy: boolean;
      focusSession: FocusSession | null;
    };

    const session = response?.focusSession || null;
    const sessionJson = session ? JSON.stringify({ id: session.id, phase: session.phase, status: session.status }) : null;

    const hasChanged = sessionJson !== lastSessionJson;
    lastSessionJson = sessionJson;

    if (hasChanged) {
      debugLog('[Stellar Focus] Session changed:', session?.phase, session?.status);

      if (!isInitialLoad) {
        setSyncStatus('syncing');
        setTimeout(() => setSyncStatus('synced'), 800);
      }

      updateStatusDisplay(session);
    }

    if (isInitialLoad) {
      setSyncStatus('synced');
    }
  } catch (error) {
    debugError('[Stellar Focus] Load focus status error:', error);
    if (isInitialLoad) {
      setSyncStatus('error');
    }
  }
}

async function loadBlockLists() {
  const response = await browser.runtime.sendMessage({ type: 'GET_BLOCK_LISTS' }) as {
    lists: BlockList[];
  };

  cachedBlockLists = response?.lists || [];
  renderBlockLists(cachedBlockLists);
  updateActiveBlockListCount(cachedBlockLists);
}

function isBlockListActiveToday(list: BlockList): boolean {
  if (!list.is_enabled) return false;
  if (list.active_days === null) return true;
  const currentDay = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return list.active_days.includes(currentDay);
}

function updateActiveBlockListCount(lists: BlockList[]) {
  const activeCount = lists.filter(isBlockListActiveToday).length;
  if (activeBlockListCount) {
    activeBlockListCount.classList.add('updating');
    setTimeout(() => {
      activeBlockListCount.textContent = `${activeCount} active`;
      activeBlockListCount.classList.remove('updating');
    }, 150);
  }
}

async function loadFocusTimeToday(animate = true) {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_FOCUS_TIME_TODAY' }) as {
      totalMs: number;
      hasRunningSession: boolean;
    };

    const totalMs = response?.totalMs || 0;
    const foundRunningFocusSession = response?.hasRunningSession || false;

    const wasRunning = hasActiveRunningSession;
    hasActiveRunningSession = foundRunningFocusSession;

    if (foundRunningFocusSession && !wasRunning) {
      startFocusTimeTick();
    } else if (!foundRunningFocusSession && wasRunning) {
      stopFocusTimeTick();
    }

    updateFocusTimeDisplay(totalMs, animate);
  } catch (error) {
    debugError('[Stellar Focus] Load focus time error:', error);
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function updateFocusTimeDisplay(ms: number, animate = true) {
  if (focusTimeValue) {
    if (animate) {
      focusTimeValue.classList.add('updating');
      setTimeout(() => {
        focusTimeValue.textContent = formatDuration(ms);
        focusTimeValue.classList.remove('updating');
      }, 150);
    } else {
      focusTimeValue.textContent = formatDuration(ms);
    }
  }
}

function startFocusTimeTick() {
  stopFocusTimeTick();
  focusTimeInterval = setInterval(() => {
    if (hasActiveRunningSession) {
      loadFocusTimeToday(false);
    }
  }, 30000);
}

function stopFocusTimeTick() {
  if (focusTimeInterval) {
    clearInterval(focusTimeInterval);
    focusTimeInterval = null;
  }
}

// ============================================================
// Status Display
// ============================================================

type TimerState = 'idle' | 'focus' | 'break' | 'paused';
let prevTimerState: TimerState | null = null;

function updateStatusDisplay(session: FocusSession | null) {
  let newState: TimerState = 'idle';
  let label = 'Ready to Focus';
  let desc = 'Start a session in Stellar';

  if (session) {
    if (session.status === 'running') {
      newState = session.phase;
      label = session.phase === 'focus' ? 'Focus Time' : 'Break Time';
      desc = session.phase === 'focus'
        ? 'Stay focused — distractions blocked'
        : 'Take a breather, you earned it';
    } else if (session.status === 'paused') {
      newState = 'paused';
      label = 'Session Paused';
      desc = 'Resume when you\'re ready';
    }
  }

  if (newState === prevTimerState) return;

  const isTransitioning = prevTimerState !== null && (prevTimerState !== 'idle' || newState !== 'idle');

  statusIndicator?.classList.remove('focus', 'break', 'paused', 'idle', 'transitioning');

  const icons = statusIndicator?.querySelectorAll('.status-icon svg');
  icons?.forEach(icon => icon.classList.remove('active', 'morph-in', 'morph-out'));

  if (isTransitioning) {
    const prevIcon = statusIndicator?.querySelector(`.icon-${prevTimerState}`);
    prevIcon?.classList.add('morph-out');
  }

  statusIndicator?.classList.add(newState);
  if (isTransitioning) {
    statusIndicator?.classList.add('transitioning');
  }

  const newIcon = statusIndicator?.querySelector(`.icon-${newState}`);
  if (newIcon) {
    newIcon.classList.add('active');
    if (isTransitioning) {
      newIcon.classList.add('morph-in');
    }
  }

  if (statusLabel) {
    statusLabel.classList.add('updating');
    setTimeout(() => {
      statusLabel.textContent = label;
      statusLabel.classList.remove('updating');
    }, 150);
  }

  if (statusDesc) {
    statusDesc.classList.add('updating');
    setTimeout(() => {
      statusDesc.textContent = desc;
      statusDesc.classList.remove('updating');
    }, 150);
  }

  setTimeout(() => {
    statusIndicator?.classList.remove('transitioning');
    icons?.forEach(icon => icon.classList.remove('morph-out'));
  }, 500);

  prevTimerState = newState;
}

// ============================================================
// Block Lists Rendering
// ============================================================

async function renderBlockLists(lists: BlockList[]) {
  if (!blockListsContainer) return;

  const config = await getConfig();
  const appUrl = config?.appUrl || '';

  blockListsContainer.textContent = '';

  if (lists.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-message';

    const p = document.createElement('p');
    p.textContent = 'No block lists yet';
    emptyDiv.appendChild(p);

    const createLink = document.createElement('a');
    createLink.href = `${appUrl}/focus`;
    createLink.className = 'create-link';
    createLink.textContent = 'Create one in Stellar';
    createLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await navigateToApp(`${appUrl}/focus`);
    });
    emptyDiv.appendChild(createLink);

    blockListsContainer.appendChild(emptyDiv);
    return;
  }

  const sortedLists = [...lists].sort((a, b) => {
    const aActive = isBlockListActiveToday(a);
    const bActive = isBlockListActiveToday(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  });

  for (const list of sortedLists) {
    const isActive = isBlockListActiveToday(list);
    const editUrl = `${appUrl}/focus/block-lists/${list.id}`;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'block-list-item';

    const statusSpan = document.createElement('span');
    statusSpan.className = `list-status ${isActive ? 'enabled' : 'disabled'}`;
    itemDiv.appendChild(statusSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'block-list-name';
    nameSpan.textContent = list.name;
    itemDiv.appendChild(nameSpan);

    const editLink = document.createElement('a');
    editLink.href = editUrl;
    editLink.className = 'edit-link';
    editLink.title = 'Edit in Stellar';
    editLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await navigateToApp(editUrl);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7');
    svg.appendChild(path1);

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
    svg.appendChild(path2);

    editLink.appendChild(svg);
    itemDiv.appendChild(editLink);

    blockListsContainer.appendChild(itemDiv);
  }
}

// ============================================================
// Sync Status Indicator
// ============================================================

function setSyncStatus(status: SyncStatus) {
  const prevStatus = syncStatus;
  syncStatus = status;

  syncIndicator?.classList.remove('idle', 'syncing', 'synced', 'error', 'transitioning');
  syncIndicator?.classList.add(status);

  const icons = syncIndicator?.querySelectorAll('.icon');
  icons?.forEach(icon => icon.classList.remove('active', 'morph-in'));

  const activeIcon = syncIndicator?.querySelector(`.icon-${status}`);
  if (activeIcon) {
    activeIcon.classList.add('active');

    if (prevStatus === 'syncing' && (status === 'synced' || status === 'error')) {
      activeIcon.classList.add('morph-in');
      syncIndicator?.classList.add('transitioning');

      setTimeout(() => {
        syncIndicator?.classList.remove('transitioning');
      }, 600);
    }
  }

  if (syncTimeout) clearTimeout(syncTimeout);

  if (status === 'synced') {
    syncTimeout = setTimeout(() => {
      syncIndicator?.classList.remove('synced');
      syncIndicator?.classList.add('idle');
      const syncedIcon = syncIndicator?.querySelector('.icon-synced');
      syncedIcon?.classList.remove('active', 'morph-in');
    }, 2000);
  }
}

// ============================================================
// Navigation Helpers
// ============================================================

async function focusOrOpenApp() {
  try {
    const config = await getConfig();
    if (!config) return;

    const tabs = await browser.tabs.query({
      url: `${config.appUrl}/*`
    });

    if (tabs.length > 0 && tabs[0].id !== undefined) {
      await browser.tabs.update(tabs[0].id, { active: true });
    } else {
      await browser.tabs.create({ url: config.appUrl });
    }

    window.close();
  } catch (error) {
    debugError('[Stellar Focus] Navigation error:', error);
    const config = await getConfig();
    if (config) {
      await browser.tabs.create({ url: config.appUrl });
    }
    window.close();
  }
}

async function navigateToApp(url: string) {
  try {
    const config = await getConfig();
    if (!config) return;

    const tabs = await browser.tabs.query({
      url: `${config.appUrl}/*`
    });

    if (tabs.length > 0 && tabs[0].id !== undefined) {
      await browser.tabs.update(tabs[0].id, { url, active: true });
    } else {
      await browser.tabs.create({ url });
    }

    window.close();
  } catch (error) {
    debugError('[Stellar Focus] Navigation error:', error);
    await browser.tabs.create({ url });
    window.close();
  }
}
