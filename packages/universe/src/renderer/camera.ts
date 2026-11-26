/**
 * The orbit camera: framing presets per page, eased moves between them, and on Home the
 * owner's own drag (with inertia), zoom and reset. Pure state and maths, no GL.
 */
import { clamp, easeInOut, lerp, lookAtOrigin, perspective } from "./math.ts";

export const FOV = 0.9;
const NEAR = 0.02;
const FAR = 60;
const PITCH_MIN = 0.08;
const PITCH_MAX = 1.45;
const ZOOM_MIN = 0.42;
const ZOOM_MAX = 4;
/** Per-second decay of the spin left after a drag. */
const INERTIA_DECAY = 5;
const AUTO_ORBIT_AFTER_MS = 4000;
const AUTO_ORBIT_SPEED = 0.025;
const HOME_YAW = 0.6;

export type FramingName = "home" | "focus" | "page";

export interface Framing {
  /** Radians above the galactic plane. */
  pitch: number;
  /** Share of the viewport's short side the galaxy's diameter fills. */
  fill: number;
  exposure: number;
}

export const FRAMINGS: Record<FramingName, Framing> = {
  // About 35° above the plane, the galaxy across 85% of the short side.
  home: { pitch: 0.61, fill: 0.85, exposure: 1 },
  // Closer and lower: a more dramatic angle for the timer.
  focus: { pitch: 0.36, fill: 1.15, exposure: 0.72 },
  // Behind content: wide and slightly dimmer.
  page: { pitch: 0.74, fill: 0.78, exposure: 0.62 },
};

/** How much closer the camera sits while a focus phase runs. */
const FOCUS_DOLLY = 0.82;

export class Camera {
  yaw = HOME_YAW;
  pitch = FRAMINGS.home.pitch;
  fill = FRAMINGS.home.fill;
  exposure = FRAMINGS.home.exposure;
  /** The owner's zoom on Home; 1 is the framing as designed, larger is closer. */
  zoom = 1;
  /** Where the galaxy's centre sits, in clip space (0, 0 = the middle of the viewport). */
  shiftX = 0;
  shiftY = 0;
  /** Extra push-in from an event (the focus wave), 0…1, eased by the effect itself. */
  push = 0;

  readonly view = new Float32Array(16);
  readonly projection = new Float32Array(16);
  /** Right, up and back axes of the camera in world space. */
  readonly axes = new Float32Array(9);
  readonly eye = new Float32Array(3);
  /** Pixels per world unit at distance 1. */
  pxScale = 1;
  distance = 2.4;
  aspect = 1;

  private spinYaw = 0;
  private spinPitch = 0;
  private held = false;
  private lastInputAt = -Infinity;
  private lastDragAt = 0;
  private move: {
    t: number;
    duration: number;
    yaw0: number;
    yaw1: number;
    pitch0: number;
    pitch1: number;
    fill0: number;
    fill1: number;
    exposure0: number;
    exposure1: number;
    zoom0: number;
    zoom1: number;
    shiftX0: number;
    shiftX1: number;
    shiftY0: number;
    shiftY1: number;
  } | null = null;

  /** Jump to a framing with no animation. */
  snap(framing: Framing, shiftX = 0, shiftY = 0): void {
    this.move = null;
    this.pitch = framing.pitch;
    this.fill = framing.fill;
    this.exposure = framing.exposure;
    this.zoom = 1;
    this.shiftX = shiftX;
    this.shiftY = shiftY;
    this.spinYaw = this.spinPitch = 0;
  }

  /** Ease to a framing. The yaw stays where it is unless one is given. */
  moveTo(framing: Framing, durationMs: number, shiftX = 0, shiftY = 0, yaw = this.yaw): void {
    if (durationMs <= 0) {
      this.snap(framing, shiftX, shiftY);
      this.yaw = yaw;
      return;
    }
    this.spinYaw = this.spinPitch = 0;
    this.move = {
      t: 0,
      duration: durationMs / 1000,
      yaw0: this.yaw,
      yaw1: yaw,
      pitch0: this.pitch,
      pitch1: framing.pitch,
      fill0: this.fill,
      fill1: framing.fill,
      exposure0: this.exposure,
      exposure1: framing.exposure,
      zoom0: this.zoom,
      zoom1: 1,
      shiftX0: this.shiftX,
      shiftX1: shiftX,
      shiftY0: this.shiftY,
      shiftY1: shiftY,
    };
  }

  /** Double tap on Home: back to the designed view, the short way round. */
  reset(nowMs: number): void {
    const turns = Math.round((this.yaw - HOME_YAW) / (Math.PI * 2));
    this.moveTo(FRAMINGS.home, 700, this.shiftX, this.shiftY, HOME_YAW + turns * Math.PI * 2);
    this.lastInputAt = nowMs;
  }

  grab(nowMs: number): void {
    // The owner's hand always wins over a move in progress.
    this.move = null;
    this.held = true;
    this.spinYaw = this.spinPitch = 0;
    this.lastInputAt = this.lastDragAt = nowMs;
  }

  drag(dxPx: number, dyPx: number, nowMs: number): void {
    this.move = null;
    const dYaw = -dxPx * 0.005;
    const dPitch = dyPx * 0.004;
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, PITCH_MIN, PITCH_MAX);
    const dt = Math.max(1 / 240, (nowMs - this.lastDragAt) / 1000);
    // Smoothed, so one jittery sample at release does not fling the view.
    this.spinYaw = lerp(this.spinYaw, clamp(dYaw / dt, -6, 6), 0.5);
    this.spinPitch = lerp(this.spinPitch, clamp(dPitch / dt, -4, 4), 0.5);
    this.lastInputAt = this.lastDragAt = nowMs;
  }

  release(nowMs: number): void {
    this.held = false;
    // A finger that rested before lifting leaves no spin.
    if (nowMs - this.lastDragAt > 90) this.spinYaw = this.spinPitch = 0;
    this.lastInputAt = nowMs;
  }

  zoomBy(factor: number, nowMs: number): void {
    this.move = null;
    this.zoom = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.lastInputAt = nowMs;
  }

  /** True while the camera is still changing by itself (a move or leftover spin). */
  get busy(): boolean {
    return this.move !== null || Math.abs(this.spinYaw) > 1e-3 || Math.abs(this.spinPitch) > 1e-3;
  }

  /**
   * Advances the camera and rebuilds its matrices. `focus` is 0…1, how far into a focus
   * phase the scene is; `autoOrbit` lets the view drift once the owner has been idle a while.
   */
  update(
    dt: number,
    nowMs: number,
    width: number,
    height: number,
    focus: number,
    autoOrbit: boolean,
  ): void {
    const m = this.move;
    if (m) {
      m.t = Math.min(1, m.t + dt / m.duration);
      const e = easeInOut(m.t);
      this.yaw = lerp(m.yaw0, m.yaw1, e);
      this.pitch = lerp(m.pitch0, m.pitch1, e);
      this.fill = lerp(m.fill0, m.fill1, e);
      this.exposure = lerp(m.exposure0, m.exposure1, e);
      this.zoom = lerp(m.zoom0, m.zoom1, e);
      this.shiftX = lerp(m.shiftX0, m.shiftX1, e);
      this.shiftY = lerp(m.shiftY0, m.shiftY1, e);
      if (m.t >= 1) this.move = null;
    } else if (!this.held) {
      if (this.spinYaw !== 0 || this.spinPitch !== 0) {
        this.yaw += this.spinYaw * dt;
        this.pitch = clamp(this.pitch + this.spinPitch * dt, PITCH_MIN, PITCH_MAX);
        const decay = Math.exp(-INERTIA_DECAY * dt);
        this.spinYaw *= decay;
        this.spinPitch *= decay;
        if (Math.abs(this.spinYaw) < 1e-3) this.spinYaw = 0;
        if (Math.abs(this.spinPitch) < 1e-3) this.spinPitch = 0;
      }
      if (autoOrbit && nowMs - this.lastInputAt > AUTO_ORBIT_AFTER_MS)
        this.yaw += dt * AUTO_ORBIT_SPEED;
    }

    const short = Math.min(width, height);
    const tan = Math.tan(FOV / 2);
    const fit = height / (tan * this.fill * Math.max(1, short));
    this.distance =
      (fit / this.zoom) * lerp(1, FOCUS_DOLLY, clamp(focus, 0, 1)) * (1 - 0.22 * this.push);
    this.aspect = width / Math.max(1, height);
    const d = this.distance;
    const cp = Math.cos(this.pitch);
    this.eye[0] = cp * Math.sin(this.yaw) * d;
    this.eye[1] = Math.sin(this.pitch) * d;
    this.eye[2] = cp * Math.cos(this.yaw) * d;
    lookAtOrigin(this.view, this.axes, this.eye[0], this.eye[1], this.eye[2]);
    perspective(this.projection, FOV, this.aspect, NEAR, FAR);
    this.pxScale = height / 2 / tan;
  }

  /**
   * The world point `depth` in front of the camera that appears at a viewport position
   * (0…1 from the top left), into `out`. Events use it to start where the owner tapped.
   */
  unproject(u: number, v: number, depth: number, out: Float32Array | number[]): void {
    const tan = Math.tan(FOV / 2);
    // Undo the lens shift first: it moved everything by (shiftX, shiftY) in clip space.
    const nx = u * 2 - 1 - this.shiftX;
    const ny = 1 - v * 2 - this.shiftY;
    let dx = nx * tan * this.aspect;
    let dy = ny * tan;
    let dz = -1;
    const l = Math.hypot(dx, dy, dz);
    dx /= l;
    dy /= l;
    dz /= l;
    const a = this.axes;
    out[0] = this.eye[0]! + (a[0]! * dx + a[3]! * dy + a[6]! * dz) * depth;
    out[1] = this.eye[1]! + (a[1]! * dx + a[4]! * dy + a[7]! * dz) * depth;
    out[2] = this.eye[2]! + (a[2]! * dx + a[5]! * dy + a[8]! * dz) * depth;
  }
}
