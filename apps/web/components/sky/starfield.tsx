import type { CSSProperties } from "react";

/**
 * Zero-JS starfield. Rendered on the server so it is part of first paint; the
 * 3D universe cross-fades over it once it has loaded. Star positions come from
 * a seeded generator so the server and every client paint the same sky.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Layer {
  seed: number;
  tile: number;
  count: number;
  minSize: number;
  maxSize: number;
  alpha: number;
}

const LAYERS: readonly Layer[] = [
  { seed: 11, tile: 420, count: 34, minSize: 0.5, maxSize: 0.9, alpha: 0.55 },
  { seed: 29, tile: 640, count: 22, minSize: 0.7, maxSize: 1.2, alpha: 0.8 },
  { seed: 53, tile: 900, count: 9, minSize: 1.1, maxSize: 1.7, alpha: 0.95 },
];

function layerStyle(layer: Layer): CSSProperties {
  const rand = mulberry32(layer.seed);
  const stars: string[] = [];
  for (let i = 0; i < layer.count; i++) {
    const x = Math.round(rand() * layer.tile);
    const y = Math.round(rand() * layer.tile);
    const size = layer.minSize + rand() * (layer.maxSize - layer.minSize);
    const warm = rand() > 0.78;
    const alpha = (layer.alpha * (0.55 + rand() * 0.45)).toFixed(2);
    const color = warm ? `rgba(255,226,180,${alpha})` : `rgba(235,232,255,${alpha})`;
    stars.push(
      `radial-gradient(${size.toFixed(2)}px ${size.toFixed(2)}px at ${x}px ${y}px, ${color} 50%, transparent 100%)`,
    );
  }
  return {
    backgroundImage: stars.join(","),
    backgroundSize: `${layer.tile}px ${layer.tile}px`,
  };
}

const STYLES = LAYERS.map(layerStyle);

export function Starfield() {
  return (
    <div className="sp-sky" aria-hidden="true" data-sky="css">
      <div className="sp-sky__nebula" />
      <div className="sp-sky__stars" style={STYLES[0]} />
      <div className="sp-sky__stars sp-sky__stars--twinkle" style={STYLES[1]} />
      <div className="sp-sky__stars" style={STYLES[2]} />
      <div className="sp-sky__veil" />
    </div>
  );
}
