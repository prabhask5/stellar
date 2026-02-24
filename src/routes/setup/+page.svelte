<script lang="ts">
  /**
   * @fileoverview Setup wizard page — first-time Supabase configuration.
   *
   * Guides the user through a four-step process to connect their own
   * Supabase backend to Stellar:
   *
   * 1. Create a Supabase project (instructions only).
   * 2. Initialize the database (automatic — no manual SQL needed).
   * 3. Enter and validate Supabase credentials (URL + publishable key).
   * 4. Persist configuration via Vercel API (set env vars + redeploy).
   *
   * After a successful deploy the page polls for a new service-worker
   * version — once detected the user is prompted to refresh.
   *
   * Access is controlled by the companion `+page.ts` load function:
   * - Unconfigured → anyone can reach this page (`isFirstSetup: true`).
   * - Configured → only authenticated users (`isFirstSetup: false`).
   */

  import { page } from '$app/stores';
  import { setConfig } from 'stellar-drive/config';
  import { isOnline } from 'stellar-drive/stores';
  import { pollForNewServiceWorker } from 'stellar-drive/kit';
  import Reconfigure from './Reconfigure.svelte';

  // =============================================================================
  //  Form State — Supabase + Vercel credentials
  // =============================================================================

  /** Supabase project URL entered by the user */
  let supabaseUrl = $state('');

  /** Supabase publishable key entered by the user */
  let supabasePublishableKey = $state('');

  /** One-time Vercel API token for setting env vars */
  let vercelToken = $state('');

  // =============================================================================
  //  UI State — Validation & Deployment feedback
  // =============================================================================

  /** Whether the "Test Connection" request is in-flight */
  let validating = $state(false);

  /** Current wizard step (1–4) */
  let currentStep = $state(1);

  /** Whether the deploy/redeploy flow is in-flight */
  let deploying = $state(false);

  /** Error from credential validation, if any */
  let validateError = $state<string | null>(null);

  /** `true` after credentials have been successfully validated */
  let validateSuccess = $state(false);

  /** Error from the deployment step, if any */
  let deployError = $state<string | null>(null);

  /** Current deployment pipeline stage — drives the progress UI */
  let deployStage = $state<'idle' | 'setting-env' | 'deploying' | 'ready'>('idle');

  /** URL returned by Vercel for the triggered deployment (informational) */
  let _deploymentUrl = $state('');

  // =============================================================================
  //  Derived State
  // =============================================================================

  /** Whether this is a first-time setup (public) or reconfiguration */
  const isFirstSetup = $derived(($page.data as { isFirstSetup?: boolean }).isFirstSetup ?? false);

  /**
   * Snapshot of the credentials at validation time — used to detect
   * if the user edits the inputs *after* a successful validation.
   */
  let validatedUrl = $state('');
  let validatedKey = $state('');

  /**
   * `true` when the user changes credentials after a successful
   * validation — the "Continue" button should be re-disabled.
   */
  const credentialsChanged = $derived(
    validateSuccess && (supabaseUrl !== validatedUrl || supabasePublishableKey !== validatedKey)
  );

  // =============================================================================
  //  Effects
  // =============================================================================

  /**
   * Auto-reset validation state when the user modifies credentials
   * after they were already validated — forces re-validation.
   */
  $effect(() => {
    if (credentialsChanged) {
      validateSuccess = false;
      validateError = null;
    }
  });

  // =============================================================================
  //  Validation — "Test Connection"
  // =============================================================================

  /**
   * Send the entered Supabase credentials to `/api/setup/validate`
   * and update UI state based on the result. On success, also
   * cache the config locally via `setConfig` so the app is usable
   * immediately after the deployment finishes.
   */
  async function handleValidate() {
    validateError = null;
    validateSuccess = false;
    validating = true;

    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabasePublishableKey })
      });

      const data = await res.json();

      if (data.valid) {
        validateSuccess = true;
        validatedUrl = supabaseUrl;
        validatedKey = supabasePublishableKey;
        /* Cache config locally so the app works immediately after deploy */
        setConfig({
          supabaseUrl,
          supabasePublishableKey,
          configured: true
        });
      } else {
        validateError = data.error || 'Validation failed';
      }
    } catch (e) {
      validateError = e instanceof Error ? e.message : 'Network error';
    }

    validating = false;
  }

  // =============================================================================
  //  Deployment Polling
  // =============================================================================

  /**
   * Poll for a new service-worker version to detect when the Vercel
   * redeployment has finished. Uses the engine's `pollForNewServiceWorker`
   * helper which checks `registration.update()` at regular intervals.
   *
   * Resolves a Promise when a new SW is detected in the waiting state.
   */
  function pollForDeployment(): Promise<void> {
    return new Promise((resolve) => {
      pollForNewServiceWorker({
        intervalMs: 3000,
        maxAttempts: 200,
        onFound: () => {
          deployStage = 'ready';
          resolve();
        }
      });
    });
  }

  // =============================================================================
  //  Deployment — Set env vars + trigger Vercel redeploy
  // =============================================================================

  /**
   * Send credentials and the Vercel token to `/api/setup/deploy`,
   * which sets the environment variables on the Vercel project and
   * triggers a fresh deployment. Then poll until the new build is live.
   */
  async function handleDeploy() {
    deployError = null;
    deploying = true;
    deployStage = 'setting-env';

    try {
      const res = await fetch('/api/setup/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabasePublishableKey, vercelToken })
      });

      const data = await res.json();

      if (data.success) {
        deployStage = 'deploying';
        _deploymentUrl = data.deploymentUrl || '';
        /* Poll for the new SW version → marks `deployStage = 'ready'` */
        await pollForDeployment();
      } else {
        deployError = data.error || 'Deployment failed';
        deployStage = 'idle';
      }
    } catch (e) {
      deployError = e instanceof Error ? e.message : 'Network error';
      deployStage = 'idle';
    }

    deploying = false;
  }
</script>

<svelte:head>
  <title>Set Up - Stellar Planner</title>
</svelte:head>

{#if !isFirstSetup}
  <!-- ═══ Reconfigure Mode ═══ -->
  <div class="setup-background reconfig-mode">
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
    <div class="nebula nebula-1"></div>
    <div class="nebula nebula-2"></div>
    <div class="nebula nebula-3"></div>
    <div class="orbital-system">
      <div class="orbit orbit-1"><div class="orbit-particle"></div></div>
      <div class="orbit orbit-2"><div class="orbit-particle"></div></div>
      <div class="orbit orbit-3"><div class="orbit-particle"></div></div>
    </div>
  </div>
  <div class="setup-overlay reconfig-mode">
    <div class="setup-container">
      <div class="setup-header">
        <div class="logo-container">
          <svg
            class="logo-icon"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#logoGradient)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6c5ce7" />
                <stop offset="100%" stop-color="#ff79c6" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" />
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            />
            <path d="M2 12h20" />
          </svg>
          <h1 class="setup-title">Reconfigure Stellar Planner</h1>
        </div>
        <p class="setup-subtitle">Update your Supabase credentials and redeploy</p>
      </div>
      <Reconfigure />
    </div>
  </div>
{:else}
  <!-- ═══ Cosmic Background ═══ -->
  <div class="setup-background" class:reconfig-mode={!isFirstSetup}>
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
    <div class="nebula nebula-1"></div>
    <div class="nebula nebula-2"></div>
    <div class="nebula nebula-3"></div>
    <!-- Orbital System — decorative rotating rings -->
    <div class="orbital-system">
      <div class="orbit orbit-1">
        <div class="orbit-particle"></div>
      </div>
      <div class="orbit orbit-2">
        <div class="orbit-particle"></div>
      </div>
      <div class="orbit orbit-3">
        <div class="orbit-particle"></div>
      </div>
    </div>
  </div>

  <!-- ═══ Setup Overlay ═══ -->
  <div class="setup-overlay" class:reconfig-mode={!isFirstSetup}>
    <div class="setup-container">
      <!-- ═══ Header — Logo + title ═══ -->
      <div class="setup-header">
        <div class="logo-container">
          <svg
            class="logo-icon"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#logoGradient)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6c5ce7" />
                <stop offset="100%" stop-color="#ff79c6" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" />
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            />
            <path d="M2 12h20" />
          </svg>
          <h1 class="setup-title">Set Up Stellar Planner</h1>
        </div>
        <p class="setup-subtitle">
          Configure Stellar Planner to connect to your own Supabase backend
        </p>
      </div>

      <!-- ═══ Step Indicator ═══ -->
      <div class="step-indicator">
        {#each [1, 2, 3, 4] as step (step)}
          <div
            class="step-dot"
            class:active={currentStep === step}
            class:completed={currentStep > step}
          >
            {#if currentStep > step}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
              >
            {:else}
              {step}
            {/if}
          </div>
          {#if step < 4}
            <div class="step-line" class:completed={currentStep > step}></div>
          {/if}
        {/each}
      </div>

      <!-- ═══ Offline Warning ═══ -->
      {#if !$isOnline}
        <div class="offline-card">
          <div class="offline-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </div>
          <h2 class="offline-title">Internet Required</h2>
          <p class="offline-description">
            Setup requires an internet connection to configure your Supabase backend and deploy
            credentials. Please connect to the internet to continue.
          </p>
        </div>
      {/if}

      <!-- ═══ Step Card ═══ -->
      <div class="step-card">
        <!-- ─── Step 1: Create a Supabase Project ─── -->
        {#if currentStep === 1}
          <div class="section-header">
            <span class="section-number">1</span>
            <h2 class="section-title">Create a Supabase Project</h2>
          </div>
          <div class="section-content">
            <p class="section-description">
              Stellar Planner stores data in your own Supabase project. Create one if you don't have
              one already &mdash; the free tier is more than enough.
            </p>
            <ol class="instruction-list">
              <li>
                Go to <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer">supabase.com/dashboard</a
                > and sign in (or create an account)
              </li>
              <li>
                Click <strong>New Project</strong>, pick a name, set a database password, and choose
                a region close to you
              </li>
              <li>Wait for provisioning to finish (about 30 seconds)</li>
            </ol>
            <div class="info-note">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span
                >For production use, configure a custom SMTP provider in Authentication &gt;
                Settings. Supabase's built-in email service is limited to 2 emails per hour.</span
              >
            </div>
          </div>

          <!-- ─── Step 2: Initialize Database ─── -->
        {:else if currentStep === 2}
          <div class="section-header">
            <span class="section-number">2</span>
            <h2 class="section-title">Initialize the Database</h2>
          </div>
          <div class="section-content">
            <p class="section-description">
              The required tables and RLS policies are created automatically during the build
              process. When your app deploys to Vercel, the schema is pushed to your Supabase
              database &mdash; no manual SQL is needed.
            </p>
          </div>

          <!-- ─── Step 3: Enter Credentials ─── -->
        {:else if currentStep === 3}
          <div class="section-header">
            <span class="section-number">3</span>
            <h2 class="section-title">Connect Your Supabase Project</h2>
          </div>
          <div class="section-content">
            <p class="section-description">
              Find these values in your Supabase dashboard under <strong>Settings &gt; API</strong>.
            </p>

            <!-- Supabase URL input -->
            <div class="form-group">
              <label for="supabaseUrl">Supabase URL</label>
              <input
                type="url"
                id="supabaseUrl"
                bind:value={supabaseUrl}
                placeholder="https://your-project.supabase.co"
                disabled={deploying || deployStage === 'ready'}
              />
            </div>

            <!-- Supabase publishable key input -->
            <div class="form-group">
              <label for="supabasePublishableKey">Supabase Publishable Key</label>
              <input
                type="text"
                id="supabasePublishableKey"
                bind:value={supabasePublishableKey}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                disabled={deploying || deployStage === 'ready'}
              />
              <span class="input-hint"
                >This is your public (anon) key. Row-Level Security policies enforce access control.</span
              >
            </div>

            <!-- Validation feedback messages -->
            {#if validateError}
              <div class="message error">{validateError}</div>
            {/if}

            {#if validateSuccess && !credentialsChanged}
              <div class="message success">Credentials validated successfully.</div>
            {/if}

            <!-- "Test Connection" button -->
            <button
              class="btn btn-secondary"
              onclick={handleValidate}
              disabled={!supabaseUrl ||
                !supabasePublishableKey ||
                validating ||
                deploying ||
                deployStage === 'ready'}
            >
              {#if validating}
                <span class="loading-spinner"></span>
                Validating...
              {:else}
                Test Connection
              {/if}
            </button>
          </div>

          <!-- ─── Step 4: Deploy ─── -->
        {:else}
          <div class="section-header">
            <span class="section-number">4</span>
            <h2 class="section-title">Deploy to Vercel</h2>
          </div>
          <div class="section-content">
            <p class="section-description">
              To persist your Supabase credentials across deployments, Stellar needs a one-time
              Vercel API token to set environment variables and trigger a redeploy.
            </p>

            <ol class="instruction-list">
              <li>
                Go to <a
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer">Vercel Settings &gt; Tokens</a
                >
              </li>
              <li>Create a token with a descriptive name (e.g., "Stellar Setup")</li>
              <li>Copy and paste below</li>
            </ol>

            <!-- Token usage note — not stored after use -->
            <div class="info-note">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span
                >This token is used once to set environment variables and trigger a redeployment. It
                is not stored.</span
              >
            </div>

            <!-- Vercel token input -->
            <div class="form-group">
              <label for="vercelToken">Vercel API Token</label>
              <input
                type="password"
                id="vercelToken"
                bind:value={vercelToken}
                placeholder="Enter your Vercel token"
                disabled={deploying || deployStage === 'ready'}
              />
            </div>

            <!-- Deploy error feedback -->
            {#if deployError}
              <div class="message error">{deployError}</div>
            {/if}

            <!-- Deploy button -->
            {#if deployStage === 'idle'}
              <button
                class="btn btn-primary"
                onclick={handleDeploy}
                disabled={!validateSuccess || credentialsChanged || !vercelToken || deploying}
              >
                Deploy
              </button>
            {/if}

            <!-- Deployment progress stages -->
            {#if deployStage !== 'idle'}
              <div class="deploy-steps">
                <!-- Step A: Setting environment variables -->
                <div
                  class="deploy-step"
                  class:active={deployStage === 'setting-env'}
                  class:complete={deployStage === 'deploying' || deployStage === 'ready'}
                >
                  <div class="deploy-step-indicator">
                    {#if deployStage === 'setting-env'}
                      <span class="loading-spinner small"></span>
                    {:else}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {/if}
                  </div>
                  <span>Setting environment variables...</span>
                </div>

                <!-- Step B: Deploying (waiting for new build) -->
                <div
                  class="deploy-step"
                  class:active={deployStage === 'deploying'}
                  class:complete={deployStage === 'ready'}
                >
                  <div class="deploy-step-indicator">
                    {#if deployStage === 'deploying'}
                      <span class="loading-spinner small"></span>
                    {:else if deployStage === 'ready'}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {:else}
                      <div class="deploy-dot"></div>
                    {/if}
                  </div>
                  <span>Deploying... (might take a bit)</span>
                </div>

                <!-- Step C: Ready -->
                <div class="deploy-step" class:active={deployStage === 'ready'}>
                  <div class="deploy-step-indicator">
                    {#if deployStage === 'ready'}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {:else}
                      <div class="deploy-dot"></div>
                    {/if}
                  </div>
                  <span>Ready</span>
                </div>
              </div>

              <!-- Success message when deployment is live -->
              {#if deployStage === 'ready'}
                <div class="message success">
                  Your Stellar instance is configured and the new deployment is live. Use the
                  notification at the bottom of the page to refresh and load the updated version.
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>

      <!-- ═══ Step Navigation ═══ -->
      <div class="step-nav">
        {#if currentStep > 1}
          <button
            class="btn btn-secondary"
            onclick={() => currentStep--}
            disabled={deploying || deployStage === 'ready'}
          >
            Back
          </button>
        {:else}
          <div></div>
        {/if}

        {#if currentStep < 3}
          <button class="btn btn-primary" onclick={() => currentStep++}>Continue</button>
        {:else if currentStep === 3}
          <button
            class="btn btn-primary"
            onclick={() => currentStep++}
            disabled={!validateSuccess || credentialsChanged}
          >
            Continue
          </button>
        {/if}
      </div>

      <!-- ═══ Security notice (first-time setup only) ═══ -->
      {#if isFirstSetup}
        <div class="security-warning">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            This page is publicly accessible until setup is complete. Afterward, only authenticated
            users can reconfigure.
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     COSMIC BACKGROUND — Starfield/nebula system
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-background {
    position: fixed;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(40, 20, 80, 0.5) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, rgba(20, 10, 60, 0.3) 0%, transparent 50%),
      linear-gradient(180deg, #050510 0%, #0a0a1a 30%, #0d0d25 60%, #080818 100%);
    overflow: hidden;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CSS STARFIELD — Three layers at increasing sizes
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .stars {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .stars-small {
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.6) 50%, transparent 100%),
      radial-gradient(1px 1px at 30% 40%, rgba(255, 255, 255, 0.5) 50%, transparent 100%),
      radial-gradient(1px 1px at 50% 10%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(1px 1px at 70% 60%, rgba(255, 255, 255, 0.5) 50%, transparent 100%),
      radial-gradient(1px 1px at 90% 30%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(1px 1px at 20% 70%, rgba(255, 255, 255, 0.3) 50%, transparent 100%),
      radial-gradient(1px 1px at 60% 80%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(1px 1px at 80% 50%, rgba(255, 255, 255, 0.3) 50%, transparent 100%),
      radial-gradient(1px 1px at 40% 90%, rgba(255, 255, 255, 0.5) 50%, transparent 100%),
      radial-gradient(1px 1px at 15% 55%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
    animation: twinkle 4s ease-in-out infinite alternate;
  }

  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 25% 15%, rgba(255, 255, 255, 0.5) 50%, transparent 100%),
      radial-gradient(1.5px 1.5px at 55% 45%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(1.5px 1.5px at 75% 25%, rgba(255, 255, 255, 0.5) 50%, transparent 100%),
      radial-gradient(1.5px 1.5px at 85% 75%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(1.5px 1.5px at 45% 65%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
    animation: twinkle 5s ease-in-out infinite alternate-reverse;
  }

  .stars-large {
    background-image:
      radial-gradient(2px 2px at 35% 35%, rgba(255, 255, 255, 0.4) 50%, transparent 100%),
      radial-gradient(2px 2px at 65% 55%, rgba(255, 255, 255, 0.3) 50%, transparent 100%),
      radial-gradient(2.5px 2.5px at 20% 80%, rgba(108, 92, 231, 0.5) 50%, transparent 100%);
    animation: twinkle 6s ease-in-out infinite alternate;
  }

  @keyframes twinkle {
    0% {
      opacity: 0.7;
    }
    100% {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NEBULAE — Blurred color orbs for ambient depth
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.15;
  }

  .nebula-1 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.6) 0%, transparent 70%);
    top: -10%;
    right: -5%;
    animation: nebulaDrift 20s ease-in-out infinite alternate;
  }

  .nebula-2 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(255, 121, 198, 0.4) 0%, transparent 70%);
    bottom: -10%;
    left: -5%;
    animation: nebulaDrift 25s ease-in-out infinite alternate-reverse;
  }

  .nebula-3 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(72, 52, 212, 0.3) 0%, transparent 70%);
    top: 40%;
    left: 30%;
    animation: nebulaDrift 30s ease-in-out infinite alternate;
  }

  @keyframes nebulaDrift {
    0% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(20px, -10px) scale(1.05);
    }
    100% {
      transform: translate(-10px, 15px) scale(0.95);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ORBITAL SYSTEM — Decorative rotating rings with particles
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .orbital-system {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0;
    height: 0;
  }

  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border: 1px solid rgba(108, 92, 231, 0.08);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .orbit-1 {
    width: 300px;
    height: 300px;
    animation: orbitRotate 30s linear infinite;
  }

  .orbit-2 {
    width: 500px;
    height: 500px;
    animation: orbitRotate 45s linear infinite reverse;
  }

  .orbit-3 {
    width: 700px;
    height: 700px;
    animation: orbitRotate 60s linear infinite;
  }

  @keyframes orbitRotate {
    from {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  /* Glowing dot positioned at 12-o'clock on each orbit ring */
  .orbit-particle {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--color-primary, #6c5ce7);
    border-radius: 50%;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    box-shadow: 0 0 8px rgba(108, 92, 231, 0.6);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SETUP OVERLAY & CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem 1rem;
  }

  /* Reconfiguration mode — sits under the navbar instead of overlaying */
  .setup-background.reconfig-mode {
    z-index: -1;
  }

  .setup-overlay.reconfig-mode {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: calc(100dvh - 64px);
    padding: 2rem 1rem;
  }

  .setup-container {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HEADER — Logo + shimmer title
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-header {
    text-align: center;
    padding: 2rem 0 0.5rem;
  }

  .logo-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .logo-icon {
    filter: drop-shadow(0 0 12px rgba(108, 92, 231, 0.5));
  }

  .setup-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-text, #e8e6f0);
    margin: 0;
    background: linear-gradient(135deg, #e8e6f0, #a78bfa, #e8e6f0);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .setup-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted, #8b8ba3);
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STEP INDICATOR — Horizontal numbered dots connected by lines
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-dot {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8125rem;
    font-weight: 700;
    border: 2px solid rgba(108, 92, 231, 0.25);
    color: var(--color-text-muted, #8b8ba3);
    background: rgba(10, 10, 20, 0.8);
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .step-dot.active {
    border-color: var(--color-primary, #6c5ce7);
    color: var(--color-primary-light, #8b7cf0);
    background: rgba(108, 92, 231, 0.15);
    box-shadow: 0 0 16px rgba(108, 92, 231, 0.35);
  }

  .step-dot.completed {
    border-color: #26de81;
    background: #26de81;
    color: white;
    box-shadow: 0 0 10px rgba(38, 222, 129, 0.3);
  }

  .step-line {
    width: 44px;
    height: 2px;
    background: rgba(108, 92, 231, 0.15);
    transition: background 0.3s ease;
  }

  .step-line.completed {
    background: #26de81;
    box-shadow: 0 0 6px rgba(38, 222, 129, 0.3);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STEP CARD — Glassmorphism card with top glow line
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .step-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: 16px;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    overflow: hidden;
    position: relative;
  }

  /* Top glow line — gradient accent at the card's top edge */
  .step-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent
    );
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem 0;
  }

  /* Numbered badge for each section */
  .section-number {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary, linear-gradient(135deg, #6c5ce7, #a78bfa));
    color: white;
    font-weight: 700;
    font-size: 0.8125rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .section-title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--color-text, #e8e6f0);
    margin: 0;
  }

  .section-content {
    padding: 1rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-description {
    font-size: 0.875rem;
    color: var(--color-text-muted, #8b8ba3);
    margin: 0;
    line-height: 1.6;
  }

  .section-description strong {
    color: var(--color-text, #e8e6f0);
    font-weight: 600;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STEP NAVIGATION — Back / Continue buttons
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .step-nav {
    display: flex;
    justify-content: space-between;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     INSTRUCTION LISTS — Numbered steps within each section
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .instruction-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    font-size: 0.875rem;
    color: var(--color-text-muted, #8b8ba3);
    line-height: 1.6;
  }

  .instruction-list li::marker {
    color: rgba(108, 92, 231, 0.6);
    font-weight: 600;
  }

  .instruction-list a {
    color: var(--color-primary-light, #a78bfa);
    text-decoration: none;
    border-bottom: 1px solid rgba(167, 139, 250, 0.3);
    transition: all 0.2s;
  }

  .instruction-list a:hover {
    color: var(--color-primary, #6c5ce7);
    border-bottom-color: rgba(108, 92, 231, 0.6);
  }

  .instruction-list strong {
    color: var(--color-text, #e8e6f0);
    font-weight: 600;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     INFO NOTES — Inline callout boxes
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .info-note {
    display: flex;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: rgba(108, 92, 231, 0.08);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #8b8ba3);
    line-height: 1.5;
    align-items: flex-start;
  }

  .info-note svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-primary-light, #a78bfa);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SECURITY WARNING — Amber banner shown during first-time setup
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .security-warning {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    background: rgba(255, 165, 2, 0.08);
    border: 1px solid rgba(255, 165, 2, 0.3);
    border-radius: 12px;
    color: #ffa502;
    font-size: 0.8125rem;
    line-height: 1.5;
    align-items: flex-start;
  }

  .security-warning svg {
    flex-shrink: 0;
    margin-top: 1px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM STYLES — Input fields, labels, hints
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 700;
    color: var(--color-text-muted, #8b8ba3);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 0.9375rem;
    color: var(--color-text, #e8e6f0);
    background: rgba(10, 10, 18, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: 10px;
    transition: all 0.3s;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.15);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  input::placeholder {
    color: rgba(139, 139, 163, 0.5);
  }

  .input-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted, #8b8ba3);
    opacity: 0.7;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MESSAGES — Error (red) and success (green) feedback banners
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .message {
    padding: 0.875rem 1rem;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .error {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.15) 0%,
      rgba(255, 107, 107, 0.05) 100%
    );
    color: #ff6b6b;
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .success {
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.15) 0%, rgba(38, 222, 129, 0.05) 100%);
    color: #26de81;
    border: 1px solid rgba(38, 222, 129, 0.3);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BUTTONS — Primary (gradient) & secondary (outline) styles
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    border: none;
    font-family: inherit;
  }

  .btn-primary {
    background: var(--gradient-primary, linear-gradient(135deg, #6c5ce7, #a78bfa));
    color: white;
    box-shadow: 0 4px 16px rgba(108, 92, 231, 0.25);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(108, 92, 231, 0.35);
  }

  .btn-secondary {
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light, #a78bfa);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .done-link {
    text-decoration: none;
    text-align: center;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOADING SPINNER — Rotating border animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-spinner.small {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  .btn-secondary .loading-spinner {
    border-color: rgba(108, 92, 231, 0.3);
    border-top-color: var(--color-primary-light, #a78bfa);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DEPLOYMENT PROGRESS — Three-step pipeline tracker
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .deploy-steps {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .deploy-step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-muted, #8b8ba3);
    opacity: 0.5;
    transition: all 0.3s;
  }

  /* Active step — highlighted in primary color */
  .deploy-step.active {
    opacity: 1;
    color: var(--color-primary-light, #a78bfa);
  }

  /* Completed step — green */
  .deploy-step.complete {
    opacity: 1;
    color: #26de81;
  }

  .deploy-step-indicator {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Inactive dot placeholder before a step begins */
  .deploy-dot {
    width: 8px;
    height: 8px;
    background: rgba(108, 92, 231, 0.3);
    border-radius: 50%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OFFLINE PLACEHOLDER — Shown when navigator is offline
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .offline-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: 16px;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    text-align: center;
    padding: 2.5rem 1.5rem;
  }

  .offline-icon {
    color: var(--color-text-muted, #8b8ba3);
    margin-bottom: 1.5rem;
    opacity: 0.7;
  }

  .offline-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text, #e8e6f0);
    margin: 0 0 0.75rem;
  }

  .offline-description {
    color: var(--color-text-muted, #8b8ba3);
    font-size: 0.9375rem;
    line-height: 1.6;
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Mobile & tablet breakpoints
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .setup-overlay {
      padding: 1rem 0.75rem;
    }

    .setup-title {
      font-size: 1.375rem;
    }

    .setup-subtitle {
      font-size: 0.8125rem;
    }

    .section-content {
      padding: 0.875rem 1.25rem 1.25rem;
    }

    .section-header {
      padding: 1rem 1.25rem 0;
    }

    input {
      padding: 0.75rem 0.875rem;
      font-size: 16px; /* Prevents iOS zoom */
    }

    .step-dot {
      width: 30px;
      height: 30px;
    }

    .step-line {
      width: 32px;
    }
  }

  /* iPhone SE — extra compact layout */
  @media (max-width: 375px) {
    .setup-overlay {
      padding: 0.75rem 0.5rem;
    }

    .setup-title {
      font-size: 1.25rem;
    }

    .section-content {
      padding: 0.75rem 1rem 1rem;
    }

    .section-header {
      padding: 0.875rem 1rem 0;
    }

    .logo-container {
      flex-direction: column;
      gap: 0.5rem;
    }

    .step-dot {
      width: 28px;
      height: 28px;
      font-size: 0.75rem;
    }

    .step-line {
      width: 24px;
    }
  }

  /* iPhone 16 Pro (~402px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .setup-overlay {
      padding: 1.25rem 1rem;
    }
  }

  /* iPhone Pro Max (430px+) */
  @media (min-width: 430px) and (max-width: 640px) {
    .setup-overlay {
      padding: 1.5rem 1rem;
    }

    .section-content {
      padding: 1rem 1.5rem 1.5rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION — Respect prefers-reduced-motion preference
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .stars-small,
    .stars-medium,
    .stars-large,
    .nebula,
    .orbit,
    .loading-spinner {
      animation: none;
    }

    .setup-title {
      animation: none;
      background: none;
      -webkit-text-fill-color: var(--color-text, #e8e6f0);
    }

    .btn {
      transition: none;
    }

    .step-dot,
    .step-line,
    .deploy-step {
      transition: none;
    }
  }
</style>
