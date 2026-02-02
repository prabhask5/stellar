<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    changeSingleUserGate,
    updateSingleUserProfile,
    getSingleUserInfo
  } from '@prabhask5/stellar-engine/auth';
  import { authState } from '@prabhask5/stellar-engine/stores';
  import { userDisplayInfo } from '$lib/stores/userDisplayInfo';
  import { isDebugMode, setDebugMode } from '@prabhask5/stellar-engine/utils';
  import { resetDatabase, getTrustedDevices, removeTrustedDevice, getCurrentDeviceId } from '@prabhask5/stellar-engine';
  import type { TrustedDevice } from '@prabhask5/stellar-engine';
  import { onMount } from 'svelte';

  // Form state
  let firstName = $state('');
  let lastName = $state('');

  // Gate change state - using digit arrays like login page
  let oldCodeDigits = $state(['', '', '', '']);
  let newCodeDigits = $state(['', '', '', '']);
  let confirmCodeDigits = $state(['', '', '', '']);
  const oldCode = $derived(oldCodeDigits.join(''));
  const newCode = $derived(newCodeDigits.join(''));
  const confirmNewCode = $derived(confirmCodeDigits.join(''));

  // Input refs for digit inputs
  let oldCodeInputs: HTMLInputElement[] = $state([]);
  let newCodeInputs: HTMLInputElement[] = $state([]);
  let confirmCodeInputs: HTMLInputElement[] = $state([]);

  // UI state
  let profileLoading = $state(false);
  let codeLoading = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  let codeSuccess = $state<string | null>(null);
  let debugMode = $state(isDebugMode());
  let resetting = $state(false);

  // Trusted devices state
  let trustedDevices = $state<TrustedDevice[]>([]);
  let currentDeviceId = $state('');
  let devicesLoading = $state(true);
  let removingDeviceId = $state<string | null>(null);

  // Get initial values from user data
  onMount(async () => {
    const info = await getSingleUserInfo();
    if (info) {
      firstName = (info.profile.firstName as string) || '';
      lastName = (info.profile.lastName as string) || '';
    } else if ($userDisplayInfo) {
      firstName = $userDisplayInfo.firstName;
      lastName = $userDisplayInfo.lastName;
    }

    // Load trusted devices
    currentDeviceId = getCurrentDeviceId();
    try {
      const session = $authState?.session;
      if (session?.user?.id) {
        trustedDevices = await getTrustedDevices(session.user.id);
      }
    } catch {
      // Ignore errors loading devices
    }
    devicesLoading = false;
  });

  // Digit input helpers (same pattern as login page)
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

  async function handleProfileSubmit(e: Event) {
    e.preventDefault();
    profileLoading = true;
    profileError = null;
    profileSuccess = null;

    try {
      await updateSingleUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim()
      });
      // Update auth state to immediately reflect changes in navbar
      authState.updateUserProfile({ first_name: firstName.trim(), last_name: lastName.trim() });
      profileSuccess = 'Profile updated successfully';
      setTimeout(() => (profileSuccess = null), 3000);
    } catch (err: unknown) {
      profileError = err instanceof Error ? err.message : 'Failed to update profile';
    }

    profileLoading = false;
  }

  async function handleCodeSubmit(e: Event) {
    e.preventDefault();

    if (oldCode.length !== 4) {
      codeError = 'Please enter your current 4-digit code';
      return;
    }

    if (newCode.length !== 4) {
      codeError = 'Please enter a new 4-digit code';
      return;
    }

    if (newCode !== confirmNewCode) {
      codeError = 'New codes do not match';
      return;
    }

    codeLoading = true;
    codeError = null;
    codeSuccess = null;

    try {
      await changeSingleUserGate(oldCode, newCode);
      codeSuccess = 'Code changed successfully';
      oldCodeDigits = ['', '', '', ''];
      newCodeDigits = ['', '', '', ''];
      confirmCodeDigits = ['', '', '', ''];
      setTimeout(() => (codeSuccess = null), 3000);
    } catch (err: unknown) {
      codeError = err instanceof Error ? err.message : 'Failed to change code';
    }

    codeLoading = false;
  }

  function toggleDebugMode() {
    debugMode = !debugMode;
    setDebugMode(debugMode);
  }

  function goBack() {
    goto('/tasks');
  }

  async function handleResetDatabase() {
    if (!confirm('This will delete all local data and reload. Your data will be re-synced from the server. Continue?')) {
      return;
    }
    resetting = true;
    try {
      await resetDatabase();
      // Reload the page — session is preserved in localStorage, so the app
      // will re-create the DB, fetch config from Supabase, and re-hydrate.
      window.location.reload();
    } catch (err) {
      alert('Reset failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      resetting = false;
    }
  }

  async function handleRemoveDevice(id: string) {
    removingDeviceId = id;
    try {
      await removeTrustedDevice(id);
      trustedDevices = trustedDevices.filter((d) => d.id !== id);
    } catch {
      // Ignore errors
    }
    removingDeviceId = null;
  }

  function handleMobileSignOut() {
    window.dispatchEvent(new CustomEvent('stellar:signout'));
  }
</script>

<svelte:head>
  <title>Profile - Stellar</title>
</svelte:head>

<div class="profile-page">
  <!-- Header -->
  <header class="profile-header">
    <button class="back-btn" onclick={goBack}>
      <svg
        width="20"
        height="20"
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
      <span>Back</span>
    </button>
    <h1 class="profile-title">Profile</h1>
    <div class="header-spacer"></div>
  </header>

  <!-- Profile Avatar -->
  <div class="profile-avatar-section">
    <div class="avatar-container">
      <div class="avatar-ring"></div>
      <div class="avatar">
        {firstName.charAt(0).toUpperCase() || '?'}
      </div>
    </div>
    <div class="avatar-particles">
      {#each Array(6) as _, i (i)}
        <span class="particle" style="--delay: {i * 0.5}s; --angle: {i * 60}deg;"></span>
      {/each}
    </div>
  </div>

  <!-- Profile Form Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Personal Information</h2>
      <p class="card-subtitle">Update your personal details</p>
    </div>

    <form onsubmit={handleProfileSubmit}>
      <div class="form-row">
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input
            type="text"
            id="firstName"
            bind:value={firstName}
            disabled={profileLoading}
            required
            placeholder="John"
          />
        </div>

        <div class="form-group">
          <label for="lastName">Last Name</label>
          <input
            type="text"
            id="lastName"
            bind:value={lastName}
            disabled={profileLoading}
            placeholder="Doe"
          />
        </div>
      </div>

      {#if profileError}
        <div class="message error">{profileError}</div>
      {/if}

      {#if profileSuccess}
        <div class="message success">{profileSuccess}</div>
      {/if}

      <button type="submit" class="btn btn-primary" disabled={profileLoading}>
        {#if profileLoading}
          <span class="loading-spinner"></span>
          Saving...
        {:else}
          Save Changes
        {/if}
      </button>
    </form>
  </div>

  <!-- Change Code Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Change Code</h2>
      <p class="card-subtitle">Update your 4-digit access code</p>
    </div>

    <form onsubmit={handleCodeSubmit}>
      <div class="form-group">
        <label for="oldCode0">Current Code</label>
        <div class="code-input-group">
          {#each oldCodeDigits as digit, i (i)}
            <input
              class="code-digit"
              type="tel"
              inputmode="numeric"
              pattern="[0-9]"
              maxlength="1"
              id={`oldCode${i}`}
              bind:this={oldCodeInputs[i]}
              value={digit}
              oninput={(e) => handleDigitInput(oldCodeDigits, i, e, oldCodeInputs)}
              onkeydown={(e) => handleDigitKeydown(oldCodeDigits, i, e, oldCodeInputs)}
              onpaste={(e) => handleDigitPaste(oldCodeDigits, e, oldCodeInputs)}
              disabled={codeLoading}
              autocomplete="off"
            />
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="newCode0">New Code</label>
        <div class="code-input-group">
          {#each newCodeDigits as digit, i (i)}
            <input
              class="code-digit"
              type="tel"
              inputmode="numeric"
              pattern="[0-9]"
              maxlength="1"
              id={`newCode${i}`}
              bind:this={newCodeInputs[i]}
              value={digit}
              oninput={(e) => handleDigitInput(newCodeDigits, i, e, newCodeInputs)}
              onkeydown={(e) => handleDigitKeydown(newCodeDigits, i, e, newCodeInputs)}
              onpaste={(e) => handleDigitPaste(newCodeDigits, e, newCodeInputs)}
              disabled={codeLoading}
              autocomplete="off"
            />
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="confirmCode0">Confirm New Code</label>
        <div class="code-input-group">
          {#each confirmCodeDigits as digit, i (i)}
            <input
              class="code-digit"
              type="tel"
              inputmode="numeric"
              pattern="[0-9]"
              maxlength="1"
              id={`confirmCode${i}`}
              bind:this={confirmCodeInputs[i]}
              value={digit}
              oninput={(e) => handleDigitInput(confirmCodeDigits, i, e, confirmCodeInputs)}
              onkeydown={(e) => handleDigitKeydown(confirmCodeDigits, i, e, confirmCodeInputs)}
              onpaste={(e) => handleDigitPaste(confirmCodeDigits, e, confirmCodeInputs)}
              disabled={codeLoading}
              autocomplete="off"
            />
          {/each}
        </div>
      </div>

      {#if codeError}
        <div class="message error">{codeError}</div>
      {/if}

      {#if codeSuccess}
        <div class="message success">{codeSuccess}</div>
      {/if}

      <button type="submit" class="btn btn-secondary" disabled={codeLoading}>
        {#if codeLoading}
          <span class="loading-spinner"></span>
          Updating...
        {:else}
          Update Code
        {/if}
      </button>
    </form>
  </div>

  <!-- Trusted Devices -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Trusted Devices</h2>
      <p class="card-subtitle">Devices that can access your account without email verification</p>
    </div>

    {#if devicesLoading}
      <div class="devices-loading">
        <span class="loading-spinner"></span>
      </div>
    {:else if trustedDevices.length === 0}
      <p class="setting-hint">No trusted devices found.</p>
    {:else}
      <div class="devices-list">
        {#each trustedDevices as device (device.id)}
          <div class="device-item" class:current={device.deviceId === currentDeviceId}>
            <div class="device-info">
              <span class="device-label">
                {device.deviceLabel || 'Unknown device'}
                {#if device.deviceId === currentDeviceId}
                  <span class="device-badge">This device</span>
                {/if}
              </span>
              <span class="device-meta">
                Last used {new Date(device.lastUsedAt).toLocaleDateString()}
              </span>
            </div>
            {#if device.deviceId !== currentDeviceId}
              <button
                class="device-remove-btn"
                onclick={() => handleRemoveDevice(device.id)}
                disabled={removingDeviceId === device.id}
                aria-label="Remove device"
              >
                {#if removingDeviceId === device.id}
                  <span class="loading-spinner small"></span>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                {/if}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Administration -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Administration</h2>
      <p class="card-subtitle">Manage your Stellar instance</p>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Debug Mode</span>
        <span class="setting-hint"
          >Enable console logging for troubleshooting (you'll need to refresh for the changes to
          take effect)</span
        >
      </div>
      <button
        class="toggle-btn"
        class:active={debugMode}
        onclick={toggleDebugMode}
        role="switch"
        aria-checked={debugMode}
        aria-label="Toggle debug mode"
      >
        <span class="toggle-knob"></span>
      </button>
    </div>

    <button class="btn btn-secondary" onclick={() => goto('/setup')}>
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
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      Update Supabase Configuration
    </button>

    <button class="btn btn-danger" onclick={handleResetDatabase} disabled={resetting}>
      {#if resetting}
        <span class="loading-spinner"></span>
        Resetting...
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
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
        Reset Local Database
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">Deletes all local data and re-syncs from the server. Use this if you're experiencing data issues.</p>
  </div>

  <!-- Sign Out (Mobile only — desktop has sign out in the navbar) -->
  <div class="mobile-signout">
    <button class="signout-btn" onclick={handleMobileSignOut}>
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
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Lock
    </button>
  </div>

  <!-- Footer Links -->
  <div class="profile-footer">
    <a href="/policy" class="footer-link">
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
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      Privacy Policy
    </a>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     PROFILE PAGE - Space-themed layout
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-page {
    max-width: 600px;
    margin: 0 auto;
    padding-bottom: 2rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.2);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .back-btn:hover {
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.1);
    border-color: rgba(108, 92, 231, 0.2);
  }

  .profile-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .header-spacer {
    width: 80px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     AVATAR SECTION - Cosmic orb effect
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-avatar-section {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
    padding: 1.5rem 0;
  }

  .avatar-container {
    position: relative;
    z-index: 2;
  }

  .avatar {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary);
    color: white;
    font-weight: 700;
    font-size: 2.5rem;
    border-radius: 50%;
    box-shadow:
      0 8px 32px var(--color-primary-glow),
      0 0 60px rgba(108, 92, 231, 0.3);
    position: relative;
    z-index: 2;
  }

  .avatar-ring {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 2px solid rgba(108, 92, 231, 0.4);
    animation: ringPulse 3s ease-in-out infinite;
  }

  @keyframes ringPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.3;
    }
  }

  .avatar-particles {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .avatar-particles .particle {
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--color-primary-glow);
    animation: orbitParticle 8s linear infinite;
    animation-delay: var(--delay);
    transform: rotate(var(--angle)) translateX(70px);
  }

  @keyframes orbitParticle {
    from {
      transform: rotate(var(--angle)) translateX(70px);
    }
    to {
      transform: rotate(calc(var(--angle) + 360deg)) translateX(70px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PROFILE CARD - Cosmic glass card
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    padding: 2rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  /* Top glow line */
  .profile-card::before {
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
    margin-bottom: 1.5rem;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.25rem;
  }

  .card-subtitle {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-row {
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

  input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    color: var(--color-text);
    background: rgba(10, 10, 18, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    transition: all 0.3s;
  }

  input:focus {
    outline: none;
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MESSAGES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .message {
    padding: 0.875rem 1rem;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .error {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.15) 0%,
      rgba(255, 107, 107, 0.05) 100%
    );
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .success {
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.15) 0%, rgba(38, 222, 129, 0.05) 100%);
    color: var(--color-green);
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
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    border: none;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 16px var(--color-primary-glow);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px var(--color-primary-glow);
  }

  .btn-secondary {
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .btn-danger {
    background: rgba(255, 107, 107, 0.1);
    color: var(--color-red, #ff6b6b);
    border: 1px solid rgba(255, 107, 107, 0.25);
    margin-top: 0.75rem;
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(255, 107, 107, 0.2);
    border-color: rgba(255, 107, 107, 0.4);
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

  .btn-secondary .loading-spinner {
    border-color: rgba(108, 92, 231, 0.3);
    border-top-color: var(--color-primary-light);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE — iPhone 16 Pro Optimized
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .profile-page {
      padding: 0 0.25rem 2rem;
    }

    .profile-header {
      padding: 0 0.25rem 1rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .profile-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    .card-title {
      font-size: 1rem;
    }

    .card-subtitle {
      font-size: 0.75rem;
    }

    .avatar {
      width: 80px;
      height: 80px;
      font-size: 2rem;
    }

    .avatar-ring {
      inset: -6px;
    }

    .avatar-particles .particle {
      transform: rotate(var(--angle)) translateX(55px);
    }

    @keyframes orbitParticle {
      from {
        transform: rotate(var(--angle)) translateX(55px);
      }
      to {
        transform: rotate(calc(var(--angle) + 360deg)) translateX(55px);
      }
    }

    input {
      padding: 0.75rem 0.875rem;
      font-size: 16px; /* Prevents iOS zoom */
    }

    .btn {
      padding: 0.875rem 1.25rem;
      font-size: 0.9375rem;
    }
  }

  /* iPhone SE */
  @media (max-width: 375px) {
    .profile-title {
      font-size: 1.125rem;
    }

    .profile-card {
      padding: 1rem;
    }

    .avatar {
      width: 70px;
      height: 70px;
      font-size: 1.75rem;
    }

    .avatar-particles .particle {
      transform: rotate(var(--angle)) translateX(48px);
    }

    @keyframes orbitParticle {
      from {
        transform: rotate(var(--angle)) translateX(48px);
      }
      to {
        transform: rotate(calc(var(--angle) + 360deg)) translateX(48px);
      }
    }
  }

  /* iPhone 16 Pro (402px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .profile-page {
      padding: 0 0.5rem 2rem;
    }

    .profile-card {
      padding: 1.5rem;
    }

    .avatar {
      width: 88px;
      height: 88px;
      font-size: 2.25rem;
    }

    .avatar-particles .particle {
      transform: rotate(var(--angle)) translateX(60px);
    }

    @keyframes orbitParticle {
      from {
        transform: rotate(var(--angle)) translateX(60px);
      }
      to {
        transform: rotate(calc(var(--angle) + 360deg)) translateX(60px);
      }
    }
  }

  /* iPhone Pro Max (430px+) */
  @media (min-width: 430px) and (max-width: 640px) {
    .profile-page {
      padding: 0 0.75rem 2rem;
    }

    .profile-card {
      padding: 1.75rem;
    }

    .form-row {
      grid-template-columns: 1fr 1fr;
    }

    .avatar {
      width: 100px;
      height: 100px;
      font-size: 2.5rem;
    }

    .avatar-ring {
      inset: -8px;
    }

    .avatar-particles .particle {
      transform: rotate(var(--angle)) translateX(70px);
    }

    @keyframes orbitParticle {
      from {
        transform: rotate(var(--angle)) translateX(70px);
      }
      to {
        transform: rotate(calc(var(--angle) + 360deg)) translateX(70px);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-footer {
    display: flex;
    justify-content: center;
    padding-top: 1rem;
  }

  .footer-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: all 0.2s ease;
    opacity: 0.7;
  }

  .footer-link:hover {
    color: var(--color-primary-light);
    opacity: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SETTINGS TOGGLE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    margin-bottom: 1rem;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .setting-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .toggle-btn {
    position: relative;
    width: 48px;
    height: 26px;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: 13px;
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-btn.active {
    background: var(--gradient-primary);
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 12px var(--color-primary-glow);
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: #e8e6f0;
    border-radius: 50%;
    transition: transform 0.3s ease;
  }

  .toggle-btn.active .toggle-knob {
    transform: translateX(22px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE SIGN OUT — Only visible on mobile (desktop uses navbar sign out)
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .mobile-signout {
    display: none;
  }

  @media (max-width: 640px) {
    .mobile-signout {
      display: flex;
      justify-content: center;
      padding-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
  }

  .signout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-red, #ff6b6b);
    background: rgba(255, 107, 107, 0.08);
    border: 1px solid rgba(255, 107, 107, 0.2);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .signout-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    border-color: rgba(255, 107, 107, 0.35);
  }

  .signout-btn:active {
    transform: scale(0.98);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CODE INPUT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .code-input-group {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
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
  }

  .code-digit:focus {
    border-color: rgba(108, 92, 231, 0.6);
    box-shadow:
      0 0 24px var(--color-primary-glow),
      0 0 0 2px rgba(108, 92, 231, 0.2);
  }

  @media (max-width: 389px) {
    .code-digit {
      width: 48px;
      height: 56px;
      font-size: 1.25rem;
    }
    .code-input-group {
      gap: 0.5rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .avatar-ring,
    .avatar-particles .particle,
    .loading-spinner {
      animation: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     TRUSTED DEVICES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .devices-loading {
    display: flex;
    justify-content: center;
    padding: 1.5rem;
  }

  .devices-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .device-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: border-color 0.2s ease;
  }

  .device-item.current {
    border-color: var(--color-primary);
    background: rgba(108, 92, 231, 0.05);
  }

  .device-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .device-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .device-badge {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary-light);
    background: rgba(108, 92, 231, 0.15);
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-sm);
  }

  .device-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .device-remove-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .device-remove-btn:hover {
    color: var(--color-red);
    border-color: rgba(255, 107, 107, 0.3);
    background: rgba(255, 107, 107, 0.1);
  }

  .loading-spinner.small {
    width: 14px;
    height: 14px;
  }
</style>
