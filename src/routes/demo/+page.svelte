<script lang="ts">
  /**
   * @fileoverview **Demo landing page** — cinematic entry point for Stellar's demo mode.
   *
   * This is a public (no-auth) page at `/demo` that lets prospective users
   * explore Stellar without creating an account. The page explains what demo
   * mode offers, what's limited, and provides a one-click launch/exit toggle.
   *
   * ## How it works
   *
   * - **Launch Demo**: calls `setDemoMode(true)` (persists a flag in
   *   `localStorage`), then hard-navigates to `/` where `initEngine` detects
   *   demo mode, opens a sandboxed Dexie database (`GoalPlannerDB_demo`),
   *   seeds it with mock data, and resolves `authMode: 'demo'`.
   *
   * - **Exit Demo**: calls `setDemoMode(false)` to clear the flag, then
   *   `cleanupDemoDatabase()` to delete the sandboxed IndexedDB, and
   *   hard-navigates back to `/demo` to show the inactive state.
   *
   * ## Visual design
   *
   * Uses Stellar's cosmic design system:
   * - Multi-layer CSS starfield parallax background
   * - Glassmorphism cards with `backdrop-filter: blur`
   * - Purple→pink gradient text and glow effects
   * - Orbital ring animation around the hero section
   * - Staggered `fadeInUp` entrance animations (via `--delay` CSS var)
   * - Full `prefers-reduced-motion: reduce` support
   *
   * @see {@link $lib/demo/config.ts} — demo config wired into initEngine
   * @see {@link $lib/demo/mockData.ts} — mock data seeder
   */

  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { isDemoMode, setDemoMode, cleanupDemoDatabase } from '@prabhask5/stellar-engine';

  // =============================================================================
  //                            COMPONENT STATE
  // =============================================================================

  /** Whether demo mode is currently active (read from localStorage on mount). */
  let demoActive = $state(isDemoMode());

  // =============================================================================
  //                              HANDLERS
  // =============================================================================

  /**
   * Activate demo mode and navigate to the home page.
   *
   * Sets the `stellar-demo-mode` localStorage flag, then performs a full page
   * navigation (not SvelteKit client nav) so `initEngine` re-runs with demo
   * mode enabled — opening the sandboxed DB and seeding mock data.
   */
  function launchDemo() {
    setDemoMode(true);
    window.location.href = '/';
  }

  /**
   * Deactivate demo mode, clean up the sandboxed database, and reload.
   *
   * 1. Clears the localStorage flag → engine will no longer detect demo mode.
   * 2. Deletes the `GoalPlannerDB_demo` IndexedDB database entirely.
   * 3. Hard-navigates back to `/demo` to show the "Launch Demo" state.
   */
  function exitDemo() {
    setDemoMode(false);
    cleanupDemoDatabase('GoalPlannerDB_demo');
    window.location.href = '/demo';
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     HEAD — page title for browser tab / SEO
     ═══════════════════════════════════════════════════════════════════════════ -->

<svelte:head>
  <title>Try Stellar — Interactive Demo</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     PAGE LAYOUT
     Three-layer starfield background sits behind all content sections.
     Each section uses `z-index: 1` to float above the starfield.
     ═══════════════════════════════════════════════════════════════════════════ -->

<div class="demo-page">
  <!-- Parallax starfield — 3 layers with different speeds and sizes -->
  <div class="starfield"></div>
  <div class="starfield starfield-2"></div>
  <div class="starfield starfield-3"></div>

  <!-- ═══════ Hero Section ═══════ -->
  <section class="hero">
    <div class="orbital-ring"></div>
    <h1 class="hero-title">
      Experience <span class="gradient-text">Stellar</span>
    </h1>
    <p class="hero-subtitle">No account needed. Fully interactive. Zero commitment.</p>
  </section>

  <!-- ═══════ Feature Cards ═══════
       Three glassmorphism cards highlighting key demo mode properties.
       Staggered entrance animation via `- -delay` CSS custom property. -->
  <section class="features">
    <div class="card anim-up" style="--delay: 0.1s">
      <div class="card-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          />
        </svg>
      </div>
      <h3>Full Access</h3>
      <p>Explore goals, tasks, focus timer, block lists — everything works.</p>
    </div>

    <div class="card anim-up" style="--delay: 0.25s">
      <div class="card-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <h3>Sandboxed Safety</h3>
      <p>Isolated demo database. Your real data is never touched.</p>
    </div>

    <div class="card anim-up" style="--delay: 0.4s">
      <div class="card-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </div>
      <h3>Instant Reset</h3>
      <p>Refresh the page to start fresh with sample data.</p>
    </div>
  </section>

  <!-- ═══════ Capabilities — Can / Cannot ═══════
       Two-column glassmorphism panel listing what users can and cannot
       do in demo mode. Helps set expectations before launching. -->
  <section class="capabilities anim-up" style="--delay: 0.5s">
    <div class="cap-col cap-can">
      <h3 class="gradient-text">What you can do</h3>
      <ul>
        <li>Browse all pages</li>
        <li>Create, edit & delete items</li>
        <li>Use focus timer</li>
        <li>Manage block lists</li>
        <li>Change settings</li>
      </ul>
    </div>
    <div class="cap-divider"></div>
    <div class="cap-col cap-limited">
      <h3>What's limited</h3>
      <ul>
        <li>Cloud sync</li>
        <li>Email / password changes</li>
        <li>Device management</li>
        <li>Debug tools</li>
      </ul>
    </div>
  </section>

  <!-- ═══════ Launch / Exit Controls ═══════
       Conditionally renders either:
       - "Launch Demo" button (inactive state) — activates demo mode
       - "Exit Demo" button + "Back to Stellar" link (active state) -->
  <section class="launch anim-up" style="--delay: 0.6s">
    {#if demoActive}
      <button class="btn-exit" onclick={exitDemo}>Exit Demo</button>
      <a href="/" class="back-link">← Back to Stellar</a>
    {:else}
      <button class="btn-launch" onclick={launchDemo}>Launch Demo</button>
    {/if}
  </section>
</div>

<style>
  /* ==========================================================================
     DEMO PAGE STYLES
     Cosmic-themed landing page using Stellar's design system. Key techniques:
     - Multi-layer CSS starfield with `radial-gradient` dots + `drift` animation
     - Glassmorphism cards: semi-transparent bg + `backdrop-filter: blur`
     - CSS custom properties from the app theme (`--color-*`, `--radius-*`)
     - Staggered entrance animations via `--delay` CSS variable
     - Full `prefers-reduced-motion` support at the bottom
     ========================================================================== */

  /* ── Page container ── */
  .demo-page {
    position: relative;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 1.25rem 4rem;
    gap: 3.5rem;
    overflow: hidden;
    background: radial-gradient(
      ellipse at 50% 20%,
      rgba(108, 92, 231, 0.12) 0%,
      var(--color-void, #050510) 70%
    );
    color: var(--color-text, #e8e6f0);
    font-family: inherit;
  }

  /* ── Starfield layers ──
     Three fixed-position layers of tiny radial-gradient dots that slowly
     drift upward at different speeds, creating a parallax star effect.
     Layer 1: 300px tile, normal speed | Layer 2: 400px, slower, reversed
     Layer 3: 220px tile, fastest, most transparent ── */
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

  /* ── Hero ── */
  .hero {
    position: relative;
    z-index: 1;
    text-align: center;
    padding-top: 2rem;
  }

  .hero-title {
    font-size: clamp(2.6rem, 7vw, 5rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
    margin: 0 0 1rem;
    animation: fadeInUp 0.8s var(--ease-out, ease-out) both;
  }

  .hero-subtitle {
    font-size: clamp(1rem, 2.5vw, 1.35rem);
    color: var(--color-text-muted, #a09bb5);
    max-width: 480px;
    margin: 0 auto;
    animation: fadeInUp 0.8s 0.15s var(--ease-out, ease-out) both;
  }

  .gradient-text {
    background: linear-gradient(135deg, #6c5ce7, #ff79c6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Orbital ring ──
     Decorative spinning ring behind the hero text with a small glowing
     dot (::after pseudo-element) that orbits around the title. ── */
  .orbital-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 420px;
    height: 420px;
    translate: -50% -50%;
    border-radius: 50%;
    border: 1px solid rgba(108, 92, 231, 0.15);
    pointer-events: none;
    animation: spin 25s linear infinite;
  }

  .orbital-ring::after {
    content: '';
    position: absolute;
    top: -4px;
    left: 50%;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent, #ff79c6);
    box-shadow: 0 0 12px var(--color-accent, #ff79c6);
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }

  /* ── Feature Cards ──
     Glassmorphism grid cards with icon, title, and description.
     Auto-fit grid collapses to single column on mobile. ── */
  .features {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.5rem;
    max-width: 860px;
    width: 100%;
  }

  .card {
    background: rgba(15, 15, 26, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg, 16px);
    padding: 2rem 1.5rem;
    text-align: center;
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }

  .card:hover {
    border-color: rgba(108, 92, 231, 0.45);
    box-shadow: 0 4px 30px rgba(108, 92, 231, 0.1);
  }

  .card-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 1rem;
    color: var(--color-accent, #ff79c6);
  }

  .card-icon svg {
    width: 100%;
    height: 100%;
  }

  .card h3 {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .card p {
    font-size: 0.92rem;
    color: var(--color-text-muted, #a09bb5);
    margin: 0;
    line-height: 1.5;
  }

  /* ── Capabilities (Can / Cannot) ──
     Side-by-side panel with a vertical divider (horizontal on mobile).
     "Can" items use green checkmarks; "Limited" items use muted dashes. ── */
  .capabilities {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 2rem;
    max-width: 680px;
    width: 100%;
    background: rgba(15, 15, 26, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg, 16px);
    padding: 2rem 2.5rem;
  }

  .cap-col {
    flex: 1;
  }

  .cap-col h3 {
    font-size: 1.05rem;
    font-weight: 700;
    margin: 0 0 0.75rem;
  }

  .cap-limited h3 {
    color: var(--color-text-muted, #a09bb5);
  }

  .cap-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .cap-col li {
    font-size: 0.9rem;
    line-height: 1.5;
    padding-left: 1.25rem;
    position: relative;
  }

  .cap-can li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: var(--color-success, #26de81);
    font-weight: 700;
  }

  .cap-limited li::before {
    content: '—';
    position: absolute;
    left: 0;
    color: var(--color-text-muted, #a09bb5);
  }

  .cap-divider {
    width: 1px;
    background: rgba(108, 92, 231, 0.2);
  }

  /* ── Launch / Exit buttons ──
     Primary "Launch Demo" uses the app's gradient with cosmic glow.
     "Exit Demo" uses a destructive red outline style. ── */
  .launch {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .btn-launch {
    position: relative;
    padding: 1rem 3rem;
    font-size: 1.15rem;
    font-weight: 700;
    border: none;
    border-radius: var(--radius-xl, 24px);
    color: #fff;
    background: var(--gradient-primary, linear-gradient(135deg, #6c5ce7, #ff79c6));
    cursor: pointer;
    transition:
      transform 0.2s var(--ease-out, ease-out),
      box-shadow 0.3s;
    box-shadow:
      0 0 30px rgba(108, 92, 231, 0.3),
      0 0 60px rgba(108, 92, 231, 0.15);
  }

  .btn-launch:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow:
      0 0 40px rgba(108, 92, 231, 0.5),
      0 0 80px rgba(255, 121, 198, 0.2);
  }

  .btn-launch:active {
    transform: translateY(0) scale(0.98);
  }

  .btn-exit {
    padding: 0.85rem 2.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    border: 2px solid rgba(255, 100, 100, 0.5);
    border-radius: var(--radius-xl, 24px);
    color: #ff6464;
    background: rgba(255, 100, 100, 0.08);
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
  }

  .btn-exit:hover {
    background: rgba(255, 100, 100, 0.15);
    border-color: rgba(255, 100, 100, 0.7);
  }

  .back-link {
    font-size: 0.9rem;
    color: var(--color-text-muted, #a09bb5);
    text-decoration: none;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: var(--color-text, #e8e6f0);
  }

  /* ── Entrance animation ──
     Shared `fadeInUp` keyframe used by `.anim-up` elements. Each element
     sets a `--delay` CSS var for staggered appearance. ── */
  .anim-up {
    animation: fadeInUp 0.7s var(--delay, 0s) var(--ease-out, ease-out) both;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(28px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Reduced motion ──
     Disables all animations (starfield drift, orbital spin, entrance
     fade-ins) when the user prefers reduced motion. Elements are shown
     at their final state (opacity: 1, no transform). ── */
  @media (prefers-reduced-motion: reduce) {
    .starfield,
    .starfield-2,
    .starfield-3 {
      animation: none;
    }

    .orbital-ring {
      animation: none;
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
  }

  /* ── Mobile (≤640px) ──
     Cards stack vertically, capabilities panel switches to column layout,
     orbital ring shrinks to fit smaller viewports. ── */
  @media (max-width: 640px) {
    .demo-page {
      padding: 2rem 1rem 3rem;
      gap: 2.5rem;
    }

    .features {
      grid-template-columns: 1fr;
    }

    .capabilities {
      flex-direction: column;
      padding: 1.5rem;
    }

    .cap-divider {
      width: 100%;
      height: 1px;
    }

    .orbital-ring {
      width: 300px;
      height: 300px;
    }
  }
</style>
