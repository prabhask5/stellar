import { derived, type Readable } from 'svelte/store';
import { userDisplayInfo as engineDisplayInfo } from '@prabhask5/stellar-engine/stores';

export const userDisplayInfo: Readable<{
  firstName: string;
  lastName: string;
  email: string;
} | null> = derived(engineDisplayInfo, ($info) => {
  if (!$info) return null;
  const p = $info.profile || {};
  return {
    firstName: (p.firstName as string) || (p.first_name as string) || '',
    lastName: (p.lastName as string) || (p.last_name as string) || '',
    email: $info.email
  };
});
