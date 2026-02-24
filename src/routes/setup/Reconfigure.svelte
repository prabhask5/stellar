<!--
  @fileoverview Reconfigure settings page for Stellar Planner.

  Shown when `isFirstSetup: false` — a flat settings page where the
  user can update Supabase credentials and redeploy without stepping
  through the full wizard.
-->
<script lang="ts">
  import { getConfig, setConfig } from 'stellar-drive/config';
  import { isOnline } from 'stellar-drive/stores';
  import { pollForNewServiceWorker } from 'stellar-drive/kit';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  // ===========================================================================
  //  Form State
  // ===========================================================================

  let supabaseUrl = $state('');
  let supabasePublishableKey = $state('');
  let vercelToken = $state('');

  // Initial values for change detection
  let initialSupabaseUrl = $state('');
  let initialSupabaseKey = $state('');

  // ===========================================================================
  //  UI State
  // ===========================================================================

  let loading = $state(true);
  let validating = $state(false);
  let validateError = $state<string | null>(null);
  let validateSuccess = $state(false);
  let validatedUrl = $state('');
  let validatedKey = $state('');
  let deploying = $state(false);
  let deployError = $state<string | null>(null);
  let deployStage = $state<'idle' | 'setting-env' | 'deploying' | 'ready'>('idle');

  // ===========================================================================
  //  Derived State
  // ===========================================================================

  const supabaseChanged = $derived(
    supabaseUrl !== initialSupabaseUrl || supabasePublishableKey !== initialSupabaseKey
  );

  const credentialsChanged = $derived(
    validateSuccess && (supabaseUrl !== validatedUrl || supabasePublishableKey !== validatedKey)
  );

  const supabaseNeedsValidation = $derived(supabaseChanged && !validateSuccess);

  const canDeploy = $derived(
    supabaseChanged &&
      !supabaseNeedsValidation &&
      !credentialsChanged &&
      !!vercelToken &&
      !deploying &&
      deployStage === 'idle'
  );

  // ===========================================================================
  //  Effects
  // ===========================================================================

  $effect(() => {
    if (credentialsChanged) {
      validateSuccess = false;
      validateError = null;
    }
  });

  // ===========================================================================
  //  Lifecycle
  // ===========================================================================

  onMount(() => {
    if (!browser) return;

    const config = getConfig();
    if (config) {
      supabaseUrl = config.supabaseUrl || '';
      supabasePublishableKey = config.supabasePublishableKey || '';
      initialSupabaseUrl = supabaseUrl;
      initialSupabaseKey = supabasePublishableKey;
    }

    loading = false;
  });

  // ===========================================================================
  //  Validation
  // ===========================================================================

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
        setConfig({ supabaseUrl, supabasePublishableKey, configured: true });
      } else {
        validateError = data.error || 'Validation failed';
      }
    } catch (e) {
      validateError = e instanceof Error ? e.message : 'Network error';
    }

    validating = false;
  }

  // ===========================================================================
  //  Deployment
  // ===========================================================================

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

<div class="reconfigure-page">
  {#if loading}
    <div class="loading-state">
      <span class="loading-spinner"></span>
      Loading configuration...
    </div>
  {:else}
    <!-- Supabase Connection Card -->
    <section class="config-card">
      <div class="card-header">
        <h2>Supabase Connection</h2>
        {#if !supabaseChanged && initialSupabaseUrl}
          <span class="status-badge status-connected">Connected</span>
        {/if}
      </div>

      <p class="card-description">
        Find these values in your Supabase dashboard under <strong>Settings &gt; API</strong>.
      </p>

      <div class="form-group">
        <label for="reconfig-supabase-url">Supabase URL</label>
        <input
          id="reconfig-supabase-url"
          type="url"
          placeholder="https://your-project.supabase.co"
          bind:value={supabaseUrl}
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="form-group">
        <label for="reconfig-supabase-key">Supabase Publishable Key</label>
        <input
          id="reconfig-supabase-key"
          type="text"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          bind:value={supabasePublishableKey}
          autocomplete="off"
          spellcheck="false"
        />
        <span class="input-hint"
          >This is your public (anon) key. Row-Level Security policies enforce access control.</span
        >
      </div>

      <button
        class="btn btn-secondary"
        onclick={handleValidate}
        disabled={!supabaseUrl || !supabasePublishableKey || validating}
      >
        {#if validating}
          <span class="loading-spinner small"></span>
          Testing connection...
        {:else}
          Test Connection
        {/if}
      </button>

      {#if validateError}
        <div class="message error">{validateError}</div>
      {/if}
      {#if validateSuccess && !credentialsChanged}
        <div class="message success">Connection successful — credentials are valid.</div>
      {/if}
    </section>

    <!-- Deploy Section -->
    <section class="config-card">
      <div class="card-header">
        <h2>Deploy Changes</h2>
      </div>

      {#if !$isOnline}
        <div class="message error">
          You are currently offline. Deployment requires an internet connection.
        </div>
      {/if}

      <div class="form-group">
        <label for="reconfig-vercel-token">Vercel API Token</label>
        <input
          id="reconfig-vercel-token"
          type="password"
          placeholder="Paste your Vercel token"
          bind:value={vercelToken}
          autocomplete="off"
          disabled={deploying || deployStage !== 'idle'}
        />
        <span class="input-hint">
          Create a token at
          <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer">
            vercel.com/account/tokens</a
          >. It is used once and never stored.
        </span>
      </div>

      {#if deployStage === 'idle'}
        <button class="btn btn-primary" onclick={handleDeploy} disabled={!canDeploy}>
          {#if deploying}
            <span class="loading-spinner small"></span>
            Deploying...
          {:else}
            Deploy Changes
          {/if}
        </button>
      {/if}

      {#if deployError}
        <div class="message error">{deployError}</div>
      {/if}

      {#if deployStage !== 'idle'}
        <div class="deploy-steps">
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

        {#if deployStage === 'ready'}
          <div class="message success">
            Your Stellar instance is configured and the new deployment is live. Use the notification
            at the bottom of the page to refresh and load the updated version.
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  /* ===========================================================================
     Layout
     =========================================================================== */

  .reconfigure-page {
    max-width: 640px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
    font-size: 0.9375rem;
    color: var(--color-text-muted, #8b8ba3);
  }

  /* ===========================================================================
     Config Card
     =========================================================================== */

  .config-card {
    padding: 1.5rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: 16px;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    position: relative;
  }

  .config-card::before {
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

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .card-header h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--color-text, #e8e6f0);
  }

  .card-description {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--color-text-muted, #8b8ba3);
    line-height: 1.6;
  }

  .card-description strong {
    color: var(--color-text, #e8e6f0);
    font-weight: 600;
  }

  /* ===========================================================================
     Status Badges
     =========================================================================== */

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }

  .status-connected {
    background: rgba(38, 222, 129, 0.15);
    color: #26de81;
  }

  /* ===========================================================================
     Form Elements
     =========================================================================== */

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .form-group label {
    font-weight: 700;
    color: var(--color-text-muted, #8b8ba3);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .form-group input {
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

  .form-group input:focus {
    outline: none;
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.15);
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-group input::placeholder {
    color: rgba(139, 139, 163, 0.5);
  }

  .input-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted, #8b8ba3);
    opacity: 0.7;
    line-height: 1.4;
  }

  .input-hint a {
    color: var(--color-primary-light, #a78bfa);
    text-decoration: none;
    border-bottom: 1px solid rgba(167, 139, 250, 0.3);
    transition: all 0.2s;
  }

  .input-hint a:hover {
    color: var(--color-primary, #6c5ce7);
    border-bottom-color: rgba(108, 92, 231, 0.6);
  }

  /* ===========================================================================
     Messages
     =========================================================================== */

  .message {
    padding: 0.875rem 1rem;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
    margin-top: 0.75rem;
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

  /* ===========================================================================
     Buttons
     =========================================================================== */

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

  /* ===========================================================================
     Loading Spinner
     =========================================================================== */

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
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

  /* ===========================================================================
     Deploy Steps
     =========================================================================== */

  .deploy-steps {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
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

  .deploy-step-indicator {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .deploy-dot {
    width: 8px;
    height: 8px;
    background: rgba(108, 92, 231, 0.3);
    border-radius: 50%;
  }

  /* ===========================================================================
     Responsive
     =========================================================================== */

  @media (max-width: 640px) {
    .config-card {
      padding: 1.25rem;
    }

    .form-group input {
      padding: 0.75rem 0.875rem;
      font-size: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }

    .btn {
      transition: none;
    }

    .deploy-step {
      transition: none;
    }
  }
</style>
