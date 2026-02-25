/**
 * @fileoverview Supabase credential validation endpoint.
 *
 * Delegates entirely to stellar-drive's `createValidateHandler()` which
 * validates credentials and includes built-in security guards (already-
 * configured check + CSRF origin validation).
 */

import { createValidateHandler } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/** POST /api/setup/validate — Test Supabase credentials. */
export const POST: RequestHandler = createValidateHandler();
