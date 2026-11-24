"use client";

import { advance, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useState } from "react";
import type { PerspectiveCamera } from "three";
import { useStore } from "zustand";
import { FrameGovernor, stepDown, TIERS, type TierProfile } from "./quality.ts";
import { UniverseScene } from "./scene-core.ts";
import { cameraInput, diagnostics, rememberTierCap, sceneSignals, universeStore } from "./store.ts";

/** Seconds between the last two rendered frames, shared with the scene. */
let frameDt = 0;

function Scene({ profile }: { profile: TierProfile }) {
  const scene = useMemo(() => new UniverseScene(profile), [profile]);

  useEffect(() => {
    const apply = () => {
      const { snapshot } = universeStore.getState();
      if (snapshot) scene.setSnapshot(snapshot);
    };
    apply();
    // Snapshot changes reach the scene here, not through React props.
    let last = universeStore.getState().snapshot;
    const unsubscribe = universeStore.subscribe((s) => {
      if (s.snapshot !== last) {
        last = s.snapshot;
        apply();
      }
    });
    return () => {
      unsubscribe();
      scene.dispose();
    };
  }, [scene]);

  useFrame((state) => {
    const { reducedMotion } = universeStore.getState();
    scene.update(
      state.camera as PerspectiveCamera,
      state.size.width,
      state.size.height,
      state.viewport.dpr,
      frameDt,
      !reducedMotion,
    );
  });

  return <primitive object={scene.root} />;
}

/**
 * The render loop. `frameloop="never"` hands scheduling to us: frames are
 * skipped when the tab is hidden or the scene is paused, throttled when idle,
 * and measured so the tier can step down if the device cannot keep up.
 */
function Loop({ profile }: { profile: TierProfile }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  // Read-only renderer statistics for diagnostics and the memory sweep.
  useEffect(() => {
    diagnostics.info = () => ({
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      calls: gl.info.render.calls,
    });
    return () => {
      diagnostics.info = null;
    };
  }, [gl]);
  useEffect(() => {
    const governor = new FrameGovernor(profile.frameBudgetMs);
    let raf = 0;
    let lastRender = 0;
    let lastTick = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = universeStore.getState();
      if (document.hidden || s.paused || s.mode === "off") {
        lastRender = 0;
        lastTick = now;
        return;
      }
      // The interface has the floor (scrolling, typing, a sheet moving): hold this frame.
      // Frames skipped here say nothing about what the device can do, so the governor
      // does not see them either.
      if (now < sceneSignals.yieldUntil && !cameraInput.dragging) {
        lastTick = 0;
        return;
      }
      // Step-down decisions use the browser's own frame cadence, not our throttle. They
      // apply to Auto only: a tier the owner chose in Settings is theirs to keep.
      if (s.setting === "auto" && lastTick && governor.frame(now - lastTick, now)) {
        const lower = stepDown(s.tier);
        rememberTierCap(lower);
        universeStore.setState({ tier: lower });
      }
      lastTick = now;

      const t = sceneSignals.now;
      const busy =
        cameraInput.dragging ||
        cameraInput.idle < 2.5 ||
        (sceneSignals.flashAt >= 0 && t - sceneSignals.flashAt < 3.5) ||
        (sceneSignals.warpAt >= 0 && t - sceneSignals.warpAt < 2) ||
        !s.ready;
      const fps = s.reducedMotion ? 8 : busy ? profile.activeFps : profile.idleFps;
      const interval = 1000 / fps;
      if (lastRender && now - lastRender < interval - 2) return;
      frameDt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 0.016;
      lastRender = now;
      sceneSignals.now += frameDt;
      advance(now / 1000);
      if (!s.ready) universeStore.setState({ ready: true });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [profile, invalidate]);
  return null;
}

/**
 * The persistent universe. Mounted once in the root layout and never remounted
 * on navigation; it re-renders in React only when the quality tier changes.
 */
export default function UniverseCanvas() {
  const tier = useStore(universeStore, (s) => s.tier);
  const profile = TIERS[tier];
  // iOS takes the WebGL context away from a backgrounded app and does not always give it
  // back. When that happens the scene is rebuilt on a fresh context instead of leaving
  // an empty sky behind; the CSS starfield shows through in between.
  const [epoch, setEpoch] = useState(0);
  if (!profile.webgl) return null;
  return (
    <Canvas
      key={`${tier}:${epoch}`}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener("webglcontextlost", (e) => {
          // A canvas that was replaced (a tier change, an earlier rebuild) loses its context
          // when it is disposed. That is not a loss to recover from: rebuilding here would
          // dispose the current canvas in turn, and so on without end.
          if (!canvas.isConnected) return;
          e.preventDefault();
          universeStore.setState({ ready: false });
          // Rebuild once the page is in front again; nothing can be drawn before that.
          const rebuild = () => {
            if (document.hidden) return;
            document.removeEventListener("visibilitychange", rebuild);
            if (canvas.isConnected) setEpoch((n) => n + 1);
          };
          if (document.hidden) document.addEventListener("visibilitychange", rebuild);
          else setTimeout(rebuild, 400);
        });
      }}
      frameloop="never"
      dpr={[1, profile.maxDpr]}
      gl={{
        antialias: !profile.bloom,
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 50, near: 0.05, far: 80, position: [0, 1.4, 3] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden="true"
      data-universe="3d"
      data-tier={tier}
    >
      <Scene profile={profile} />
      {profile.bloom && (
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            intensity={0.85}
            luminanceThreshold={0.18}
            luminanceSmoothing={0.3}
            radius={0.72}
          />
        </EffectComposer>
      )}
      <Loop profile={profile} />
    </Canvas>
  );
}
