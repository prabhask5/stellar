<!--
  @fileoverview Landing / Home page — the authenticated user's welcome screen.

  This is the first page a logged-in user sees. It renders a cinematic,
  space-themed greeting with:

  1. **Time-aware greeting** — "Good morning / afternoon / evening" that
     transitions smoothly when the time-of-day period changes.
  2. **Personalised name** — resolved from the Supabase session profile or
     offline cached credentials, with fallbacks to email username.
  3. **Motivational compliment** — randomly selected from a curated list.
  4. **Immersive background** — animated star field, nebula effects, orbital
     rings, shooting stars, floating particles, and a constellation SVG.
  5. **Auth redirect** — if the auth store resolves to `'none'`, the user
     is redirected to `/login` automatically.

  The page also subscribes to sync-completion events to detect overnight
  time-period changes without requiring a manual refresh.
-->

<script lang="ts">
  /**
   * @fileoverview Home page script — greeting logic, compliment selection,
   * and auth-redirect guard.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  /* ── SvelteKit Utilities ── */
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';

  /* ── Stellar Engine — Stores & Auth ── */
  import { onSyncComplete, authState } from '@prabhask5/stellar-engine/stores';
  import { getUserProfile } from '@prabhask5/stellar-engine/auth';

  /* ── Actions ── */
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';

  // =============================================================================
  //  Component State
  // =============================================================================

  /** Whether the page is still initialising (shows the stellar loader). */
  let isLoading = $state(true);

  /** The currently displayed motivational message. */
  let selectedCompliment = $state('');

  /** The time-of-day greeting text (e.g. "Good morning"). */
  let timeGreeting = $state('Good day');

  /** When `true`, the greeting text is fading out for a period transition. */
  let isGreetingTransitioning = $state(false);

  // =============================================================================
  //  Time-of-Day Helpers
  // =============================================================================

  /** Union type representing the three greeting periods. */
  type TimePeriod = 'morning' | 'afternoon' | 'evening';

  /** Tracks the current period so we can detect transitions. */
  let currentTimePeriod = $state<TimePeriod>('morning');

  /**
   * Determines the current time-of-day period based on the hour.
   *
   * - 05:00 -- 11:59 → `'morning'`
   * - 12:00 -- 16:59 → `'afternoon'`
   * - 17:00 -- 04:59 → `'evening'`
   *
   * @returns The current `TimePeriod`
   */
  function getTimePeriod(): TimePeriod {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'morning';
    } else if (hour >= 12 && hour < 17) {
      return 'afternoon';
    } else {
      return 'evening';
    }
  }

  /**
   * Maps a `TimePeriod` to its human-readable greeting string.
   *
   * @param period - The time period to convert
   * @returns A greeting like `"Good morning"`
   */
  function getGreetingForPeriod(period: TimePeriod): string {
    switch (period) {
      case 'morning':
        return 'Good morning';
      case 'afternoon':
        return 'Good afternoon';
      case 'evening':
        return 'Good evening';
    }
  }

  /**
   * Checks whether the time-of-day period has changed and, if so,
   * smoothly transitions the greeting text with a fade-out / fade-in.
   *
   * Called on sync completion events to handle overnight changes.
   */
  function updateGreetingIfNeeded(): void {
    const newPeriod = getTimePeriod();
    if (newPeriod !== currentTimePeriod) {
      // Time period changed — animate the transition
      isGreetingTransitioning = true;

      // After fade out, update the text
      setTimeout(() => {
        currentTimePeriod = newPeriod;
        timeGreeting = getGreetingForPeriod(newPeriod);

        // After text update, fade back in
        setTimeout(() => {
          isGreetingTransitioning = false;
        }, 50);
      }, 300);
    }
  }

  // =============================================================================
  //  Cleanup References
  // =============================================================================

  /** Unsubscribe function for the sync-completion listener. */
  let unsubscribeSyncComplete: (() => void) | null = null;

  // =============================================================================
  //  Compliment Data
  // =============================================================================

  /** Pool of motivational compliments, randomly selected on each visit. */
  const compliments = [
    "you're going to do great things.",
    'the universe is on your side.',
    'your potential is limitless.',
    "you're capable of amazing things.",
    'keep reaching for the stars.',
    'your dedication is inspiring.',
    'greatness is within your reach.',
    'you make the impossible possible.',
    "you're stronger than you know.",
    'every step you take matters.',
    'your journey is extraordinary.',
    "you're exactly where you need to be.",
    'the best is yet to come.',
    "you've got this.",
    'your hard work will pay off.'
  ];

  /**
   * Picks a random compliment from the pool.
   *
   * @returns A motivational string (lowercase, no prefix)
   */
  function getRandomCompliment(): string {
    return compliments[Math.floor(Math.random() * compliments.length)];
  }

  // =============================================================================
  //  Derived State
  // =============================================================================

  /**
   * Derives the user's first name for the greeting display.
   *
   * Resolution order:
   * 1. `firstName` / `first_name` from the Supabase session profile
   * 2. Email username (before `@`) from the Supabase session
   * 3. `firstName` from the offline cached profile
   * 4. Email username from the offline cached profile
   * 5. Fallback → `'Explorer'`
   */
  const firstName = $derived.by(() => {
    if ($authState.session?.user) {
      const profile = getUserProfile($authState.session.user);
      if (profile.firstName || profile.first_name) {
        return (profile.firstName || profile.first_name) as string;
      }
      if ($authState.session.user.email) {
        return $authState.session.user.email.split('@')[0];
      }
    }
    if ($authState.offlineProfile?.profile?.firstName) {
      return $authState.offlineProfile.profile.firstName as string;
    }
    if ($authState.offlineProfile?.email) {
      return $authState.offlineProfile.email.split('@')[0];
    }
    return 'Explorer';
  });

  // =============================================================================
  //  Lifecycle — Mount
  // =============================================================================

  onMount(() => {
    // Initialise greeting based on current time
    currentTimePeriod = getTimePeriod();
    timeGreeting = getGreetingForPeriod(currentTimePeriod);

    // Select a random motivational compliment
    selectedCompliment = getRandomCompliment();

    isLoading = false;

    // Subscribe to sync completion — check if greeting needs update.
    // This handles the case where the page is open overnight.
    unsubscribeSyncComplete = onSyncComplete(() => {
      updateGreetingIfNeeded();
    });
  });

  // =============================================================================
  //  Reactive Effects
  // =============================================================================

  /**
   * Effect: auth redirect guard.
   *
   * Once the auth store finishes loading and resolves to `'none'` (no session),
   * redirect to `/login` with a `redirect` query param so the login page knows
   * this was an automatic redirect rather than direct navigation.
   */
  $effect(() => {
    if (!$authState.isLoading && $authState.mode === 'none') {
      // Include redirect param so login page knows this was a redirect, not direct navigation
      goto('/login?redirect=%2F', { replaceState: true });
    }
  });

  // =============================================================================
  //  Lifecycle — Destroy
  // =============================================================================

  onDestroy(() => {
    // Clean up sync subscription
    if (unsubscribeSyncComplete) {
      unsubscribeSyncComplete();
      unsubscribeSyncComplete = null;
    }
  });
</script>

<svelte:head>
  <title>Home - Stellar Planner</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Loading State — full-screen stellar spinner while auth resolves
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isLoading}
  <div class="loading-screen">
    <div class="stellar-loader">
      <div class="loader-ring loader-ring-1"></div>
      <div class="loader-ring loader-ring-2"></div>
      <div class="loader-ring loader-ring-3"></div>
      <div class="loader-core">
        <div class="loader-core-inner"></div>
      </div>
      <div class="loader-particle loader-particle-1"></div>
      <div class="loader-particle loader-particle-2"></div>
      <div class="loader-particle loader-particle-3"></div>
      <div class="loader-particle loader-particle-4"></div>
    </div>
  </div>
{:else}
  <!-- ═══════════════════════════════════════════════════════════════════════
       Home Container — immersive space-themed welcome screen
       ═══════════════════════════════════════════════════════════════════════ -->
  <div class="home-container">
    <!-- ── Animated Star Field — three layers of parallax stars ── -->
    <div class="starfield">
      <div class="stars stars-small"></div>
      <div class="stars stars-medium"></div>
      <div class="stars stars-large"></div>
    </div>

    <!-- ── Nebula Effects — blurred radial gradients for depth ── -->
    <div class="nebula nebula-1"></div>
    <div class="nebula nebula-2"></div>
    <div class="nebula nebula-3"></div>

    <!-- ── Orbital Rings — concentric rotating ring borders with particles ── -->
    <div class="orbital-system">
      <div class="orbit orbit-1"></div>
      <div class="orbit orbit-2"></div>
      <div class="orbit orbit-3"></div>
      <div class="orbit-particle particle-1"></div>
      <div class="orbit-particle particle-2"></div>
      <div class="orbit-particle particle-3"></div>
    </div>

    <!-- ── Shooting Stars — periodic streak animations ── -->
    <div class="shooting-star shooting-star-1"></div>
    <div class="shooting-star shooting-star-2"></div>
    <div class="shooting-star shooting-star-3"></div>

    <!-- ── Central Content — greeting and compliment ── -->
    <div class="content">
      <div class="greeting-wrapper">
        <div class="greeting-glow"></div>
        <h1 class="greeting">
          <span class="greeting-hello" class:greeting-transitioning={isGreetingTransitioning}
            >{timeGreeting},</span
          >
          <span class="greeting-name" use:truncateTooltip>{firstName}</span>
        </h1>
      </div>

      <!-- Compliment — prefixed with "Remember, " -->
      <p class="compliment">
        Remember, {selectedCompliment}
      </p>

      <!-- ── Decorative Constellation — SVG lines connecting pulsing star dots ── -->
      <div class="constellation">
        <span class="star star-1"></span>
        <span class="star star-2"></span>
        <span class="star star-3"></span>
        <span class="star star-4"></span>
        <span class="star star-5"></span>
        <svg class="constellation-lines" viewBox="0 0 200 100" fill="none">
          <path
            d="M20 50 L80 30 L140 55 L180 25"
            stroke="url(#constellationGrad)"
            stroke-width="1"
            opacity="0.3"
          />
          <path
            d="M80 30 L100 70"
            stroke="url(#constellationGrad)"
            stroke-width="1"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="constellationGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#6c5ce7" />
              <stop offset="50%" stop-color="#ff79c6" />
              <stop offset="100%" stop-color="#26de81" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>

    <!-- ── Floating Particles — 20 randomly-positioned drifting dots ── -->
    <div class="particles">
      {#each Array(20) as _, _i (_i)}
        <span
          class="particle"
          style="
            --delay: {Math.random() * 5}s;
            --duration: {5 + Math.random() * 10}s;
            --x-start: {Math.random() * 100}%;
            --y-start: {Math.random() * 100}%;
            --size: {2 + Math.random() * 4}px;
            --opacity: {0.3 + Math.random() * 0.5};
          "
        ></span>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOADING SCREEN
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-void);
  }

  /* ═══ Stellar Loader — animated "star being born" spinner ═══ */

  .stellar-loader {
    position: relative;
    width: 120px;
    height: 120px;
    animation: loaderFadeIn 0.6s ease-out both;
  }

  @keyframes loaderFadeIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Orbital Rings ── */

  .loader-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid transparent;
  }

  .loader-ring-1 {
    inset: 0;
    border-color: rgba(108, 92, 231, 0.25);
    border-top-color: rgba(108, 92, 231, 0.8);
    animation: loaderOrbit 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .loader-ring-2 {
    inset: 12px;
    border-color: rgba(255, 121, 198, 0.15);
    border-right-color: rgba(255, 121, 198, 0.6);
    animation: loaderOrbit 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite reverse;
  }

  .loader-ring-3 {
    inset: 24px;
    border-color: rgba(0, 212, 255, 0.1);
    border-bottom-color: rgba(0, 212, 255, 0.5);
    animation: loaderOrbit 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  @keyframes loaderOrbit {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Core ── */

  .loader-core {
    position: absolute;
    inset: 36px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(108, 92, 231, 0.4) 0%,
      rgba(108, 92, 231, 0.1) 60%,
      transparent 70%
    );
    animation: loaderCorePulse 2s ease-in-out infinite;
  }

  .loader-core-inner {
    position: absolute;
    inset: 30%;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(139, 124, 240, 0.9) 30%,
      rgba(108, 92, 231, 0.6) 60%,
      transparent 100%
    );
    box-shadow:
      0 0 20px rgba(108, 92, 231, 0.8),
      0 0 40px rgba(108, 92, 231, 0.4),
      0 0 80px rgba(108, 92, 231, 0.2);
    animation: loaderCoreGlow 2s ease-in-out infinite;
  }

  @keyframes loaderCorePulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
  }

  @keyframes loaderCoreGlow {
    0%,
    100% {
      transform: scale(1);
      box-shadow:
        0 0 20px rgba(108, 92, 231, 0.8),
        0 0 40px rgba(108, 92, 231, 0.4),
        0 0 80px rgba(108, 92, 231, 0.2);
    }
    50% {
      transform: scale(1.1);
      box-shadow:
        0 0 30px rgba(139, 124, 240, 0.9),
        0 0 60px rgba(108, 92, 231, 0.5),
        0 0 100px rgba(255, 121, 198, 0.2);
    }
  }

  /* ── Orbiting Particles ── */

  .loader-particle {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    top: 50%;
    left: 50%;
  }

  .loader-particle-1 {
    background: rgba(108, 92, 231, 0.9);
    box-shadow: 0 0 6px rgba(108, 92, 231, 0.6);
    animation: loaderParticleOrbit1 3s linear infinite;
  }

  .loader-particle-2 {
    width: 3px;
    height: 3px;
    background: rgba(255, 121, 198, 0.9);
    box-shadow: 0 0 6px rgba(255, 121, 198, 0.6);
    animation: loaderParticleOrbit2 2.2s linear infinite;
  }

  .loader-particle-3 {
    width: 3px;
    height: 3px;
    background: rgba(0, 212, 255, 0.9);
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.6);
    animation: loaderParticleOrbit3 2.8s linear infinite;
  }

  .loader-particle-4 {
    width: 2px;
    height: 2px;
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    animation: loaderParticleOrbit4 3.5s linear infinite;
  }

  @keyframes loaderParticleOrbit1 {
    from {
      transform: rotate(0deg) translateX(54px) rotate(0deg);
      opacity: 0.9;
    }
    50% {
      opacity: 0.4;
    }
    to {
      transform: rotate(360deg) translateX(54px) rotate(-360deg);
      opacity: 0.9;
    }
  }

  @keyframes loaderParticleOrbit2 {
    from {
      transform: rotate(90deg) translateX(42px) rotate(-90deg);
      opacity: 0.8;
    }
    50% {
      opacity: 0.3;
    }
    to {
      transform: rotate(450deg) translateX(42px) rotate(-450deg);
      opacity: 0.8;
    }
  }

  @keyframes loaderParticleOrbit3 {
    from {
      transform: rotate(200deg) translateX(48px) rotate(-200deg);
      opacity: 0.8;
    }
    50% {
      opacity: 0.3;
    }
    to {
      transform: rotate(560deg) translateX(48px) rotate(-560deg);
      opacity: 0.8;
    }
  }

  @keyframes loaderParticleOrbit4 {
    from {
      transform: rotate(320deg) translateX(36px) rotate(-320deg);
      opacity: 0.7;
    }
    50% {
      opacity: 0.2;
    }
    to {
      transform: rotate(680deg) translateX(36px) rotate(-680deg);
      opacity: 0.7;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loader-ring,
    .loader-core,
    .loader-core-inner,
    .loader-particle {
      animation: none !important;
    }
    .loader-core-inner {
      box-shadow:
        0 0 20px rgba(108, 92, 231, 0.8),
        0 0 40px rgba(108, 92, 231, 0.4);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HOME CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .home-container {
    position: fixed;
    /* Fill entire screen below the navbar */
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(
      ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%
    );
    background-attachment: fixed;
    /* Offset upward to account for navbar (64px desktop) and appear truly centered */
    padding-top: 64px;
  }

  /* Mobile: account for bottom navbar instead */
  @media (max-width: 768px) {
    .home-container {
      padding-top: 0;
      /* Mobile has top island header + bottom nav, roughly balanced */
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STAR FIELD — three layers of parallax-drifting stars
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .starfield {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .stars {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  /* Small white dots — fast drift */
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

  /* Medium coloured dots — slow reverse drift */
  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(108, 92, 231, 0.9) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 60% 80%, rgba(255, 121, 198, 0.8) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 80% 20%, rgba(38, 222, 129, 0.7) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 40% 60%, rgba(0, 212, 255, 0.6) 0%, transparent 100%);
    background-size: 300px 300px;
    animation: starsDrift 150s linear infinite reverse;
  }

  /* Large bright dots — twinkle + very slow drift */
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
     NEBULA EFFECTS — blurred radial gradients for cosmic depth
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.4;
    pointer-events: none;
  }

  /* Top-right purple nebula */
  .nebula-1 {
    width: 600px;
    height: 600px;
    top: -200px;
    right: -150px;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.5) 0%, transparent 70%);
    animation:
      nebulaPulse 8s ease-in-out infinite,
      nebulaFloat 20s ease-in-out infinite;
  }

  /* Bottom-left pink nebula */
  .nebula-2 {
    width: 500px;
    height: 500px;
    bottom: -150px;
    left: -100px;
    background: radial-gradient(ellipse, rgba(255, 121, 198, 0.4) 0%, transparent 70%);
    animation:
      nebulaPulse 10s ease-in-out infinite 2s,
      nebulaFloat 25s ease-in-out infinite reverse;
  }

  /* Centre green nebula */
  .nebula-3 {
    width: 400px;
    height: 400px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(38, 222, 129, 0.2) 0%, transparent 70%);
    animation: nebulaPulse 12s ease-in-out infinite 4s;
  }

  @keyframes nebulaPulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
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
     ORBITAL SYSTEM — concentric rotating rings with glowing particles
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
    border: 1px solid rgba(108, 92, 231, 0.15);
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
    border-color: rgba(255, 121, 198, 0.1);
    animation: orbitRotate 50s linear infinite reverse;
  }

  .orbit-3 {
    width: 700px;
    height: 700px;
    border-color: rgba(38, 222, 129, 0.08);
    animation: orbitRotate 70s linear infinite;
  }

  @keyframes orbitRotate {
    from {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  /* ── Orbit Particles — glowing dots that travel along each ring ── */

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
    animation: orbitParticle1 30s linear infinite;
  }

  .particle-2 {
    background: var(--color-accent);
    box-shadow:
      0 0 15px var(--color-accent-glow),
      0 0 30px var(--color-accent-glow);
    animation: orbitParticle2 50s linear infinite reverse;
    width: 4px;
    height: 4px;
  }

  .particle-3 {
    background: var(--color-success);
    box-shadow:
      0 0 15px var(--color-success-glow),
      0 0 30px var(--color-success-glow);
    animation: orbitParticle3 70s linear infinite;
    width: 5px;
    height: 5px;
  }

  @keyframes orbitParticle1 {
    from {
      transform: rotate(0deg) translateX(150px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(150px) rotate(-360deg);
    }
  }

  @keyframes orbitParticle2 {
    from {
      transform: rotate(0deg) translateX(250px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(250px) rotate(-360deg);
    }
  }

  @keyframes orbitParticle3 {
    from {
      transform: rotate(0deg) translateX(350px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(350px) rotate(-360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHOOTING STARS — periodic diagonal streak animations
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .shooting-star {
    position: absolute;
    width: 100px;
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
    top: 15%;
    left: 10%;
    transform: rotate(-35deg);
    animation: shootingStar 8s ease-in-out infinite;
  }

  .shooting-star-2 {
    top: 35%;
    right: 20%;
    transform: rotate(-40deg);
    animation: shootingStar 12s ease-in-out infinite 3s;
  }

  .shooting-star-3 {
    bottom: 30%;
    left: 30%;
    transform: rotate(-30deg);
    animation: shootingStar 10s ease-in-out infinite 6s;
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
      transform: rotate(-35deg) translateX(300px);
    }
    96% {
      opacity: 0;
      transform: rotate(-35deg) translateX(350px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CENTRAL CONTENT — greeting text and compliment
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content {
    position: relative;
    z-index: 10;
    text-align: center;
    padding: 2rem;
    animation: contentReveal 1.2s ease-out forwards;
  }

  @keyframes contentReveal {
    0% {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .greeting-wrapper {
    position: relative;
    display: inline-block;
    margin-bottom: 1.5rem;
  }

  /* Blurred glow behind the greeting text */
  .greeting-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: 150px;
    background: radial-gradient(
      ellipse,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.1) 50%,
      transparent 70%
    );
    filter: blur(40px);
    animation: greetingGlow 4s ease-in-out infinite;
  }

  @keyframes greetingGlow {
    0%,
    100% {
      opacity: 0.6;
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  .greeting {
    position: relative;
    font-size: clamp(2.5rem, 8vw, 5rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /* Time-of-day sub-heading (e.g. "Good morning,") */
  .greeting-hello {
    color: var(--color-text-secondary);
    font-size: 0.5em;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 0.3s forwards;
    transition:
      opacity 0.3s ease-out,
      transform 0.3s ease-out;
  }

  /* Subtle fade transition when time greeting changes */
  .greeting-hello.greeting-transitioning {
    opacity: 0 !important;
    transform: translateY(-4px);
  }

  /* User's name — gradient shimmer text */
  .greeting-name {
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 25%,
      var(--color-accent) 50%,
      var(--color-primary-light) 75%,
      var(--color-text) 100%
    );
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation:
      nameShimmer 8s linear infinite,
      fadeSlideIn 0.8s ease-out 0.5s forwards;
    opacity: 0;
    text-shadow: 0 0 80px rgba(108, 92, 231, 0.5);
  }

  @keyframes nameShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 300% center;
    }
  }

  @keyframes fadeSlideIn {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Compliment text below the greeting */
  .compliment {
    font-size: clamp(1.125rem, 3vw, 1.5rem);
    color: var(--color-text-muted);
    font-weight: 500;
    letter-spacing: 0.01em;
    max-width: 500px;
    margin: 0 auto;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 0.8s forwards;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONSTELLATION — decorative SVG star pattern below the greeting
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .constellation {
    position: relative;
    width: 200px;
    height: 100px;
    margin: 3rem auto 0;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 1s forwards;
  }

  .constellation-lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Individual constellation star dots */
  .star {
    position: absolute;
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
    animation: starPulse 2s ease-in-out infinite;
  }

  .star-1 {
    left: 10%;
    top: 50%;
    animation-delay: 0s;
  }
  .star-2 {
    left: 40%;
    top: 30%;
    animation-delay: 0.3s;
  }
  .star-3 {
    left: 50%;
    top: 70%;
    animation-delay: 0.6s;
    width: 3px;
    height: 3px;
  }
  .star-4 {
    left: 70%;
    top: 55%;
    animation-delay: 0.9s;
  }
  .star-5 {
    left: 90%;
    top: 25%;
    animation-delay: 1.2s;
    width: 3px;
    height: 3px;
  }

  @keyframes starPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.3);
      box-shadow: 0 0 20px rgba(255, 255, 255, 1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FLOATING PARTICLES — randomly-positioned drifting dots
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
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* ── Tablet (<=768px) — shrink orbits and nebulae ── */
  @media (max-width: 768px) {
    .orbit-1 {
      width: 200px;
      height: 200px;
    }
    .orbit-2 {
      width: 350px;
      height: 350px;
    }
    .orbit-3 {
      width: 500px;
      height: 500px;
    }

    @keyframes orbitParticle1 {
      from {
        transform: rotate(0deg) translateX(100px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(100px) rotate(-360deg);
      }
    }

    @keyframes orbitParticle2 {
      from {
        transform: rotate(0deg) translateX(175px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(175px) rotate(-360deg);
      }
    }

    @keyframes orbitParticle3 {
      from {
        transform: rotate(0deg) translateX(250px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(250px) rotate(-360deg);
      }
    }

    .nebula-1 {
      width: 400px;
      height: 400px;
    }
    .nebula-2 {
      width: 350px;
      height: 350px;
    }
    .nebula-3 {
      width: 300px;
      height: 300px;
    }

    .content {
      padding: 1.5rem;
    }

    .constellation {
      width: 150px;
      height: 75px;
      margin-top: 2rem;
    }
  }

  /* ── Small Mobile (<=480px) — reduce shooting star length and glow sizes ── */
  @media (max-width: 480px) {
    .shooting-star {
      width: 60px;
    }

    .greeting-glow {
      width: 200px;
      height: 100px;
    }
  }

  /* ── Reduced Motion — disable all cosmetic animations ── */
  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .orbit,
    .orbit-particle,
    .shooting-star,
    .particle,
    .star,
    .greeting-glow {
      animation: none;
    }

    .greeting-name {
      animation: fadeSlideIn 0.8s ease-out 0.5s forwards;
    }

    .greeting-hello,
    .compliment,
    .constellation {
      animation: fadeSlideIn 0.5s ease-out forwards;
      opacity: 1;
    }
  }
</style>
