/**
 * Setup Deploy Endpoint
 *
 * Sets Supabase environment variables in Vercel and triggers a redeployment.
 * The Vercel token is used once and is not stored.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface VercelEnvVar {
  key: string;
  value: string;
  target: string[];
  type: string;
}

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

async function setEnvVar(projectId: string, token: string, key: string, value: string): Promise<void> {
  // Try to create the env var first
  const createRes = await vercelApi(`/v10/projects/${projectId}/env`, token, 'POST', {
    key,
    value,
    target: ['production', 'preview', 'development'],
    type: 'plain'
  });

  if (createRes.ok) return;

  const createData = await createRes.json();

  // If it already exists, find its ID and update it
  if (createData.error?.code === 'ENV_ALREADY_EXISTS') {
    // List env vars to find the ID
    const listRes = await vercelApi(`/v9/projects/${projectId}/env`, token);
    if (!listRes.ok) {
      throw new Error(`Failed to list env vars: ${listRes.statusText}`);
    }
    const listData = await listRes.json();
    const existing = listData.envs?.find((e: VercelEnvVar) => e.key === key);

    if (existing) {
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
    throw new Error(`Failed to create env var ${key}: ${createData.error?.message || createRes.statusText}`);
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { supabaseUrl, supabaseAnonKey, vercelToken } = await request.json();

    if (!supabaseUrl || !supabaseAnonKey || !vercelToken) {
      return json(
        { success: false, error: 'Supabase URL, Anon Key, and Vercel Token are required' },
        { status: 400 }
      );
    }

    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) {
      return json(
        { success: false, error: 'VERCEL_PROJECT_ID not found. This endpoint only works on Vercel deployments.' },
        { status: 400 }
      );
    }

    // Set environment variables
    await setEnvVar(projectId, vercelToken, 'PUBLIC_SUPABASE_URL', supabaseUrl);
    await setEnvVar(projectId, vercelToken, 'PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY', supabaseAnonKey);

    // Trigger redeployment
    // Get the current deployment's git info for redeployment
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL;
    const gitRepo = process.env.VERCEL_GIT_REPO_SLUG;
    const gitOwner = process.env.VERCEL_GIT_REPO_OWNER;
    const gitRef = process.env.VERCEL_GIT_COMMIT_REF || 'main';

    let deploymentUrl = '';

    if (gitRepo && gitOwner) {
      // Trigger deployment via git
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

    // If git-based deploy failed or no git info, try redeploying from current deployment
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
    const message = e instanceof Error ? e.message : 'Unknown error';
    return json({ success: false, error: message });
  }
};
