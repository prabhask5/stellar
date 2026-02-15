<script lang="ts">
  import { isDemoMode, setDemoMode, cleanupDemoDatabase } from '@prabhask5/stellar-engine';

  let demoActive = $state(isDemoMode());
  let toggling = $state(false);
  let exploding = $state(false);
  let imploding = $state(false);
  let fading = $state(false);

  function handleToggle() {
    if (toggling) return;
    toggling = true;
    const turningOn = !demoActive;
    demoActive = turningOn;

    if (turningOn) {
      exploding = true;
      setTimeout(() => {
        fading = true;
      }, 2700);
      setTimeout(() => {
        setDemoMode(true);
        window.location.href = '/';
      }, 3400);
    } else {
      imploding = true;
      setTimeout(() => {
        fading = true;
      }, 1500);
      setTimeout(() => {
        setDemoMode(false);
        cleanupDemoDatabase('GoalPlannerDB_demo');
        window.location.href = '/';
      }, 2200);
    }
  }
</script>

<svelte:head>
  <title>Demo Mode — Stellar</title>
</svelte:head>

<div class="page" class:active={demoActive} class:exploding class:imploding class:fading>
  <!-- ═══ Stars (3 parallax layers) ═══ -->
  <div class="stars s1"></div>
  <div class="stars s2"></div>
  <div class="stars s3"></div>

  <!-- ═══ Aurora color wash ═══ -->
  <div class="aurora"></div>

  <!-- ═══ Nebulae (3 breathing) ═══ -->
  <div class="nebula n1"></div>
  <div class="nebula n2"></div>
  <div class="nebula n3"></div>

  <!-- ═══ Orbital rings (4 with dot children) ═══ -->
  <div class="orbit o1"><i></i></div>
  <div class="orbit o2"><i></i></div>
  <div class="orbit o3"><i></i></div>
  <div class="orbit o4"><i></i></div>

  <!-- ═══ Cosmic dust (20 particles) ═══ -->
  {#each Array(20) as _, i (i)}
    <b
      class="dust"
      style="
        --x:{[6, 94, 18, 82, 42, 58, 12, 88, 32, 68, 75, 25, 50, 85, 15, 62, 38, 72, 28, 55][i]}%;
        --y:{[10, 22, 52, 78, 90, 35, 65, 42, 18, 85, 12, 58, 40, 28, 72, 8, 82, 48, 62, 30][i]}%;
        --s:{[2, 3, 2, 4, 3, 2, 3, 2, 4, 2, 3, 2, 3, 4, 2, 3, 2, 4, 3, 2][i]}px;
        --d:{[20, 28, 18, 32, 24, 16, 26, 22, 30, 19, 25, 21, 27, 33, 17, 29, 23, 31, 20, 26][i]}s;
        --r:{[35, 50, 28, 60, 40, 32, 55, 38, 48, 30, 45, 34, 52, 42, 36, 58, 44, 56, 33, 47][i]}px;
        --w:{(i * 1.1).toFixed(1)}s;
        --h:{[
        258, 328, 268, 318, 278, 338, 262, 322, 272, 332, 255, 312, 288, 302, 248, 316, 282, 308,
        252, 325
      ][i]};
      "
    ></b>
  {/each}

  <!-- ═══ Flash overlay (supernova) ═══ -->
  <div class="flash"></div>

  <!-- ═══ Dim overlay (anticipation) ═══ -->
  <div class="dim"></div>

  <!-- ══════ Title ══════ -->
  <h1 class="title"><span class="grad">Demo Mode</span></h1>
  <p class="sub">Explore Stellar with sample data — no account required</p>

  <!-- ══════════════════════════════════════════════════════════════════════
       THE TOGGLE — born from a singularity
       ══════════════════════════════════════════════════════════════════════ -->
  <div class="tz">
    <!-- Birth rings (3, expand during toggle birth) -->
    <div class="birth-ring br1"></div>
    <div class="birth-ring br2"></div>
    <div class="birth-ring br3"></div>

    <!-- Shockwave rings (4, expand on explosion) -->
    <div class="shock sh1"></div>
    <div class="shock sh2"></div>
    <div class="shock sh3"></div>
    <div class="shock sh4"></div>

    <!-- Layered auras -->
    <div class="aura a1" class:on={demoActive}></div>
    <div class="aura a2" class:on={demoActive}></div>
    <div class="aura a3" class:on={demoActive}></div>

    <!-- Corona rays — 12 radiating beams -->
    {#each Array(12) as _, j (j)}
      <span
        class="ray"
        class:on={demoActive}
        style="--a:{j * 30}deg; --l:{[90, 65, 100, 60, 95, 70, 85, 62, 98, 68, 88, 72][j]}px; --w:{[
          2.2, 1.5, 2.8, 1.4, 2.4, 1.6, 2, 1.5, 2.6, 1.7, 2.2, 1.5
        ][j]}px"
      ></span>
    {/each}

    <button
      class="tog"
      class:on={demoActive}
      onclick={handleToggle}
      disabled={toggling}
      aria-label={demoActive ? 'Disable demo mode' : 'Enable demo mode'}
    >
      <span class="track">
        <span class="shimmer"></span>
        <span class="energy"></span>
        <span class="glow-trail"></span>
        <span class="knob">
          <span class="k-halo"></span>
          <span class="k-core"></span>
          <span class="k-flare"></span>
          <span class="k-ring"></span>
          <span class="k-ring kr2"></span>
        </span>
      </span>
    </button>
    <span class="state-label" class:on={demoActive}>{demoActive ? 'ACTIVE' : 'INACTIVE'}</span>
  </div>

  <!-- ═══ Info card ═══ -->
  <section class="info">
    <div class="col ok">
      <h3>Available</h3>
      <ul>
        <li>Browse all pages</li>
        <li>Create & edit items</li>
        <li>Focus timer</li>
        <li>Site blocking</li>
      </ul>
    </div>
    <div class="divider"></div>
    <div class="col cap">
      <h3>Limited</h3>
      <ul>
        <li>Cloud sync</li>
        <li>Account settings</li>
        <li>Device management</li>
        <li>Debug tools</li>
      </ul>
    </div>
  </section>

  <p class="foot">Data resets each session</p>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     1. PAGE BASE + FADING STATE
     ═══════════════════════════════════════════════════════════════════════════ */

  .page {
    /* Full-viewport overlay — ignores layout padding/nav entirely */
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.25rem 2rem;
    padding-top: max(3rem, env(safe-area-inset-top, 0px));
    padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));
    padding-left: max(1.25rem, env(safe-area-inset-left, 0px));
    padding-right: max(1.25rem, env(safe-area-inset-right, 0px));
    gap: 2.5rem;
    overflow: hidden;
    overflow-y: auto;
    background: #050510;
    color: #e8e6f0;
    font-family: inherit;
    transition:
      opacity 0.7s ease,
      filter 0.7s ease,
      transform 0.7s ease;
  }

  .page.fading {
    opacity: 0;
    filter: blur(20px);
    transform: scale(1.08);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     2. STARFIELDS (3 layers, drift animation, staggered fade-in)
     ═══════════════════════════════════════════════════════════════════════════ */

  .stars {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    animation-fill-mode: forwards;
  }

  .s1 {
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(255, 255, 255, 0.6) 50%, transparent 50%),
      radial-gradient(1px 1px at 40% 70%, rgba(255, 255, 255, 0.4) 50%, transparent 50%),
      radial-gradient(1.3px 1.3px at 60% 15%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 80% 50%, rgba(255, 255, 255, 0.35) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 10% 80%, rgba(255, 255, 255, 0.55) 50%, transparent 50%),
      radial-gradient(0.8px 0.8px at 55% 45%, rgba(255, 255, 255, 0.3) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 75% 88%, rgba(255, 255, 255, 0.45) 50%, transparent 50%);
    background-size: 300px 300px;
    animation:
      fadeIn 0.8s 0.2s ease forwards,
      drift1 90s linear infinite;
  }

  .s2 {
    background-image:
      radial-gradient(1px 1px at 15% 55%, rgba(255, 255, 255, 0.35) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 48% 22%, rgba(255, 255, 255, 0.45) 50%, transparent 50%),
      radial-gradient(0.9px 0.9px at 72% 68%, rgba(255, 255, 255, 0.3) 50%, transparent 50%),
      radial-gradient(1.4px 1.4px at 88% 12%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 35% 92%, rgba(255, 255, 255, 0.35) 50%, transparent 50%);
    background-size: 420px 420px;
    animation:
      fadeIn 0.8s 0.5s ease forwards,
      drift2 140s linear infinite;
  }

  .s3 {
    background-image:
      radial-gradient(0.8px 0.8px at 25% 42%, rgba(255, 255, 255, 0.25) 50%, transparent 50%),
      radial-gradient(1px 1px at 62% 78%, rgba(255, 255, 255, 0.3) 50%, transparent 50%),
      radial-gradient(0.7px 0.7px at 85% 35%, rgba(255, 255, 255, 0.2) 50%, transparent 50%),
      radial-gradient(1.1px 1.1px at 42% 10%, rgba(255, 255, 255, 0.35) 50%, transparent 50%);
    background-size: 200px 200px;
    animation:
      fadeIn 0.8s 0.7s ease forwards,
      drift3 60s linear infinite;
  }

  @keyframes drift1 {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-300px);
    }
  }
  @keyframes drift2 {
    from {
      transform: translate(0, 0);
    }
    to {
      transform: translate(100px, -420px);
    }
  }
  @keyframes drift3 {
    from {
      transform: translate(0, 0);
    }
    to {
      transform: translate(-60px, -200px);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     3. AURORA (slow morphing color wash)
     ═══════════════════════════════════════════════════════════════════════════ */

  .aurora {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    background:
      radial-gradient(ellipse 80% 50% at 30% 60%, rgba(108, 92, 231, 0.04) 0%, transparent 70%),
      radial-gradient(ellipse 60% 80% at 70% 40%, rgba(255, 121, 198, 0.03) 0%, transparent 70%),
      radial-gradient(ellipse 90% 60% at 50% 50%, rgba(168, 123, 255, 0.03) 0%, transparent 60%);
    background-size: 200% 200%;
    animation:
      fadeIn 1.2s 0.8s ease forwards,
      auroraShift 25s ease-in-out infinite;
  }

  @keyframes auroraShift {
    0%,
    100% {
      background-position: 0% 50%;
    }
    25% {
      background-position: 100% 30%;
    }
    50% {
      background-position: 50% 80%;
    }
    75% {
      background-position: 80% 20%;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     4. NEBULAE (3 breathing at different phases)
     ═══════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -55%;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    animation-fill-mode: forwards;
  }

  .n1 {
    width: 700px;
    height: 700px;
    background: radial-gradient(
      ellipse,
      rgba(108, 92, 231, 0.08) 0%,
      rgba(108, 92, 231, 0.02) 45%,
      transparent 70%
    );
    animation:
      fadeIn 1s 0.5s ease forwards,
      nebPulse 9s ease-in-out infinite;
  }

  .n2 {
    width: 550px;
    height: 550px;
    translate: -45% -50%;
    background: radial-gradient(
      ellipse,
      rgba(255, 121, 198, 0.06) 0%,
      rgba(255, 121, 198, 0.015) 45%,
      transparent 70%
    );
    animation:
      fadeIn 1s 0.5s ease forwards,
      nebPulse 12s 3s ease-in-out infinite;
  }

  .n3 {
    width: 400px;
    height: 400px;
    translate: -55% -52%;
    background: radial-gradient(ellipse, rgba(168, 123, 255, 0.05) 0%, transparent 60%);
    animation:
      fadeIn 1s 0.5s ease forwards,
      nebPulse 7s 1.5s ease-in-out infinite;
  }

  @keyframes nebPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.6;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     5. ORBITAL RINGS (4 spinning with dot children)
     ═══════════════════════════════════════════════════════════════════════════ */

  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    translate: -50% -55%;
    opacity: 0;
    animation: fadeIn 0.8s 0.8s ease forwards;
  }

  .o1 {
    width: 280px;
    height: 280px;
    border: 1px solid rgba(108, 92, 231, 0.12);
    animation:
      fadeIn 0.8s 0.8s ease forwards,
      ospin 28s linear infinite;
  }
  .o2 {
    width: 420px;
    height: 420px;
    border: 1px solid rgba(255, 121, 198, 0.08);
    animation:
      fadeIn 0.8s 0.8s ease forwards,
      ospin 42s linear infinite reverse;
  }
  .o3 {
    width: 580px;
    height: 580px;
    border: 1px solid rgba(108, 92, 231, 0.06);
    animation:
      fadeIn 0.8s 0.8s ease forwards,
      ospin 55s linear infinite;
  }
  .o4 {
    width: 760px;
    height: 760px;
    border: 1px solid rgba(255, 121, 198, 0.04);
    animation:
      fadeIn 0.8s 0.8s ease forwards,
      ospin 70s linear infinite reverse;
  }

  .orbit i {
    position: absolute;
    top: -3px;
    left: 50%;
    margin-left: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(108, 92, 231, 0.55);
    box-shadow: 0 0 12px rgba(108, 92, 231, 0.45);
  }

  .o2 i {
    background: rgba(255, 121, 198, 0.45);
    box-shadow: 0 0 10px rgba(255, 121, 198, 0.4);
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
  }
  .o3 i {
    background: rgba(168, 123, 255, 0.35);
    box-shadow: 0 0 8px rgba(168, 123, 255, 0.3);
    width: 4px;
    height: 4px;
    margin-left: -2px;
  }
  .o4 i {
    background: rgba(255, 121, 198, 0.22);
    box-shadow: 0 0 6px rgba(255, 121, 198, 0.18);
    width: 3px;
    height: 3px;
    margin-left: -1.5px;
  }

  @keyframes ospin {
    from {
      rotate: 0deg;
    }
    to {
      rotate: 360deg;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     6. COSMIC DUST (20 particles, random float paths)
     ═══════════════════════════════════════════════════════════════════════════ */

  .dust {
    position: fixed;
    left: var(--x);
    top: var(--y);
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: hsla(var(--h), 70%, 65%, 0.35);
    pointer-events: none;
    z-index: 0;
    animation: dfloat var(--d) var(--w) ease-in-out infinite;
  }

  @keyframes dfloat {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.15;
    }
    25% {
      transform: translate(calc(var(--r) * 0.7), calc(var(--r) * -1)) scale(1.4);
      opacity: 0.55;
    }
    50% {
      transform: translate(calc(var(--r) * -0.5), calc(var(--r) * -0.6)) scale(0.7);
      opacity: 0.3;
    }
    75% {
      transform: translate(calc(var(--r) * 0.9), calc(var(--r) * 0.4)) scale(1.2);
      opacity: 0.45;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     7. FLASH OVERLAY (.page.exploding triggers flashBurst)
     ═══════════════════════════════════════════════════════════════════════════ */

  .flash {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(168, 123, 255, 0.6) 20%,
      rgba(108, 92, 231, 0.3) 40%,
      transparent 70%
    );
  }

  .page.exploding .flash {
    animation: flashBurst 1s ease-out forwards;
  }

  @keyframes flashBurst {
    0% {
      opacity: 0;
    }
    15% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     8. DIM OVERLAY (anticipation before toggle birth)
     ═══════════════════════════════════════════════════════════════════════════ */

  .dim {
    position: fixed;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    opacity: 0;
    background: rgba(2, 2, 8, 0.4);
    animation: anticipate 1.5s 2s ease forwards;
  }

  @keyframes anticipate {
    0% {
      opacity: 0;
    }
    35% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     9. TITLE ENTRANCE (descend + blur-clear)
     ═══════════════════════════════════════════════════════════════════════════ */

  .title {
    position: relative;
    z-index: 6;
    font-size: clamp(3rem, 10vw, 6.5rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
    margin: 0;
    text-align: center;
    opacity: 0;
    animation: titleIn 1.2s 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes titleIn {
    from {
      opacity: 0;
      transform: translateY(-50px);
      filter: blur(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .grad {
    background: linear-gradient(
      135deg,
      #6c5ce7 0%,
      #a87bff 25%,
      #ff79c6 55%,
      #ff9de2 75%,
      #6c5ce7 100%
    );
    background-size: 200% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gshift 6s ease-in-out infinite;
  }

  @keyframes gshift {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     10. SUBTITLE ENTRANCE
     ═══════════════════════════════════════════════════════════════════════════ */

  .sub {
    position: relative;
    z-index: 6;
    font-size: clamp(0.9rem, 2vw, 1.12rem);
    color: #a09bb5;
    max-width: 420px;
    margin: -0.5rem auto 0;
    text-align: center;
    line-height: 1.5;
    opacity: 0;
    animation: subIn 1s 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes subIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 0.85;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     11. TOGGLE ZONE BIRTH (scale 0.01 → 1 with blur+brightness, 2s at 2.8s delay)
     ═══════════════════════════════════════════════════════════════════════════ */

  .tz {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    opacity: 0;
    animation: toggleBirth 2s 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes toggleBirth {
    0% {
      opacity: 0;
      transform: scale(0.01);
      filter: blur(40px) brightness(4);
    }
    25% {
      opacity: 0.6;
      transform: scale(0.4);
      filter: blur(15px) brightness(2.5);
    }
    55% {
      opacity: 1;
      transform: scale(1.15);
      filter: blur(3px) brightness(1.5);
    }
    75% {
      transform: scale(0.96);
      filter: blur(0) brightness(1.1);
    }
    90% {
      transform: scale(1.04);
      filter: blur(0) brightness(1);
    }
    100% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0) brightness(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     12. BIRTH RINGS (3 expanding rings during birth)
     ═══════════════════════════════════════════════════════════════════════════ */

  .birth-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid rgba(108, 92, 231, 0.8);
    pointer-events: none;
    opacity: 0;
    z-index: 1;
  }

  .br1 {
    animation: birthRing 2s 3s ease-out forwards;
  }
  .br2 {
    animation: birthRing 2s 3.15s ease-out forwards;
    border-color: rgba(255, 121, 198, 0.7);
  }
  .br3 {
    animation: birthRing 2s 3.3s ease-out forwards;
    border-color: rgba(168, 123, 255, 0.6);
  }

  @keyframes birthRing {
    0% {
      width: 40px;
      height: 40px;
      opacity: 0.8;
      border-width: 2px;
    }
    100% {
      width: 700px;
      height: 700px;
      opacity: 0;
      border-width: 0.3px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     13. SHOCKWAVE RINGS (.page.exploding triggers expansion)
     ═══════════════════════════════════════════════════════════════════════════ */

  .shock {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 2.5px solid rgba(108, 92, 231, 0.8);
    pointer-events: none;
    opacity: 0;
    z-index: 2;
  }

  .page.exploding .sh1 {
    animation: shockExpand 2.2s 0ms ease-out forwards;
  }
  .page.exploding .sh2 {
    animation: shockExpand 2.2s 120ms ease-out forwards;
    border-color: rgba(255, 121, 198, 0.75);
  }
  .page.exploding .sh3 {
    animation: shockExpand 2.2s 250ms ease-out forwards;
    border-color: rgba(168, 123, 255, 0.7);
  }
  .page.exploding .sh4 {
    animation: shockExpand 2.2s 400ms ease-out forwards;
    border-color: rgba(255, 255, 255, 0.5);
  }

  @keyframes shockExpand {
    0% {
      width: 60px;
      height: 60px;
      opacity: 0.8;
      border-width: 2.5px;
    }
    100% {
      width: 1600px;
      height: 1600px;
      opacity: 0;
      border-width: 0.5px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     14. AURAS (OFF: small/faint, ON: large/glowing with pulse)
     ═══════════════════════════════════════════════════════════════════════════ */

  .aura {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    pointer-events: none;
    translate: -50% -55%;
    transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .a1 {
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.06) 0%, transparent 70%);
  }
  .a1.on {
    width: 500px;
    height: 500px;
    background: radial-gradient(
      circle,
      rgba(108, 92, 231, 0.2) 0%,
      rgba(108, 92, 231, 0.06) 35%,
      transparent 70%
    );
    animation: aPulse 3.5s ease-in-out infinite;
  }

  .a2 {
    width: 160px;
    height: 160px;
    background: radial-gradient(circle, rgba(255, 121, 198, 0.04) 0%, transparent 70%);
    transition-delay: 0.05s;
  }
  .a2.on {
    width: 380px;
    height: 380px;
    background: radial-gradient(
      circle,
      rgba(255, 121, 198, 0.16) 0%,
      rgba(168, 123, 255, 0.05) 45%,
      transparent 70%
    );
    animation: aPulse 3.5s 1.2s ease-in-out infinite;
  }

  .a3 {
    width: 120px;
    height: 120px;
    background: radial-gradient(circle, rgba(168, 123, 255, 0.03) 0%, transparent 70%);
    transition-delay: 0.1s;
  }
  .a3.on {
    width: 280px;
    height: 280px;
    background: radial-gradient(circle, rgba(168, 123, 255, 0.12) 0%, transparent 65%);
    animation: aPulse 3.5s 2.4s ease-in-out infinite;
  }

  @keyframes aPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.55;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     15. CORONA RAYS (OFF: hidden, ON: extended with pulse)
     ═══════════════════════════════════════════════════════════════════════════ */

  .ray {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--w);
    height: 0;
    transform-origin: center bottom;
    transform: translate(-50%, -50%) rotate(var(--a)) translateY(-28px);
    border-radius: 1px;
    background: linear-gradient(
      to top,
      rgba(108, 92, 231, 0.35),
      rgba(255, 121, 198, 0.1),
      transparent
    );
    pointer-events: none;
    opacity: 0;
    transition:
      height 0.7s 0.15s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.5s 0.1s;
    z-index: 1;
  }

  .ray.on {
    height: var(--l);
    opacity: 1;
    animation: rayPulse 4s ease-in-out infinite;
    animation-delay: calc(var(--a) * 0.012);
  }

  @keyframes rayPulse {
    0%,
    100% {
      opacity: 0.75;
      transform: translate(-50%, -50%) rotate(var(--a)) translateY(-28px) scaleY(1);
    }
    50% {
      opacity: 0.3;
      transform: translate(-50%, -50%) rotate(var(--a)) translateY(-28px) scaleY(0.7);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     16. TOGGLE BUTTON + hover/focus states
     ═══════════════════════════════════════════════════════════════════════════ */

  .tog {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    z-index: 5;
  }

  .tog:focus-visible .track {
    outline: 2px solid #ff79c6;
    outline-offset: 6px;
  }

  .tog:disabled {
    cursor: default;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     17. TRACK (OFF: dark with breathing border, ON: gradient with glow)
     ═══════════════════════════════════════════════════════════════════════════ */

  .track {
    position: relative;
    display: block;
    width: 240px;
    height: 80px;
    border-radius: 40px;
    background: rgba(10, 8, 22, 0.95);
    border: 2px solid rgba(108, 92, 231, 0.12);
    transition:
      background 0.6s,
      border-color 0.6s,
      box-shadow 0.6s;
  }

  /* Breathing border glow when OFF (delayed to start after birth) */
  .tog:not(.on) .track {
    animation: trackBreathe 4s 5s ease-in-out infinite;
    animation-fill-mode: both;
  }

  @keyframes trackBreathe {
    0%,
    100% {
      border-color: rgba(108, 92, 231, 0.12);
      box-shadow: none;
    }
    50% {
      border-color: rgba(108, 92, 231, 0.25);
      box-shadow: 0 0 20px rgba(108, 92, 231, 0.06);
    }
  }

  .tog:hover:not(:disabled) .track {
    border-color: rgba(108, 92, 231, 0.35);
    box-shadow: 0 0 30px rgba(108, 92, 231, 0.1);
  }

  .tog.on .track {
    background: linear-gradient(
      135deg,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.2) 50%,
      rgba(168, 123, 255, 0.15) 100%
    );
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow:
      0 0 50px rgba(108, 92, 231, 0.35),
      0 0 100px rgba(255, 121, 198, 0.15),
      inset 0 0 40px rgba(108, 92, 231, 0.1);
  }

  .tog.on:hover:not(:disabled) .track {
    box-shadow:
      0 0 65px rgba(108, 92, 231, 0.45),
      0 0 130px rgba(255, 121, 198, 0.2),
      inset 0 0 40px rgba(108, 92, 231, 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     18. SHIMMER (ON only, sweep animation)
     ═══════════════════════════════════════════════════════════════════════════ */

  .shimmer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      110deg,
      transparent 25%,
      rgba(255, 255, 255, 0.04) 42%,
      rgba(255, 255, 255, 0.08) 50%,
      rgba(255, 255, 255, 0.04) 58%,
      transparent 75%
    );
    background-size: 250% 100%;
    opacity: 0;
    transition: opacity 0.5s;
  }

  .tog.on .shimmer {
    opacity: 1;
    animation: sweep 4s 0.3s ease-in-out infinite;
  }

  @keyframes sweep {
    0% {
      background-position: 250% 0;
    }
    100% {
      background-position: -250% 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     19. ENERGY (ON only, flowing gradient)
     ═══════════════════════════════════════════════════════════════════════════ */

  .energy {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 121, 198, 0.1) 50%,
      rgba(168, 123, 255, 0.08) 80%,
      transparent 100%
    );
    background-size: 200% 100%;
    opacity: 0;
    transition: opacity 0.6s;
  }

  .tog.on .energy {
    opacity: 1;
    animation: energyFlow 3s linear infinite;
  }

  @keyframes energyFlow {
    0% {
      background-position: -100% 0;
    }
    100% {
      background-position: 100% 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     20. GLOW TRAIL (follows knob, ON only)
     ═══════════════════════════════════════════════════════════════════════════ */

  .glow-trail {
    position: absolute;
    top: 50%;
    left: 8px;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    transform: translateY(-50%);
    background: transparent;
    transition: transform 0.6s cubic-bezier(0.68, -0.2, 0.27, 1.2);
    pointer-events: none;
    z-index: 1;
  }

  .tog.on .glow-trail {
    transform: translateY(-50%) translateX(160px);
    background: radial-gradient(
      circle,
      rgba(255, 121, 198, 0.5) 0%,
      rgba(108, 92, 231, 0.25) 40%,
      transparent 70%
    );
    animation: glowPulse 2.5s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%,
    100% {
      transform: translateY(-50%) translateX(160px) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translateY(-50%) translateX(160px) scale(2.4);
      opacity: 0.15;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     21. KNOB CONTAINER (spring slide transition)
     ═══════════════════════════════════════════════════════════════════════════ */

  .knob {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    z-index: 2;
    transition: transform 0.6s cubic-bezier(0.68, -0.2, 0.27, 1.2);
  }

  /* travel = 240 - 16 - 64 = 160 */
  .tog.on .knob {
    transform: translateX(160px);
  }
  .tog:active:not(:disabled) .knob {
    transition-duration: 0.35s;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     22. KNOB CORE (OFF: heartbeat, ON: shifting gradient + massive glow)
     ═══════════════════════════════════════════════════════════════════════════ */

  .k-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(40, 36, 65, 0.95);
    box-shadow:
      0 2px 10px rgba(0, 0, 0, 0.4),
      inset 0 1px 2px rgba(255, 255, 255, 0.04);
    transition:
      background 0.6s,
      box-shadow 0.6s;
    z-index: 3;
  }

  /* Heartbeat pulse when OFF (delayed 5s for after birth) */
  .tog:not(.on) .k-core {
    animation: heartbeat 3s 5s ease-in-out infinite;
    animation-fill-mode: both;
  }

  @keyframes heartbeat {
    0%,
    100% {
      box-shadow:
        0 0 12px rgba(108, 92, 231, 0.15),
        0 2px 10px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(255, 255, 255, 0.04);
    }
    14% {
      box-shadow:
        0 0 22px rgba(108, 92, 231, 0.4),
        0 0 44px rgba(108, 92, 231, 0.2),
        0 2px 10px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(255, 255, 255, 0.04);
    }
    28% {
      box-shadow:
        0 0 14px rgba(108, 92, 231, 0.2),
        0 2px 10px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(255, 255, 255, 0.04);
    }
    42% {
      box-shadow:
        0 0 26px rgba(108, 92, 231, 0.45),
        0 0 52px rgba(108, 92, 231, 0.22),
        0 2px 10px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(255, 255, 255, 0.04);
    }
  }

  .tog:hover:not(:disabled) .k-core {
    background: rgba(55, 48, 85, 0.95);
  }

  .tog.on .k-core {
    background: linear-gradient(135deg, #7c6cf0 0%, #d87bff 40%, #ff79c6 100%);
    background-size: 200% 200%;
    box-shadow:
      0 0 30px rgba(108, 92, 231, 0.85),
      0 0 60px rgba(255, 121, 198, 0.55),
      0 0 120px rgba(108, 92, 231, 0.3),
      0 0 180px rgba(255, 121, 198, 0.12),
      inset 0 1px 4px rgba(255, 255, 255, 0.3);
    animation: coreShift 4s ease-in-out infinite;
  }

  @keyframes coreShift {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     23. KNOB HALO (OFF: beacon ping, ON: breathing glow)
     ═══════════════════════════════════════════════════════════════════════════ */

  .k-halo {
    position: absolute;
    inset: -14px;
    border-radius: 50%;
    background: transparent;
    transition:
      background 0.6s,
      opacity 0.6s;
    z-index: 1;
  }

  /* Beacon ping when OFF */
  .tog:not(.on) .k-halo {
    animation: beacon 4s 5s ease-out infinite;
    animation-fill-mode: both;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.2) 0%, transparent 70%);
  }

  @keyframes beacon {
    0%,
    75%,
    100% {
      transform: scale(1);
      opacity: 0;
    }
    80% {
      transform: scale(1);
      opacity: 0.8;
    }
    95% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  .tog.on .k-halo {
    background: radial-gradient(
      circle,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.18) 40%,
      transparent 70%
    );
    animation: haloPulse 3s ease-in-out infinite;
  }

  @keyframes haloPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.85;
    }
    50% {
      transform: scale(1.6);
      opacity: 0.3;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     24. KNOB FLARE (OFF: tiny dot, ON: white-hot pulse)
     ═══════════════════════════════════════════════════════════════════════════ */

  .k-flare {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: rgba(108, 92, 231, 0.3);
    transition:
      width 0.5s,
      height 0.5s,
      margin 0.5s,
      background 0.4s 0.1s,
      box-shadow 0.4s 0.1s;
    z-index: 4;
  }

  .tog.on .k-flare {
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(255, 200, 240, 0.5) 50%,
      transparent 70%
    );
    box-shadow:
      0 0 14px rgba(255, 255, 255, 0.7),
      0 0 28px rgba(255, 121, 198, 0.35);
    animation: flarePulse 2s ease-in-out infinite;
  }

  @keyframes flarePulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(0.65);
      opacity: 0.55;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     25. KNOB RINGS (OFF: 1 slow ring, ON: 2 fast counter-rotating)
     ═══════════════════════════════════════════════════════════════════════════ */

  .k-ring {
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    z-index: 2;
    transition: border-color 0.6s;
  }

  /* One slow ring when OFF (delayed 5s) */
  .tog:not(.on) .k-ring:not(.kr2) {
    border-color: rgba(108, 92, 231, 0.15);
    animation: ringSpin 12s 5s linear infinite;
    animation-fill-mode: both;
  }

  .tog.on .k-ring {
    border-color: rgba(108, 92, 231, 0.4);
    animation: ringSpin 5s linear infinite;
  }

  .kr2 {
    inset: -12px;
    border-width: 1px;
  }

  .tog:not(.on) .kr2 {
    border-color: transparent;
  }

  .tog.on .kr2 {
    border-color: rgba(255, 121, 198, 0.25);
    animation: ringSpin 8s linear infinite reverse;
  }

  @keyframes ringSpin {
    from {
      rotate: 0deg;
    }
    to {
      rotate: 360deg;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     26. STATE LABEL
     ═══════════════════════════════════════════════════════════════════════════ */

  .state-label {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: rgba(160, 155, 181, 0.4);
    user-select: none;
    transition:
      color 0.5s,
      text-shadow 0.5s;
  }

  .state-label.on {
    color: #ff79c6;
    text-shadow:
      0 0 24px rgba(255, 121, 198, 0.55),
      0 0 48px rgba(108, 92, 231, 0.25);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     27. EXPLODING STATE OVERRIDES (extra spring on knob, star reaction)
     ═══════════════════════════════════════════════════════════════════════════ */

  .page.exploding .knob {
    transition: transform 0.8s cubic-bezier(0.34, -0.3, 0.15, 1.4);
  }

  .page.exploding .stars {
    animation-duration: 2s;
  }

  .page.exploding .s1 {
    filter: brightness(1.3);
  }
  .page.exploding .s2 {
    filter: brightness(1.2);
  }

  .page.exploding .nebula {
    transform: scale(1.3);
    transition: transform 1.5s ease-out;
  }

  .page.exploding .orbit {
    filter: brightness(1.5);
    transition: filter 0.5s;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     28. IMPLODING STATE OVERRIDES (gentle easing)
     ═══════════════════════════════════════════════════════════════════════════ */

  .page.imploding .knob {
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .page.imploding .flash {
    animation: dimFlash 0.6s ease-out forwards;
  }

  @keyframes dimFlash {
    0% {
      opacity: 0;
    }
    20% {
      opacity: 0.15;
    }
    100% {
      opacity: 0;
    }
  }

  .page.imploding .aura {
    transition-duration: 0.4s;
  }

  .page.imploding .ray {
    transition-duration: 0.3s;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     29. ACTIVE PAGE OVERRIDES (slightly enhanced background)
     ═══════════════════════════════════════════════════════════════════════════ */

  .page.active .aurora {
    opacity: 1;
    background:
      radial-gradient(ellipse 80% 50% at 30% 60%, rgba(108, 92, 231, 0.07) 0%, transparent 70%),
      radial-gradient(ellipse 60% 80% at 70% 40%, rgba(255, 121, 198, 0.05) 0%, transparent 70%),
      radial-gradient(ellipse 90% 60% at 50% 50%, rgba(168, 123, 255, 0.05) 0%, transparent 60%);
  }

  .page.active .n1 {
    background: radial-gradient(
      ellipse,
      rgba(108, 92, 231, 0.12) 0%,
      rgba(108, 92, 231, 0.03) 45%,
      transparent 70%
    );
  }
  .page.active .n2 {
    background: radial-gradient(
      ellipse,
      rgba(255, 121, 198, 0.09) 0%,
      rgba(255, 121, 198, 0.02) 45%,
      transparent 70%
    );
  }
  .page.active .n3 {
    background: radial-gradient(ellipse, rgba(168, 123, 255, 0.07) 0%, transparent 60%);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     30. INFO CARD
     ═══════════════════════════════════════════════════════════════════════════ */

  .info {
    position: relative;
    z-index: 6;
    display: flex;
    gap: 2rem;
    max-width: 500px;
    width: 100%;
    background: rgba(10, 8, 20, 0.45);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.08);
    border-radius: 16px;
    padding: 1.5rem 2rem;
    opacity: 0;
    animation: infoIn 1s 5.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes infoIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 0.8;
      transform: translateY(0);
    }
  }

  .info:hover {
    border-color: rgba(108, 92, 231, 0.18);
  }

  .col {
    flex: 1;
  }

  .col h3 {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 0.6rem;
  }

  .ok h3 {
    color: rgba(232, 230, 240, 0.7);
  }
  .cap h3 {
    color: rgba(160, 155, 181, 0.55);
  }

  .col ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .col li {
    font-size: 0.8rem;
    line-height: 1.5;
    padding-left: 1.3rem;
    position: relative;
    color: rgba(160, 155, 181, 0.65);
  }

  .ok li::before {
    content: '\2713';
    position: absolute;
    left: 0;
    color: rgba(38, 222, 129, 0.65);
    font-weight: 700;
    font-size: 0.78rem;
  }

  .cap li::before {
    content: '\2014';
    position: absolute;
    left: 0;
    color: rgba(160, 155, 181, 0.3);
  }

  .divider {
    width: 1px;
    background: rgba(108, 92, 231, 0.08);
    align-self: stretch;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     31. FOOTER
     ═══════════════════════════════════════════════════════════════════════════ */

  .foot {
    position: relative;
    z-index: 6;
    font-size: 0.7rem;
    color: rgba(160, 155, 181, 0.18);
    margin: 0;
    letter-spacing: 0.05em;
    opacity: 0;
    animation: fadeIn 0.8s 6s ease forwards;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     32. REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .stars,
    .s1,
    .s2,
    .s3,
    .orbit,
    .o1,
    .o2,
    .o3,
    .o4,
    .dust,
    .nebula,
    .n1,
    .n2,
    .n3,
    .aurora {
      animation: none;
      opacity: 1;
    }

    .title,
    .sub,
    .tz,
    .info,
    .foot,
    .dim {
      animation: none;
      opacity: 1;
      filter: none;
      transform: none;
    }

    .grad {
      animation: none;
      background-position: 0% 50%;
    }
    .flash {
      display: none;
    }

    .birth-ring,
    .shock {
      display: none;
    }

    .knob,
    .k-core,
    .k-halo,
    .k-flare,
    .k-ring,
    .kr2,
    .glow-trail,
    .track,
    .shimmer,
    .energy,
    .aura,
    .a1,
    .a2,
    .a3,
    .ray,
    .state-label {
      transition-duration: 0.15s;
    }

    .tog.on .glow-trail,
    .tog.on .shimmer,
    .tog.on .energy,
    .tog.on .k-ring,
    .tog.on .kr2,
    .tog.on .k-halo,
    .tog.on .k-flare,
    .tog.on .k-core,
    .tog:not(.on) .k-core,
    .tog:not(.on) .k-halo,
    .tog:not(.on) .k-ring,
    .tog:not(.on) .track,
    .a1.on,
    .a2.on,
    .a3.on,
    .ray.on {
      animation: none;
    }

    .page {
      transition-duration: 0.15s;
    }

    .page.exploding .knob,
    .page.imploding .knob {
      transition-duration: 0.15s;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     33. MOBILE (640px)
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page {
      padding: 1.5rem 1rem;
      padding-top: max(1.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));
      padding-bottom: max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem));
      gap: 1.5rem;
    }

    .title {
      font-size: clamp(2.5rem, 12vw, 3.8rem);
    }

    .o1 {
      width: 220px;
      height: 220px;
    }
    .o2 {
      width: 340px;
      height: 340px;
    }
    .o3 {
      width: 460px;
      height: 460px;
    }
    .o4 {
      width: 600px;
      height: 600px;
    }

    .n1 {
      width: 450px;
      height: 450px;
    }
    .n2 {
      width: 350px;
      height: 350px;
    }
    .n3 {
      width: 260px;
      height: 260px;
    }

    /* Track: 200x68, knob: 54px, travel = 200-16-54 = 130 */
    .track {
      width: 200px;
      height: 68px;
      border-radius: 34px;
    }

    .knob {
      width: 54px;
      height: 54px;
      top: 7px;
      left: 7px;
    }
    .tog.on .knob {
      transform: translateX(130px);
    }

    .glow-trail {
      width: 54px;
      height: 54px;
      left: 7px;
    }
    .tog.on .glow-trail {
      transform: translateY(-50%) translateX(130px);
    }

    @keyframes glowPulse {
      0%,
      100% {
        transform: translateY(-50%) translateX(130px) scale(1);
        opacity: 0.8;
      }
      50% {
        transform: translateY(-50%) translateX(130px) scale(2.2);
        opacity: 0.15;
      }
    }

    .k-halo {
      inset: -10px;
    }
    .k-flare {
      width: 5px;
      height: 5px;
      margin: -2.5px 0 0 -2.5px;
    }
    .tog.on .k-flare {
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
    }
    .k-ring {
      inset: -5px;
    }
    .kr2 {
      inset: -9px;
    }

    .a1.on {
      width: 380px;
      height: 380px;
    }
    .a2.on {
      width: 280px;
      height: 280px;
    }
    .a3.on {
      width: 200px;
      height: 200px;
    }

    .info {
      flex-direction: column;
      padding: 1.25rem;
      gap: 0.8rem;
    }

    .divider {
      width: 100%;
      height: 1px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     34. SMALL MOBILE (380px)
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 380px) {
    .page {
      padding: 1.25rem 0.75rem;
      padding-top: max(1.25rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));
      padding-bottom: max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem));
      gap: 1.25rem;
    }

    .title {
      font-size: 2.2rem;
    }

    /* Track: 170x60, knob: 46px, travel = 170-16-46 = 108 */
    .track {
      width: 170px;
      height: 60px;
      border-radius: 30px;
    }

    .knob {
      width: 46px;
      height: 46px;
      top: 7px;
      left: 7px;
    }
    .tog.on .knob {
      transform: translateX(108px);
    }

    .glow-trail {
      width: 46px;
      height: 46px;
      left: 7px;
    }
    .tog.on .glow-trail {
      transform: translateY(-50%) translateX(108px);
    }

    @keyframes glowPulse {
      0%,
      100% {
        transform: translateY(-50%) translateX(108px) scale(1);
        opacity: 0.8;
      }
      50% {
        transform: translateY(-50%) translateX(108px) scale(2.2);
        opacity: 0.15;
      }
    }

    .k-halo {
      inset: -8px;
    }
    .k-flare {
      width: 4px;
      height: 4px;
      margin: -2px 0 0 -2px;
    }
    .tog.on .k-flare {
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
    }
    .k-ring {
      inset: -4px;
    }
    .kr2 {
      inset: -7px;
    }

    .o1 {
      width: 180px;
      height: 180px;
    }
    .o2 {
      width: 280px;
      height: 280px;
    }
    .o3 {
      width: 380px;
      height: 380px;
    }
    .o4 {
      width: 500px;
      height: 500px;
    }

    .info {
      padding: 1rem;
    }
  }
</style>
