import { engineUpdate, engineQuery, engineGetOrCreate } from '@prabhask5/stellar-engine/data';
import type { FocusSettings } from '$lib/types';

// Default focus settings
const DEFAULT_FOCUS_SETTINGS = {
  focus_duration: 25,
  break_duration: 5,
  long_break_duration: 15,
  cycles_before_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false
};

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
