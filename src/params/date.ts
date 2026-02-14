// =============================================================================
//  Stellar — Date Parameter Matcher
// =============================================================================
//
//  SvelteKit param matcher that validates URL segments against the ISO 8601
//  date format `YYYY-MM-DD`. Used in routes like `/plans/[date=date]` to ensure
//  the `date` param is well-formed before the route loads.
//
//  Pattern: `/^\d{4}-\d{2}-\d{2}$/` → e.g., `2025-03-15`
//
// =============================================================================

import type { ParamMatcher } from '@sveltejs/kit';

/**
 * **Date param matcher** — validates that a route parameter is a `YYYY-MM-DD` date string.
 *
 * @param param - The raw URL segment to validate
 * @returns `true` if `param` matches the `YYYY-MM-DD` format, `false` otherwise
 */
export const match: ParamMatcher = (param) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(param);
};
