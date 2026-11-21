/**
 * The universe scene, built imperatively with three.js. React only mounts it;
 * every update goes through `setSnapshot` and `update`, never through props,
 * so navigating between pages cannot re-render it.
 */
import type { UniverseSnapshot } from "@stellar/shared";
import { seededRandom } from "@stellar/shared/hash";
import * as THREE from "three";
import {
  constellationBrightness,
  dustCount,
  litStars,
  placeClusters,
  placeConstellation,
  placeNeighbours,
  placePlanet,
  placeStar,
  placeSystem,
  placeWeb,
  planetRadius,
  SKY_RADIUS,
  starSeeds,
  type Vec3,
} from "./layout.ts";
import { FAMILY_RGB, GOLD_RGB, NEBULA_RGBA, VIOLET_RGB } from "./palette.ts";
import type { TierProfile } from "./quality.ts";
import { cameraInput, coreScreen, sceneSignals, screenTargets, universeStore } from "./store.ts";

const TAU = Math.PI * 2;

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aWarm;
  attribute float aPhase;
  attribute float aBirth;
  uniform float uTime;
  uniform float uPx;
  uniform float uSize;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 1.0 - uTwinkle * (0.5 - 0.5 * sin(uTime * (0.7 + aPhase * 0.2) + aPhase * 5.0));
    // A star that has just ignited flares, then settles over 1.2s.
    float age = uTime - aBirth;
    float flare = (aBirth > 0.0 && age >= 0.0 && age < 1.2) ? 1.0 + 3.5 * (1.0 - age / 1.2) : 1.0;
    float visible = (aBirth > 0.0 && age < 0.0) ? 0.0 : 1.0;
    gl_PointSize = max(1.0, aSize * uSize * uPx * flare / max(0.2, -mv.z));
    gl_Position = projectionMatrix * mv;
    vColor = mix(vec3(0.80, 0.84, 1.0), vec3(1.0, 0.86, 0.62), aWarm) * flare;
    vAlpha = visible * tw;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.7);
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }
`;

const PLANET_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLANET_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLight;
  uniform float uGlow;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    // Lit by the galactic core at the origin.
    vec3 toCore = normalize(-vWorld);
    float lambert = clamp(dot(normalize(vNormal), toCore), 0.0, 1.0);
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - clamp(dot(normalize(vNormal), view), 0.0, 1.0), 2.4);
    vec3 color = mix(uBase * 0.16, mix(uBase, uLight, lambert * 0.7), 0.2 + 0.8 * lambert);
    color += uLight * rim * (0.25 + uGlow * 0.9);
    gl_FragColor = vec4(color * (0.75 + uGlow * 0.5), 1.0);
  }
`;

const WARP_VERTEX = /* glsl */ `
  attribute vec4 aSeed; // angle, speed, offset, length
  attribute float aEnd;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uAspect;
  varying float vAlpha;
  void main() {
    float t = fract(aSeed.z + uTime * aSeed.y);
    float head = 0.06 + t * t * 1.7;
    float r = head - aEnd * aSeed.w * (0.25 + uIntensity * 0.9) * (0.3 + t);
    vec2 dir = vec2(cos(aSeed.x), sin(aSeed.x));
    vec2 p = dir * max(r, 0.02);
    p.x /= max(uAspect, 0.3);
    gl_Position = vec4(p, 0.0, 1.0);
    vAlpha = (1.0 - aEnd) * smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.75, 1.0, t)) * uIntensity;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.92, 0.9, 1.0, vAlpha * 0.5);
  }
`;

function radialTexture(stops: [number, string][], size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowSprite(rgb: string, peak = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: radialTexture([
      [0, `rgba(${rgb},${peak})`],
      [0.25, `rgba(${rgb},${peak * 0.45})`],
      [1, `rgba(${rgb},0)`],
    ]),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  return new THREE.Sprite(material);
}

interface PointsLayer {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  position: Float32Array;
  size: Float32Array;
  warm: Float32Array;
  phase: Float32Array;
  birth: Float32Array;
}

function pointsLayer(capacity: number, sizeScale: number, opacity: number): PointsLayer {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const warm = new Float32Array(capacity);
  const phase = new Float32Array(capacity);
  const birth = new Float32Array(capacity).fill(-100);
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aWarm", new THREE.BufferAttribute(warm, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute("aBirth", new THREE.BufferAttribute(birth, 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: 1 },
      uSize: { value: sizeScale },
      uOpacity: { value: opacity },
      uTwinkle: { value: 0.45 },
    },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material, position, size, warm, phase, birth };
}

function commit(layer: PointsLayer, count: number): void {
  for (const name of ["position", "aSize", "aWarm", "aPhase", "aBirth"]) {
    const attr = layer.geometry.getAttribute(name) as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }
  layer.geometry.setDrawRange(0, count);
}

interface PlanetEntry {
  id: string;
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  material: THREE.ShaderMaterial;
  orbit: number;
  angle: number;
  speed: number;
  tilt: number;
  radius: number;
  targetRadius: number;
  system: THREE.Group;
  title: string;
  subtitle: string;
}

interface ConstellationEntry {
  id: string;
  group: THREE.Group;
  stars: PointsLayer;
  lines: THREE.LineSegments;
  brightness: number;
  target: number;
  flickerUntil: number;
  center: THREE.Vector3;
  title: string;
  subtitle: string;
}

/** Core glow and nebula richness per era (Void … Cosmic Web). */
const CORE_BY_ERA = [0.0, 0.42, 0.6, 0.72, 0.9, 1.0, 1.05];
const NEBULA_BY_ERA = [0.0, 0.05, 0.55, 0.65, 0.8, 0.9, 1.0];

export class UniverseScene {
  readonly root = new THREE.Group();
  private readonly galaxy = new THREE.Group();
  private readonly stars: PointsLayer;
  private readonly dust: PointsLayer;
  private readonly backdrop: PointsLayer;
  private readonly core: THREE.Sprite;
  private readonly coreHalo: THREE.Sprite;
  private readonly nebulae: THREE.Sprite[] = [];
  private readonly systems = new THREE.Group();
  private readonly sky = new THREE.Group();
  private readonly layers = new THREE.Group();
  private readonly warp: THREE.LineSegments;
  private readonly warpMaterial: THREE.ShaderMaterial;
  private readonly planetGeometry = new THREE.IcosahedronGeometry(1, 3);
  private planets: PlanetEntry[] = [];
  private constellations: ConstellationEntry[] = [];
  private knownStars = new Set<string>();
  private firstSnapshot = true;
  private era = -1;
  private structureKey = "";
  private coreLevel = 0;
  private coreTarget = 0;
  private nebulaLevel = 0;
  private nebulaTarget = 0;
  private warpLevel = 0;
  private drift = 0;
  private sinceProject = 1;
  private readonly tmp = new THREE.Vector3();
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly profile: TierProfile;

  constructor(profile: TierProfile) {
    this.profile = profile;
    this.stars = pointsLayer(Math.max(profile.maxStars, 1), 0.02, 1);
    this.dust = pointsLayer(Math.max(profile.maxDust, 1), 0.011, 0.55);
    this.backdrop = pointsLayer(700, 0.022, 0.6);
    this.fillBackdrop();

    // White-hot centre falling off through Starlight Gold.
    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture(
          [
            [0, "rgba(255,250,238,1)"],
            [0.1, `rgba(${NEBULA_RGBA.core},0.95)`],
            [0.32, `rgba(${NEBULA_RGBA.gold},0.34)`],
            [0.62, `rgba(${NEBULA_RGBA.gold},0.08)`],
            [1, `rgba(${NEBULA_RGBA.gold},0)`],
          ],
          256,
        ),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.core.scale.setScalar(0.5);
    this.coreHalo = glowSprite(NEBULA_RGBA.violet, 0.45);
    this.coreHalo.scale.setScalar(1.9);

    const nebulaSpecs: [string, Vec3, number][] = [
      [NEBULA_RGBA.violet, [0.5, 0.06, -0.35], 1.5],
      [NEBULA_RGBA.magenta, [-0.62, -0.04, 0.3], 1.3],
      [NEBULA_RGBA.blue, [0.15, 0.03, 0.7], 1.4],
      [NEBULA_RGBA.violet, [-0.3, 0.08, -0.7], 1.1],
      [NEBULA_RGBA.magenta, [0.85, -0.05, 0.4], 0.9],
    ];
    for (const [rgb, pos, scale] of nebulaSpecs) {
      const sprite = glowSprite(rgb, 0.5);
      sprite.position.set(...pos);
      sprite.scale.setScalar(scale);
      sprite.userData.base = scale;
      this.nebulae.push(sprite);
      this.galaxy.add(sprite);
    }

    this.galaxy.add(this.coreHalo, this.core, this.dust.points, this.stars.points, this.systems);
    this.root.add(this.backdrop.points, this.layers, this.sky, this.galaxy);

    // Warp streaks live in clip space, so they always radiate from the centre of the view.
    const count = 110;
    const warpGeometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 2 * 4);
    const ends = new Float32Array(count * 2);
    const rand = seededRandom(4242);
    for (let i = 0; i < count; i++) {
      const s = [rand() * TAU, 0.05 + rand() * 0.11, rand(), 0.12 + rand() * 0.3];
      for (let e = 0; e < 2; e++) {
        seeds.set(s, (i * 2 + e) * 4);
        ends[i * 2 + e] = e;
      }
    }
    warpGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3),
    );
    warpGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    warpGeometry.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
    this.warpMaterial = new THREE.ShaderMaterial({
      vertexShader: WARP_VERTEX,
      fragmentShader: WARP_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uAspect: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.warp = new THREE.LineSegments(warpGeometry, this.warpMaterial);
    this.warp.frustumCulled = false;
    this.warp.renderOrder = 10;
    this.warp.visible = false;
    this.root.add(this.warp);

    this.disposables.push(this.planetGeometry, warpGeometry, this.warpMaterial);
    for (const layer of [this.stars, this.dust, this.backdrop])
      this.disposables.push(layer.geometry, layer.material);
  }

  private fillBackdrop(): void {
    const rand = seededRandom(77);
    const n = this.profile.maxDpr > 1.5 ? 700 : 320;
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const e = Math.asin(rand() * 2 - 1);
      const r = SKY_RADIUS * 2.4;
      this.backdrop.position.set(
        [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r],
        i * 3,
      );
      this.backdrop.size[i] = 0.5 + rand() * rand() * 1.2;
      this.backdrop.warm[i] = rand();
      this.backdrop.phase[i] = rand() * TAU;
    }
    commit(this.backdrop, n);
  }

  /** Applies a new snapshot. Cheap when nothing structural changed. */
  setSnapshot(snapshot: UniverseSnapshot): void {
    const era = snapshot.era.index;
    if (era !== this.era) {
      this.era = era;
      this.coreTarget = CORE_BY_ERA[Math.min(era, 6)] ?? 0;
      this.nebulaTarget = NEBULA_BY_ERA[Math.min(era, 6)] ?? 0;
      this.fillDust(era);
      this.buildLayers(era);
      if (this.firstSnapshot) {
        this.coreLevel = this.coreTarget;
        this.nebulaLevel = this.nebulaTarget;
      }
    }
    this.fillStars(snapshot);
    const key = JSON.stringify([
      snapshot.lists.map((l) => [l.id, l.all_complete]),
      snapshot.planets.map((p) => [p.id, p.list_id, p.completed]),
    ]);
    if (key !== this.structureKey) {
      this.structureKey = key;
      this.buildPlanets(snapshot);
    } else {
      this.updatePlanets(snapshot);
    }
    this.buildConstellations(snapshot);
    this.firstSnapshot = false;
    this.sinceProject = 1;
  }

  private fillStars(snapshot: UniverseSnapshot): void {
    const seeds = starSeeds(
      snapshot.stars.recent,
      snapshot.stars.months,
      snapshot.stars.count,
      this.profile.maxStars,
    );
    const igniting = new Set(sceneSignals.ignite.splice(0));
    const next = new Set<string>();
    const now = sceneSignals.now;
    seeds.forEach((seed, i) => {
      const s = placeStar(seed);
      this.stars.position.set(s.position, i * 3);
      this.stars.size[i] = s.size;
      this.stars.warm[i] = s.warmth;
      this.stars.phase[i] = s.phase;
      const fresh = !this.firstSnapshot && !this.knownStars.has(seed);
      // A star completed a moment ago ignites when its spark arrives (about 0.85s after the tap).
      this.stars.birth[i] =
        fresh || igniting.has(seed) ? now + (igniting.has(seed) ? 0.85 : 0.1) : -100;
      next.add(seed);
    });
    this.knownStars = next;
    commit(this.stars, seeds.length);
  }

  private fillDust(era: number): void {
    const n = dustCount(era, this.profile.maxDust);
    for (let i = 0; i < n; i++) {
      const s = placeStar(`dust:${i}`);
      this.dust.position.set(s.position, i * 3);
      this.dust.size[i] = s.size * 0.8;
      // Dust leans cool so the owner's own (warmer) stars stand out.
      this.dust.warm[i] = s.warmth * 0.45;
      this.dust.phase[i] = s.phase;
    }
    commit(this.dust, n);
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== this.planetGeometry) m.geometry.dispose();
        const material = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((x) => x.dispose());
        else material?.dispose();
      });
    }
  }

  /** Era layers: globular clusters, neighbouring galaxies, the cosmic web. */
  private buildLayers(era: number): void {
    this.clearGroup(this.layers);
    const clusters = placeClusters(era);
    if (clusters.length) {
      const total = clusters.reduce((n, c) => n + c.stars, 0);
      const layer = pointsLayer(total, 0.012, 0.85);
      const rand = seededRandom(5150);
      let i = 0;
      for (const c of clusters) {
        for (let k = 0; k < c.stars; k++, i++) {
          const a = rand() * TAU;
          const e = Math.asin(rand() * 2 - 1);
          const r = c.radius * Math.pow(rand(), 1.8);
          layer.position.set(
            [
              c.center[0] + Math.cos(a) * Math.cos(e) * r,
              c.center[1] + Math.sin(e) * r,
              c.center[2] + Math.sin(a) * Math.cos(e) * r,
            ],
            i * 3,
          );
          layer.size[i] = 0.6 + rand() * 0.6;
          layer.warm[i] = 0.5 + rand() * 0.5;
          layer.phase[i] = rand() * TAU;
        }
      }
      commit(layer, total);
      this.layers.add(layer.points);
    }
    for (const n of placeNeighbours(era)) {
      const sprite = glowSprite(NEBULA_RGBA.violet, 0.55);
      sprite.position.set(...n.position);
      sprite.scale.set(n.scale * 1.8, n.scale * 0.7, 1);
      sprite.material.rotation = n.tilt;
      const heart = glowSprite(NEBULA_RGBA.core, 0.8);
      heart.position.set(...n.position);
      heart.scale.setScalar(n.scale * 0.35);
      this.layers.add(sprite, heart);
    }
    const web = placeWeb(era);
    if (web.edges.length) {
      const positions = new Float32Array(web.edges.length * 6);
      web.edges.forEach(([a, b], i) => {
        positions.set(web.nodes[a] as Vec3, i * 6);
        positions.set(web.nodes[b] as Vec3, i * 6 + 3);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(...VIOLET_RGB),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.layers.add(new THREE.LineSegments(geometry, material));
    }
  }

  private buildPlanets(snapshot: UniverseSnapshot): void {
    this.clearGroup(this.systems);
    this.planets = [];
    snapshot.lists.forEach((list, listIndex) => {
      const placement = placeSystem(list.id, listIndex, snapshot.lists.length);
      const colors = FAMILY_RGB[placement.family];
      const system = new THREE.Group();
      system.position.set(...placement.center);
      system.userData.drift = placement.drift;
      system.userData.radius = Math.hypot(placement.center[0], placement.center[2]);
      system.userData.angle = Math.atan2(placement.center[2], placement.center[0]);
      system.userData.y = placement.center[1];

      const mine = snapshot.planets.filter((p) => p.list_id === list.id);
      mine.forEach((goal, i) => {
        const p = placePlanet(goal.id, i);
        const base = colors.base.map((c, k) =>
          Math.min(1, Math.max(0, c + p.shade * 0.07 * (k === 1 ? 1 : -1))),
        ) as [number, number, number];
        const material = new THREE.ShaderMaterial({
          vertexShader: PLANET_VERTEX,
          fragmentShader: PLANET_FRAGMENT,
          uniforms: {
            uBase: { value: new THREE.Color(...base) },
            uLight: { value: new THREE.Color(...colors.light) },
            uGlow: { value: goal.completed ? 1 : 0 },
          },
        });
        const mesh = new THREE.Mesh(this.planetGeometry, material);
        const radius = planetRadius(goal.progress, goal.completed);
        mesh.scale.setScalar(radius);
        const halo = glowSprite(colors.base.map((c) => Math.round(c * 255)).join(","), 0.6);
        halo.visible = goal.completed;
        halo.scale.setScalar(radius * 5.5);
        system.add(mesh, halo);
        this.planets.push({
          id: goal.id,
          mesh,
          halo,
          material,
          orbit: p.orbit,
          angle: p.angle,
          speed: p.speed,
          tilt: p.tilt,
          radius,
          targetRadius: radius,
          system,
          title: goal.name,
          subtitle: goal.completed ? "Complete" : `${Math.round(goal.progress * 100)}%`,
        });
      });

      if (list.all_complete && mine.length > 0) {
        // A fully complete list earns rings and two moons.
        const outer = 0.06 + mine.length * 0.034;
        const ringGeometry = new THREE.RingGeometry(outer + 0.012, outer + 0.03, 72);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color(...GOLD_RGB),
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        ringMesh.rotation.x = -Math.PI / 2 + 0.25;
        system.add(ringMesh);
        for (let m = 0; m < 2; m++) {
          const moon = glowSprite(NEBULA_RGBA.white, 0.9);
          moon.scale.setScalar(0.018);
          moon.userData.moon = {
            orbit: outer + 0.05 + m * 0.02,
            speed: 0.5 - m * 0.18,
            phase: m * 2.4,
          };
          system.add(moon);
        }
      }
      this.systems.add(system);
    });
    // A faint orbit ring for each system's path around the core.
    for (const system of [...this.systems.children]) {
      const radius = system.userData.radius as number;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++)
        points.push(
          new THREE.Vector3(
            Math.cos((i / 128) * TAU) * radius,
            0,
            Math.sin((i / 128) * TAU) * radius,
          ),
        );
      const orbit = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.07,
          depthWrite: false,
        }),
      );
      orbit.userData.orbit = true;
      this.systems.add(orbit);
    }
  }

  private updatePlanets(snapshot: UniverseSnapshot): void {
    const byId = new Map(snapshot.planets.map((p) => [p.id, p]));
    for (const planet of this.planets) {
      const goal = byId.get(planet.id);
      if (!goal) continue;
      planet.targetRadius = planetRadius(goal.progress, goal.completed);
      planet.title = goal.name;
      planet.subtitle = goal.completed ? "Complete" : `${Math.round(goal.progress * 100)}%`;
    }
  }

  private buildConstellations(snapshot: UniverseSnapshot): void {
    const previous = new Map(this.constellations.map((c) => [c.id, c]));
    const rekindled = new Set(sceneSignals.rekindle.splice(0));
    this.clearGroup(this.sky);
    this.constellations = snapshot.constellations.map((c, index) => {
      const shape = placeConstellation(c.id, index, snapshot.constellations.length);
      const lit = litStars(c.stars);
      const layer = pointsLayer(shape.stars.length, 0.03, 1);
      shape.stars.forEach((s, i) => {
        layer.position.set(s, i * 3);
        layer.size[i] = i < lit ? 1.3 : 0.55;
        layer.warm[i] = 0.9;
        layer.phase[i] = i * 1.7;
      });
      layer.material.uniforms.uTwinkle!.value = 0.25;
      commit(layer, shape.stars.length);
      const segments = shape.lines.filter(([a, b]) => a < lit && b < lit);
      const positions = new Float32Array(segments.length * 6);
      segments.forEach(([a, b], i) => {
        positions.set(shape.stars[a] as Vec3, i * 6);
        positions.set(shape.stars[b] as Vec3, i * 6 + 3);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(...GOLD_RGB),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(geometry, material);
      const group = new THREE.Group();
      group.add(lines, layer.points);
      this.sky.add(group);
      const target = constellationBrightness(c.streak, c.broken);
      const before = previous.get(c.id);
      return {
        id: c.id,
        group,
        stars: layer,
        lines,
        brightness: before?.brightness ?? target,
        target,
        flickerUntil: rekindled.has(c.id) ? sceneSignals.now + 1.5 : (before?.flickerUntil ?? 0),
        center: new THREE.Vector3(...shape.center),
        title: `${c.emoji ? `${c.emoji} ` : ""}${c.name}`,
        subtitle: c.broken
          ? "Streak paused"
          : c.streak === 1
            ? "1-day streak"
            : `${c.streak}-day streak`,
      };
    });
  }

  /** Per-frame update. `dt` in seconds; `dpr` scales point sprites; `motion` false freezes ambient loops (reduced motion). */
  update(
    camera: THREE.PerspectiveCamera,
    width: number,
    cssHeight: number,
    dpr: number,
    dt: number,
    motion: boolean,
  ): void {
    const state = universeStore.getState();
    const height = cssHeight * dpr;
    const t = sceneSignals.now;
    const home = state.mode === "home";

    // Ease levels towards their targets (a new era brightens gradually).
    const ease = 1 - Math.exp(-dt * 1.2);
    this.coreLevel += (this.coreTarget - this.coreLevel) * ease;
    this.nebulaLevel += (this.nebulaTarget - this.nebulaLevel) * ease;
    const sinceFlash = sceneSignals.flashAt < 0 ? 99 : t - sceneSignals.flashAt;
    const flash = sinceFlash < 3 ? sceneSignals.flashStrength * Math.exp(-sinceFlash * 1.6) : 0;
    const pulse = motion ? 1 + Math.sin(t * 0.9) * 0.03 : 1;
    this.core.material.opacity =
      this.coreLevel > 0.01 || flash > 0 ? Math.min(1, 0.5 + this.coreLevel * 0.5 + flash) : 0;
    this.core.scale.setScalar((0.42 + this.coreLevel * 0.5 + flash * 0.9) * pulse);
    this.coreHalo.material.opacity = Math.min(1, this.coreLevel * 0.55 + flash * 0.4);
    this.coreHalo.scale.setScalar(1.4 + this.coreLevel * 0.7 + flash * 1.2);
    this.nebulae.forEach((sprite, i) => {
      sprite.material.opacity = this.nebulaLevel * (0.5 + 0.15 * Math.sin(t * 0.07 + i));
      sprite.scale.setScalar(
        (sprite.userData.base as number) * (1 + 0.04 * Math.sin(t * 0.05 + i * 2)),
      );
    });

    const twinkle = motion ? 0.45 : 0;
    for (const layer of [this.stars, this.dust, this.backdrop]) {
      layer.material.uniforms.uTime!.value = t;
      layer.material.uniforms.uPx!.value = height;
      layer.material.uniforms.uTwinkle!.value = twinkle;
    }

    if (motion) this.drift += dt * 0.012;
    this.galaxy.rotation.y = this.drift;

    for (const system of this.systems.children) {
      if (system.userData.orbit) continue;
      const u = system.userData as { drift: number; radius: number; angle: number; y: number };
      const a = u.angle + (motion ? t * u.drift : 0);
      system.position.set(Math.cos(a) * u.radius, u.y, Math.sin(a) * u.radius);
      for (const child of system.children) {
        const moon = child.userData.moon as
          { orbit: number; speed: number; phase: number } | undefined;
        if (moon)
          child.position.set(
            Math.cos(t * moon.speed + moon.phase) * moon.orbit,
            0.01,
            Math.sin(t * moon.speed + moon.phase) * moon.orbit,
          );
      }
    }
    for (const p of this.planets) {
      const a = p.angle + (motion ? t * p.speed : 0);
      p.mesh.position.set(
        Math.cos(a) * p.orbit,
        Math.sin(a) * p.orbit * Math.sin(p.tilt) * 0.5,
        Math.sin(a) * p.orbit,
      );
      p.radius += (p.targetRadius - p.radius) * (1 - Math.exp(-dt * 4));
      p.mesh.scale.setScalar(p.radius);
      p.halo.position.copy(p.mesh.position);
      p.halo.scale.setScalar(p.radius * 5.5);
    }

    for (const c of this.constellations) {
      c.brightness += (c.target - c.brightness) * (1 - Math.exp(-dt * 2));
      // Rekindle: the dim figure flickers before it settles at full brightness.
      const flicker = t < c.flickerUntil ? 0.4 + 0.6 * (Math.sin(t * 46) > 0 ? 1 : 0.3) : 1;
      const b = c.brightness * flicker * (home ? 1 : 0.7);
      (c.lines.material as THREE.LineBasicMaterial).opacity = 0.55 * b;
      c.stars.material.uniforms.uOpacity!.value = b;
      c.stars.material.uniforms.uTime!.value = t;
      c.stars.material.uniforms.uPx!.value = height;
      c.stars.material.uniforms.uTwinkle!.value = twinkle * 0.5;
    }
    for (const child of this.layers.children) {
      const points = child as THREE.Points;
      const material = points.material as THREE.ShaderMaterial;
      if (material.uniforms?.uTime) {
        material.uniforms.uTime.value = t;
        material.uniforms.uPx!.value = height;
      }
    }

    // Warp: a burst when a focus phase starts, then a calm tunnel while it runs.
    const sinceWarp = sceneSignals.warpAt < 0 ? 99 : t - sceneSignals.warpAt;
    const burst = sinceWarp < 1.5 ? Math.sin((sinceWarp / 1.5) * Math.PI) : 0;
    const warpTarget = motion ? Math.max(state.focusAmbient ? 0.32 : 0, burst) : 0;
    this.warpLevel += (warpTarget - this.warpLevel) * (1 - Math.exp(-dt * 3));
    this.warp.visible = this.warpLevel > 0.01;
    this.warpMaterial.uniforms.uTime!.value = t * (1 + burst * 2.5);
    this.warpMaterial.uniforms.uIntensity!.value = this.warpLevel;
    this.warpMaterial.uniforms.uAspect!.value = width / Math.max(1, cssHeight);

    this.frameCamera(camera, width, cssHeight, dt, home, motion);

    this.sinceProject += dt;
    if (this.sinceProject > 0.2) {
      this.sinceProject = 0;
      this.project(camera, width, cssHeight, home);
    }
  }

  private frameCamera(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    dt: number,
    home: boolean,
    motion: boolean,
  ): void {
    // Inertial return to the default framing once the pointer is released.
    cameraInput.idle += dt;
    if (!cameraInput.dragging && (cameraInput.idle > 1.2 || !home)) {
      const k = 1 - Math.exp(-dt * (home ? 1.6 : 4));
      cameraInput.azimuth -= cameraInput.azimuth * k;
      cameraInput.polar -= cameraInput.polar * k;
      cameraInput.zoom -= cameraInput.zoom * k;
    }
    const aspect = width / Math.max(1, height);
    const base = Math.min(
      4.4,
      Math.max(2.5, 0.78 / (Math.tan((camera.fov * Math.PI) / 360) * aspect)),
    );
    const distance = (home ? base : base * 1.12) * Math.exp(-cameraInput.zoom);
    const polar =
      1.02 + cameraInput.polar + (motion ? Math.sin(sceneSignals.now * 0.05) * 0.015 : 0);
    const azimuth = 0.6 + cameraInput.azimuth;
    camera.position.set(
      Math.sin(polar) * Math.sin(azimuth) * distance,
      Math.cos(polar) * distance,
      Math.sin(polar) * Math.cos(azimuth) * distance,
    );
    camera.lookAt(0, 0, 0);
    // Shift the view so the core sits where the layout leaves room for it.
    const nav = width >= 1024 ? 220 : width >= 768 ? 72 : 0;
    const cx = nav + (width - nav) / 2;
    const cy = height * (home ? (width < 768 ? 0.37 : 0.42) : 0.34);
    camera.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
  }

  /** Refreshes screen-space targets for hover/tap labels and tells the overlay where the core is. */
  private project(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    home: boolean,
  ): void {
    const toScreen = (v: THREE.Vector3): { x: number; y: number; visible: boolean } => {
      this.tmp.copy(v).project(camera);
      return {
        x: (this.tmp.x * 0.5 + 0.5) * width,
        y: (-this.tmp.y * 0.5 + 0.5) * height,
        visible: this.tmp.z < 1 && this.tmp.z > -1,
      };
    };
    const core = toScreen(new THREE.Vector3(0, 0, 0));
    coreScreen.x = core.x;
    coreScreen.y = core.y;
    coreScreen.known = true;
    screenTargets.length = 0;
    if (!home) return;
    const world = new THREE.Vector3();
    for (const p of this.planets) {
      p.mesh.getWorldPosition(world);
      const s = toScreen(world);
      if (s.visible)
        screenTargets.push({
          kind: "planet",
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          x: s.x,
          y: s.y,
          r: 26,
        });
    }
    for (const c of this.constellations) {
      const s = toScreen(c.center);
      if (s.visible && s.y > 0 && s.x > 0 && s.x < width)
        screenTargets.push({
          kind: "constellation",
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          x: s.x,
          y: s.y,
          r: 44,
        });
    }
  }

  dispose(): void {
    this.clearGroup(this.systems);
    this.clearGroup(this.sky);
    this.clearGroup(this.layers);
    for (const d of this.disposables) d.dispose();
    for (const sprite of [this.core, this.coreHalo, ...this.nebulae]) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    screenTargets.length = 0;
    coreScreen.known = false;
  }
}
