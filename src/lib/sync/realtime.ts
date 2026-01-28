/**
 * Real-Time Subscription Manager
 *
 * Phase 5 of multi-device sync: Implements Supabase Realtime subscriptions
 * for instant multi-device synchronization.
 *
 * Design decisions:
 * - Uses Supabase Realtime PostgreSQL Changes for all entity tables
 * - Skips changes from own device using recently-modified tracking
 * - Respects recently-modified protection window (2 seconds)
 * - Applies changes through existing conflict resolution engine
 * - Falls back to polling if WebSocket connection fails
 * - Single channel per user with filter by user_id for efficiency
 * - Pauses reconnection attempts while offline (waits for online event)
 */

import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getDeviceId } from './deviceId';
import { resolveConflicts, storeConflictHistory, getPendingOpsForEntity } from './conflicts';
import { getPendingEntityIds } from './queue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Tables that support real-time sync
const REALTIME_TABLES = [
  'goal_lists',
  'goals',
  'daily_routine_goals',
  'daily_goal_progress',
  'task_categories',
  'commitments',
  'daily_tasks',
  'long_term_tasks',
  'focus_settings',
  'focus_sessions',
  'block_lists',
  'blocked_websites'
] as const;

type RealtimeTable = typeof REALTIME_TABLES[number];

// Map from Supabase table names to Dexie table names
const TABLE_MAP: Record<RealtimeTable, keyof typeof db> = {
  'goal_lists': 'goalLists',
  'goals': 'goals',
  'daily_routine_goals': 'dailyRoutineGoals',
  'daily_goal_progress': 'dailyGoalProgress',
  'task_categories': 'taskCategories',
  'commitments': 'commitments',
  'daily_tasks': 'dailyTasks',
  'long_term_tasks': 'longTermTasks',
  'focus_settings': 'focusSettings',
  'focus_sessions': 'focusSessions',
  'block_lists': 'blockLists',
  'blocked_websites': 'blockedWebsites'
};

// Protection window for recently modified entities (matches engine.ts)
const RECENTLY_MODIFIED_TTL_MS = 2000;

// Track recently modified entities (shared with engine.ts via export)
const recentlyModifiedByRealtime: Map<string, number> = new Map();

// Connection state
export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RealtimeManagerState {
  channel: RealtimeChannel | null;
  connectionState: RealtimeConnectionState;
  userId: string | null;
  deviceId: string;
  lastError: string | null;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
}

const state: RealtimeManagerState = {
  channel: null,
  connectionState: 'disconnected',
  userId: null,
  deviceId: '',
  lastError: null,
  reconnectAttempts: 0,
  reconnectTimeout: null
};

// Callbacks for state changes and data updates
const connectionCallbacks: Set<(state: RealtimeConnectionState) => void> = new Set();
const dataUpdateCallbacks: Set<(table: string, entityId: string) => void> = new Set();

// Maximum reconnect attempts before giving up (will fall back to polling)
const MAX_RECONNECT_ATTEMPTS = 5;
// Base delay for exponential backoff (ms)
const RECONNECT_BASE_DELAY = 1000;

// Lock to prevent concurrent start/stop operations
let operationInProgress = false;

/**
 * Subscribe to connection state changes
 */
export function onConnectionStateChange(callback: (state: RealtimeConnectionState) => void): () => void {
  connectionCallbacks.add(callback);
  // Immediately call with current state
  callback(state.connectionState);
  return () => connectionCallbacks.delete(callback);
}

/**
 * Subscribe to data update notifications (called after local DB is updated)
 */
export function onRealtimeDataUpdate(callback: (table: string, entityId: string) => void): () => void {
  dataUpdateCallbacks.add(callback);
  return () => dataUpdateCallbacks.delete(callback);
}

/**
 * Get current connection state
 */
export function getConnectionState(): RealtimeConnectionState {
  return state.connectionState;
}

/**
 * Check if an entity was recently modified via realtime
 * Used to prevent duplicate processing
 */
export function wasRecentlyUpdatedByRealtime(entityId: string): boolean {
  const modifiedAt = recentlyModifiedByRealtime.get(entityId);
  if (!modifiedAt) return false;

  const age = Date.now() - modifiedAt;
  if (age > RECENTLY_MODIFIED_TTL_MS) {
    recentlyModifiedByRealtime.delete(entityId);
    return false;
  }
  return true;
}

/**
 * Update connection state and notify subscribers
 */
function setConnectionState(newState: RealtimeConnectionState, error?: string): void {
  state.connectionState = newState;
  state.lastError = error || null;

  for (const callback of connectionCallbacks) {
    try {
      callback(newState);
    } catch (e) {
      console.error('[Realtime] Connection callback error:', e);
    }
  }
}

/**
 * Notify data update subscribers
 */
function notifyDataUpdate(table: string, entityId: string): void {
  for (const callback of dataUpdateCallbacks) {
    try {
      callback(table, entityId);
    } catch (e) {
      console.error('[Realtime] Data update callback error:', e);
    }
  }
}

/**
 * Check if entity was recently modified locally (prevent overwriting fresh local changes)
 */
function isRecentlyModifiedLocally(entityId: string): boolean {
  const rtModified = recentlyModifiedByRealtime.get(entityId);
  if (rtModified && Date.now() - rtModified < RECENTLY_MODIFIED_TTL_MS) {
    return true;
  }
  return false;
}

/**
 * Handle incoming realtime change
 */
async function handleRealtimeChange(
  table: RealtimeTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): Promise<void> {
  const eventType = payload.eventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newRecord = (payload as any).new as Record<string, unknown> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldRecord = (payload as any).old as Record<string, unknown> | null;

  // Determine entity ID
  const entityId = (newRecord?.id || oldRecord?.id) as string;
  if (!entityId) {
    console.warn('[Realtime] Change without entity ID:', table, eventType);
    return;
  }

  // Skip if this was our own change (prevents echo)
  // Check if this entity was recently modified locally by us
  if (isRecentlyModifiedLocally(entityId)) {
    return;
  }

  const dexieTable = TABLE_MAP[table];
  if (!dexieTable) {
    console.warn('[Realtime] Unknown table:', table);
    return;
  }

  try {
    switch (eventType) {
      case 'INSERT':
      case 'UPDATE': {
        if (!newRecord) return;

        // Get local entity if it exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const localEntity = await (db[dexieTable] as any).get(entityId);

        // Check for pending operations
        const pendingEntityIds = await getPendingEntityIds();
        const hasPendingOps = pendingEntityIds.has(entityId);

        if (!localEntity) {
          // New entity - just insert it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).put(newRecord);
        } else if (!hasPendingOps) {
          // No pending ops - check if remote is newer
          const localUpdatedAt = new Date(localEntity.updated_at as string).getTime();
          const remoteUpdatedAt = new Date(newRecord.updated_at as string).getTime();

          if (remoteUpdatedAt > localUpdatedAt) {
            // Remote is newer, accept it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db[dexieTable] as any).put(newRecord);
          }
        } else {
          // Has pending operations - use conflict resolution
          const pendingOps = await getPendingOpsForEntity(entityId);
          const resolution = await resolveConflicts(
            table,
            entityId,
            localEntity as Record<string, unknown>,
            newRecord,
            pendingOps
          );

          // Store merged entity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).put(resolution.mergedEntity);

          // Store conflict history if there were conflicts
          if (resolution.hasConflicts) {
            await storeConflictHistory(resolution);
          }
        }

        // Mark as recently updated to prevent duplicate processing
        recentlyModifiedByRealtime.set(entityId, Date.now());

        // Notify subscribers
        notifyDataUpdate(table, entityId);
        break;
      }

      case 'DELETE': {
        // For soft-delete systems, this would be an UPDATE with deleted=true
        // But if hard delete happens, we should remove locally too
        if (oldRecord) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).delete(entityId);
          notifyDataUpdate(table, entityId);
        }
        break;
      }
    }
  } catch (error) {
    console.error(`[Realtime] Error handling ${eventType} on ${table}:`, error);
  }
}

/**
 * Schedule reconnection with exponential backoff
 * Only schedules if online - no point reconnecting while offline
 */
function scheduleReconnect(): void {
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }

  // Don't attempt reconnection while offline - wait for online event
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[Realtime] Offline - waiting for online event to reconnect');
    setConnectionState('disconnected');
    return;
  }

  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[Realtime] Max reconnect attempts reached, falling back to polling');
    setConnectionState('error', 'Max reconnection attempts reached');
    return;
  }

  const delay = RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts);
  console.log(`[Realtime] Scheduling reconnect attempt ${state.reconnectAttempts + 1} in ${delay}ms`);

  state.reconnectTimeout = setTimeout(async () => {
    // Double-check we're still online before attempting
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Realtime] Went offline during backoff, cancelling reconnect');
      return;
    }
    state.reconnectAttempts++;
    if (state.userId) {
      await startRealtimeSubscriptions(state.userId);
    }
  }, delay);
}

/**
 * Internal stop function (doesn't check operation lock)
 */
async function stopRealtimeSubscriptionsInternal(): Promise<void> {
  // Clear reconnect timeout
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }

  // Unsubscribe from channel
  if (state.channel) {
    try {
      await supabase.removeChannel(state.channel);
    } catch (error) {
      console.error('[Realtime] Error removing channel:', error);
    }
    state.channel = null;
  }

  state.reconnectAttempts = 0;
  setConnectionState('disconnected');
}

/**
 * Start realtime subscriptions for a user
 */
export async function startRealtimeSubscriptions(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // Don't start if offline - wait for online event
  if (!navigator.onLine) {
    console.log('[Realtime] Offline - skipping subscription start');
    return;
  }

  // Don't start if already connected with same user
  if (state.channel && state.userId === userId && state.connectionState === 'connected') {
    return;
  }

  // Prevent concurrent start/stop operations
  if (operationInProgress) {
    console.log('[Realtime] Operation already in progress, skipping');
    return;
  }

  operationInProgress = true;

  try {
    // Stop existing subscriptions first
    await stopRealtimeSubscriptionsInternal();

    state.userId = userId;
    state.deviceId = getDeviceId();
    setConnectionState('connecting');

    // Create a single channel for all tables
    // Using a unique channel name per user
    const channelName = `stellar_sync_${userId}`;
    state.channel = supabase.channel(channelName);

    // Subscribe to each table
    for (const table of REALTIME_TABLES) {
      state.channel = state.channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          handleRealtimeChange(table, payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        }
      );
    }

    // Subscribe to the channel
    state.channel.subscribe((status, err) => {
      switch (status) {
        case 'SUBSCRIBED':
          console.log('[Realtime] Connected and subscribed');
          state.reconnectAttempts = 0;
          setConnectionState('connected');
          break;

        case 'CHANNEL_ERROR':
          console.error('[Realtime] Channel error:', err);
          setConnectionState('error', err?.message || 'Channel error');
          scheduleReconnect();
          break;

        case 'TIMED_OUT':
          console.warn('[Realtime] Connection timed out');
          setConnectionState('error', 'Connection timed out');
          scheduleReconnect();
          break;

        case 'CLOSED':
          console.log('[Realtime] Channel closed');
          if (state.connectionState !== 'disconnected') {
            setConnectionState('disconnected');
            // Only reconnect if this wasn't an intentional close and we have a user
            if (state.userId) {
              scheduleReconnect();
            }
          }
          break;
      }
    });
  } catch (error) {
    console.error('[Realtime] Failed to start subscriptions:', error);
    setConnectionState('error', error instanceof Error ? error.message : 'Failed to connect');
    scheduleReconnect();
  } finally {
    operationInProgress = false;
  }
}

/**
 * Stop realtime subscriptions (public API)
 */
export async function stopRealtimeSubscriptions(): Promise<void> {
  // Prevent concurrent operations
  if (operationInProgress) {
    console.log('[Realtime] Operation already in progress, skipping stop');
    return;
  }

  operationInProgress = true;

  try {
    await stopRealtimeSubscriptionsInternal();
    state.userId = null;
    // Clear recently modified tracking
    recentlyModifiedByRealtime.clear();
  } finally {
    operationInProgress = false;
  }
}

/**
 * Pause realtime (when going offline) - stops reconnection attempts
 * Called by sync engine when offline event fires
 */
export function pauseRealtime(): void {
  // Clear any pending reconnect attempts
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }
  // Reset reconnect attempts so we get fresh attempts when coming online
  state.reconnectAttempts = 0;
  setConnectionState('disconnected');
  console.log('[Realtime] Paused - waiting for online event');
}

/**
 * Check if realtime is healthy (connected and not in error state)
 */
export function isRealtimeHealthy(): boolean {
  return state.connectionState === 'connected';
}

/**
 * Clean up expired entries from recently modified tracking
 */
export function cleanupRealtimeTracking(): void {
  const now = Date.now();
  for (const [entityId, modifiedAt] of recentlyModifiedByRealtime) {
    if (now - modifiedAt > RECENTLY_MODIFIED_TTL_MS) {
      recentlyModifiedByRealtime.delete(entityId);
    }
  }
}
