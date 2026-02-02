<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    setupSingleUser,
    unlockSingleUser,
    getSingleUserInfo
  } from '@prabhask5/stellar-engine/auth';

  // Layout data
  const singleUserSetUp = $derived($page.data.singleUserSetUp);

  // Redirect URL from query params
  const redirectUrl = $derived($page.url.searchParams.get('redirect') || '/');

  // Shared state
  let loading = $state(false);
  let error = $state<string | null>(null);
  let shaking = $state(false);
  let mounted = $state(false);

  // Setup mode state
  let firstName = $state('');
  let lastName = $state('');
  let codeDigits = $state(['', '', '', '']);
  let confirmDigits = $state(['', '', '', '']);
  const code = $derived(codeDigits.join(''));
  const confirmCode = $derived(confirmDigits.join(''));
  let setupStep = $state(1); // 1 = name, 2 = code

  // Unlock mode state
  let unlockDigits = $state(['', '', '', '']);
  const unlockCode = $derived(unlockDigits.join(''));
  let userInfo = $state<{ firstName: string; lastName: string } | null>(null);

  // Input refs
  let codeInputs: HTMLInputElement[] = $state([]);
  let confirmInputs: HTMLInputElement[] = $state([]);
  let unlockInputs: HTMLInputElement[] = $state([]);

  onMount(async () => {
    mounted = true;
    if (singleUserSetUp) {
      const info = await getSingleUserInfo();
      if (info) {
        userInfo = {
          firstName: (info.profile.firstName as string) || '',
          lastName: (info.profile.lastName as string) || ''
        };
      }
    }
  });

  function handleDigitInput(
    digits: string[],
    index: number,
    event: Event,
    inputs: HTMLInputElement[]
  ) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');

    if (value.length > 0) {
      digits[index] = value.charAt(value.length - 1);
      input.value = digits[index];
      // Auto-focus next input
      if (index < 3 && inputs[index + 1]) {
        inputs[index + 1].focus();
      }
    } else {
      digits[index] = '';
    }
  }

  function handleDigitKeydown(
    digits: string[],
    index: number,
    event: KeyboardEvent,
    inputs: HTMLInputElement[]
  ) {
    if (event.key === 'Backspace') {
      if (digits[index] === '' && index > 0 && inputs[index - 1]) {
        inputs[index - 1].focus();
        digits[index - 1] = '';
      } else {
        digits[index] = '';
      }
    }
  }

  function handleDigitPaste(digits: string[], event: ClipboardEvent, inputs: HTMLInputElement[]) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '');
    for (let i = 0; i < 4 && i < pasted.length; i++) {
      digits[i] = pasted[i];
      if (inputs[i]) inputs[i].value = pasted[i];
    }
    const focusIndex = Math.min(pasted.length, 3);
    if (inputs[focusIndex]) inputs[focusIndex].focus();
  }

  function goToCodeStep() {
    if (!firstName.trim()) {
      error = 'First name is required';
      return;
    }
    error = null;
    setupStep = 2;
  }

  function goBackToNameStep() {
    setupStep = 1;
    error = null;
  }

  async function handleSetup(e: Event) {
    e.preventDefault();
    if (loading) return;

    error = null;

    if (code.length !== 4) {
      error = 'Please enter a 4-digit code';
      return;
    }

    if (code !== confirmCode) {
      error = 'Codes do not match';
      return;
    }

    loading = true;

    try {
      await setupSingleUser(code, {
        firstName: firstName.trim(),
        lastName: lastName.trim()
      });
      await invalidateAll();
      goto('/');
    } catch (err: any) {
      error = err?.message || 'Setup failed. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function handleUnlock(e: Event) {
    e.preventDefault();
    if (loading) return;

    error = null;

    if (unlockCode.length !== 4) {
      error = 'Please enter your 4-digit code';
      return;
    }

    loading = true;

    try {
      await unlockSingleUser(unlockCode);
      await invalidateAll();
      goto(redirectUrl);
    } catch (err: any) {
      error = err?.message || 'Incorrect code';
      // Trigger shake animation
      shaking = true;
      setTimeout(() => {
        shaking = false;
      }, 500);
      // Clear digits
      unlockDigits = ['', '', '', ''];
      if (unlockInputs[0]) unlockInputs[0].focus();
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{singleUserSetUp ? 'Unlock' : 'Welcome'} - Stellar</title>
</svelte:head>

<div class="login-page" class:mounted>
  <!-- Starfield (fixed, always covers viewport even when scrolling) -->
  <div class="starfield">
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
  </div>

  <!-- Nebula Effects (fixed, always covers viewport even when scrolling) -->
  <div class="nebula nebula-1"></div>
  <div class="nebula nebula-2"></div>
  <div class="nebula nebula-3"></div>

  <!-- Background Effects (clipped separately to allow content to grow) -->
  <div class="background-effects">
    <!-- Orbital Rings -->
    <div class="orbital-system">
      <div class="orbit orbit-1"></div>
      <div class="orbit orbit-2"></div>
      <div class="orbit orbit-3"></div>
      <div class="orbit-particle particle-1"></div>
      <div class="orbit-particle particle-2"></div>
      <div class="orbit-particle particle-3"></div>
    </div>

    <!-- Shooting Stars -->
    <div class="shooting-star shooting-star-1"></div>
    <div class="shooting-star shooting-star-2"></div>

    <!-- Floating Particles -->
    <div class="particles">
      {#each Array(15) as _, _i (_i)}
        <span
          class="particle"
          style="
            --delay: {Math.random() * 5}s;
            --duration: {5 + Math.random() * 10}s;
            --x-start: {Math.random() * 100}%;
            --y-start: {Math.random() * 100}%;
            --size: {2 + Math.random() * 3}px;
            --opacity: {0.2 + Math.random() * 0.4};
          "
        ></span>
      {/each}
    </div>
  </div>

  <!-- Login Content -->
  <div class="login-content">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-icon">
        <div class="brand-glow"></div>
        <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="url(#loginBrandGrad)"
            stroke-width="5"
            fill="none"
          />
          <path
            d="M30 52 L45 67 L72 35"
            stroke="url(#loginCheckGrad)"
            stroke-width="6"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
          <defs>
            <linearGradient id="loginBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6c5ce7" />
              <stop offset="100%" stop-color="#ff79c6" />
            </linearGradient>
            <linearGradient id="loginCheckGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#26de81" />
              <stop offset="100%" stop-color="#00d4ff" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h1 class="brand-title">Stellar</h1>
      <p class="brand-tagline">Your universe of productivity awaits</p>
    </div>

    {#if singleUserSetUp}
      <!-- Unlock Mode -->
      <div class="login-card" class:shake={shaking}>
        <div class="card-glow"></div>
        <div class="card-inner">
          <div class="unlock-user-info">
            <div class="avatar-wrapper">
              <div class="avatar-ring-outer"></div>
              <div class="avatar-ring-inner"></div>
              <div class="avatar">
                {(userInfo?.firstName || 'U').charAt(0).toUpperCase()}
              </div>
            </div>
            <h2 class="card-title">
              Welcome back{userInfo?.firstName ? `, ${userInfo.firstName}` : ''}
            </h2>
            <p class="card-subtitle">Enter your code to continue</p>
          </div>

          <form onsubmit={handleUnlock}>
            <div class="form-group">
              <div class="code-label">Access Code</div>
              <div class="code-input-group">
                {#each unlockDigits as digit, i (i)}
                  <div class="code-digit-wrapper" class:filled={digit !== ''}>
                    <input
                      class="code-digit"
                      type="tel"
                      inputmode="numeric"
                      pattern="[0-9]"
                      maxlength="1"
                      bind:this={unlockInputs[i]}
                      value={digit}
                      oninput={(e) => handleDigitInput(unlockDigits, i, e, unlockInputs)}
                      onkeydown={(e) => handleDigitKeydown(unlockDigits, i, e, unlockInputs)}
                      onpaste={(e) => handleDigitPaste(unlockDigits, e, unlockInputs)}
                      disabled={loading}
                      autocomplete="off"
                    />
                  </div>
                {/each}
              </div>
            </div>

            {#if error}
              <div class="message error">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            {/if}

            <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
              {#if loading}
                <span class="loading-spinner"></span>
                Unlocking...
              {:else}
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                Unlock
              {/if}
            </button>
          </form>
        </div>
      </div>
    {:else}
      <!-- Setup Mode -->
      <div class="login-card">
        <div class="card-glow"></div>
        <div class="card-inner">
          {#if setupStep === 1}
            <!-- Step 1: Name -->
            <div class="setup-step">
              <div class="step-indicator">
                <div class="step-dot active"></div>
                <div class="step-line"></div>
                <div class="step-dot"></div>
              </div>

              <h2 class="card-title">Welcome to Stellar</h2>
              <p class="card-subtitle">Let's get you set up. What's your name?</p>

              <div class="form-fields">
                <div class="name-row">
                  <div class="form-group">
                    <label for="firstName">First Name</label>
                    <div class="input-wrapper">
                      <input
                        type="text"
                        id="firstName"
                        bind:value={firstName}
                        required
                        disabled={loading}
                        placeholder="John"
                      />
                      <div class="input-glow"></div>
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="lastName">Last Name</label>
                    <div class="input-wrapper">
                      <input
                        type="text"
                        id="lastName"
                        bind:value={lastName}
                        disabled={loading}
                        placeholder="Doe"
                      />
                      <div class="input-glow"></div>
                    </div>
                  </div>
                </div>

                {#if error}
                  <div class="message error">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </div>
                {/if}

                <button type="button" class="btn btn-primary submit-btn" onclick={goToCodeStep}>
                  Continue
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
                    <path d="M5 12h14" />
                    <path d="M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          {:else}
            <!-- Step 2: Code -->
            <div class="setup-step">
              <div class="step-indicator">
                <div class="step-dot completed">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div class="step-line active"></div>
                <div class="step-dot active"></div>
              </div>

              <button type="button" class="back-link" onclick={goBackToNameStep}>
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
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <h2 class="card-title">Create Your Code</h2>
              <p class="card-subtitle">
                Choose a 4-digit code to secure your account, {firstName.trim()}
              </p>

              <form onsubmit={handleSetup}>
                <div class="form-group">
                  <div class="code-label">Your Code</div>
                  <div class="code-input-group">
                    {#each codeDigits as digit, i (i)}
                      <div class="code-digit-wrapper" class:filled={digit !== ''}>
                        <input
                          class="code-digit"
                          type="tel"
                          inputmode="numeric"
                          pattern="[0-9]"
                          maxlength="1"
                          bind:this={codeInputs[i]}
                          value={digit}
                          oninput={(e) => handleDigitInput(codeDigits, i, e, codeInputs)}
                          onkeydown={(e) => handleDigitKeydown(codeDigits, i, e, codeInputs)}
                          onpaste={(e) => handleDigitPaste(codeDigits, e, codeInputs)}
                          disabled={loading}
                          autocomplete="off"
                        />
                      </div>
                    {/each}
                  </div>
                </div>

                <div class="form-group">
                  <div class="code-label">Confirm Code</div>
                  <div class="code-input-group">
                    {#each confirmDigits as digit, i (i)}
                      <div class="code-digit-wrapper" class:filled={digit !== ''}>
                        <input
                          class="code-digit"
                          type="tel"
                          inputmode="numeric"
                          pattern="[0-9]"
                          maxlength="1"
                          bind:this={confirmInputs[i]}
                          value={digit}
                          oninput={(e) => handleDigitInput(confirmDigits, i, e, confirmInputs)}
                          onkeydown={(e) => handleDigitKeydown(confirmDigits, i, e, confirmInputs)}
                          onpaste={(e) => handleDigitPaste(confirmDigits, e, confirmInputs)}
                          disabled={loading}
                          autocomplete="off"
                        />
                      </div>
                    {/each}
                  </div>
                </div>

                {#if error}
                  <div class="message error">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </div>
                {/if}

                <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
                  {#if loading}
                    <span class="loading-spinner"></span>
                    Setting up...
                  {:else}
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
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Get Started
                  {/if}
                </button>
              </form>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN PAGE CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-page {
    inset: 0;
    z-index: 200;
    position: fixed;
    height: calc(100vh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px));
    margin-top: calc(-1 * env(safe-area-inset-top, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    background: radial-gradient(
      ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%
    );
  }

  .background-effects {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STAR FIELD
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .starfield {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .stars {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  .stars-small {
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.8) 0%, transparent 100%),
      radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 50% 10%, rgba(255, 255, 255, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 70% 50%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 90% 80%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 15% 90%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 15%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 45% 45%, rgba(255, 255, 255, 0.6) 0%, transparent 100%);
    background-size: 200px 200px;
    animation: starsDrift 100s linear infinite;
  }

  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(108, 92, 231, 0.9) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 60% 80%, rgba(255, 121, 198, 0.8) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 80% 20%, rgba(38, 222, 129, 0.7) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 40% 60%, rgba(0, 212, 255, 0.6) 0%, transparent 100%);
    background-size: 300px 300px;
    animation: starsDrift 150s linear infinite reverse;
  }

  .stars-large {
    background-image:
      radial-gradient(2px 2px at 25% 25%, rgba(255, 255, 255, 1) 0%, transparent 100%),
      radial-gradient(2.5px 2.5px at 75% 75%, rgba(108, 92, 231, 1) 0%, transparent 100%),
      radial-gradient(2px 2px at 50% 90%, rgba(255, 121, 198, 0.9) 0%, transparent 100%);
    background-size: 400px 400px;
    animation:
      starsTwinkle 4s ease-in-out infinite,
      starsDrift 200s linear infinite;
  }

  @keyframes starsDrift {
    from {
      transform: translateY(0) translateX(0);
    }
    to {
      transform: translateY(-100px) translateX(-50px);
    }
  }

  @keyframes starsTwinkle {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NEBULA EFFECTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.5;
    pointer-events: none;
  }

  .nebula-1 {
    width: 700px;
    height: 700px;
    top: -250px;
    right: -200px;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.6) 0%, transparent 70%);
    animation:
      nebulaPulse 8s ease-in-out infinite,
      nebulaFloat 20s ease-in-out infinite;
  }

  .nebula-2 {
    width: 600px;
    height: 600px;
    bottom: -200px;
    left: -150px;
    background: radial-gradient(ellipse, rgba(255, 121, 198, 0.5) 0%, transparent 70%);
    animation:
      nebulaPulse 10s ease-in-out infinite 2s,
      nebulaFloat 25s ease-in-out infinite reverse;
  }

  .nebula-3 {
    width: 500px;
    height: 500px;
    top: 40%;
    left: 60%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(38, 222, 129, 0.25) 0%, transparent 70%);
    animation: nebulaPulse 12s ease-in-out infinite 4s;
  }

  @keyframes nebulaPulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.1);
    }
  }

  @keyframes nebulaFloat {
    0%,
    100% {
      transform: translate(0, 0);
    }
    33% {
      transform: translate(30px, -20px);
    }
    66% {
      transform: translate(-20px, 30px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ORBITAL SYSTEM
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .orbital-system {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    border: 1px solid rgba(108, 92, 231, 0.12);
    transform: translate(-50%, -50%);
  }

  .orbit-1 {
    width: 400px;
    height: 400px;
    animation: orbitRotate 40s linear infinite;
  }
  .orbit-2 {
    width: 600px;
    height: 600px;
    border-color: rgba(255, 121, 198, 0.08);
    animation: orbitRotate 60s linear infinite reverse;
  }
  .orbit-3 {
    width: 800px;
    height: 800px;
    border-color: rgba(38, 222, 129, 0.06);
    animation: orbitRotate 80s linear infinite;
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
    width: 6px;
    height: 6px;
    border-radius: 50%;
    top: 50%;
    left: 50%;
  }

  .particle-1 {
    background: var(--color-primary);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 0 30px var(--color-primary-glow);
    animation: orbitParticle1 40s linear infinite;
  }

  .particle-2 {
    background: var(--color-accent);
    box-shadow:
      0 0 15px var(--color-accent-glow),
      0 0 30px var(--color-accent-glow);
    animation: orbitParticle2 60s linear infinite reverse;
    width: 4px;
    height: 4px;
  }

  .particle-3 {
    background: var(--color-success);
    box-shadow:
      0 0 15px var(--color-success-glow),
      0 0 30px var(--color-success-glow);
    animation: orbitParticle3 80s linear infinite;
    width: 5px;
    height: 5px;
  }

  @keyframes orbitParticle1 {
    from {
      transform: rotate(0deg) translateX(200px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(200px) rotate(-360deg);
    }
  }
  @keyframes orbitParticle2 {
    from {
      transform: rotate(0deg) translateX(300px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(300px) rotate(-360deg);
    }
  }
  @keyframes orbitParticle3 {
    from {
      transform: rotate(0deg) translateX(400px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(400px) rotate(-360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHOOTING STARS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .shooting-star {
    position: absolute;
    width: 120px;
    height: 2px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(108, 92, 231, 1) 100%
    );
    border-radius: 100px;
    opacity: 0;
    pointer-events: none;
  }

  .shooting-star-1 {
    top: 20%;
    left: 5%;
    transform: rotate(-35deg);
    animation: shootingStar 10s ease-in-out infinite;
  }

  .shooting-star-2 {
    top: 40%;
    right: 10%;
    transform: rotate(-40deg);
    animation: shootingStar 14s ease-in-out infinite 5s;
  }

  @keyframes shootingStar {
    0%,
    90%,
    100% {
      opacity: 0;
      transform: rotate(-35deg) translateX(0);
    }
    92% {
      opacity: 1;
    }
    95% {
      opacity: 1;
      transform: rotate(-35deg) translateX(350px);
    }
    96% {
      opacity: 0;
      transform: rotate(-35deg) translateX(400px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FLOATING PARTICLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .particle {
    position: absolute;
    left: var(--x-start);
    top: var(--y-start);
    width: var(--size);
    height: var(--size);
    background: white;
    border-radius: 50%;
    opacity: var(--opacity);
    animation: particleFloat var(--duration) ease-in-out var(--delay) infinite;
  }

  @keyframes particleFloat {
    0%,
    100% {
      transform: translateY(0) translateX(0);
      opacity: var(--opacity);
    }
    25% {
      transform: translateY(-30px) translateX(15px);
    }
    50% {
      transform: translateY(-50px) translateX(-10px);
      opacity: calc(var(--opacity) * 1.5);
    }
    75% {
      transform: translateY(-20px) translateX(20px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding: 2rem;
    width: 100%;
    max-width: 440px;
    margin: auto;
    opacity: 0;
    transform: translateY(40px) scale(0.95);
  }

  .mounted .login-content {
    animation: contentReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes contentReveal {
    0% {
      opacity: 0;
      transform: translateY(40px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BRAND
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-icon {
    position: relative;
    animation: brandFloat 4s ease-in-out infinite;
    filter: drop-shadow(0 0 30px var(--color-primary-glow));
  }

  .brand-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.4) 0%, transparent 70%);
    border-radius: 50%;
    animation: brandGlowPulse 3s ease-in-out infinite;
  }

  @keyframes brandGlowPulse {
    0%,
    100% {
      opacity: 0.5;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.2);
    }
  }

  @keyframes brandFloat {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  .brand-title {
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 6s linear infinite;
    margin: 0;
  }

  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .brand-tagline {
    color: var(--color-text-muted);
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
    opacity: 0.8;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN CARD — Cinematic glass card with animated border
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-card {
    width: 100%;
    position: relative;
    border-radius: var(--radius-2xl);
    padding: 2px; /* Space for animated gradient border */
    background: linear-gradient(
      135deg,
      rgba(108, 92, 231, 0.5),
      rgba(255, 121, 198, 0.3),
      rgba(38, 222, 129, 0.2),
      rgba(0, 212, 255, 0.3),
      rgba(108, 92, 231, 0.5)
    );
    background-size: 300% 300%;
    animation: borderGlow 6s ease-in-out infinite;
  }

  @keyframes borderGlow {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  .card-glow {
    position: absolute;
    inset: -40px;
    background: radial-gradient(ellipse at center, rgba(108, 92, 231, 0.15) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
    animation: cardGlowPulse 4s ease-in-out infinite;
  }

  @keyframes cardGlowPulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .card-inner {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.92) 100%);
    border-radius: calc(var(--radius-2xl) - 2px);
    padding: 2.5rem;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 32px 80px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    position: relative;
    overflow: hidden;
  }

  /* Subtle inner light streaks */
  .card-inner::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.15),
      rgba(108, 92, 231, 0.3),
      rgba(255, 255, 255, 0.15),
      transparent
    );
  }

  .card-inner::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 121, 198, 0.15), transparent);
  }

  .card-title {
    text-align: center;
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.02em;
  }

  .card-subtitle {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin: 0 0 2rem 0;
    opacity: 0.8;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     UNLOCK MODE — Avatar & User Info
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .unlock-user-info {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .avatar-wrapper {
    position: relative;
    width: 80px;
    height: 80px;
    margin: 0 auto 1.25rem;
  }

  .avatar {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary);
    color: white;
    font-weight: 700;
    font-size: 2rem;
    border-radius: 50%;
    position: relative;
    z-index: 2;
    box-shadow:
      0 4px 20px var(--color-primary-glow),
      0 0 40px rgba(108, 92, 231, 0.2);
  }

  .avatar-ring-outer {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    border: 1px solid rgba(108, 92, 231, 0.3);
    animation: avatarRingPulse 3s ease-in-out infinite;
  }

  .avatar-ring-inner {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 1px solid rgba(108, 92, 231, 0.5);
    animation: avatarRingPulse 3s ease-in-out infinite 0.5s;
  }

  @keyframes avatarRingPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.3;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SETUP MODE — Step Indicator & Transitions
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setup-step {
    animation: stepFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes stepFadeIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 1.75rem;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(108, 92, 231, 0.1);
    border: 2px solid rgba(108, 92, 231, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    position: relative;
  }

  .step-dot.active {
    background: var(--gradient-primary);
    border-color: rgba(108, 92, 231, 0.6);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .step-dot.completed {
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.8), rgba(0, 212, 255, 0.6));
    border-color: rgba(38, 222, 129, 0.6);
    box-shadow: 0 0 15px rgba(38, 222, 129, 0.3);
    color: white;
  }

  .step-line {
    width: 60px;
    height: 2px;
    background: rgba(108, 92, 231, 0.15);
    transition: all 0.3s ease;
  }

  .step-line.active {
    background: linear-gradient(90deg, rgba(38, 222, 129, 0.6), rgba(108, 92, 231, 0.6));
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem 0;
    margin-bottom: 1rem;
    transition: color 0.2s ease;
  }

  .back-link:hover {
    color: var(--color-primary-light);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM ELEMENTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .name-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 700;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .input-wrapper {
    position: relative;
  }

  .input-glow {
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-lg);
    opacity: 0;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.4), rgba(255, 121, 198, 0.3));
    filter: blur(8px);
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: -1;
  }

  .input-wrapper:focus-within .input-glow {
    opacity: 1;
  }

  input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 16px; /* Prevents iOS zoom */
    color: var(--color-text);
    background: rgba(10, 10, 18, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    transition: all 0.3s ease;
    position: relative;
  }

  input:focus {
    outline: none;
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 24px var(--color-primary-glow);
    background: rgba(10, 10, 18, 0.8);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PIN CODE INPUTS — Glowing digit boxes
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .code-input-group {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }

  .code-digit-wrapper {
    position: relative;
  }

  .code-digit-wrapper::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: calc(var(--radius-lg) + 2px);
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3), rgba(255, 121, 198, 0.2));
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
    filter: blur(6px);
  }

  .code-digit-wrapper.filled::after {
    opacity: 1;
  }

  .code-digit {
    width: 56px;
    height: 64px;
    text-align: center;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0;
    caret-color: var(--color-primary-light);
    padding: 0;
    transition: all 0.3s ease;
  }

  .code-digit:focus {
    border-color: rgba(108, 92, 231, 0.6);
    box-shadow:
      0 0 24px var(--color-primary-glow),
      0 0 0 2px rgba(108, 92, 231, 0.2);
    transform: translateY(-2px);
  }

  .code-digit-wrapper.filled .code-digit {
    border-color: rgba(108, 92, 231, 0.4);
    background: rgba(108, 92, 231, 0.08);
  }

  .code-label {
    text-align: center;
    font-weight: 700;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.75rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MESSAGES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 600;
    backdrop-filter: blur(16px);
    animation: messageFadeIn 0.3s ease-out;
  }

  @keyframes messageFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.2) 0%,
      rgba(255, 107, 107, 0.06) 100%
    );
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.4);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BUTTONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .submit-btn {
    width: 100%;
    padding: 1rem;
    margin-top: 0.75rem;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    position: relative;
    overflow: hidden;
  }

  /* Shimmer effect on button */
  .submit-btn::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: buttonShimmer 3s ease-in-out infinite;
  }

  @keyframes buttonShimmer {
    0% {
      left: -100%;
    }
    50%,
    100% {
      left: 100%;
    }
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .submit-btn:disabled::after {
    display: none;
  }

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHAKE ANIMATION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    10%,
    30%,
    50%,
    70%,
    90% {
      transform: translateX(-6px);
    }
    20%,
    40%,
    60%,
    80% {
      transform: translateX(6px);
    }
  }

  .shake {
    animation: shake 0.5s ease-in-out;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Large Screens
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (min-width: 1200px) {
    .login-content {
      max-width: 480px;
    }
    .brand-icon svg {
      width: 56px;
      height: 56px;
    }
    .brand-title {
      font-size: 3rem;
    }
    .brand-tagline {
      font-size: 1.125rem;
    }
    .card-inner {
      padding: 3rem;
    }
    .orbit-1 {
      width: 500px;
      height: 500px;
    }
    .orbit-2 {
      width: 750px;
      height: 750px;
    }
    .orbit-3 {
      width: 1000px;
      height: 1000px;
    }
    .nebula-1 {
      width: 800px;
      height: 800px;
    }
    .nebula-2 {
      width: 700px;
      height: 700px;
    }
    .nebula-3 {
      width: 600px;
      height: 600px;
    }
  }

  /* Tablets */
  @media (min-width: 768px) and (max-width: 1199px) {
    .login-content {
      max-width: 460px;
    }
    .brand-icon svg {
      width: 52px;
      height: 52px;
    }
    .brand-title {
      font-size: 2.75rem;
    }
    .card-inner {
      padding: 2.75rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Mobile Devices
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 767px) {
    .login-content {
      padding: 1.5rem;
      gap: 1.5rem;
    }
    .brand-icon svg {
      width: 44px;
      height: 44px;
    }
    .brand-title {
      font-size: 2.25rem;
    }
    .brand-tagline {
      font-size: 0.9375rem;
    }
    .card-inner {
      padding: 2rem;
    }
    .card-title {
      font-size: 1.375rem;
    }

    .orbit-1 {
      width: 320px;
      height: 320px;
    }
    .orbit-2 {
      width: 480px;
      height: 480px;
    }
    .orbit-3 {
      width: 640px;
      height: 640px;
    }

    @keyframes orbitParticle1 {
      from {
        transform: rotate(0deg) translateX(160px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(160px) rotate(-360deg);
      }
    }
    @keyframes orbitParticle2 {
      from {
        transform: rotate(0deg) translateX(240px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(240px) rotate(-360deg);
      }
    }
    @keyframes orbitParticle3 {
      from {
        transform: rotate(0deg) translateX(320px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(320px) rotate(-360deg);
      }
    }

    .nebula-1 {
      width: 500px;
      height: 500px;
    }
    .nebula-2 {
      width: 450px;
      height: 450px;
    }
    .nebula-3 {
      width: 400px;
      height: 400px;
    }
  }

  /* iPhone 16 Pro / 15 Pro / 14 Pro (393px width) */
  @media (min-width: 390px) and (max-width: 429px) {
    .login-content {
      padding: 1.25rem;
      gap: 1.75rem;
    }
    .brand-icon svg {
      width: 48px;
      height: 48px;
    }
    .brand-title {
      font-size: 2.5rem;
    }
    .brand-tagline {
      font-size: 1rem;
    }
    .card-inner {
      padding: 2rem;
      border-radius: 22px;
    }
    .card-title {
      font-size: 1.5rem;
    }
    .login-card {
      border-radius: 24px;
    }

    input {
      padding: 1rem 1.125rem;
      border-radius: 14px;
    }

    .submit-btn {
      padding: 1.125rem;
      font-size: 1.0625rem;
      border-radius: 14px;
    }

    .avatar-wrapper {
      width: 72px;
      height: 72px;
    }
    .avatar {
      width: 72px;
      height: 72px;
      font-size: 1.75rem;
    }
  }

  /* iPhone 16 Pro Max / 15 Pro Max (430px width) */
  @media (min-width: 430px) and (max-width: 480px) {
    .login-content {
      padding: 1.5rem;
      gap: 2rem;
    }
    .brand-icon svg {
      width: 52px;
      height: 52px;
    }
    .brand-title {
      font-size: 2.75rem;
    }
    .card-inner {
      padding: 2.25rem;
    }
    .card-title {
      font-size: 1.5rem;
    }

    .avatar-wrapper {
      width: 80px;
      height: 80px;
    }
    .avatar {
      width: 80px;
      height: 80px;
      font-size: 2rem;
    }

    .code-digit {
      width: 60px;
      height: 68px;
      font-size: 1.625rem;
    }
  }

  /* Small devices (iPhone SE, older phones) */
  @media (max-width: 389px) {
    .login-content {
      padding: 1rem;
      gap: 1.25rem;
    }
    .brand-icon svg {
      width: 40px;
      height: 40px;
    }
    .brand-title {
      font-size: 2rem;
    }
    .brand-tagline {
      font-size: 0.8125rem;
    }
    .card-inner {
      padding: 1.5rem;
    }
    .card-title {
      font-size: 1.25rem;
    }
    .card-subtitle {
      font-size: 0.8125rem;
    }

    .name-row {
      grid-template-columns: 1fr;
    }

    .submit-btn {
      padding: 0.875rem;
      font-size: 0.9375rem;
    }

    .avatar-wrapper {
      width: 60px;
      height: 60px;
    }
    .avatar {
      width: 60px;
      height: 60px;
      font-size: 1.5rem;
    }

    .code-digit {
      width: 48px;
      height: 56px;
      font-size: 1.25rem;
    }
    .code-input-group {
      gap: 0.5rem;
    }

    .step-line {
      width: 40px;
    }

    .orbit-1 {
      width: 240px;
      height: 240px;
    }
    .orbit-2 {
      width: 360px;
      height: 360px;
    }
    .orbit-3 {
      width: 480px;
      height: 480px;
    }

    @keyframes orbitParticle1 {
      from {
        transform: rotate(0deg) translateX(120px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(120px) rotate(-360deg);
      }
    }
    @keyframes orbitParticle2 {
      from {
        transform: rotate(0deg) translateX(180px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(180px) rotate(-360deg);
      }
    }
    @keyframes orbitParticle3 {
      from {
        transform: rotate(0deg) translateX(240px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(240px) rotate(-360deg);
      }
    }

    .nebula-1 {
      width: 350px;
      height: 350px;
    }
    .nebula-2 {
      width: 300px;
      height: 300px;
    }
    .nebula-3 {
      width: 250px;
      height: 250px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .orbit,
    .orbit-particle,
    .shooting-star,
    .particle,
    .brand-icon,
    .brand-glow,
    .card-glow,
    .avatar-ring-outer,
    .avatar-ring-inner {
      animation: none;
    }

    .brand-title {
      animation: none;
    }
    .login-card {
      animation: none;
      background: rgba(108, 92, 231, 0.3);
    }
    .submit-btn::after {
      animation: none;
      display: none;
    }
    .setup-step {
      animation: none;
      opacity: 1;
    }

    .login-content,
    .mounted .login-content {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .code-digit:focus {
      transform: none;
    }
  }
</style>
