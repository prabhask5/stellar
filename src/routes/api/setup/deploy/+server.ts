/**
 * @fileoverview Setup Deploy API Endpoint — `/api/setup/deploy`
 *
 * Sets Supabase environment variables in a Vercel project and triggers
 * a production redeployment so the new config takes effect immediately.
 *
 * The caller supplies a **one-time** Vercel token that is used exclusively
 * for this request and is **never** stored server-side.
 *
 * Flow:
 *  1. Validate required inputs (Supabase URL, anon key, Vercel token).
 *  2. Upsert `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
 *     as Vercel environment variables (create or update).
 *  3. Trigger a production redeployment — first via Git source, then
 *     falling back to cloning the current deployment if Git info is unavailable.
 */

// =============================================================================
//  IMPORTS
// =============================================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// =============================================================================
//  TYPES
// =============================================================================

/**
 * Shape of a single environment variable returned by the Vercel API
 * (`GET /v9/projects/:id/env`).
 */
interface VercelEnvVar {
  key: string;
  value: string;
  target: string[];
  type: string;
}

// =============================================================================
//  HELPERS — Vercel API Utilities
// =============================================================================

/**
 * Low-level wrapper around the Vercel REST API.
 *
 * @param path   — API path appended to `https://api.vercel.com` (e.g. `/v13/deployments`).
 * @param token  — Bearer token for authentication.
 * @param method — HTTP method; defaults to `'GET'`.
 * @param body   — Optional JSON-serialisable request body.
 * @returns The raw `Response` object from `fetch`.
 */
async function vercelApi(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

/**
 * Creates **or** updates a single environment variable on a Vercel project.
 *
 * Strategy:
 *  1. Attempt to **create** the variable via `POST /v10/projects/:id/env`.
 *  2. If the API reports `ENV_ALREADY_EXISTS`, **list** all env vars to
 *     find the existing entry's ID, then **patch** it with the new value.
 *
 * @param projectId — Vercel project ID (from `VERCEL_PROJECT_ID`).
 * @param token     — Vercel API bearer token.
 * @param key       — Environment variable name.
 * @param value     — Environment variable value.
 * @throws If the create, list, or update request fails unexpectedly.
 */
async function setEnvVar(
  projectId: string,
  token: string,
  key: string,
  value: string
): Promise<void> {
  /* ── Step 1 — Attempt to create the env var ──── */
  const createRes = await vercelApi(`/v10/projects/${projectId}/env`, token, 'POST', {
    key,
    value,
    target: ['production', 'preview', 'development'],
    type: 'plain'
  });

  if (createRes.ok) return; /* created successfully → done */

  const createData = await createRes.json();

  /* ── Step 2 — Handle "already exists" by updating instead ──── */
  const errorCode = createData.error?.code || '';
  const errorMessage = createData.error?.message || '';
  if (errorCode === 'ENV_ALREADY_EXISTS' || errorMessage.includes('already exists')) {
    /* List all env vars to locate the existing entry's ID */
    const listRes = await vercelApi(`/v9/projects/${projectId}/env`, token);
    if (!listRes.ok) {
      throw new Error(`Failed to list env vars: ${listRes.statusText}`);
    }
    const listData = await listRes.json();
    const existing = listData.envs?.find((e: VercelEnvVar) => e.key === key);

    if (existing) {
      /* Patch the existing variable with the new value */
      const updateRes = await vercelApi(
        `/v9/projects/${projectId}/env/${existing.id}`,
        token,
        'PATCH',
        { value }
      );
      if (!updateRes.ok) {
        throw new Error(`Failed to update env var ${key}: ${updateRes.statusText}`);
      }
    } else {
      throw new Error(`Env var ${key} reported as existing but not found in list`);
    }
  } else {
    throw new Error(
      `Failed to create env var ${key}: ${createData.error?.message || createRes.statusText}`
    );
  }
}

// =============================================================================
//  POST HANDLER — Deploy Supabase Configuration to Vercel
// =============================================================================

/**
 * Accepts Supabase credentials and a Vercel token, persists the credentials
 * as Vercel env vars, and triggers a production redeployment.
 *
 * @param request — The incoming `Request` with JSON body containing
 *                  `supabaseUrl`, `supabaseAnonKey`, and `vercelToken`.
 * @returns JSON `{ success: true, deploymentUrl }` on success,
 *          or `{ success: false, error }` on failure.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    /* ── Extract inputs from request body ──── */
    const { supabaseUrl, supabaseAnonKey, vercelToken } = await request.json();

    /* ── Guard — all three fields are required ──── */
    if (!supabaseUrl || !supabaseAnonKey || !vercelToken) {
      return json(
        { success: false, error: 'Supabase URL, Anon Key, and Vercel Token are required' },
        { status: 400 }
      );
    }

    /* ── Guard — must be running on Vercel ──── */
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) {
      return json(
        {
          success: false,
          error: 'VERCEL_PROJECT_ID not found. This endpoint only works on Vercel deployments.'
        },
        { status: 400 }
      );
    }

    // =========================================================================
    //  PHASE 1 — Upsert Environment Variables
    // =========================================================================

    await setEnvVar(projectId, vercelToken, 'PUBLIC_SUPABASE_URL', supabaseUrl);
    await setEnvVar(
      projectId,
      vercelToken,
      'PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
      supabaseAnonKey
    );

    // =========================================================================
    //  PHASE 2 — Trigger Production Redeployment
    // =========================================================================

    /* Read git metadata from Vercel runtime env vars */
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL;
    const gitRepo = process.env.VERCEL_GIT_REPO_SLUG;
    const gitOwner = process.env.VERCEL_GIT_REPO_OWNER;
    const gitRef = process.env.VERCEL_GIT_COMMIT_REF || 'main';

    /** URL of the newly created deployment (populated on success) */
    let deploymentUrl = '';

    /* ── Strategy A — Git-based redeployment (preferred) ──── */
    if (gitRepo && gitOwner) {
      const deployRes = await vercelApi(`/v13/deployments`, vercelToken, 'POST', {
        name: projectId,
        project: projectId,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: `${gitOwner}/${gitRepo}`,
          ref: gitRef
        }
      });

      if (deployRes.ok) {
        const deployData = await deployRes.json();
        deploymentUrl = deployData.url || '';
      }
    }

    /* ── Strategy B — Clone current deployment (fallback) ──── */
    if (!deploymentUrl && deploymentId) {
      const redeployRes = await vercelApi(`/v13/deployments`, vercelToken, 'POST', {
        name: projectId,
        project: projectId,
        target: 'production',
        deploymentId
      });

      if (redeployRes.ok) {
        const redeployData = await redeployRes.json();
        deploymentUrl = redeployData.url || '';
      }
    }

    return json({ success: true, deploymentUrl });
  } catch (e) {
    /* ── Catch-all — surface a friendly error message ──── */
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ success: false, error: message });
  }
};
