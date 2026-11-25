"use client";

import { useEffect, useRef } from "react";
import { type CosmicEvent, onCosmic } from "./bus.ts";
import { type Effect, EventDirector } from "./director.ts";
import { OverlayRenderer } from "./overlay.ts";
import { sceneSignals, universeStore } from "./store.ts";

/** Tells the 3D scene about moments it should react to (a flaring star, a core flash, a warp burst). */
function signal(event: CosmicEvent | Effect): void {
  const t = sceneSignals.now;
  switch (event.type) {
    case "focus_start":
      sceneSignals.warpAt = t;
      break;
    case "focus_complete":
      sceneSignals.flashAt = t;
      sceneSignals.flashStrength = 0.9;
      break;
    case "goal_list_completed":
      sceneSignals.flashAt = t;
      sceneSignals.flashStrength = 0.35;
      break;
    default:
      break;
  }
}

/**
 * The EventDirector's stage: a full-screen canvas above the interface with
 * pointer events off. It animates only while an effect is alive.
 */
export function EventOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: OverlayRenderer;
    try {
      renderer = new OverlayRenderer(canvas);
    } catch {
      return;
    }
    const director = new EventDirector();
    let raf = 0;

    const isReduced = () => {
      const s = universeStore.getState();
      return s.reducedMotion || s.tier === "minimal";
    };

    const frame = () => {
      const now = performance.now();
      for (const started of director.tick(now)) signal(started);
      renderer.draw(director.effects(), now, director.reduced);
      if (director.idle) {
        renderer.clear();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const off = onCosmic((event) => {
      director.reduced = isReduced();
      if (event.type === "task_completed" && event.id) sceneSignals.ignite.push(event.id);
      if (event.type === "streak_rekindled") sceneSignals.rekindle.push(event.routineId);
      // Nothing drains these on the Minimal tier (no 3D scene): keep only the latest few.
      if (sceneSignals.ignite.length > 64)
        sceneSignals.ignite.splice(0, sceneSignals.ignite.length - 64);
      if (sceneSignals.rekindle.length > 64)
        sceneSignals.rekindle.splice(0, sceneSignals.rekindle.length - 64);
      const decision = director.push(event, performance.now());
      if (decision.action === "start") signal(event);
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    });

    const onResize = () => renderer.resize();
    const onVisible = () => {
      if (!document.hidden && !director.idle && !raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="sp-events" aria-hidden data-testid="event-overlay">
      <canvas ref={canvasRef} className="sp-events__canvas" />
    </div>
  );
}
