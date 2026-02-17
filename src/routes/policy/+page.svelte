<!--
  ═══════════════════════════════════════════════════════════════════════════════
  Stellar — Privacy Policy Page
  ═══════════════════════════════════════════════════════════════════════════════

  A visually immersive privacy policy page with a cosmic background —
  animated starfields, nebula clouds, orbital rings, shooting stars, and
  floating particles. Contains structured privacy policy content in a
  liquid glass container.

  Layout:
    - Full-height container with deep-space gradient background
    - Three layers of parallax star fields (small, medium, large)
    - Three nebula blobs with pulsing/floating animations
    - Three concentric orbital rings with orbiting particles
    - Three shooting stars on staggered timers
    - 15 randomly-positioned floating particles
    - Centered scrollable content in a liquid glass card

  Accessibility:
    - All animations disabled under `prefers-reduced-motion: reduce`
    - Content uses `clamp()` for fluid responsive typography

  ═══════════════════════════════════════════════════════════════════════════════
-->

<script lang="ts">
  import { onMount } from 'svelte';

  /** Controls the fade-in entrance animation for the content card */
  let isVisible = $state(false);

  onMount(() => {
    /* Short delay before revealing content — lets the cosmic background render first */
    setTimeout(() => (isVisible = true), 100);
  });
</script>

<svelte:head>
  <title>Privacy - Stellar Planner</title>
  <meta name="description" content="Stellar Privacy Policy" />
</svelte:head>

<div class="policy-page">
  <!-- ═══════════════════════════════════════════════════════════════════════════
       Animated Star Field — three layers at different sizes/speeds for parallax
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="starfield">
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════════
       Nebula Effects — large blurred gradient blobs that pulse and float
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="nebula nebula-1"></div>
  <div class="nebula nebula-2"></div>
  <div class="nebula nebula-3"></div>

  <!-- ═══════════════════════════════════════════════════════════════════════════
       Orbital Rings — concentric circles with glowing particles tracing paths
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="orbital-system">
    <div class="orbit orbit-1"></div>
    <div class="orbit orbit-2"></div>
    <div class="orbit orbit-3"></div>
    <div class="orbit-particle particle-1"></div>
    <div class="orbit-particle particle-2"></div>
    <div class="orbit-particle particle-3"></div>
  </div>

  <!-- Shooting Stars — brief streaks that fire on staggered intervals -->
  <div class="shooting-star shooting-star-1"></div>
  <div class="shooting-star shooting-star-2"></div>
  <div class="shooting-star shooting-star-3"></div>

  <!-- ═══════════════════════════════════════════════════════════════════════════
       Floating Particles — 15 randomly-positioned dots with CSS custom
       properties for staggered animation timing, position, and size
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="particles">
    {#each Array(15) as _, _i (_i)}
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

  <!-- ═══════════════════════════════════════════════════════════════════════════
       Content Card — liquid glass container with privacy policy text
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="content-wrapper" class:visible={isVisible}>
    <div class="glass-card">
      <h1 class="title">Privacy</h1>

      <!-- Section 1: Stellar Privacy Policy -->
      <section class="policy-section">
        <h2 class="section-heading">Stellar Privacy Policy</h2>
        <p class="policy-text">
          Stellar is a fully self-hosted personal planning application. You deploy it to your own
          Vercel account and configure your own Supabase database. All data — goals, tasks,
          routines, and focus sessions — is stored exclusively in your own database instance. No
          data is collected, transmitted to, or accessible by the developer or any third party. No
          telemetry, no analytics, no tracking. You are the sole owner and manager of your data.
        </p>
      </section>

      <div class="section-divider"></div>

      <!-- Section 2: Stellar Focus — Browser Extension -->
      <section class="policy-section">
        <h2 class="section-heading">Stellar Focus — Browser Extension</h2>
        <p class="policy-text">
          Stellar Focus is a companion browser extension that integrates with your self-hosted
          Stellar instance to enforce website blocking during focus sessions.
        </p>

        <ul class="permissions-list">
          <li>
            <span class="permission-label">storage</span>: Stores extension configuration (Supabase
            connection URL, sync preferences, block list settings) locally in the browser's
            extension storage area. No data is sent externally.
          </li>
          <li>
            <span class="permission-label">tabs</span>: Reads the URL of the active tab to check
            whether it matches a site on your personal block list during active focus sessions. Used
            solely for blocking — no browsing history is recorded or transmitted.
          </li>
          <li>
            <span class="permission-label">webNavigation</span>: Detects in-page navigations to
            enforce blocking on sites that load content dynamically without full page reloads. No
            navigation data is stored or sent externally.
          </li>
          <li>
            <span class="permission-label">alarms</span>: Schedules background timers for periodic
            sync checks with your Supabase instance and focus session countdown events. Alarms run
            locally.
          </li>
          <li>
            <span class="permission-label">host_permissions (<code>&lt;all_urls&gt;</code>)</span>:
            Required to intercept and redirect navigation to any URL that appears on your custom
            block list during focus sessions. Without this permission, the extension cannot block
            arbitrary sites.
          </li>
        </ul>

        <p class="policy-text">
          All data synced between Stellar Focus and Stellar is transmitted directly to your
          self-hosted Supabase instance. No data passes through any intermediary server. No data is
          sold, shared, or accessible to anyone other than you.
        </p>

        <p class="policy-text source-text">
          Open-source at
          <a href="https://github.com/prabhask5/stellar" target="_blank" rel="noopener noreferrer">
            github.com/prabhask5/stellar
          </a>
        </p>
      </section>
    </div>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════
     PAGE CONTAINER — Full-viewport deep-space backdrop (scrollable)
     ═══════════════════════════════════════════════════════════════════════════════ */

  .policy-page {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(
      ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%
    );
    /* Negative margin to bleed into layout padding, then re-pad internally */
    margin: -2rem;
    padding: 3rem 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STAR FIELD — Three-layer parallax starfield using repeating radial gradients
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
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.4;
    pointer-events: none;
  }

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
     SHOOTING STARS
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
     CONTENT WRAPPER — Centered, full-width layout with fade-in
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content-wrapper {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 700px;
    opacity: 0;
    transform: translateY(30px) scale(0.95);
    transition:
      opacity 1s ease-out,
      transform 1s ease-out;
  }

  .content-wrapper.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     GLASS CARD — Liquid glass container matching profile/plans panels
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .glass-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl, 1.5rem);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    padding: 2.5rem 2rem;
    text-align: center;
  }

  /* Page title — multi-stop gradient text with animated shimmer sweep */
  .title {
    position: relative;
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 2rem;
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
    animation: titleShimmer 8s linear infinite;
  }

  @keyframes titleShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 300% center;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     POLICY SECTIONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .policy-section {
    padding: 1rem 0;
    text-align: left;
  }

  .section-heading {
    font-size: clamp(1.375rem, 4vw, 1.75rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0 0 1rem;
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
    animation: titleShimmer 8s linear infinite;
  }

  .section-divider {
    height: 1px;
    margin: 1.5rem 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.4) 20%,
      rgba(255, 121, 198, 0.4) 50%,
      rgba(108, 92, 231, 0.4) 80%,
      transparent 100%
    );
  }

  .policy-text {
    font-size: clamp(0.9375rem, 2.5vw, 1.0625rem);
    color: var(--color-text-muted);
    font-weight: 500;
    line-height: 1.7;
    margin: 0 0 1.25rem;
  }

  .permissions-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .permissions-list li {
    font-size: clamp(0.875rem, 2.25vw, 1rem);
    color: var(--color-text-muted);
    line-height: 1.7;
    padding-left: 1rem;
    border-left: 2px solid rgba(108, 92, 231, 0.2);
  }

  .permission-label {
    color: var(--color-primary-light);
    font-weight: 600;
  }

  .permissions-list code {
    font-family: inherit;
    font-size: 0.9em;
    color: var(--color-primary-light);
    opacity: 0.8;
  }

  .source-text a {
    color: var(--color-primary-light);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.3s ease;
  }

  .source-text a:hover {
    color: var(--color-accent);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

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
  }

  @media (max-width: 640px) {
    .policy-page {
      margin: -1rem;
      padding: 2rem 1rem;
    }

    .glass-card {
      padding: 1.75rem 1.25rem;
      border-radius: var(--radius-xl, 1rem);
    }
  }

  @media (max-width: 480px) {
    .shooting-star {
      width: 60px;
    }

    .policy-page {
      padding: 1.5rem 0.75rem;
    }

    .glass-card {
      padding: 1.5rem 1rem;
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
    .title,
    .section-heading {
      animation: none;
    }

    .content-wrapper {
      transition: opacity 0.3s ease-out;
      transform: none;
    }

    .content-wrapper.visible {
      transform: none;
    }
  }
</style>
