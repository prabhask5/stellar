<!--
  ═══════════════════════════════════════════════════════════════════════════════
  Stellar — Privacy Policy Page
  ═══════════════════════════════════════════════════════════════════════════════

  A visually immersive privacy policy page with a full cosmic background —
  animated starfields, nebula clouds, orbital rings, shooting stars, and
  floating particles. The actual policy content is minimal (self-hosted app,
  no data sold) but the presentation matches Stellar's space theme.

  Layout:
    - Fixed full-screen container with deep-space gradient background
    - Three layers of parallax star fields (small, medium, large)
    - Three nebula blobs with pulsing/floating animations
    - Three concentric orbital rings with orbiting particles
    - Three shooting stars on staggered timers
    - 15 randomly-positioned floating particles
    - Centered content card with fade-in entrance animation

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

<div class="policy-container">
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
       Content Card — the actual privacy policy text with fade-in entrance
       ═══════════════════════════════════════════════════════════════════════════ -->
  <div class="content" class:visible={isVisible}>
    <!-- Ambient glow behind the text — pulsing purple/pink radial gradient -->
    <div class="content-glow"></div>
    <h1 class="title">Privacy</h1>
    <p class="policy-text">
      This is a self-hosted app, so your goals, tasks, routines, and focus sessions data are only
      managed by you and never sold. Who would want that anyway?
    </p>
    <a href="/" class="back-link">
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
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      Back to Stellar
    </a>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════
     CONTAINER — Full-screen deep-space backdrop
     ═══════════════════════════════════════════════════════════════════════════════ */

  .policy-container {
    position: fixed;
    inset: 0;
    top: 64px; /* Offset below the app header bar */
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

  /* Layer 1 — Small white stars, fastest drift, 200px tile */
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

  /* Layer 2 — Medium colored stars (purple, pink, green, cyan), 300px tile */
  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(108, 92, 231, 0.9) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 60% 80%, rgba(255, 121, 198, 0.8) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 80% 20%, rgba(38, 222, 129, 0.7) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 40% 60%, rgba(0, 212, 255, 0.6) 0%, transparent 100%);
    background-size: 300px 300px;
    animation: starsDrift 150s linear infinite reverse;
  }

  /* Layer 3 — Large bright stars with twinkle + drift, 400px tile */
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

  /* Slow diagonal drift — creates the illusion of drifting through space */
  @keyframes starsDrift {
    from {
      transform: translateY(0) translateX(0);
    }
    to {
      transform: translateY(-100px) translateX(-50px);
    }
  }

  /* Gentle opacity oscillation for large stars */
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
     NEBULA EFFECTS — Large blurred gradient blobs that pulse and float
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px); /* Heavy blur creates the soft cloud look */
    opacity: 0.4;
    pointer-events: none;
  }

  /* Top-right purple nebula — largest, anchors the scene */
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

  /* Bottom-left pink nebula — staggered 2s delay */
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

  /* Center green nebula — subtler, 4s delay */
  .nebula-3 {
    width: 400px;
    height: 400px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(38, 222, 129, 0.2) 0%, transparent 70%);
    animation: nebulaPulse 12s ease-in-out infinite 4s;
  }

  /* Breathe in/out — opacity + scale oscillation */
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

  /* Gentle wandering drift path */
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
     ORBITAL SYSTEM — Concentric rings with glowing particles tracing orbits
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

  /* Inner orbit — 300px diameter, 30s rotation */
  .orbit-1 {
    width: 300px;
    height: 300px;
    animation: orbitRotate 30s linear infinite;
  }

  /* Middle orbit — 500px diameter, 50s rotation (reversed) */
  .orbit-2 {
    width: 500px;
    height: 500px;
    border-color: rgba(255, 121, 198, 0.1);
    animation: orbitRotate 50s linear infinite reverse;
  }

  /* Outer orbit — 700px diameter, 70s rotation */
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

  /* Glowing dots that trace along each orbit ring */
  .orbit-particle {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    top: 50%;
    left: 50%;
  }

  /* Purple particle on the inner orbit — double-glow box-shadow */
  .particle-1 {
    background: var(--color-primary);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 0 30px var(--color-primary-glow);
    animation: orbitParticle1 30s linear infinite;
  }

  /* Pink particle on the middle orbit — smaller (4px), reversed direction */
  .particle-2 {
    background: var(--color-accent);
    box-shadow:
      0 0 15px var(--color-accent-glow),
      0 0 30px var(--color-accent-glow);
    animation: orbitParticle2 50s linear infinite reverse;
    width: 4px;
    height: 4px;
  }

  /* Green particle on the outer orbit — 5px size */
  .particle-3 {
    background: var(--color-success);
    box-shadow:
      0 0 15px var(--color-success-glow),
      0 0 30px var(--color-success-glow);
    animation: orbitParticle3 70s linear infinite;
    width: 5px;
    height: 5px;
  }

  /* Orbit particle keyframes — rotate(angle) translateX(radius) rotate(-angle)
     keeps the particle upright while tracing a circular path */

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
     SHOOTING STARS — Brief bright streaks that fire on staggered intervals
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

  /* Three shooting stars at different positions and stagger offsets */
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
    animation: shootingStar 12s ease-in-out infinite 3s; /* 3s stagger */
  }

  .shooting-star-3 {
    bottom: 30%;
    left: 30%;
    transform: rotate(-30deg);
    animation: shootingStar 10s ease-in-out infinite 6s; /* 6s stagger */
  }

  /* Quick flash-and-streak — visible for only ~6% of the cycle */
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
     FLOATING PARTICLES — Randomly-positioned dots with CSS custom property animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  /* Each particle reads its unique `--x-start`, `--y-start`, `--size`,
     `--opacity`, `--delay`, and `--duration` from inline styles set in the template */
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

  /* Gentle looping drift path — up, sideways, and slightly brighter at midpoint */
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
      opacity: calc(var(--opacity) * 1.5); /* Brighten at apex */
    }
    75% {
      transform: translateY(-20px) translateX(20px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONTENT — Centered policy text with fade-in entrance animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content {
    position: relative;
    z-index: 10;
    text-align: center;
    padding: 2rem;
    max-width: 500px;
    /* Start hidden and offset — `.visible` class triggers the transition */
    opacity: 0;
    transform: translateY(30px) scale(0.95);
    transition:
      opacity 1s ease-out,
      transform 1s ease-out;
  }

  .content.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Ambient purple/pink glow behind the text — pulsing radial gradient */
  .content-glow {
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
    animation: contentGlow 4s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes contentGlow {
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

  /* Page title — multi-stop gradient text with animated shimmer sweep */
  .title {
    position: relative;
    font-size: clamp(3rem, 10vw, 5rem); /* Fluid responsive sizing */
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 1.5rem;
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

  /* Policy body text — muted color, fluid font size */
  .policy-text {
    font-size: clamp(1rem, 3vw, 1.25rem);
    color: var(--color-text-muted);
    font-weight: 500;
    line-height: 1.6;
    margin: 0 0 2rem;
  }

  /* "Back to Stellar" navigation link with arrow icon hover animation */
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: all 0.3s ease;
  }

  .back-link:hover {
    color: var(--color-primary-light);
  }

  /* Arrow slides left on hover for a "go back" visual cue */
  .back-link:hover svg {
    transform: translateX(-4px);
  }

  .back-link svg {
    transition: transform 0.3s ease;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Scale down cosmic elements for smaller viewports
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Tablet breakpoint — shrink orbits and nebulae */
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

    /* Reduce orbit radii to match smaller ring sizes */
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

  /* Mobile breakpoint — adjust container for safe areas and bottom nav */
  @media (max-width: 640px) {
    .policy-container {
      top: calc(env(safe-area-inset-top, 47px) + 20px); /* Below notch/Dynamic Island */
      bottom: calc(60px + env(safe-area-inset-bottom, 0px)); /* Above bottom nav bar */
    }

    .content {
      padding: 1.5rem;
    }
  }

  /* Small phone breakpoint — reduce shooting star and glow sizes */
  @media (max-width: 480px) {
    .shooting-star {
      width: 60px;
    }
    .content-glow {
      width: 200px;
      height: 100px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION — Disable all animations for accessibility
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .orbit,
    .orbit-particle,
    .shooting-star,
    .particle,
    .content-glow,
    .title {
      animation: none;
    }

    /* Keep the fade-in but remove the transform for content entrance */
    .content {
      transition: opacity 0.3s ease-out;
      transform: none;
    }

    .content.visible {
      transform: none;
    }
  }
</style>
