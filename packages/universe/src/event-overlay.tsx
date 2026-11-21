"use client";

import { useEffect, useRef, useState } from "react";
import { type CosmicEvent, onCosmic } from "./bus.ts";
import { type Effect, EventDirector } from "./director.ts";
import { OverlayRenderer } from "./overlay.ts";
import { sceneSignals, universeStore } from "./store.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

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
    case "first_light":
      sceneSignals.flashAt = t + 0.6;
      sceneSignals.flashStrength = 1;
      break;
    case "new_era":
      sceneSignals.flashAt = t + 0.8;
      sceneSignals.flashStrength = 0.6;
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
  const [era, setEra] = useState<{
    key: number;
    index: number;
    name: string;
    reduced: boolean;
  } | null>(null);

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
    let eraTimer: ReturnType<typeof setTimeout> | null = null;

    const isReduced = () => {
      const s = universeStore.getState();
      return s.reducedMotion || s.tier === "minimal";
    };

    const announce = (effect: Effect) => {
      if (effect.type !== "new_era") return;
      const reduced = isReduced();
      setEra({
        key: effect.id,
        index: Number(effect.detail.index),
        name: String(effect.detail.name),
        reduced,
      });
      if (eraTimer) clearTimeout(eraTimer);
      eraTimer = setTimeout(() => setEra(null), reduced ? 2600 : 6000);
    };

    const frame = () => {
      const now = performance.now();
      for (const started of director.tick(now)) {
        signal(started);
        announce(started);
      }
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
      const decision = director.push(event, performance.now());
      if (decision.action === "start") {
        signal(event);
        announce(decision.effect);
      }
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
      if (eraTimer) clearTimeout(eraTimer);
    };
  }, []);

  return (
    <div className="sp-events" aria-hidden={era ? undefined : true} data-testid="event-overlay">
      <canvas ref={canvasRef} className="sp-events__canvas" />
      {era && (
        <div
          key={era.key}
          className={era.reduced ? "sp-era sp-era--reduced" : "sp-era"}
          role="status"
          aria-live="polite"
          data-testid="era-title"
        >
          <p className="sp-era__eyebrow">Era {ROMAN[era.index] ?? era.index + 1}</p>
          <p className="sp-era__name">{era.name}</p>
          <p className="sp-era__line">A new layer of your universe has formed.</p>
        </div>
      )}
    </div>
  );
}
