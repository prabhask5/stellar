<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    changeSingleUserGate,
    updateSingleUserProfile,
    getSingleUserInfo,
    changeSingleUserEmail,
    completeSingleUserEmailChange
  } from '@prabhask5/stellar-engine/auth';
  import { authState } from '@prabhask5/stellar-engine/stores';
  import { isDebugMode, setDebugMode } from '@prabhask5/stellar-engine/utils';
  import {
    resetDatabase,
    getTrustedDevices,
    removeTrustedDevice,
    getCurrentDeviceId
  } from '@prabhask5/stellar-engine';
  import type { TrustedDevice } from '@prabhask5/stellar-engine';
  import { onMount } from 'svelte';

  // Form state
  let firstName = $state('');
  let lastName = $state('');

  // Gate change state - using digit arrays like login page
  let oldCodeDigits = $state(['', '', '', '', '', '']);
  let newCodeDigits = $state(['', '', '', '', '', '']);
  let confirmCodeDigits = $state(['', '', '', '', '', '']);
  const oldCode = $derived(oldCodeDigits.join(''));
  const newCode = $derived(newCodeDigits.join(''));
  const confirmNewCode = $derived(confirmCodeDigits.join(''));

  // Input refs for digit inputs
  let oldCodeInputs: HTMLInputElement[] = $state([]);
  let newCodeInputs: HTMLInputElement[] = $state([]);
  let confirmCodeInputs: HTMLInputElement[] = $state([]);

  // Email change state
  let currentEmail = $state('');
  let newEmail = $state('');
  let emailLoading = $state(false);
  let emailError = $state<string | null>(null);
  let emailSuccess = $state<string | null>(null);
  let showEmailConfirmationModal = $state(false);
  let emailResendCooldown = $state(0);

  // UI state
  let profileLoading = $state(false);
  let codeLoading = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  let codeSuccess = $state<string | null>(null);
  let debugMode = $state(isDebugMode());
  let resetting = $state(false);

  // Debug tools state
  let forceSyncing = $state(false);
  let triggeringSyncManual = $state(false);
  let resettingCursor = $state(false);
  let checkingConnection = $state(false);
  let viewingTombstones = $state(false);
  let cleaningTombstones = $state(false);

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
      currentEmail = info.email || '';
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
      if (index < 5 && inputs[index + 1]) {
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
    for (let i = 0; i < 6 && i < pasted.length; i++) {
      digits[i] = pasted[i];
      if (inputs[i]) inputs[i].value = pasted[i];
    }
    const focusIndex = Math.min(pasted.length, 5);
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

    if (oldCode.length !== 6) {
      codeError = 'Please enter your current 6-digit code';
      return;
    }

    if (newCode.length !== 6) {
      codeError = 'Please enter a new 6-digit code';
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
      oldCodeDigits = ['', '', '', '', '', ''];
      newCodeDigits = ['', '', '', '', '', ''];
      confirmCodeDigits = ['', '', '', '', '', ''];
      setTimeout(() => (codeSuccess = null), 3000);
    } catch (err: unknown) {
      codeError = err instanceof Error ? err.message : 'Failed to change code';
    }

    codeLoading = false;
  }

  async function handleEmailSubmit(e: Event) {
    e.preventDefault();
    emailError = null;
    emailSuccess = null;

    if (!newEmail.trim()) {
      emailError = 'Please enter a new email address';
      return;
    }

    if (newEmail.trim() === currentEmail) {
      emailError = 'New email is the same as your current email';
      return;
    }

    emailLoading = true;

    try {
      const result = await changeSingleUserEmail(newEmail.trim());
      if (result.error) {
        emailError = result.error;
      } else if (result.confirmationRequired) {
        showEmailConfirmationModal = true;
        startResendCooldown();
        listenForEmailConfirmation();
      }
    } catch (err: unknown) {
      emailError = err instanceof Error ? err.message : 'Failed to change email';
    }

    emailLoading = false;
  }

  function startResendCooldown() {
    emailResendCooldown = 30;
    const interval = setInterval(() => {
      emailResendCooldown--;
      if (emailResendCooldown <= 0) clearInterval(interval);
    }, 1000);
  }

  async function handleResendEmailChange() {
    if (emailResendCooldown > 0) return;
    try {
      await changeSingleUserEmail(newEmail.trim());
      startResendCooldown();
    } catch {
      // Ignore resend errors
    }
  }

  function listenForEmailConfirmation() {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('stellar-auth-channel');
    channel.onmessage = async (event) => {
      if (
        event.data?.type === 'AUTH_CONFIRMED' &&
        event.data?.verificationType === 'email_change'
      ) {
        // Bring this tab to the foreground before the confirm tab closes
        window.focus();
        const result = await completeSingleUserEmailChange();
        if (!result.error && result.newEmail) {
          currentEmail = result.newEmail;
          emailSuccess = 'Email changed successfully';
          newEmail = '';
          setTimeout(() => (emailSuccess = null), 5000);
        } else {
          emailError = result.error || 'Failed to complete email change';
        }
        showEmailConfirmationModal = false;
        channel.close();
      }
    };
  }

  function dismissEmailModal() {
    showEmailConfirmationModal = false;
  }

  function toggleDebugMode() {
    debugMode = !debugMode;
    setDebugMode(debugMode);
  }

  function goBack() {
    goto('/tasks');
  }

  async function handleResetDatabase() {
    if (
      !confirm(
        'This will delete all local data and reload. Your data will be re-synced from the server. Continue?'
      )
    ) {
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

  // Debug tool handlers
  function getDebugWindow(): Record<string, unknown> {
    return window as unknown as Record<string, unknown>;
  }

  async function handleForceFullSync() {
    if (
      !confirm(
        'This will reset the sync cursor and re-download all data from the server. Continue?'
      )
    )
      return;
    forceSyncing = true;
    try {
      const fn = getDebugWindow().__stellarSync as
        | { forceFullSync: () => Promise<void> }
        | undefined;
      if (fn?.forceFullSync) {
        await fn.forceFullSync();
        alert('Force full sync complete.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Force full sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    forceSyncing = false;
  }

  async function handleTriggerSync() {
    triggeringSyncManual = true;
    try {
      const fn = getDebugWindow().__stellarSync as { sync: () => Promise<void> } | undefined;
      if (fn?.sync) {
        await fn.sync();
        alert('Sync cycle complete.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    triggeringSyncManual = false;
  }

  async function handleResetSyncCursor() {
    resettingCursor = true;
    try {
      const fn = getDebugWindow().__stellarSync as
        | { resetSyncCursor: () => Promise<void> }
        | undefined;
      if (fn?.resetSyncCursor) {
        await fn.resetSyncCursor();
        alert('Sync cursor reset. The next sync will pull all data.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Reset cursor failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    resettingCursor = false;
  }

  async function handleCheckConnection() {
    checkingConnection = true;
    try {
      const fn = getDebugWindow().__stellarSync as
        | {
            checkConnection: () => Promise<{
              connected: boolean;
              error?: string;
              records?: number;
            }>;
          }
        | undefined;
      if (fn?.checkConnection) {
        const result = await fn.checkConnection();
        if (result.connected) {
          alert('Connection OK. Supabase is reachable.');
        } else {
          alert('Connection failed: ' + (result.error || 'Unknown error'));
        }
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Connection check failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    checkingConnection = false;
  }

  function handleGetSyncStatus() {
    const fn = getDebugWindow().__stellarSync as
      | { getStatus: () => { cursor: unknown; pendingOps: Promise<number> } }
      | undefined;
    if (fn?.getStatus) {
      const status = fn.getStatus();
      const cursorDisplay =
        typeof status.cursor === 'object'
          ? JSON.stringify(status.cursor)
          : String(status.cursor || 'None');
      status.pendingOps.then((count: number) => {
        alert(`Sync Status:\n\nCursor: ${cursorDisplay}\nPending operations: ${count}`);
      });
    } else {
      alert('Debug mode must be enabled and the page refreshed to use this tool.');
    }
  }

  function handleRealtimeStatus() {
    const fn = getDebugWindow().__stellarSync as
      | { realtimeStatus: () => { state: string; healthy: boolean } }
      | undefined;
    if (fn?.realtimeStatus) {
      const status = fn.realtimeStatus();
      alert(
        `Realtime Status:\n\nState: ${status.state}\nHealthy: ${status.healthy ? 'Yes' : 'No'}`
      );
    } else {
      alert('Debug mode must be enabled and the page refreshed to use this tool.');
    }
  }

  function handleViewSyncStats() {
    const fn = getDebugWindow().__stellarSyncStats as
      | (() => { totalSyncCycles: number; recentMinute: number; recent: unknown[] })
      | undefined;
    if (fn) {
      const stats = fn();
      alert(
        `Sync Stats:\n\nTotal cycles: ${stats.totalSyncCycles}\nCycles in last minute: ${stats.recentMinute}\nRecent cycles logged to console.`
      );
    } else {
      alert('Debug mode must be enabled and the page refreshed to use this tool.');
    }
  }

  function handleViewEgress() {
    const fn = getDebugWindow().__stellarEgress as
      | (() => { totalFormatted: string; totalRecords: number; sessionStart: string })
      | undefined;
    if (fn) {
      const stats = fn();
      alert(
        `Egress Stats:\n\nTotal data transferred: ${stats.totalFormatted}\nTotal records: ${stats.totalRecords}\nSession started: ${new Date(stats.sessionStart).toLocaleString()}\n\nFull breakdown logged to console.`
      );
    } else {
      alert('Debug mode must be enabled and the page refreshed to use this tool.');
    }
  }

  async function handleViewTombstones() {
    viewingTombstones = true;
    try {
      const fn = getDebugWindow().__stellarTombstones as
        | ((opts?: { cleanup?: boolean; force?: boolean }) => Promise<void>)
        | undefined;
      if (fn) {
        await fn();
        alert('Tombstone details logged to console. Open DevTools to view.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('View tombstones failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    viewingTombstones = false;
  }

  async function handleCleanupTombstones() {
    if (
      !confirm(
        'This will permanently remove old soft-deleted records from local and server databases. Continue?'
      )
    )
      return;
    cleaningTombstones = true;
    try {
      const fn = getDebugWindow().__stellarTombstones as
        | ((opts?: { cleanup?: boolean; force?: boolean }) => Promise<void>)
        | undefined;
      if (fn) {
        await fn({ cleanup: true });
        alert('Tombstone cleanup complete. Details logged to console.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Tombstone cleanup failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    cleaningTombstones = false;
  }

  function handleMobileSignOut() {
    window.dispatchEvent(new CustomEvent('stellar:signout'));
  }
</script>

<svelte:head>
  <title>Profile - Stellar Planner</title>
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

  <!-- Change Email Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Change Email</h2>
      <p class="card-subtitle">Update the email address associated with your account</p>
    </div>

    {#if currentEmail}
      <div class="current-email">
        <span class="current-email-label">Current email</span>
        <span class="current-email-value">{currentEmail}</span>
      </div>
    {/if}

    <form onsubmit={handleEmailSubmit}>
      <div class="form-group">
        <label for="newEmail">New Email</label>
        <input
          type="email"
          id="newEmail"
          bind:value={newEmail}
          disabled={emailLoading}
          required
          placeholder="new@example.com"
        />
      </div>

      {#if emailError}
        <div class="message error">{emailError}</div>
      {/if}

      {#if emailSuccess}
        <div class="message success">{emailSuccess}</div>
      {/if}

      <button type="submit" class="btn btn-secondary" disabled={emailLoading}>
        {#if emailLoading}
          <span class="loading-spinner"></span>
          Sending...
        {:else}
          Update Email
        {/if}
      </button>
    </form>
  </div>

  <!-- Email Confirmation Modal -->
  {#if showEmailConfirmationModal}
    <div class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="modal-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h2 class="modal-title">Check your email</h2>
        <p class="modal-text">
          We sent a confirmation link to <strong>{newEmail}</strong>. Click the link to confirm your
          new email address.
        </p>

        <button
          class="btn btn-secondary modal-resend"
          disabled={emailResendCooldown > 0}
          onclick={handleResendEmailChange}
        >
          {#if emailResendCooldown > 0}
            Resend in {emailResendCooldown}s
          {:else}
            Resend confirmation email
          {/if}
        </button>

        <button class="modal-dismiss" onclick={dismissEmailModal}> Cancel </button>
      </div>
    </div>
  {/if}

  <!-- Change Code Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Change Code</h2>
      <p class="card-subtitle">Update your 6-digit access code</p>
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

    <!-- Debug Tools Section -->
    <div class="debug-section-divider">
      <span class="debug-section-label">Debug Tools</span>
    </div>

    <button class="btn btn-secondary" onclick={handleForceFullSync} disabled={forceSyncing}>
      {#if forceSyncing}
        <span class="loading-spinner"></span>
        Syncing...
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
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        Force Full Sync
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Clears local table data, resets the sync cursor, and re-downloads everything from the server
      without reloading the page. Use when data appears out of sync.<br /><span
        class="console-label">Run in console:</span
      > <code class="console-cmd">__stellarSync.forceFullSync()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleTriggerSync} disabled={triggeringSyncManual}>
      {#if triggeringSyncManual}
        <span class="loading-spinner"></span>
        Syncing...
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
          <path d="M21.5 2v6h-6" />
          <path d="M2.5 22v-6h6" />
          <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
          <path d="M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
        Trigger Sync Cycle
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Manually triggers a sync cycle to push local changes and pull remote changes. Use when changes
      aren't appearing.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarSync.sync()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleResetSyncCursor} disabled={resettingCursor}>
      {#if resettingCursor}
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
        Reset Sync Cursor
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Resets the sync cursor so the next sync cycle pulls all data instead of only new changes. Use
      before triggering a sync to do a full re-pull.<br /><span class="console-label"
        >Run in console:</span
      > <code class="console-cmd">__stellarSync.resetSyncCursor()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleCheckConnection} disabled={checkingConnection}>
      {#if checkingConnection}
        <span class="loading-spinner"></span>
        Checking...
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
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        Check Connection
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Tests the connection to Supabase and displays the result in a popup. Use to diagnose
      connectivity issues.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarSync.checkConnection()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleGetSyncStatus}>
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
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      View Sync Status
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Displays the current sync cursor and number of pending operations in a popup. Use to check if
      changes are queued.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarSync.getStatus()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleRealtimeStatus}>
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
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      Realtime Status
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Displays the current realtime WebSocket connection state and health in a popup. Use to check
      if live updates are working.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarSync.realtimeStatus()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleViewSyncStats}>
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
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
      View Sync Stats
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Displays a summary of sync cycles in a popup and logs the full details to the browser console.
      Use to monitor sync performance.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarSyncStats()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleViewEgress}>
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
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      View Egress Stats
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Displays a summary of data transfer in a popup and logs the per-table breakdown to the browser
      console. Use to monitor bandwidth usage.<br /><span class="console-label"
        >Run in console:</span
      >
      <code class="console-cmd">__stellarEgress()</code>
    </p>

    <button class="btn btn-secondary" onclick={handleViewTombstones} disabled={viewingTombstones}>
      {#if viewingTombstones}
        <span class="loading-spinner"></span>
        Loading...
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
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
          <line x1="5" y1="1" x2="19" y2="1" />
        </svg>
        View Tombstones
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Logs soft-deleted record counts per table to the browser console. Use to inspect pending
      deletions before cleanup.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarTombstones()</code>
    </p>

    <button
      class="btn btn-secondary"
      onclick={handleCleanupTombstones}
      disabled={cleaningTombstones}
    >
      {#if cleaningTombstones}
        <span class="loading-spinner"></span>
        Cleaning...
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
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        Cleanup Tombstones
      {/if}
    </button>
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Permanently removes old soft-deleted records from local IndexedDB and remote Supabase. Results
      are logged to the browser console.<br /><span class="console-label">Run in console:</span>
      <code class="console-cmd">__stellarTombstones({'{'} cleanup: true })</code>
    </p>

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
    <p class="setting-hint" style="margin-top: 0.5rem;">
      Deletes and recreates the entire IndexedDB database, then reloads the page. Use as a last
      resort when the database is corrupted or Force Full Sync doesn't resolve the issue.
    </p>
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
    margin-bottom: 0.5rem;
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

  .console-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .console-cmd {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.2rem 0.5rem;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.6875rem;
    color: var(--color-primary-light);
    background: rgba(108, 92, 231, 0.1);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-sm, 4px);
    word-break: break-all;
    max-width: 100%;
  }

  @media (max-width: 640px) {
    .console-label {
      display: block;
      margin-top: 0.375rem;
    }

    .console-cmd {
      display: block;
      font-size: 0.625rem;
    }
  }

  .debug-section-divider ~ .btn {
    margin-top: 1.25rem;
  }

  .debug-section-divider ~ .btn:first-of-type {
    margin-top: 0;
  }

  .debug-section-divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0 1rem;
  }

  .debug-section-divider::before,
  .debug-section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(108, 92, 231, 0.2);
  }

  .debug-section-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    white-space: nowrap;
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
    gap: 0.5rem;
  }

  .code-digit {
    width: 48px;
    height: 56px;
    text-align: center;
    font-size: 1.375rem;
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
  }

  /* iPhone SE / small phones */
  @media (max-width: 389px) {
    .code-digit {
      width: 36px;
      height: 44px;
      font-size: 1.125rem;
    }
    .code-input-group {
      gap: 0.25rem;
    }
  }

  /* iPhone 16 Pro (400-430px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .code-digit {
      width: 44px;
      height: 52px;
      font-size: 1.375rem;
    }
    .code-input-group {
      gap: 0.4375rem;
    }
  }

  /* General mobile (390-640px, excluding Pro range above) */
  @media (min-width: 390px) and (max-width: 399px) {
    .code-digit {
      width: 40px;
      height: 48px;
      font-size: 1.25rem;
    }
    .code-input-group {
      gap: 0.375rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CURRENT EMAIL DISPLAY
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .current-email {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    background: rgba(10, 10, 18, 0.4);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    margin-bottom: 1.25rem;
  }

  .current-email-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
  }

  .current-email-value {
    font-size: 0.9375rem;
    color: var(--color-text);
    font-weight: 500;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     EMAIL CONFIRMATION MODAL
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 1.5rem;
  }

  .modal-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.98) 0%, rgba(20, 20, 40, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-2xl);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 32px 80px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 0 100px rgba(108, 92, 231, 0.1);
    padding: 2.5rem 2rem;
    text-align: center;
    max-width: 400px;
    width: 100%;
  }

  .modal-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(255, 121, 198, 0.15) 100%);
    border-radius: 50%;
    color: var(--color-primary, #6c5ce7);
  }

  .modal-icon svg {
    width: 32px;
    height: 32px;
  }

  .modal-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.75rem;
  }

  .modal-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-muted);
    margin: 0 0 1.5rem;
  }

  .modal-text strong {
    color: var(--color-text);
  }

  .modal-resend {
    width: 100%;
  }

  .modal-dismiss {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .modal-dismiss:hover {
    color: var(--color-text);
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
