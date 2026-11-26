/**
 * The messages between the host (main thread) and the engine. The engine runs in a worker
 * when the browser can give a worker a WebGL2 canvas, and on the main thread behind this
 * same interface when it cannot.
 */
import type { CosmicEvent } from "./bus.ts";
import type { PageMode, RunState } from "./modes.ts";
import type { FramingName } from "./renderer/camera.ts";
import type { DeviceSignals, QualitySetting, QualityTier } from "./renderer/quality.ts";
import type { StageInput } from "./state.ts";

export interface PageView {
  mode: PageMode;
  framing: FramingName;
  /** Where the galaxy's centre sits, in clip space. */
  shiftX: number;
  shiftY: number;
}

/** Everything about the device except the GPU, which the engine reads from its own context. */
export type HostSignals = Omit<DeviceSignals, "gpuTier">;

export type ToEngine =
  | {
      type: "init";
      canvas: OffscreenCanvas | HTMLCanvasElement;
      width: number;
      height: number;
      dpr: number;
      setting: QualitySetting;
      signals: HostSignals;
      page: PageView;
      focusing: boolean;
      visible: boolean;
    }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "page"; page: PageView }
  | { type: "quality"; setting: QualitySetting; signals: HostSignals }
  | { type: "focus"; active: boolean }
  /** `u`, `v`: the tapped control as a share of the viewport, when there is one. */
  | { type: "event"; event: CosmicEvent; u?: number; v?: number }
  | { type: "input"; input: StageInput }
  | { type: "visible"; visible: boolean }
  | { type: "probe"; id: number }
  | { type: "dispose" };

export interface EngineInfo {
  tier: QualityTier;
  still: boolean;
  /** Half-float scene target, or the 8-bit fallback. */
  hdr: boolean;
  /** Milliseconds from `init` to the first presented frame. */
  firstFrameMs: number;
}

export interface ProbeResult {
  /** Frames presented since the engine started. */
  frames: number;
  /** What the engine is doing right now. */
  state: RunState;
  tier: QualityTier;
  still: boolean;
  /** The framing of the page the engine was last told about. */
  framing: FramingName;
  /** A frame has been requested and not drawn yet. False when the sky is still and at rest. */
  pending: boolean;
  /** WebGL is drawn on the CPU here: timings say nothing about a real device. */
  software: boolean;
  /** Effects playing or waiting. */
  effects: number;
  /** Of 1024 pixels sampled around the galaxy's centre, how many are not black. */
  lit: number;
  /** Average frame time of the last live stretch, ms (0 when unknown). */
  frameMs: number;
  /** Average time the engine spent building a frame, ms. */
  workMs: number;
}

export type FromEngine =
  | ({ type: "ready" } & EngineInfo)
  | { type: "quality"; tier: QualityTier; still: boolean }
  /** Auto found this tier too heavy here: remember the lower one for next time. */
  | { type: "suggest"; tier: QualityTier }
  | ({ type: "probe"; id: number } & ProbeResult)
  | { type: "failed"; reason: string };
