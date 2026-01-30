/**
 * Stellar Focus - Blocked Page Logic
 * A cinematic moment of encouragement
 */

import browser from 'webextension-polyfill';
import { getConfig } from '../config';

// Encouraging submessages - the main message stays fixed for impact
const submessages = [
  'This moment is for your focus.',
  'You\'ve got this.',
  'Your future self will thank you.',
  'Distractions can wait.',
  'Deep work requires deep focus.',
  'The best work happens here.',
  'Stay present. Stay powerful.',
  'This is where the magic happens.',
  'Trust the process.',
  'You\'re building something great.'
];

// Get random submessage
function getRandomSubmessage(): string {
  const index = Math.floor(Math.random() * submessages.length);
  return submessages[index];
}

/**
 * Focus an existing app tab if open, otherwise open a new tab to the app
 */
async function focusOrOpenApp() {
  try {
    const config = await getConfig();
    const appUrl = config?.appUrl || '';
    if (!appUrl) return;

    const tabs = await browser.tabs.query({
      currentWindow: true,
      url: `${appUrl}/*`
    });

    if (tabs.length > 0 && tabs[0].id !== undefined) {
      // Found an existing app tab - just focus it without changing URL
      await browser.tabs.update(tabs[0].id, { active: true });
    } else {
      // No existing tab - create a new one
      await browser.tabs.create({ url: `${appUrl}/focus` });
    }
  } catch (error) {
    console.error('[Stellar Focus] Navigation error:', error);
    const config = await getConfig();
    if (config?.appUrl) {
      window.open(`${config.appUrl}/focus`, '_blank');
    }
  }
}

// Parse URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    url: params.get('url') || '',
    domain: params.get('domain') || ''
  };
}

// =============================================
// SPIRAL GALAXY RENDERER
// =============================================
interface GalaxyStar {
  r: number;
  theta: number;
  size: number;
  color: string;
  twinkleSpeed: number;
  twinkleOffset: number;
  twinkleIntensity: number;
}

function initGalaxy() {
  const canvas = document.getElementById('galaxyCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width: number, height: number, centerX: number, centerY: number;
  let rotation = 0;
  let stars: GalaxyStar[] = [];

  // Galaxy parameters
  const NUM_ARMS = 2;
  const ARM_SPREAD = 0.5;
  const STARS_PER_ARM = 2500;
  const GALAXY_RADIUS = 350;
  const CORE_RADIUS = 40;
  const ROTATION_SPEED = 0.00008;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    centerX = width / 2;
    centerY = height / 2;
  }

  function createGalaxyStars() {
    stars = [];

    // Core stars (dense center)
    for (let i = 0; i < 800; i++) {
      const r = Math.random() * CORE_RADIUS * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const brightness = 0.5 + Math.random() * 0.5;
      const size = 0.5 + Math.random() * 1.5;

      const warmth = Math.random();
      const color = warmth > 0.7
        ? `rgba(255, ${200 + Math.random() * 55}, ${150 + Math.random() * 50}, ${brightness})`
        : `rgba(255, ${220 + Math.random() * 35}, ${200 + Math.random() * 55}, ${brightness})`;

      stars.push({
        r, theta, size, color,
        twinkleSpeed: 1 + Math.random() * 3,
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleIntensity: 0.4 + Math.random() * 0.5
      });
    }

    // Spiral arm stars
    for (let arm = 0; arm < NUM_ARMS; arm++) {
      const armAngle = (arm / NUM_ARMS) * Math.PI * 2;

      for (let i = 0; i < STARS_PER_ARM; i++) {
        const t = i / STARS_PER_ARM;
        const spiralAngle = armAngle + t * Math.PI * 3;
        const baseR = CORE_RADIUS + t * (GALAXY_RADIUS - CORE_RADIUS);

        const spread = ARM_SPREAD * (0.3 + t * 0.7);
        const scatter = (Math.random() - 0.5) * spread * baseR * 0.4;
        const scatterAngle = (Math.random() - 0.5) * spread * 0.8;

        const r = baseR + scatter;
        const theta = spiralAngle + scatterAngle;

        const edgeFade = 1 - t * 0.6;
        const brightness = (0.3 + Math.random() * 0.7) * edgeFade;
        const size = (0.5 + Math.random() * 2) * (1 - t * 0.3);

        const colorRand = Math.random();
        let color: string;
        if (t < 0.2) {
          color = `rgba(${200 + Math.random() * 55}, ${180 + Math.random() * 50}, ${220 + Math.random() * 35}, ${brightness})`;
        } else if (colorRand > 0.85) {
          color = `rgba(${150 + Math.random() * 50}, ${180 + Math.random() * 50}, 255, ${brightness})`;
        } else if (colorRand > 0.7) {
          color = `rgba(255, ${120 + Math.random() * 80}, ${180 + Math.random() * 75}, ${brightness})`;
        } else {
          color = `rgba(${167 + Math.random() * 40}, ${139 + Math.random() * 60}, 250, ${brightness})`;
        }

        stars.push({
          r, theta, size, color,
          twinkleSpeed: 0.8 + Math.random() * 2.5,
          twinkleOffset: Math.random() * Math.PI * 2,
          twinkleIntensity: 0.3 + Math.random() * 0.6
        });
      }
    }

    // Scattered field stars
    for (let i = 0; i < 300; i++) {
      const r = CORE_RADIUS + Math.random() * (GALAXY_RADIUS * 1.2);
      const theta = Math.random() * Math.PI * 2;
      const brightness = 0.1 + Math.random() * 0.3;
      const size = 0.3 + Math.random() * 0.8;
      const color = `rgba(255, 255, 255, ${brightness})`;

      stars.push({
        r, theta, size, color,
        twinkleSpeed: 1 + Math.random() * 2.5,
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleIntensity: 0.4 + Math.random() * 0.5
      });
    }
  }

  function drawGalaxy(time: number) {
    ctx.clearRect(0, 0, width, height);

    // Draw galactic core glow
    const coreGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, CORE_RADIUS * 3
    );
    coreGradient.addColorStop(0, 'rgba(255, 250, 240, 0.9)');
    coreGradient.addColorStop(0.1, 'rgba(255, 230, 200, 0.7)');
    coreGradient.addColorStop(0.25, 'rgba(255, 200, 150, 0.4)');
    coreGradient.addColorStop(0.5, 'rgba(200, 160, 220, 0.15)');
    coreGradient.addColorStop(1, 'rgba(108, 92, 231, 0)');

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, CORE_RADIUS * 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw stars
    for (const star of stars) {
      const theta = star.theta + rotation;
      const x = centerX + Math.cos(theta) * star.r;
      const y = centerY + Math.sin(theta) * star.r;

      const twinkleCycle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const intensity = star.twinkleIntensity;
      const twinkle = (1 - intensity) + intensity * (0.5 + 0.5 * twinkleCycle);
      const size = star.size * (0.6 + 0.4 * twinkle);

      ctx.fillStyle = star.color;
      ctx.globalAlpha = twinkle;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Brighter core center
    const brightCore = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, CORE_RADIUS
    );
    brightCore.addColorStop(0, 'rgba(255, 255, 250, 0.8)');
    brightCore.addColorStop(0.3, 'rgba(255, 240, 220, 0.4)');
    brightCore.addColorStop(1, 'rgba(255, 220, 200, 0)');

    ctx.fillStyle = brightCore;
    ctx.beginPath();
    ctx.arc(centerX, centerY, CORE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function animate(time: number) {
    rotation += ROTATION_SPEED;
    drawGalaxy(time * 0.001);
    requestAnimationFrame(animate);
  }

  resize();
  createGalaxyStars();
  window.addEventListener('resize', resize);
  requestAnimationFrame(animate);
}

// =============================================
// STARFIELD RENDERER
// =============================================
interface BackgroundStar {
  x: number;
  y: number;
  baseSize: number;
  maxBrightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  twinkleIntensity: number;
}

function initStarfield() {
  const canvas = document.getElementById('starfieldCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width: number, height: number;
  let stars: BackgroundStar[] = [];
  const NUM_STARS = 500;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    createStars();
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < NUM_STARS; i++) {
      const sizeRand = Math.random();
      const baseSize = sizeRand < 0.7 ? 0.5 + Math.random() * 0.8
                     : sizeRand < 0.9 ? 1 + Math.random() * 1
                     : 2 + Math.random() * 1.5;

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        baseSize: baseSize,
        maxBrightness: 0.4 + Math.random() * 0.6,
        twinkleSpeed: 0.8 + Math.random() * 3,
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleIntensity: 0.3 + Math.random() * 0.7
      });
    }
  }

  function drawStars(time: number) {
    ctx.clearRect(0, 0, width, height);

    for (const star of stars) {
      const twinkleCycle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const twinkle = (1 - star.twinkleIntensity) + star.twinkleIntensity * (0.5 + 0.5 * twinkleCycle);

      const alpha = star.maxBrightness * twinkle;
      const size = star.baseSize * (0.7 + 0.3 * twinkle);

      // Brighter stars get a subtle glow
      if (star.baseSize > 1.5 && twinkle > 0.7) {
        const glowSize = size * 3;
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(star.x, star.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate(time: number) {
    drawStars(time * 0.001);
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(animate);
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  const submessageEl = document.getElementById('submessage');
  const blockedUrlEl = document.getElementById('blockedUrl');
  const returnBtn = document.getElementById('returnBtn') as HTMLAnchorElement;

  // Set return button URL and click handler
  if (returnBtn) {
    const config = await getConfig();
    returnBtn.href = config?.appUrl ? `${config.appUrl}/focus` : '#';
    returnBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await focusOrOpenApp();
    });
  }

  // Set random submessage
  if (submessageEl) {
    submessageEl.textContent = getRandomSubmessage();
  }

  // Show blocked domain (subtle, non-judgmental)
  const { domain } = getUrlParams();
  if (blockedUrlEl && domain) {
    blockedUrlEl.textContent = domain;
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      window.history.back();
    }
    if (e.key === 'Enter') {
      await focusOrOpenApp();
    }
  });

  // Initialize canvas renderers
  initStarfield();
  initGalaxy();
});
