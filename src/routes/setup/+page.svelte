<script lang="ts">
  import { page } from '$app/stores';
  import { setConfig } from '@prabhask5/stellar-engine/config';
  import { isOnline } from '@prabhask5/stellar-engine/stores';

  // Form state
  let supabaseUrl = $state('');
  let supabaseAnonKey = $state('');
  let vercelToken = $state('');

  // UI state
  let validating = $state(false);
  let deploying = $state(false);
  let validateError = $state<string | null>(null);
  let validateSuccess = $state(false);
  let deployError = $state<string | null>(null);
  let deployStage = $state<'idle' | 'setting-env' | 'deploying' | 'ready'>('idle');
  let _deploymentUrl = $state('');

  // Access control from load function
  const isFirstSetup = $derived(($page.data as { isFirstSetup?: boolean }).isFirstSetup ?? false);

  // Track validated credentials to detect changes after validation
  let validatedUrl = $state('');
  let validatedKey = $state('');
  const credentialsChanged = $derived(
    validateSuccess && (supabaseUrl !== validatedUrl || supabaseAnonKey !== validatedKey)
  );

  // Reset validation when credentials change after successful validation
  $effect(() => {
    if (credentialsChanged) {
      validateSuccess = false;
      validateError = null;
    }
  });

  async function handleValidate() {
    validateError = null;
    validateSuccess = false;
    validating = true;

    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabaseAnonKey })
      });

      const data = await res.json();

      if (data.valid) {
        validateSuccess = true;
        validatedUrl = supabaseUrl;
        validatedKey = supabaseAnonKey;
        // Cache config locally so the app works immediately after deploy
        setConfig({
          supabaseUrl,
          supabaseAnonKey,
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

  async function pollForDeployment() {
    const maxAttempts = 200; // 3s * 200 = 10 minutes max
    const registration = await navigator.serviceWorker?.getRegistration();

    // If there's already a waiting SW from before, note it so we don't false-positive
    const existingWaiting = registration?.waiting;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        // Force the browser to check for a new service worker version
        await registration?.update();

        // A new SW (different from any pre-existing one) means the new build is live
        if (
          registration?.installing ||
          (registration?.waiting && registration.waiting !== existingWaiting)
        ) {
          deployStage = 'ready';
          return;
        }
      } catch {
        // Network error during poll, keep trying
      }
    }
    // Timed out but deployment was triggered — show ready anyway
    deployStage = 'ready';
  }

  async function handleDeploy() {
    deployError = null;
    deploying = true;
    deployStage = 'setting-env';

    try {
      const res = await fetch('/api/setup/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabaseAnonKey, vercelToken })
      });

      const data = await res.json();

      if (data.success) {
        deployStage = 'deploying';
        _deploymentUrl = data.deploymentUrl || '';
        // Poll /api/config until the new deployment is live with the submitted credentials
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
  <title>Set Up Stellar</title>
</svelte:head>

<!-- Cosmic Background -->
<div class="setup-background" class:admin-mode={!isFirstSetup}>
  <div class="stars stars-small"></div>
  <div class="stars stars-medium"></div>
  <div class="stars stars-large"></div>
  <div class="nebula nebula-1"></div>
  <div class="nebula nebula-2"></div>
  <div class="nebula nebula-3"></div>
  <!-- Orbital System -->
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

<!-- Setup Overlay -->
<div class="setup-overlay" class:admin-mode={!isFirstSetup}>
  <div class="setup-container">
    <!-- Header -->
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
        <h1 class="setup-title">Set Up Your Instance</h1>
      </div>
      <p class="setup-subtitle">Configure Stellar to connect to your own Supabase backend</p>
    </div>

    <!-- Offline Placeholder -->
    {#if !$isOnline}
      <div class="setup-section">
        <div class="section-content">
          <div class="offline-message">
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
        </div>
      </div>
    {:else}
      <!-- Security Warning (only on first setup) -->
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
            <strong>This page is publicly accessible</strong> until setup is complete. After your first
            user signs up and is granted admin privileges, only admins can access this page.
          </div>
        </div>
      {/if}

      <!-- Section 1: Create Supabase Project -->
      <section class="setup-section">
        <div class="section-header">
          <span class="section-number">1</span>
          <h2 class="section-title">Create a Supabase Project</h2>
        </div>
        <div class="section-content">
          <ol class="instruction-list">
            <li>
              Go to <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer">supabase.com/dashboard</a
              > and create a new project
            </li>
            <li>
              Choose a name, set a strong database password, and select a region close to your users
            </li>
            <li>Wait for the project to finish provisioning</li>
          </ol>
        </div>
      </section>

      <!-- Section 2: Configure Authentication -->
      <section class="setup-section">
        <div class="section-header">
          <span class="section-number">2</span>
          <h2 class="section-title">Configure Authentication</h2>
        </div>
        <div class="section-content">
          <ol class="instruction-list">
            <li>
              In your Supabase dashboard, go to <strong>Authentication &gt; Providers</strong>
            </li>
            <li>Ensure <strong>Email</strong> auth is enabled</li>
            <li>
              Under <strong>URL Configuration</strong>, set the <strong>Site URL</strong> to your
              deployment domain (e.g., <code>https://your-app.vercel.app</code>)
            </li>
            <li>Add <code>/confirm</code> to the <strong>Redirect URLs</strong> list</li>
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
              >For production, configure a custom SMTP provider in Authentication &gt; Settings.
              Supabase's built-in email service has a limit of 2 emails per hour.</span
            >
          </div>
        </div>
      </section>

      <!-- Section 3: Initialize Database -->
      <section class="setup-section">
        <div class="section-header">
          <span class="section-number">3</span>
          <h2 class="section-title">Initialize Database</h2>
        </div>
        <div class="section-content">
          <ol class="instruction-list">
            <li>In your Supabase dashboard, go to <strong>SQL Editor</strong></li>
            <li>Open the <code>supabase-schema.sql</code> file from the Stellar repository</li>
            <li>Copy the entire contents and paste it into the SQL Editor</li>
            <li>Click <strong>Run</strong> to create all tables, RLS policies, and functions</li>
          </ol>
          <div class="warning-note">
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
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Table names and columns must match exactly. Do not modify the schema.</span>
          </div>
        </div>
      </section>

      <!-- Section 4: Enter Credentials -->
      <section class="setup-section">
        <div class="section-header">
          <span class="section-number">4</span>
          <h2 class="section-title">Enter Credentials</h2>
        </div>
        <div class="section-content">
          <p class="section-description">
            Find these in your Supabase dashboard under <strong>Settings &gt; API</strong>.
          </p>

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

          <div class="form-group">
            <label for="supabaseAnonKey">Supabase Anon Key</label>
            <input
              type="text"
              id="supabaseAnonKey"
              bind:value={supabaseAnonKey}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              disabled={deploying || deployStage === 'ready'}
            />
            <span class="input-hint"
              >This is your public anon key, safe to use in the browser. RLS policies enforce
              security.</span
            >
          </div>

          {#if validateError}
            <div class="message error">{validateError}</div>
          {/if}

          {#if validateSuccess}
            <div class="message success">Credentials validated successfully</div>
          {/if}

          <button
            class="btn btn-secondary"
            onclick={handleValidate}
            disabled={!supabaseUrl ||
              !supabaseAnonKey ||
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
      </section>

      <!-- Section 5: Persist Configuration -->
      <section class="setup-section">
        <div class="section-header">
          <span class="section-number">5</span>
          <h2 class="section-title">Persist Configuration</h2>
        </div>
        <div class="section-content">
          <p class="section-description">
            To persist your configuration across redeployments, Stellar needs to set environment
            variables in your Vercel project. This requires a one-time Vercel API token.
          </p>
          <ol class="instruction-list">
            <li>
              Go to <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noopener noreferrer">Vercel Settings &gt; Tokens</a
              >
            </li>
            <li>Create a new token with a descriptive name (e.g., "Stellar Setup")</li>
            <li>Copy the token and paste it below</li>
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
              >This token is used once to set environment variables and trigger a redeployment. It
              is not stored.</span
            >
          </div>

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

          {#if deployError}
            <div class="message error">{deployError}</div>
          {/if}

          <button
            class="btn btn-primary"
            onclick={handleDeploy}
            disabled={!validateSuccess || !vercelToken || deploying || deployStage === 'ready'}
          >
            {#if deploying}
              <span class="loading-spinner"></span>
              Setting up...
            {:else}
              Continue
            {/if}
          </button>
        </div>
      </section>

      <!-- Deployment Progress -->
      {#if deployStage !== 'idle'}
        <section class="setup-section deploy-progress">
          <div class="section-header">
            <span class="section-number">
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
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </span>
            <h2 class="section-title">Deployment</h2>
          </div>
          <div class="section-content">
            <div class="deploy-steps">
              <div
                class="deploy-step"
                class:active={deployStage === 'setting-env'}
                class:complete={deployStage === 'deploying' || deployStage === 'ready'}
              >
                <div class="step-indicator">
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
              <div
                class="deploy-step"
                class:active={deployStage === 'deploying'}
                class:complete={deployStage === 'ready'}
              >
                <div class="step-indicator">
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
                    <div class="step-dot"></div>
                  {/if}
                </div>
                <span>Deploying... (might take a bit)</span>
              </div>
              <div class="deploy-step" class:active={deployStage === 'ready'}>
                <div class="step-indicator">
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
                    <div class="step-dot"></div>
                  {/if}
                </div>
                <span>Ready</span>
              </div>
            </div>

            {#if deployStage === 'ready'}
              <div class="message success">
                Your Stellar instance is configured and the new deployment is live. Use the
                notification at the bottom of the page to refresh and load the updated version.
              </div>
            {/if}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     COSMIC BACKGROUND — Same starfield/nebula system as login page
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

  /* CSS Starfield */
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

  /* Nebulae */
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

  /* Orbital System */
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
    align-items: flex-start;
    padding: 2rem 1rem 4rem;
  }

  /* Admin reconfiguration mode: normal document flow under navbar */
  .setup-background.admin-mode {
    z-index: -1;
  }

  .setup-overlay.admin-mode {
    position: relative;
    z-index: 1;
    min-height: 100vh;
  }

  .setup-container {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-header {
    text-align: center;
    padding: 2rem 0 1rem;
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
     SECURITY WARNING
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

  .security-warning strong {
    color: #ffb84d;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SECTIONS — Glassmorphism cards
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-section {
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

  /* Top glow line */
  .setup-section::before {
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
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     INSTRUCTION LISTS
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

  .instruction-list code {
    background: rgba(108, 92, 231, 0.15);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    color: var(--color-primary-light, #a78bfa);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     INFO & WARNING NOTES
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

  .warning-note {
    display: flex;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 165, 2, 0.06);
    border: 1px solid rgba(255, 165, 2, 0.2);
    border-radius: 8px;
    font-size: 0.8125rem;
    color: #ffa502;
    line-height: 1.5;
    align-items: flex-start;
  }

  .warning-note svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM STYLES
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
     MESSAGES
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
     BUTTONS
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
     DEPLOYMENT PROGRESS
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

  .deploy-step.active {
    opacity: 1;
    color: var(--color-primary-light, #a78bfa);
  }

  .deploy-step.complete {
    opacity: 1;
    color: #26de81;
  }

  .step-indicator {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    background: rgba(108, 92, 231, 0.3);
    border-radius: 50%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OFFLINE PLACEHOLDER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .offline-message {
    text-align: center;
    padding: 2rem 1rem;
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
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .setup-overlay {
      padding: 1rem 0.75rem 3rem;
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
  }

  /* iPhone SE */
  @media (max-width: 375px) {
    .setup-overlay {
      padding: 0.75rem 0.5rem 2rem;
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
  }

  /* iPhone 16 Pro (402px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .setup-overlay {
      padding: 1.25rem 1rem 3rem;
    }
  }

  /* iPhone Pro Max (430px+) */
  @media (min-width: 430px) and (max-width: 640px) {
    .setup-overlay {
      padding: 1.5rem 1rem 3rem;
    }

    .section-content {
      padding: 1rem 1.5rem 1.5rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
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
  }
</style>
