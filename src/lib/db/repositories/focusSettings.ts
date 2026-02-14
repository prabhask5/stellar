/**
 * @fileoverview Repository for **focus settings** (Pomodoro timer configuration).
 *
 * Each user has at most one `focus_settings` record that stores their
 * preferred timer durations and automation flags.  This module provides
 * get-or-create semantics — if no settings exist for the user, a default
 * record is created transparently.
 *
 * Table: `focus_settings`
 *
 * @module repositories/focusSettings
 */

import { engineUpdate, engineQuery, engineGetOrCreate } from '@prabhask5/stellar-engine/data';
import type { FocusSettings } from '$lib/types';

// =============================================================================
//                              Defaults
// =============================================================================

/**
 * Default Pomodoro timer configuration applied when a user's settings are
 * first created.  Based on the classic 25/5/15 Pomodoro technique.
 *
 * - `focus_duration`            — 25 minutes of focused work
 * - `break_duration`            — 5-minute short break
 * - `long_break_duration`       — 15-minute long break
 * - `cycles_before_long_break`  — Long break after every 4 cycles
 * - `auto_start_breaks`         — Do **not** auto-start breaks
 * - `auto_start_focus`          — Do **not** auto-start next focus phase
 */
const DEFAULT_FOCUS_SETTINGS = {
  focus_duration: 25,
  break_duration: 5,
  long_break_duration: 15,
  cycles_before_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false
};

// =============================================================================
//                             Read Operations
// =============================================================================

/**
 * Fetches the user's focus settings, or `null` if none exist yet.
 *
 * Unlike {@link getOrCreateFocusSettings}, this will **not** create a
 * default record — useful for checking existence without side effects.
 *
 * @param userId - The owning user's identifier
 * @returns The {@link FocusSettings}, or `null` if not found / deleted
 */
export async function getFocusSettings(userId: string): Promise<FocusSettings | null> {
  const results = (await engineQuery(
    'focus_settings',
    'user_id',
    userId
  )) as unknown as FocusSettings[];
  const settings = results[0];

  if (!settings || settings.deleted) return null;
  return settings;
}

/**
 * Returns the user's focus settings, creating a default record if none exists.
 *
 * Uses {@link engineGetOrCreate} with `checkRemote: true` to handle the case
 * where settings exist on the server but haven't been synced locally yet.
 *
 * @param userId - The owning user's identifier
 * @returns The existing or newly created {@link FocusSettings}
 */
export async function getOrCreateFocusSettings(userId: string): Promise<FocusSettings> {
  const result = await engineGetOrCreate(
    'focus_settings',
    'user_id',
    userId,
    {
      ...DEFAULT_FOCUS_SETTINGS,
      user_id: userId
    },
    { checkRemote: true }
  );
  return result as unknown as FocusSettings;
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Updates the user's focus timer configuration.
 *
 * @param id      - The focus settings record's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link FocusSettings}, or `undefined` if not found
 */
export async function updateFocusSettings(
  id: string,
  updates: Partial<
    Pick<
      FocusSettings,
      | 'focus_duration'
      | 'break_duration'
      | 'long_break_duration'
      | 'cycles_before_long_break'
      | 'auto_start_breaks'
      | 'auto_start_focus'
    >
  >
): Promise<FocusSettings | undefined> {
  const result = await engineUpdate('focus_settings', id, updates as Record<string, unknown>);
  return result as unknown as FocusSettings | undefined;
}
