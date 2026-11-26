import { describe, expect, it } from "vitest";
import { Camera, FOV, FRAMINGS } from "@stellar/universe/renderer/camera";

/** Projects a world point to the viewport (0…1 from the top left), like the vertex shader. */
function project(camera: Camera, p: number[]): { u: number; v: number } {
  const v = camera.view;
  const pr = camera.projection;
  const x = v[0]! * p[0]! + v[4]! * p[1]! + v[8]! * p[2]! + v[12]!;
  const y = v[1]! * p[0]! + v[5]! * p[1]! + v[9]! * p[2]! + v[13]!;
  const z = v[2]! * p[0]! + v[6]! * p[1]! + v[10]! * p[2]! + v[14]!;
  const w = -z;
  return {
    u: ((pr[0]! * x) / w + camera.shiftX) * 0.5 + 0.5,
    v: 0.5 - ((pr[5]! * y) / w + camera.shiftY) * 0.5,
  };
}

const settle = (camera: Camera, w: number, h: number, seconds = 2) => {
  for (let t = 0; t < seconds * 60; t++) camera.update(1 / 60, t * 16.7, w, h, 0, false);
};

describe("camera framing", () => {
  it("fits the galaxy's diameter to 85% of the short side on Home, on any screen", () => {
    for (const [w, h] of [
      [1440, 900],
      [393, 852],
      [852, 393],
    ] as const) {
      const camera = new Camera();
      camera.snap(FRAMINGS.home);
      camera.update(0, 0, w, h, 0, false);
      // A galaxy of radius 1 is 2 · pxScale / distance pixels wide.
      const diameter = (2 * camera.pxScale) / camera.distance;
      expect(diameter / Math.min(w, h)).toBeCloseTo(0.85, 2);
      expect(camera.pitch).toBeCloseTo((35 * Math.PI) / 180, 1);
    }
  });

  it("sits closer and lower on Focus, and wider and dimmer behind other pages", () => {
    expect(FRAMINGS.focus.fill).toBeGreaterThan(FRAMINGS.home.fill);
    expect(FRAMINGS.focus.pitch).toBeLessThan(FRAMINGS.home.pitch);
    expect(FRAMINGS.page.fill).toBeLessThan(FRAMINGS.home.fill);
    expect(FRAMINGS.page.exposure).toBeLessThan(FRAMINGS.home.exposure);
  });

  it("puts the galaxy's centre where the layout asks", () => {
    const camera = new Camera();
    camera.snap(FRAMINGS.home, 0.3, -0.2);
    camera.update(0, 0, 1280, 800, 0, false);
    const centre = project(camera, [0, 0, 0]);
    expect(centre.u).toBeCloseTo(0.65, 4);
    expect(centre.v).toBeCloseTo(0.6, 4);
  });

  it("unprojects a screen position to the point that appears there", () => {
    const camera = new Camera();
    camera.snap(FRAMINGS.home, 0.2, 0.1);
    camera.yaw = 1.3;
    camera.update(0, 0, 1280, 800, 0, false);
    const world = [0, 0, 0];
    for (const [u, v] of [
      [0.5, 0.5],
      [0.1, 0.9],
      [0.8, 0.2],
    ] as const) {
      camera.unproject(u, v, 0.6, world);
      const back = project(camera, world);
      expect(back.u).toBeCloseTo(u, 4);
      expect(back.v).toBeCloseTo(v, 4);
    }
    expect(FOV).toBeGreaterThan(0);
  });

  it("eases between framings and is interrupted by the owner's hand", () => {
    const camera = new Camera();
    camera.snap(FRAMINGS.page);
    camera.moveTo(FRAMINGS.home, 700);
    expect(camera.busy).toBe(true);
    camera.update(0.35, 0, 1280, 800, 0, false);
    expect(camera.fill).toBeGreaterThan(FRAMINGS.page.fill);
    expect(camera.fill).toBeLessThan(FRAMINGS.home.fill);
    camera.grab(400);
    const held = camera.fill;
    camera.update(0.5, 900, 1280, 800, 0, false);
    expect(camera.fill).toBe(held);
    expect(camera.busy).toBe(false);
  });

  it("finishes a move exactly on the framing", () => {
    const camera = new Camera();
    camera.snap(FRAMINGS.page);
    camera.moveTo(FRAMINGS.focus, 700, 0.1, 0);
    settle(camera, 1280, 800);
    expect(camera.busy).toBe(false);
    expect(camera.pitch).toBe(FRAMINGS.focus.pitch);
    expect(camera.fill).toBe(FRAMINGS.focus.fill);
    expect(camera.exposure).toBe(FRAMINGS.focus.exposure);
    expect(camera.shiftX).toBe(0.1);
  });
});

describe("camera input", () => {
  it("orbits with the drag, within its pitch limits", () => {
    const camera = new Camera();
    const yaw = camera.yaw;
    camera.grab(0);
    camera.drag(100, 0, 16);
    expect(camera.yaw).toBeCloseTo(yaw - 0.5, 5);
    camera.drag(0, 5000, 32);
    expect(camera.pitch).toBeLessThanOrEqual(1.45);
    camera.drag(0, -50_000, 48);
    expect(camera.pitch).toBeGreaterThanOrEqual(0.08);
  });

  it("keeps turning after a flick and comes to rest", () => {
    const camera = new Camera();
    camera.grab(0);
    camera.drag(40, 0, 16);
    camera.drag(40, 0, 32);
    camera.release(40);
    const before = camera.yaw;
    camera.update(1 / 60, 56, 1280, 800, 0, false);
    expect(camera.yaw).toBeLessThan(before);
    expect(camera.busy).toBe(true);
    settle(camera, 1280, 800, 4);
    expect(camera.busy).toBe(false);
  });

  it("does not spin when the finger rested before lifting", () => {
    const camera = new Camera();
    camera.grab(0);
    camera.drag(40, 0, 16);
    camera.release(400);
    expect(camera.busy).toBe(false);
  });

  it("zooms within limits and returns to the designed view on reset", () => {
    const camera = new Camera();
    camera.update(0, 0, 1280, 800, 0, false);
    const designed = camera.distance;
    for (let i = 0; i < 80; i++) camera.zoomBy(1.2, i);
    camera.update(0, 100, 1280, 800, 0, false);
    expect(camera.distance).toBeCloseTo(designed / 4, 4);
    for (let i = 0; i < 80; i++) camera.zoomBy(0.8, 200 + i);
    camera.update(0, 300, 1280, 800, 0, false);
    expect(camera.distance).toBeCloseTo(designed / 0.42, 4);
    camera.yaw += 7;
    camera.reset(400);
    settle(camera, 1280, 800);
    expect(camera.zoom).toBe(1);
    expect(camera.distance).toBeCloseTo(designed, 4);
    // The short way round: one full turn away from the designed yaw, not back through it.
    expect(Math.cos(camera.yaw - 0.6)).toBeCloseTo(1, 5);
  });

  it("drifts by itself only after four idle seconds, and only when allowed", () => {
    const camera = new Camera();
    camera.grab(0);
    camera.release(0);
    const yaw = camera.yaw;
    camera.update(0.1, 3000, 1280, 800, 0, true);
    expect(camera.yaw).toBe(yaw);
    camera.update(0.1, 4100, 1280, 800, 0, true);
    expect(camera.yaw).toBeGreaterThan(yaw);
    const drifted = camera.yaw;
    camera.update(0.1, 9000, 1280, 800, 0, false);
    expect(camera.yaw).toBe(drifted);
  });

  it("moves closer while a focus phase runs", () => {
    const camera = new Camera();
    camera.update(0, 0, 1280, 800, 0, false);
    const idle = camera.distance;
    camera.update(0, 0, 1280, 800, 1, false);
    expect(camera.distance).toBeLessThan(idle);
    expect(camera.distance).toBeGreaterThan(idle * 0.7);
  });
});
