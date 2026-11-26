/**
 * The engine: owns the WebGL2 context and the frame loop. It is driven only by messages
 * (`protocol.ts`), so the same code runs in a worker on an OffscreenCanvas and, where that
 * is not possible, on the main thread.
 *
 * Three states, decided afresh every frame:
 *   live    the galaxy is redrawn: Home and Focus, any camera move, a focus event
 *   still   reduced motion: the galaxy is drawn once and no frame is requested
 *   waking  a still sky while an event plays: the cached galaxy plus the particles
 *
 * The frame loop allocates nothing: every array it touches exists before the first frame.
 */
import { runState } from "../modes.ts";
import type { FromEngine, PageView, ProbeResult, ToEngine } from "../protocol.ts";
import { Camera, FRAMINGS } from "./camera.ts";
import { EffectPlayer, Particles, type Stage } from "./effects.ts";
import { type Galaxy, generateGalaxy } from "./galaxy.ts";
import {
  createPoints,
  createProgram,
  createTarget,
  deletePoints,
  deleteTarget,
  type GL,
  type PointBuffer,
  type Program,
  type Target,
} from "./gl.ts";
import { clamp, easeInOut, lerp } from "./math.ts";
import { PALETTE, type Rgb } from "./palette.ts";
import {
  bufferSize,
  chooseQuality,
  FrameProbe,
  gpuTierFromRenderer,
  QualityPlan,
  type QualitySetting,
  type QualityTier,
  stepDown,
  TIERS,
} from "./quality.ts";
import {
  BLUR_FS,
  COMPOSITE_FS,
  COPY_FS,
  DOWN_FS,
  FX_FS,
  FX_VS,
  QUAD_VS,
  STAR_FS,
  STAR_VS,
} from "./shaders.ts";

const FADE_MS = 300;
const MOVE_MS = 700;
/** How fast the scene settles into and out of a focus phase, per second. */
const FOCUS_RATE = 2.2;
const BLACK: Rgb = [0, 0, 0];

type Surface = (OffscreenCanvas | HTMLCanvasElement) & {
  addEventListener: (type: string, listener: (e: Event) => void) => void;
  removeEventListener: (type: string, listener: (e: Event) => void) => void;
};

type Schedule = (callback: (now: number) => void) => number;

interface Programs {
  star: Program;
  fx: Program;
  down: Program;
  blur: Program;
  composite: Program;
  copy: Program;
}

interface Targets {
  scene: Target;
  half: Target;
  q1: Target;
  q2: Target;
  /** The galaxy's bloom as it was when a still sky was captured. */
  cache: Target;
  /** Event particles over a still sky. */
  fx: Target;
}

export class Engine {
  private readonly canvas: Surface;
  private readonly post: (message: FromEngine) => void;
  private readonly requestFrame: Schedule;
  private gl: GL;

  private programs!: Programs;
  private targets: Targets | null = null;
  /** The outgoing frame of a cross-fade. It outlives a resize, so it is kept apart. */
  private previous: Target | null = null;
  private black!: WebGLTexture;
  private quad!: WebGLVertexArrayObject;
  private stars: PointBuffer | null = null;
  private haze: PointBuffer | null = null;
  private knots: PointBuffer | null = null;
  private dust: PointBuffer | null = null;
  private sky: PointBuffer | null = null;
  private fxPoints: PointBuffer | null = null;
  private galaxy: Galaxy | null = null;
  private hdr = false;
  private maxPointSize = 64;
  private gpuTier: 0 | 1 | 2 | 3 = 1;

  private readonly camera = new Camera();
  private readonly particles = new Particles();
  private readonly player = new EffectPlayer();
  private readonly stage: Stage;
  private plan = new QualityPlan("balanced");
  private probe = new FrameProbe(Infinity);
  private setting: QualitySetting = "auto";
  private still = false;

  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private width = 1;
  private height = 1;
  private scale = 1;

  private page: PageView = { mode: "live", framing: "page", shiftX: 0, shiftY: 0 };
  private visible = true;
  private focusTarget = 0;
  private focusLevel = 0;
  private time = 0;
  private coreBoost = 1;

  /** A still sky's galaxy is in `scene` and `cache`, ready to be composited. */
  private captured = false;
  /** The frame on screen is out of date and one more must be drawn, even when the sky is still. */
  private dirty = true;
  /** The last composite read the event particles too. */
  private lastHadFx = false;
  private lastLive = false;
  private fadeStart = -1;
  private scheduled = false;
  private lastTick = 0;
  private lost = false;
  private disposed = false;

  private frames = 0;
  private startedAt = 0;
  private announced = false;
  private frameMs = 0;
  private workMs = 0;
  private readonly sample = new Uint8Array(32 * 32 * 4);

  private readonly onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private readonly onRestored = () => this.restore();
  private readonly tickBound = (now: number) => this.tick(now);

  constructor(canvas: OffscreenCanvas | HTMLCanvasElement, post: (message: FromEngine) => void) {
    this.canvas = canvas as Surface;
    this.post = post;
    const raf = (globalThis as { requestAnimationFrame?: Schedule }).requestAnimationFrame;
    this.requestFrame = raf
      ? raf.bind(globalThis)
      : (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
    const gl = (canvas as OffscreenCanvas).getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) as GL | null;
    if (!gl) throw new Error("universe: no WebGL2");
    this.gl = gl;
    this.stage = {
      time: 0,
      targets: new Float32Array(4),
      targetCount: 0,
      camera: this.camera,
      particles: this.particles,
      core: 0,
      push: 0,
    };
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  // ── messages ──────────────────────────────────────────────────────────────

  handle(message: ToEngine): void {
    if (this.disposed) return;
    switch (message.type) {
      case "init": {
        this.startedAt = performance.now();
        this.cssWidth = message.width;
        this.cssHeight = message.height;
        this.dpr = message.dpr;
        this.visible = message.visible;
        // Whatever comes next is a first frame, not the continuation of the last one.
        this.lastLive = false;
        this.setting = message.setting;
        this.page = message.page;
        this.focusTarget = this.focusLevel = message.focusing ? 1 : 0;
        this.readGpu();
        const choice = chooseQuality(message.setting, {
          ...message.signals,
          gpuTier: this.gpuTier,
        });
        this.plan = new QualityPlan(choice.tier);
        this.still = choice.still;
        this.player.still = choice.still;
        this.build();
        this.camera.snap(FRAMINGS[this.page.framing], this.page.shiftX, this.page.shiftY);
        this.startProbe();
        this.invalidate();
        return;
      }
      case "resize": {
        if (
          message.width === this.cssWidth &&
          message.height === this.cssHeight &&
          message.dpr === this.dpr
        )
          return;
        this.cssWidth = message.width;
        this.cssHeight = message.height;
        this.dpr = message.dpr;
        this.resize();
        this.invalidate();
        return;
      }
      case "page":
        this.setPage(message.page);
        return;
      case "quality": {
        this.setting = message.setting;
        const choice = chooseQuality(message.setting, {
          ...message.signals,
          gpuTier: this.gpuTier,
        });
        if (choice.tier === this.plan.current && choice.still === this.still) return;
        // The owner chose this in Settings: it is its own boundary, covered by a cross-fade.
        this.beginFade();
        this.plan.request(choice.tier);
        this.still = choice.still;
        this.player.still = choice.still;
        this.atBoundary();
        this.settle();
        this.post({ type: "quality", tier: this.plan.current, still: this.still });
        this.invalidate();
        return;
      }
      case "focus":
        this.focusTarget = message.active ? 1 : 0;
        if (this.still) this.focusLevel = this.focusTarget;
        this.invalidate();
        return;
      case "event": {
        const origin =
          message.u === undefined || message.v === undefined
            ? null
            : { u: message.u, v: message.v };
        this.player.offer(message.event, origin, this.stage.targetCount, performance.now());
        this.wake();
        return;
      }
      case "input": {
        if (this.page.mode !== "interactive" || this.still) return;
        const now = performance.now();
        const input = message.input;
        if (input.type === "grab") this.camera.grab(now);
        else if (input.type === "drag") this.camera.drag(input.dx, input.dy, now);
        else if (input.type === "release") this.camera.release(now);
        else if (input.type === "zoom") this.camera.zoomBy(input.factor, now);
        else this.camera.reset(now);
        this.wake();
        return;
      }
      case "visible":
        if (message.visible === this.visible) return;
        this.visible = message.visible;
        // Whatever comes next is a first frame, not the continuation of the last one.
        this.lastLive = false;
        // Coming back: draw one frame whatever the mode. Safari can hand back a blank canvas.
        if (this.visible) this.invalidate();
        return;
      case "probe":
        this.post({ type: "probe", id: message.id, ...this.inspect() });
        return;
      case "dispose":
        this.dispose();
        return;
    }
  }

  private setPage(next: PageView): void {
    const from = this.page;
    this.page = next;
    const framing = FRAMINGS[next.framing];
    const tierWaiting = this.plan.waiting !== null;
    const sameView = from.framing === next.framing && from.mode === next.mode;
    if (sameView && !tierWaiting) {
      // Only the layout moved (a resize, a different stage): slide the centre across.
      if (from.shiftX !== next.shiftX || from.shiftY !== next.shiftY) {
        // Not a move to animate, and on Home it must not undo the owner's own view.
        if (this.still) this.beginFade();
        this.camera.shiftX = next.shiftX;
        this.camera.shiftY = next.shiftY;
        this.invalidate();
      }
      return;
    }
    if (this.still || tierWaiting) {
      // A still sky does not travel, and a new tier cannot appear mid-flight: the new view
      // fades in over the old one.
      this.beginFade();
      this.atBoundary();
      this.camera.snap(framing, next.shiftX, next.shiftY);
    } else {
      this.camera.moveTo(framing, MOVE_MS, next.shiftX, next.shiftY);
    }
    this.invalidate();
  }

  /** A mode change or a navigation: the only place a waiting tier is taken. */
  private atBoundary(): void {
    if (this.plan.takeAtBoundary() === null) return;
    this.rebuildGalaxy();
    this.resize();
    this.startProbe();
    this.post({ type: "quality", tier: this.plan.current, still: this.still });
  }

  /** After a change of stillness: nothing may be left half-way. */
  private settle(): void {
    if (!this.still) return;
    this.focusLevel = this.focusTarget;
    this.camera.snap(FRAMINGS[this.page.framing], this.page.shiftX, this.page.shiftY);
    this.player.clear();
  }

  /** The probe has its verdict on Auto's choice. */
  private judge(): void {
    if (this.probe.verdict === "down") {
      // Too heavy here. Nothing changes on screen now; the lower tier waits for a boundary.
      const lower = stepDown(this.plan.current);
      this.plan.request(lower);
      this.post({ type: "suggest", tier: lower });
    } else if (this.probe.verdict === "stop") {
      // A few frames a second: this device cannot afford motion. The sky goes still now,
      // under a cross-fade, because every further frame is taken from the interface.
      this.beginFade();
      this.plan.request("low");
      this.still = true;
      this.player.still = true;
      this.settle();
      this.post({ type: "suggest", tier: "low", still: true });
      this.post({ type: "quality", tier: this.plan.current, still: true });
      this.invalidate();
    }
  }

  private startProbe(): void {
    const judged = this.setting === "auto" && !this.still;
    this.probe = new FrameProbe(TIERS[this.plan.current].frameBudgetMs, judged);
  }

  // ── resources ─────────────────────────────────────────────────────────────

  private readGpu(): void {
    const gl = this.gl;
    let renderer = String(gl.getParameter(gl.RENDERER) ?? "");
    // Some engines answer RENDERER with the real GPU and warn about the extension; the
    // others mask it and need the extension. Ask for the extension only when masked.
    if (/^(webkit webgl|mozilla)?$/i.test(renderer.trim())) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? renderer);
    }
    this.gpuTier = gpuTierFromRenderer(renderer, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
  }

  private build(): void {
    const gl = this.gl;
    this.programs = {
      star: createProgram(gl, STAR_VS, STAR_FS),
      fx: createProgram(gl, FX_VS, FX_FS),
      down: createProgram(gl, QUAD_VS, DOWN_FS),
      blur: createProgram(gl, QUAD_VS, BLUR_FS),
      composite: createProgram(gl, QUAD_VS, COMPOSITE_FS),
      copy: createProgram(gl, QUAD_VS, COPY_FS),
    };
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.black = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    this.maxPointSize = Math.min(256, range?.[1] ?? 64);
    this.hdr = gl.getExtension("EXT_color_buffer_float") !== null;
    this.fxPoints = createPoints(
      gl,
      [
        [this.particles.position, 3],
        [this.particles.color, 4],
        [this.particles.size, 1],
      ],
      gl.DYNAMIC_DRAW,
    );
    this.rebuildGalaxy();
    this.resize();
    gl.disable(gl.DEPTH_TEST);
  }

  private rebuildGalaxy(): void {
    const gl = this.gl;
    for (const p of [this.stars, this.haze, this.knots, this.dust, this.sky]) deletePoints(gl, p);
    const g = generateGalaxy(TIERS[this.plan.current]);
    this.stars = createPoints(gl, [
      [g.stars.orbit, 4],
      [g.stars.props, 4],
    ]);
    this.haze = createPoints(gl, [
      [g.haze.orbit, 4],
      [g.haze.props, 4],
    ]);
    this.knots = createPoints(gl, [
      [g.knots.orbit, 4],
      [g.knots.props, 4],
    ]);
    this.dust = createPoints(gl, [
      [g.dust.orbit, 4],
      [g.dust.props, 4],
    ]);
    this.sky = createPoints(gl, [
      [g.sky.orbit, 4],
      [g.sky.props, 4],
    ]);
    this.galaxy = g;
    this.stage.targets = g.targets;
    this.stage.targetCount = g.targetCount;
    this.captured = false;
  }

  private resize(): void {
    const gl = this.gl;
    const size = bufferSize(
      this.cssWidth,
      this.cssHeight,
      this.dpr,
      TIERS[this.plan.current].maxPixels,
    );
    this.width = size.width;
    this.height = size.height;
    this.scale = size.scale;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    const old = this.targets;
    if (old) for (const t of Object.values(old)) deleteTarget(gl, t);
    const w = size.width;
    const h = size.height;
    const half = (n: number) => Math.max(1, n >> 1);
    const quarter = (n: number) => Math.max(1, n >> 2);
    let scene = createTarget(gl, w, h, this.hdr);
    if (!scene && this.hdr) {
      // The extension is there but the framebuffer is not complete: 8 bits it is.
      this.hdr = false;
      scene = createTarget(gl, w, h, false);
    }
    const make = (tw: number, th: number, hdr: boolean): Target => {
      const t = createTarget(gl, tw, th, hdr);
      if (!t) throw new Error("universe: no render target");
      return t;
    };
    if (!scene) throw new Error("universe: no render target");
    this.targets = {
      scene,
      half: make(half(w), half(h), this.hdr),
      q1: make(quarter(w), quarter(h), this.hdr),
      q2: make(quarter(w), quarter(h), this.hdr),
      cache: make(quarter(w), quarter(h), this.hdr),
      fx: make(w, h, this.hdr),
    };
    this.captured = false;
  }

  private restore(): void {
    if (this.disposed) return;
    this.lost = false;
    this.targets = null;
    this.previous = null;
    this.fadeStart = -1;
    this.stars = this.haze = this.knots = this.dust = this.sky = this.fxPoints = null;
    try {
      this.build();
    } catch {
      this.post({ type: "failed", reason: "restore" });
      return;
    }
    this.invalidate();
  }

  // ── the frame loop ────────────────────────────────────────────────────────

  /** Something on screen is out of date: draw at least one more frame. */
  private invalidate(): void {
    this.captured = false;
    this.dirty = true;
    this.wake();
  }

  private wake(): void {
    if (this.scheduled || this.disposed || !this.visible) return;
    this.scheduled = true;
    this.requestFrame(this.tickBound);
  }

  private get live(): boolean {
    return !this.still;
  }

  private tick(now: number): void {
    this.scheduled = false;
    if (this.disposed || !this.visible) return;
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) {
      // Safari does not always send the restored event to a worker: look again shortly.
      if (!gl.isContextLost() && this.lost) this.restore();
      else {
        this.lost = true;
        setTimeout(() => this.wake(), 500);
      }
      return;
    }
    if (!this.targets) return;
    const began = performance.now();
    const live = this.live;
    const gap = now - this.lastTick;
    // The first frame after a pause is not a long frame. A slow device still gets real
    // time (up to a quarter second a frame), so a camera move takes as long there as anywhere.
    const dt = this.lastLive && live ? clamp(gap / 1000, 0, 0.25) : 0;
    this.lastTick = now;

    // Events first: they add to the core, push the camera and fill the particles.
    const stage = this.stage;
    stage.time = this.time;
    stage.core = 0;
    stage.push = 0;
    this.particles.count = 0;
    const playing = this.player.draw(stage, performance.now()) > 0;
    const hasFx = this.particles.count > 0;

    if (live) {
      if (this.focusLevel !== this.focusTarget) {
        const next = lerp(this.focusLevel, this.focusTarget, 1 - Math.exp(-FOCUS_RATE * dt));
        this.focusLevel = Math.abs(next - this.focusTarget) < 0.002 ? this.focusTarget : next;
      }
      // A focus phase turns the galaxy at half speed.
      this.time += dt * lerp(1, 0.5, this.focusLevel);
    }
    this.camera.push = stage.push;
    this.camera.update(
      dt,
      now,
      this.width,
      this.height,
      this.focusLevel,
      live && this.page.mode === "interactive",
    );
    this.coreBoost = Math.max(0.2, 1 + 0.3 * this.focusLevel + stage.core);

    let drew = true;
    if (live) {
      this.captured = false;
      this.renderGalaxy(true);
      this.bloom(this.targets.scene, this.targets.q1);
      this.lastHadFx = false;
      this.composite(null, false);
    } else {
      const needsCapture = !this.captured;
      if (needsCapture) {
        this.renderGalaxy(false);
        this.bloom(this.targets.scene, this.targets.cache);
        this.captured = true;
      }
      // A still sky is only redrawn when something changed under it.
      if (needsCapture || hasFx || this.lastHadFx || this.dirty || this.fadeStart >= 0 || playing) {
        if (hasFx) this.renderParticles();
        this.lastHadFx = hasFx;
        this.composite(null, true);
      } else drew = false;
    }

    let fading = false;
    if (this.fadeStart >= 0) {
      if (this.fadeStart === 0) this.fadeStart = now;
      const f = (now - this.fadeStart) / FADE_MS;
      if (f >= 1) this.fadeStart = -1;
      else {
        this.drawPrevious(1 - easeInOut(f));
        fading = true;
      }
    }
    this.dirty = false;
    this.lastLive = live;

    if (drew) {
      this.frames++;
      if (live && dt > 0) {
        this.frameMs = this.frameMs === 0 ? gap : this.frameMs * 0.95 + gap * 0.05;
        if (this.probe.frame(gap)) this.judge();
      }
      const work = performance.now() - began;
      this.workMs = this.workMs === 0 ? work : this.workMs * 0.95 + work * 0.05;
      if (!this.announced) {
        this.announced = true;
        this.post({
          type: "ready",
          tier: this.plan.current,
          still: this.still,
          hdr: this.hdr,
          firstFrameMs: performance.now() - this.startedAt,
        });
      }
    }

    if (live || playing || fading || !this.player.idle) this.wake();
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  private drawLayer(
    points: PointBuffer,
    count: number,
    light: number,
    time: number,
    tint: Rgb | null,
    dust: boolean,
  ): void {
    const gl = this.gl;
    const u = this.programs.star.uniforms;
    gl.uniform1f(u.uT ?? null, time);
    gl.uniform1f(u.uBright ?? null, light);
    gl.uniform1f(u.uKind ?? null, tint ? 1 : 0);
    gl.uniform1f(u.uDust ?? null, dust ? 1 : 0);
    if (tint) gl.uniform3f(u.uTint ?? null, tint[0], tint[1], tint[2]);
    gl.bindVertexArray(points.vao);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  private setView(program: Program): void {
    const gl = this.gl;
    const u = program.uniforms;
    gl.useProgram(program.program);
    gl.uniformMatrix4fv(u.uV ?? null, false, this.camera.view);
    gl.uniformMatrix4fv(u.uPr ?? null, false, this.camera.projection);
    gl.uniform2f(u.uShift ?? null, this.camera.shiftX, this.camera.shiftY);
    gl.uniform1f(u.uPx ?? null, this.camera.pxScale);
    // Never smaller than about a CSS pixel and a half, whatever the render scale.
    gl.uniform1f(u.uMinPx ?? null, 1.6 * this.scale);
    gl.uniform1f(u.uMaxPx ?? null, this.maxPointSize);
  }

  /** The galaxy into the scene target: additive light, then dust that takes light away. */
  private renderGalaxy(withParticles: boolean): void {
    const gl = this.gl;
    const g = this.galaxy;
    const t = this.targets;
    if (!g || !t || !this.stars || !this.haze || !this.knots || !this.dust || !this.sky) return;
    const tier = TIERS[this.plan.current];
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const star = this.programs.star;
    this.setView(star);
    gl.uniform3f(
      star.uniforms.uYoung ?? null,
      PALETTE.young[0],
      PALETTE.young[1],
      PALETTE.young[2],
    );
    gl.uniform3f(star.uniforms.uDisk ?? null, PALETTE.disk[0], PALETTE.disk[1], PALETTE.disk[2]);
    gl.uniform3f(
      star.uniforms.uBulge ?? null,
      PALETTE.bulge[0],
      PALETTE.bulge[1],
      PALETTE.bulge[2],
    );
    this.drawLayer(this.sky, g.sky.count, 0.5, 0, null, false);
    this.drawLayer(
      this.haze,
      g.haze.count,
      0.03 * Math.sqrt(22_000 / g.haze.count),
      this.time,
      null,
      false,
    );
    this.drawLayer(this.stars, g.stars.count, tier.starLight, this.time, null, false);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    this.drawLayer(this.dust, g.dust.count, PALETTE.dust * 0.5, this.time, BLACK, true);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.drawLayer(this.knots, g.knots.count, 0.13, this.time, PALETTE.hii, false);
    if (withParticles) this.drawParticles();
    gl.disable(gl.BLEND);
  }

  private drawParticles(): void {
    const gl = this.gl;
    const n = this.particles.count;
    const points = this.fxPoints;
    if (n === 0 || !points) return;
    this.setView(this.programs.fx);
    gl.bindVertexArray(points.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, points.buffers[0] ?? null);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles.position, 0, n * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, points.buffers[1] ?? null);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles.color, 0, n * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, points.buffers[2] ?? null);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles.size, 0, n);
    gl.drawArrays(gl.POINTS, 0, n);
  }

  /** The particles alone, over a still sky, with their own bloom. */
  private renderParticles(): void {
    const gl = this.gl;
    const t = this.targets;
    if (!t) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fx.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.drawParticles();
    gl.disable(gl.BLEND);
    this.bloom(t.fx, t.q1);
  }

  private pass(program: Program, target: Target | null, source: WebGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, target ? target.width : this.width, target ? target.height : this.height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(program.uniforms.uSrc ?? null, 0);
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Half → quarter downsample, then a separable blur, ending in `into`. */
  private bloom(source: Target, into: Target): void {
    const t = this.targets;
    if (!t || !TIERS[this.plan.current].bloom) return;
    const gl = this.gl;
    const { down, blur } = this.programs;
    this.pass(down, t.half, source.texture);
    gl.uniform2f(down.uniforms.uTx ?? null, 1 / source.width, 1 / source.height);
    gl.uniform1f(down.uniforms.uThr ?? null, this.hdr ? 0.9 : 0.6);
    this.drawQuad();
    this.pass(down, t.q1, t.half.texture);
    gl.uniform2f(down.uniforms.uTx ?? null, 1 / t.half.width, 1 / t.half.height);
    gl.uniform1f(down.uniforms.uThr ?? null, 0);
    this.drawQuad();
    this.pass(blur, t.q2, t.q1.texture);
    gl.uniform2f(blur.uniforms.uDir ?? null, 1 / t.q1.width, 0);
    this.drawQuad();
    this.pass(blur, into, t.q2.texture);
    gl.uniform2f(blur.uniforms.uDir ?? null, 0, 1 / t.q1.height);
    this.drawQuad();
  }

  /**
   * The finished frame, to the screen or into a target. `frozen` reads the galaxy's cached
   * bloom and, when an event is playing, its particles; a live frame has them in the scene.
   */
  private composite(into: Target | null, frozen: boolean): void {
    const gl = this.gl;
    const t = this.targets;
    if (!t) return;
    const program = this.programs.composite;
    const u = program.uniforms;
    const bloom = TIERS[this.plan.current].bloom;
    const fx = frozen && this.lastHadFx;
    this.pass(program, into, t.scene.texture);
    gl.uniform1i(u.uScene ?? null, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom ? (frozen ? t.cache.texture : t.q1.texture) : this.black);
    gl.uniform1i(u.uBloom ?? null, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fx ? t.fx.texture : this.black);
    gl.uniform1i(u.uFx ?? null, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, fx && bloom ? t.q1.texture : this.black);
    gl.uniform1i(u.uFxBloom ?? null, 3);

    // Where the galaxy's centre is on screen, for the analytic core glow.
    const view = this.camera.view;
    const pr = this.camera.projection;
    const vz = -(view[14] ?? -1);
    const cx = ((pr[0] ?? 1) * (view[12] ?? 0)) / vz + this.camera.shiftX;
    const cy = ((pr[5] ?? 1) * (view[13] ?? 0)) / vz + this.camera.shiftY;
    gl.uniform2f(u.uCore ?? null, cx * 0.5 + 0.5, cy * 0.5 + 0.5);
    gl.uniform2f(u.uRes ?? null, this.width, this.height);
    gl.uniform1f(u.uCoreR ?? null, (this.camera.pxScale * 0.32) / Math.max(0.3, vz));
    gl.uniform1f(u.uCoreB ?? null, 0.45 * this.coreBoost);
    gl.uniform3f(u.uCoreC ?? null, PALETTE.core[0], PALETTE.core[1], PALETTE.core[2]);
    gl.uniform3f(u.uBg ?? null, PALETTE.bg[0], PALETTE.bg[1], PALETTE.bg[2]);
    // Without bloom the stars lose their glow; a touch more exposure keeps the galaxy present.
    gl.uniform1f(u.uExp ?? null, this.camera.exposure * (bloom ? 1 : 1.15));
    gl.uniform1f(u.uBl ?? null, bloom ? 0.85 : 0);
    this.drawQuad();
  }

  /** Keeps what is on screen now as the outgoing side of a cross-fade. */
  private beginFade(): void {
    if (!this.targets || !this.announced || this.lost) return;
    if (
      !this.previous ||
      this.previous.width !== this.width ||
      this.previous.height !== this.height
    ) {
      deleteTarget(this.gl, this.previous);
      this.previous = createTarget(this.gl, this.width, this.height, false);
    }
    if (!this.previous) return;
    this.composite(this.previous, !this.lastLive);
    // Stamped on the first frame that draws it, so a slow rebuild does not eat the fade.
    this.fadeStart = 0;
  }

  private drawPrevious(alpha: number): void {
    const gl = this.gl;
    if (!this.previous) return;
    const copy = this.programs.copy;
    this.pass(copy, null, this.previous.texture);
    gl.uniform1f(copy.uniforms.uAlpha ?? null, alpha);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad();
    gl.disable(gl.BLEND);
  }

  // ── inspection (tests and the PR's measurements) ──────────────────────────

  private inspect(): ProbeResult {
    const gl = this.gl;
    let lit = 0;
    if (this.targets && !this.lost && !gl.isContextLost()) {
      // Redraw what is on screen and read it back in the same task: the only reliable way
      // to see a canvas whose buffer lives in a worker.
      this.composite(null, !this.lastLive);
      const view = this.camera.view;
      const pr = this.camera.projection;
      const vz = -(view[14] ?? -1);
      const cx = (((pr[0] ?? 1) * (view[12] ?? 0)) / vz + this.camera.shiftX) * 0.5 + 0.5;
      const cy = (((pr[5] ?? 1) * (view[13] ?? 0)) / vz + this.camera.shiftY) * 0.5 + 0.5;
      const x = clamp(Math.round(cx * this.width) - 16, 0, Math.max(0, this.width - 32));
      const y = clamp(Math.round(cy * this.height) - 16, 0, Math.max(0, this.height - 32));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(x, y, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, this.sample);
      for (let i = 0; i < this.sample.length; i += 4) {
        if ((this.sample[i] ?? 0) + (this.sample[i + 1] ?? 0) + (this.sample[i + 2] ?? 0) > 48)
          lit++;
      }
      // The read consumed the frame: put it back for the compositor.
      this.composite(null, !this.lastLive);
    }
    return {
      frames: this.frames,
      state: runState({
        visible: this.visible,
        still: this.still,
        playing: !this.player.idle,
      }),
      framing: this.page.framing,
      judged: this.probe.verdict !== "pending",
      pending: this.scheduled,
      software: this.gpuTier === 0,
      tier: this.plan.current,
      still: this.still,
      effects: this.player.effects().length,
      lit,
      frameMs: this.frameMs,
      workMs: this.workMs,
    };
  }

  /** The tier on screen, for the host's bookkeeping. */
  get tier(): QualityTier {
    return this.plan.current;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
