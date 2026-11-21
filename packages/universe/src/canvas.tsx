"use client";

import { advance, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo } from "react";
import type { PerspectiveCamera } from "three";
import { useStore } from "zustand";
import { FrameGovernor, stepDown, TIERS, type TierProfile } from "./quality.ts";
import { UniverseScene } from "./scene-core.ts";
import { cameraInput, sceneSignals, universeStore } from "./store.ts";

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
      // Step-down decisions use the browser's own frame cadence, not our throttle.
      if (lastTick && governor.frame(now - lastTick, now)) {
        universeStore.setState({ tier: stepDown(s.tier) });
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
  if (!profile.webgl) return null;
  return (
    <Canvas
      key={tier}
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
