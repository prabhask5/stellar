<script lang="ts">
  import { isDemoMode, setDemoMode, cleanupDemoDatabase } from '@prabhask5/stellar-engine';

  let demoActive = $state(isDemoMode());
  let toggling = $state(false);

  function handleToggle() {
    if (toggling) return;
    toggling = true;
    demoActive = !demoActive;

    setTimeout(() => {
      if (demoActive) {
        setDemoMode(true);
      } else {
        setDemoMode(false);
        cleanupDemoDatabase('GoalPlannerDB_demo');
      }
      window.location.href = '/';
    }, 500);
  }
</script>

<svelte:head>
  <title>Demo Mode — Stellar</title>
</svelte:head>

<div class="demo-page" class:toggling>
  <!-- Starfield parallax layers -->
  <div class="starfield"></div>
  <div class="starfield starfield-2"></div>
  <div class="starfield starfield-3"></div>

  <!-- Floating particles -->
  <div class="particles">
    <span
      class="particle"
      style="--x: 12%; --y: 18%; --size: 3px; --dur: 7s; --delay: 0s; --color: rgba(108, 92, 231, 0.6)"
    ></span>
    <span
      class="particle"
      style="--x: 85%; --y: 25%; --size: 2px; --dur: 9s; --delay: 1.2s; --color: rgba(255, 121, 198, 0.5)"
    ></span>
    <span
      class="particle"
      style="--x: 30%; --y: 70%; --size: 4px; --dur: 11s; --delay: 0.5s; --color: rgba(108, 92, 231, 0.4)"
    ></span>
    <span
      class="particle"
      style="--x: 72%; --y: 60%; --size: 2px; --dur: 8s; --delay: 3s; --color: rgba(255, 121, 198, 0.4)"
    ></span>
    <span
      class="particle"
      style="--x: 50%; --y: 85%; --size: 3px; --dur: 10s; --delay: 2s; --color: rgba(108, 92, 231, 0.5)"
    ></span>
    <span
      class="particle"
      style="--x: 20%; --y: 45%; --size: 2px; --dur: 12s; --delay: 4s; --color: rgba(255, 121, 198, 0.35)"
    ></span>
    <span
      class="particle"
      style="--x: 90%; --y: 80%; --size: 3px; --dur: 7.5s; --delay: 1.8s; --color: rgba(108, 92, 231, 0.45)"
    ></span>
    <span
      class="particle"
      style="--x: 8%; --y: 65%; --size: 2px; --dur: 9.5s; --delay: 3.5s; --color: rgba(255, 121, 198, 0.3)"
    ></span>
    <span
      class="particle"
      style="--x: 60%; --y: 15%; --size: 3px; --dur: 8.5s; --delay: 0.8s; --color: rgba(108, 92, 231, 0.5)"
    ></span>
    <span
      class="particle"
      style="--x: 40%; --y: 40%; --size: 2px; --dur: 11.5s; --delay: 2.5s; --color: rgba(255, 121, 198, 0.4)"
    ></span>
  </div>

  <!-- Hero -->
  <section class="hero">
    <h1 class="hero-title anim-up">
      <span class="gradient-text">Demo Mode</span>
    </h1>
    <p class="hero-subtitle anim-up" style="--delay: 0.1s">
      Explore Stellar with sample data. No account required.
    </p>
  </section>

  <!-- Info card -->
  <section class="info-card anim-up" style="--delay: 0.2s">
    <div class="info-col info-available">
      <h3>Available</h3>
      <ul>
        <li>Browse all pages</li>
        <li>Create & edit items</li>
        <li>Focus timer</li>
        <li>Block lists</li>
        <li>Settings</li>
      </ul>
    </div>
    <div class="info-divider"></div>
    <div class="info-col info-limited">
      <h3>Limited</h3>
      <ul>
        <li>Cloud sync</li>
        <li>Account changes</li>
        <li>Device management</li>
        <li>Debug tools</li>
      </ul>
    </div>
  </section>

  <!-- Toggle centerpiece -->
  <section class="toggle-section anim-up" style="--delay: 0.35s">
    <button
      class="toggle"
      class:active={demoActive}
      onclick={handleToggle}
      disabled={toggling}
      aria-label={demoActive ? 'Disable demo mode' : 'Enable demo mode'}
    >
      <span class="toggle-track">
        <span class="toggle-glow"></span>
        <span class="toggle-knob"></span>
      </span>
    </button>
    <div class="toggle-label">
      <span class="toggle-label-text">Demo Mode</span>
      <span class="toggle-label-state" class:active={demoActive}>
        {demoActive ? 'ON' : 'OFF'}
      </span>
    </div>
  </section>

  <!-- Footer note -->
  <p class="footer-note anim-up" style="--delay: 0.45s">Data resets on refresh</p>
</div>

<style>
  /* ── CSS Custom properties ── */
  .demo-page {
    --color-void: #050510;
    --color-text: #e8e6f0;
    --color-text-muted: #a09bb5;
    --color-accent: #ff79c6;
    --color-primary-light: #6c5ce7;
    --radius-lg: 16px;
    --radius-xl: 24px;
    --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  /* ── Page container ── */
  .demo-page {
    position: relative;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.25rem 2.5rem;
    gap: 3rem;
    overflow: hidden;
    background: radial-gradient(
      ellipse at 50% 30%,
      rgba(108, 92, 231, 0.1) 0%,
      var(--color-void) 70%
    );
    color: var(--color-text);
    font-family: inherit;
    transition:
      opacity 0.4s,
      filter 0.4s;
  }

  .demo-page.toggling {
    opacity: 0.6;
    filter: blur(2px);
  }

  /* ── Starfield layers ── */
  .starfield {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 40% 70%, rgba(255, 255, 255, 0.35) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 60% 20%, rgba(255, 255, 255, 0.4) 50%, transparent 50%),
      radial-gradient(1px 1px at 80% 50%, rgba(255, 255, 255, 0.3) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 10% 80%, rgba(255, 255, 255, 0.45) 50%, transparent 50%),
      radial-gradient(1px 1px at 70% 90%, rgba(255, 255, 255, 0.3) 50%, transparent 50%);
    background-size: 300px 300px;
    animation: drift 90s linear infinite;
  }

  .starfield-2 {
    background-size: 400px 400px;
    opacity: 0.6;
    animation: drift 120s linear infinite reverse;
  }

  .starfield-3 {
    background-size: 220px 220px;
    opacity: 0.4;
    animation: drift 70s linear infinite;
  }

  @keyframes drift {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-300px);
    }
  }

  /* ── Floating particles ── */
  .particles {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .particle {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--color);
    animation: float var(--dur) var(--delay) ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translate(0, 0);
      opacity: 0.4;
    }
    25% {
      transform: translate(12px, -18px);
      opacity: 0.8;
    }
    50% {
      transform: translate(-8px, -30px);
      opacity: 0.5;
    }
    75% {
      transform: translate(15px, -12px);
      opacity: 0.7;
    }
  }

  /* ── Hero ── */
  .hero {
    position: relative;
    z-index: 1;
    text-align: center;
  }

  .hero-title {
    font-size: clamp(2.8rem, 8vw, 5.5rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin: 0 0 0.75rem;
  }

  .hero-subtitle {
    font-size: clamp(0.95rem, 2.2vw, 1.2rem);
    color: var(--color-text-muted);
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.5;
  }

  .gradient-text {
    background: linear-gradient(135deg, #6c5ce7, #ff79c6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Info card ── */
  .info-card {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 2rem;
    max-width: 560px;
    width: 100%;
    background: rgba(15, 15, 26, 0.55);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    padding: 2rem 2.5rem;
    transition: border-color 0.3s;
  }

  .info-card:hover {
    border-color: rgba(108, 92, 231, 0.3);
  }

  .info-col {
    flex: 1;
  }

  .info-col h3 {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.75rem;
  }

  .info-available h3 {
    color: var(--color-text);
  }

  .info-limited h3 {
    color: var(--color-text-muted);
  }

  .info-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .info-col li {
    font-size: 0.88rem;
    line-height: 1.5;
    padding-left: 1.4rem;
    position: relative;
    color: var(--color-text-muted);
  }

  .info-available li::before {
    content: '\2713';
    position: absolute;
    left: 0;
    color: #26de81;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .info-limited li::before {
    content: '\2014';
    position: absolute;
    left: 0;
    color: rgba(160, 155, 181, 0.5);
  }

  .info-divider {
    width: 1px;
    background: rgba(108, 92, 231, 0.15);
    align-self: stretch;
  }

  /* ── Toggle section ── */
  .toggle-section {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }

  /* ── Toggle button ── */
  .toggle {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .toggle:focus-visible .toggle-track {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
  }

  .toggle:disabled {
    cursor: default;
  }

  .toggle-track {
    position: relative;
    display: block;
    width: 200px;
    height: 64px;
    border-radius: 32px;
    background: rgba(20, 18, 35, 0.8);
    border: 1.5px solid rgba(108, 92, 231, 0.2);
    transition:
      background 0.4s ease,
      border-color 0.4s ease,
      box-shadow 0.4s ease;
    overflow: visible;
  }

  .toggle:hover:not(:disabled) .toggle-track {
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.1);
  }

  .toggle.active .toggle-track {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.4), rgba(255, 121, 198, 0.3));
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow:
      0 0 30px rgba(108, 92, 231, 0.25),
      0 0 60px rgba(255, 121, 198, 0.1);
  }

  .toggle.active:hover:not(:disabled) .toggle-track {
    box-shadow:
      0 0 40px rgba(108, 92, 231, 0.35),
      0 0 80px rgba(255, 121, 198, 0.15);
  }

  /* ── Toggle glow (pulsing background behind knob when active) ── */
  .toggle-glow {
    position: absolute;
    top: 50%;
    left: 6px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    transform: translateY(-50%);
    background: transparent;
    transition: transform 0.4s cubic-bezier(0.68, -0.15, 0.27, 1.15);
    pointer-events: none;
  }

  .toggle.active .toggle-glow {
    transform: translateY(-50%) translateX(136px);
    background: radial-gradient(circle, rgba(108, 92, 231, 0.4) 0%, transparent 70%);
    animation: glowPulse 2s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%,
    100% {
      transform: translateY(-50%) translateX(136px) scale(1);
      opacity: 0.6;
    }
    50% {
      transform: translateY(-50%) translateX(136px) scale(1.6);
      opacity: 0.3;
    }
  }

  /* ── Toggle knob ── */
  .toggle-knob {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(60, 56, 85, 0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition:
      transform 0.4s cubic-bezier(0.68, -0.15, 0.27, 1.15),
      background 0.4s ease,
      box-shadow 0.4s ease;
  }

  .toggle:hover:not(:disabled) .toggle-knob {
    background: rgba(75, 70, 105, 0.9);
  }

  .toggle:active:not(:disabled) .toggle-knob {
    transform: scale(0.95);
  }

  .toggle.active .toggle-knob {
    transform: translateX(136px);
    background: linear-gradient(135deg, #6c5ce7, #ff79c6);
    box-shadow:
      0 0 20px rgba(108, 92, 231, 0.6),
      0 0 40px rgba(255, 121, 198, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .toggle.active:active:not(:disabled) .toggle-knob {
    transform: translateX(136px) scale(0.95);
  }

  /* ── Toggle label ── */
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-muted);
    user-select: none;
  }

  .toggle-label-state {
    display: inline-block;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(160, 155, 181, 0.6);
    transition: color 0.4s ease;
    min-width: 2rem;
  }

  .toggle-label-state.active {
    color: var(--color-accent);
  }

  /* ── Footer note ── */
  .footer-note {
    position: relative;
    z-index: 1;
    font-size: 0.8rem;
    color: rgba(160, 155, 181, 0.4);
    margin: 0;
    letter-spacing: 0.02em;
  }

  /* ── Entrance animation ── */
  .anim-up {
    animation: fadeInUp 0.7s var(--delay, 0s) var(--ease-out) both;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .starfield,
    .starfield-2,
    .starfield-3 {
      animation: none;
    }

    .particle {
      animation: none;
      opacity: 0.4;
    }

    .anim-up {
      animation: none;
      opacity: 1;
    }

    .hero-title,
    .hero-subtitle {
      animation: none;
      opacity: 1;
    }

    .toggle-knob {
      transition:
        transform 0.15s ease,
        background 0.15s ease,
        box-shadow 0.15s ease;
    }

    .toggle-glow {
      transition: transform 0.15s ease;
      animation: none;
    }

    .toggle.active .toggle-glow {
      animation: none;
      opacity: 0.4;
    }

    .toggle-track {
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .demo-page {
      transition:
        opacity 0.15s,
        filter 0.15s;
    }
  }

  /* ── Mobile (max 640px) ── */
  @media (max-width: 640px) {
    .demo-page {
      padding: 2.5rem 1rem 2rem;
      gap: 2.5rem;
    }

    .info-card {
      flex-direction: column;
      padding: 1.5rem;
      gap: 1.25rem;
    }

    .info-divider {
      width: 100%;
      height: 1px;
    }

    .toggle-track {
      width: 160px;
      height: 52px;
      border-radius: 26px;
    }

    .toggle-knob {
      width: 42px;
      height: 42px;
      top: 5px;
      left: 5px;
    }

    .toggle.active .toggle-knob {
      transform: translateX(108px);
    }

    .toggle.active:active:not(:disabled) .toggle-knob {
      transform: translateX(108px) scale(0.95);
    }

    .toggle-glow {
      width: 42px;
      height: 42px;
      left: 5px;
    }

    .toggle.active .toggle-glow {
      transform: translateY(-50%) translateX(108px);
    }

    @keyframes glowPulse {
      0%,
      100% {
        transform: translateY(-50%) translateX(108px) scale(1);
        opacity: 0.6;
      }
      50% {
        transform: translateY(-50%) translateX(108px) scale(1.6);
        opacity: 0.3;
      }
    }
  }

  /* ── Small mobile (max 380px) ── */
  @media (max-width: 380px) {
    .hero-title {
      font-size: 2.4rem;
    }

    .info-card {
      padding: 1.25rem;
    }
  }
</style>
