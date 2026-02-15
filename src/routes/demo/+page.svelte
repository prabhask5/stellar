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
    }, 700);
  }
</script>

<svelte:head>
  <title>Demo Mode — Stellar</title>
</svelte:head>

<div class="page" class:toggling>
  <!-- Deep space -->
  <div class="stars"></div>
  <div class="stars stars-2"></div>
  <div class="stars stars-3"></div>

  <!-- Nebulae centered on toggle -->
  <div class="nebula"></div>
  <div class="nebula neb-2"></div>
  <div class="nebula neb-3"></div>

  <!-- Orbital rings -->
  <div class="orbit o1"><i></i></div>
  <div class="orbit o2"><i></i></div>
  <div class="orbit o3"><i></i></div>
  <div class="orbit o4"><i></i></div>

  <!-- Cosmic dust -->
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

  <!-- ══════ Title ══════ -->
  <h1 class="title"><span class="grad">Demo Mode</span></h1>
  <p class="sub">Explore Stellar with sample data. No account required.</p>

  <!-- ══════════════════════════════════════════════════════════════════════
       THE TOGGLE — a star you can touch
       ══════════════════════════════════════════════════════════════════════ -->
  <section class="tz">
    <!-- Layered auras -->
    <div class="aura a1" class:on={demoActive}></div>
    <div class="aura a2" class:on={demoActive}></div>
    <div class="aura a3" class:on={demoActive}></div>

    <!-- Corona rays — 8 radiating beams -->
    <div class="corona" class:on={demoActive}>
      {#each Array(8) as _, j (j)}
        <span
          class="ray"
          style="--angle:{j * 45}deg; --len:{[80, 60, 90, 55, 85, 65, 75, 70][j]}px; --w:{[
            2, 1.5, 2.5, 1.5, 2, 1.5, 2, 1.5
          ][j]}px"
        ></span>
      {/each}
    </div>

    <button
      class="tog"
      class:on={demoActive}
      onclick={handleToggle}
      disabled={toggling}
      aria-label={demoActive ? 'Disable demo mode' : 'Enable demo mode'}
    >
      <span class="track">
        <!-- Internal light effects -->
        <span class="shimmer"></span>
        <span class="track-glow"></span>

        <!-- The knob — a miniature star -->
        <span class="knob">
          <span class="knob-halo"></span>
          <span class="knob-core"></span>
          <span class="knob-flare"></span>
          <span class="knob-ring"></span>
          <span class="knob-ring knob-ring-2"></span>
        </span>
      </span>
    </button>

    <p class="tog-label">
      Demo Mode
      <span class="tog-state" class:on={demoActive}>{demoActive ? 'ON' : 'OFF'}</span>
    </p>
  </section>

  <!-- ══════ Info card ══════ -->
  <section class="info">
    <div class="col ok">
      <h3>Available</h3>
      <ul>
        <li>Browse all pages</li>
        <li>Create & edit items</li>
        <li>Focus timer</li>
        <li>Block lists</li>
        <li>Settings</li>
      </ul>
    </div>
    <div class="divider"></div>
    <div class="col cap">
      <h3>Limited</h3>
      <ul>
        <li>Cloud sync</li>
        <li>Account changes</li>
        <li>Device management</li>
        <li>Debug tools</li>
      </ul>
    </div>
  </section>

  <p class="foot">Data resets on refresh</p>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     PAGE
     ═══════════════════════════════════════════════════════════════════════════ */

  .page {
    position: relative;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.25rem 2rem;
    gap: 2.5rem;
    overflow: hidden;
    background: #050510;
    color: #e8e6f0;
    font-family: inherit;
    transition:
      opacity 0.6s ease,
      filter 0.6s ease;
  }

  .page.toggling {
    opacity: 0;
    filter: blur(12px);
  }

  /* ═══ STARFIELD ═══ */

  .stars {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(255, 255, 255, 0.55) 50%, transparent 50%),
      radial-gradient(1px 1px at 40% 70%, rgba(255, 255, 255, 0.35) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 60% 20%, rgba(255, 255, 255, 0.45) 50%, transparent 50%),
      radial-gradient(1px 1px at 80% 50%, rgba(255, 255, 255, 0.3) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 10% 80%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(0.8px 0.8px at 55% 45%, rgba(255, 255, 255, 0.25) 50%, transparent 50%),
      radial-gradient(1px 1px at 70% 90%, rgba(255, 255, 255, 0.3) 50%, transparent 50%);
    background-size: 300px 300px;
    animation: drift 80s linear infinite;
  }
  .stars-2 {
    background-size: 420px 420px;
    opacity: 0.5;
    animation: drift 130s linear infinite reverse;
  }
  .stars-3 {
    background-size: 200px 200px;
    opacity: 0.3;
    animation: drift 55s linear infinite;
  }

  @keyframes drift {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-300px);
    }
  }

  /* ═══ NEBULAE — atmospheric color behind the toggle ═══ */

  .nebula {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -55%;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
  }

  .nebula:first-of-type {
    width: 700px;
    height: 700px;
    background: radial-gradient(
      ellipse,
      rgba(108, 92, 231, 0.07) 0%,
      rgba(108, 92, 231, 0.02) 45%,
      transparent 70%
    );
    animation: nebPulse 9s ease-in-out infinite;
  }

  .neb-2 {
    width: 550px;
    height: 550px;
    translate: -45% -50%;
    background: radial-gradient(
      ellipse,
      rgba(255, 121, 198, 0.05) 0%,
      rgba(255, 121, 198, 0.015) 45%,
      transparent 70%
    );
    animation: nebPulse 12s 3s ease-in-out infinite;
  }

  .neb-3 {
    width: 400px;
    height: 400px;
    translate: -55% -52%;
    background: radial-gradient(ellipse, rgba(168, 123, 255, 0.04) 0%, transparent 60%);
    animation: nebPulse 7s 1.5s ease-in-out infinite;
  }

  @keyframes nebPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.18);
      opacity: 0.65;
    }
  }

  /* ═══ ORBITAL RINGS ═══ */

  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    translate: -50% -55%;
  }

  .o1 {
    width: 280px;
    height: 280px;
    border: 1px solid rgba(108, 92, 231, 0.1);
    animation: ospin 28s linear infinite;
  }
  .o2 {
    width: 420px;
    height: 420px;
    border: 1px solid rgba(255, 121, 198, 0.07);
    animation: ospin 42s linear infinite reverse;
  }
  .o3 {
    width: 580px;
    height: 580px;
    border: 1px solid rgba(108, 92, 231, 0.05);
    animation: ospin 55s linear infinite;
  }
  .o4 {
    width: 760px;
    height: 760px;
    border: 1px solid rgba(255, 121, 198, 0.03);
    animation: ospin 70s linear infinite reverse;
  }

  .orbit i {
    position: absolute;
    top: -3px;
    left: 50%;
    margin-left: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 10px rgba(108, 92, 231, 0.4);
  }

  .o2 i {
    background: rgba(255, 121, 198, 0.4);
    box-shadow: 0 0 10px rgba(255, 121, 198, 0.35);
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
  }
  .o3 i {
    background: rgba(168, 123, 255, 0.3);
    box-shadow: 0 0 8px rgba(168, 123, 255, 0.25);
    width: 4px;
    height: 4px;
    margin-left: -2px;
  }
  .o4 i {
    background: rgba(255, 121, 198, 0.2);
    box-shadow: 0 0 6px rgba(255, 121, 198, 0.15);
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

  /* ═══ COSMIC DUST ═══ */

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

  /* ═══ TITLE ═══ */

  .title {
    position: relative;
    z-index: 2;
    font-size: clamp(3rem, 10vw, 6.5rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
    margin: 0;
    text-align: center;
    opacity: 0;
    animation: titleIn 1.2s 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes titleIn {
    from {
      opacity: 0;
      transform: translateY(40px) scale(0.9);
      filter: blur(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
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

  .sub {
    position: relative;
    z-index: 2;
    font-size: clamp(0.9rem, 2vw, 1.12rem);
    color: #a09bb5;
    max-width: 380px;
    margin: -0.5rem auto 0;
    text-align: center;
    line-height: 1.5;
    opacity: 0;
    animation: subIn 1s 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes subIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     T H E   T O G G L E
     ═══════════════════════════════════════════════════════════════════════════ */

  .tz {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    opacity: 0;
    animation: togIn 1.6s 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes togIn {
    0% {
      opacity: 0;
      transform: scale(0.7);
      filter: blur(20px);
    }
    55% {
      opacity: 1;
      transform: scale(1.06);
      filter: blur(0);
    }
    100% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
  }

  /* ── Auras — three concentric radial glows ── */

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
      rgba(108, 92, 231, 0.18) 0%,
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
      rgba(255, 121, 198, 0.14) 0%,
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
    background: radial-gradient(circle, rgba(168, 123, 255, 0.1) 0%, transparent 65%);
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
      opacity: 0.6;
    }
  }

  /* ── Corona rays — radiate from the knob when active ── */

  .corona {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    translate: 0% -55%;
    pointer-events: none;
    z-index: 2;
    transition: translate 0.6s cubic-bezier(0.68, -0.2, 0.27, 1.2);
  }

  .corona.on {
    translate: 74px -55%;
  }

  .ray {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--w);
    height: 0;
    transform-origin: center bottom;
    transform: rotate(var(--angle)) translateY(28px);
    border-radius: 1px;
    background: linear-gradient(to top, rgba(108, 92, 231, 0.3), transparent);
    opacity: 0;
    transition:
      height 0.6s 0.15s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.5s 0.1s;
  }

  .corona.on .ray {
    height: var(--len);
    opacity: 1;
    animation: rayPulse 4s ease-in-out infinite;
    animation-delay: calc(var(--angle) * 0.012);
  }

  @keyframes rayPulse {
    0%,
    100% {
      opacity: 0.7;
      transform: rotate(var(--angle)) translateY(28px) scaleY(1);
    }
    50% {
      opacity: 0.3;
      transform: rotate(var(--angle)) translateY(28px) scaleY(0.7);
    }
  }

  /* ── Toggle button ── */

  .tog {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .tog:focus-visible .track {
    outline: 2px solid #ff79c6;
    outline-offset: 6px;
  }
  .tog:disabled {
    cursor: default;
  }

  /* ── Track ── */

  .track {
    position: relative;
    display: block;
    width: 220px;
    height: 72px;
    border-radius: 36px;
    background: rgba(12, 10, 25, 0.95);
    border: 2px solid rgba(108, 92, 231, 0.12);
    transition:
      background 0.6s,
      border-color 0.6s,
      box-shadow 0.6s;
    overflow: hidden;
  }

  .tog:hover:not(:disabled) .track {
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 0 25px rgba(108, 92, 231, 0.08);
  }

  .tog.on .track {
    background: linear-gradient(
      135deg,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.2) 50%,
      rgba(168, 123, 255, 0.15) 100%
    );
    border-color: rgba(108, 92, 231, 0.45);
    box-shadow:
      0 0 50px rgba(108, 92, 231, 0.3),
      0 0 100px rgba(255, 121, 198, 0.12),
      inset 0 0 40px rgba(108, 92, 231, 0.08);
  }

  .tog.on:hover:not(:disabled) .track {
    box-shadow:
      0 0 60px rgba(108, 92, 231, 0.4),
      0 0 120px rgba(255, 121, 198, 0.18),
      inset 0 0 40px rgba(108, 92, 231, 0.08);
  }

  /* ── Shimmer sweep ── */

  .shimmer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      110deg,
      transparent 25%,
      rgba(255, 255, 255, 0.03) 42%,
      rgba(255, 255, 255, 0.07) 50%,
      rgba(255, 255, 255, 0.03) 58%,
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

  /* ── Track inner glow ── */

  .track-glow {
    position: absolute;
    top: 50%;
    left: 8px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    transform: translateY(-50%);
    background: transparent;
    transition: transform 0.6s cubic-bezier(0.68, -0.2, 0.27, 1.2);
    pointer-events: none;
    z-index: 1;
  }

  .tog.on .track-glow {
    transform: translateY(-50%) translateX(148px);
    background: radial-gradient(
      circle,
      rgba(255, 121, 198, 0.45) 0%,
      rgba(108, 92, 231, 0.25) 40%,
      transparent 70%
    );
    animation: gPulse 2.5s ease-in-out infinite;
  }

  @keyframes gPulse {
    0%,
    100% {
      transform: translateY(-50%) translateX(148px) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translateY(-50%) translateX(148px) scale(2.2);
      opacity: 0.2;
    }
  }

  /* ══════════════════════════════════════════════
     THE KNOB — a star you can hold
     ══════════════════════════════════════════════ */

  .knob {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    z-index: 2;
    transition: transform 0.6s cubic-bezier(0.68, -0.2, 0.27, 1.2);
  }

  .tog.on .knob {
    transform: translateX(148px);
  }
  .tog:active:not(:disabled) .knob {
    transition-duration: 0.35s;
  }

  /* Core — the solid center */
  .knob-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(45, 40, 70, 0.95);
    box-shadow:
      0 2px 10px rgba(0, 0, 0, 0.4),
      inset 0 1px 2px rgba(255, 255, 255, 0.04);
    transition:
      background 0.6s,
      box-shadow 0.6s;
    z-index: 3;
  }

  .tog:hover:not(:disabled) .knob-core {
    background: rgba(60, 53, 90, 0.95);
  }

  .tog.on .knob-core {
    background: linear-gradient(135deg, #7c6cf0 0%, #d87bff 40%, #ff79c6 100%);
    box-shadow:
      0 0 28px rgba(108, 92, 231, 0.8),
      0 0 56px rgba(255, 121, 198, 0.5),
      0 0 112px rgba(108, 92, 231, 0.25),
      0 0 180px rgba(255, 121, 198, 0.1),
      inset 0 1px 4px rgba(255, 255, 255, 0.3);
  }

  /* Halo — soft glow around the knob */
  .knob-halo {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: transparent;
    transition:
      background 0.6s,
      opacity 0.6s;
    z-index: 1;
  }

  .tog.on .knob-halo {
    background: radial-gradient(
      circle,
      rgba(108, 92, 231, 0.25) 0%,
      rgba(255, 121, 198, 0.15) 40%,
      transparent 70%
    );
    animation: haloPulse 3s ease-in-out infinite;
  }

  @keyframes haloPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.35;
    }
  }

  /* Flare — intense white-hot center dot */
  .knob-flare {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border-radius: 50%;
    background: transparent;
    transition:
      background 0.4s 0.1s,
      box-shadow 0.4s 0.1s;
    z-index: 4;
  }

  .tog.on .knob-flare {
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.9) 0%,
      rgba(255, 200, 240, 0.4) 50%,
      transparent 70%
    );
    box-shadow:
      0 0 12px rgba(255, 255, 255, 0.6),
      0 0 24px rgba(255, 121, 198, 0.3);
    animation: flarePulse 2s ease-in-out infinite;
  }

  @keyframes flarePulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(0.7);
      opacity: 0.6;
    }
  }

  /* Rings — orbiting borders */
  .knob-ring {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    transition: border-color 0.6s;
    z-index: 2;
  }

  .tog.on .knob-ring {
    border-color: rgba(108, 92, 231, 0.35);
    animation: ringSpin 5s linear infinite;
  }

  .knob-ring-2 {
    inset: -10px;
    border-width: 1px;
  }

  .tog.on .knob-ring-2 {
    border-color: rgba(255, 121, 198, 0.2);
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

  /* ── Toggle label ── */

  .tog-label {
    font-size: 1rem;
    font-weight: 600;
    color: #a09bb5;
    user-select: none;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .tog-state {
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(160, 155, 181, 0.45);
    transition:
      color 0.5s,
      text-shadow 0.5s;
  }

  .tog-state.on {
    color: #ff79c6;
    text-shadow:
      0 0 24px rgba(255, 121, 198, 0.5),
      0 0 48px rgba(108, 92, 231, 0.2);
  }

  /* ═══ INFO CARD ═══ */

  .info {
    position: relative;
    z-index: 2;
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
    animation: infoIn 1s 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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

  /* ═══ FOOTER ═══ */

  .foot {
    position: relative;
    z-index: 2;
    font-size: 0.72rem;
    color: rgba(160, 155, 181, 0.2);
    margin: 0;
    letter-spacing: 0.04em;
    opacity: 0;
    animation: noteIn 0.8s 2.6s ease forwards;
  }

  @keyframes noteIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ═══ REDUCED MOTION ═══ */

  @media (prefers-reduced-motion: reduce) {
    .stars,
    .stars-2,
    .stars-3,
    .orbit,
    .o1,
    .o2,
    .o3,
    .o4,
    .dust,
    .nebula,
    .neb-2,
    .neb-3 {
      animation: none;
    }

    .title,
    .sub,
    .tz,
    .info,
    .foot {
      animation: none;
      opacity: 1;
      filter: none;
      transform: none;
    }

    .grad {
      animation: none;
      background-position: 0% 50%;
    }

    .knob,
    .knob-core,
    .knob-halo,
    .knob-flare,
    .knob-ring,
    .knob-ring-2,
    .track-glow,
    .track,
    .shimmer,
    .aura,
    .a1,
    .a2,
    .a3,
    .ray,
    .corona {
      transition-duration: 0.15s;
    }

    .tog.on .track-glow,
    .tog.on .shimmer,
    .tog.on .knob-ring,
    .tog.on .knob-ring-2,
    .tog.on .knob-halo,
    .tog.on .knob-flare,
    .a1.on,
    .a2.on,
    .a3.on,
    .corona.on .ray {
      animation: none;
    }

    .page {
      transition-duration: 0.15s;
    }
  }

  /* ═══ MOBILE ═══ */

  @media (max-width: 640px) {
    .page {
      padding: 2rem 1rem 1.5rem;
      gap: 2rem;
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

    .nebula:first-of-type {
      width: 450px;
      height: 450px;
    }
    .neb-2 {
      width: 350px;
      height: 350px;
    }
    .neb-3 {
      width: 260px;
      height: 260px;
    }

    .track {
      width: 180px;
      height: 62px;
      border-radius: 31px;
    }
    .knob {
      width: 48px;
      height: 48px;
      top: 7px;
      left: 7px;
    }
    .tog.on .knob {
      transform: translateX(118px);
    }
    .track-glow {
      width: 48px;
      height: 48px;
      left: 7px;
    }
    .tog.on .track-glow {
      transform: translateY(-50%) translateX(118px);
    }
    .knob-halo {
      inset: -10px;
    }
    .knob-flare {
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
    }
    .knob-ring {
      inset: -5px;
    }
    .knob-ring-2 {
      inset: -8px;
    }

    .corona.on {
      translate: 59px -55%;
    }

    @keyframes gPulse {
      0%,
      100% {
        transform: translateY(-50%) translateX(118px) scale(1);
        opacity: 0.8;
      }
      50% {
        transform: translateY(-50%) translateX(118px) scale(2.2);
        opacity: 0.2;
      }
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

  /* ═══ SMALL MOBILE ═══ */

  @media (max-width: 380px) {
    .title {
      font-size: 2.2rem;
    }

    .track {
      width: 160px;
      height: 56px;
      border-radius: 28px;
    }
    .knob {
      width: 42px;
      height: 42px;
      top: 7px;
      left: 7px;
    }
    .tog.on .knob {
      transform: translateX(104px);
    }
    .track-glow {
      width: 42px;
      height: 42px;
      left: 7px;
    }
    .tog.on .track-glow {
      transform: translateY(-50%) translateX(104px);
    }
    .knob-halo {
      inset: -8px;
    }
    .knob-flare {
      width: 10px;
      height: 10px;
      margin: -5px 0 0 -5px;
    }
    .knob-ring {
      inset: -4px;
    }
    .knob-ring-2 {
      inset: -7px;
    }

    .corona.on {
      translate: 52px -55%;
    }

    @keyframes gPulse {
      0%,
      100% {
        transform: translateY(-50%) translateX(104px) scale(1);
        opacity: 0.8;
      }
      50% {
        transform: translateY(-50%) translateX(104px) scale(2.2);
        opacity: 0.2;
      }
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
