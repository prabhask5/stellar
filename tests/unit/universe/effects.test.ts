import { describe, expect, it } from "vitest";
import { COSMIC_EVENT_TYPES, type CosmicEvent, type CosmicEventType } from "@stellar/universe/bus";
import { Camera } from "@stellar/universe/renderer/camera";
import {
  EffectPlayer,
  EFFECTS,
  GLOW_SECONDS,
  MAX_PER_TYPE,
  MAX_WAIT_MS,
  PARTICLE_CAP,
  Particles,
  type Stage,
  STAGGER_MS,
  targetPosition,
} from "@stellar/universe/renderer/effects";
import { generateGalaxy } from "@stellar/universe/renderer/galaxy";

const galaxy = generateGalaxy({ stars: 60_000, haze: 10, knots: 10, dust: 10 });

function stage(): Stage {
  const camera = new Camera();
  camera.update(0, 0, 1280, 800, 0, false);
  return {
    time: 0,
    targets: galaxy.targets,
    targetCount: galaxy.targetCount,
    camera,
    particles: new Particles(),
    core: 0,
    push: 0,
  };
}

const EVENTS: Record<CosmicEventType, CosmicEvent> = {
  task_created: { type: "task_created", id: "t1" },
  task_completed: { type: "task_completed", id: "t1" },
  task_uncompleted: { type: "task_uncompleted", id: "t1" },
  task_deleted: { type: "task_deleted", id: "t1" },
  overdue_postponed: { type: "overdue_postponed", count: 4 },
  goal_progress: { type: "goal_progress", id: "g1", amount: 0.25 },
  goal_completed: { type: "goal_completed", id: "g1" },
  routine_checked: { type: "routine_checked", id: "r1" },
  routine_day_complete: { type: "routine_day_complete", date: "2026-11-25" },
  focus_started: { type: "focus_started" },
  focus_break: { type: "focus_break" },
  focus_completed: { type: "focus_completed" },
};

const ORIGIN = { u: 0.2, v: 0.8 };
const offer = (player: EffectPlayer, event: CosmicEvent, now: number, origin = ORIGIN) =>
  player.offer(event, origin, galaxy.targetCount, now);

describe("event catalog", () => {
  it("has one effect per event type, with the catalog's durations", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual([...COSMIC_EVENT_TYPES].sort());
    const seconds = Object.fromEntries(
      COSMIC_EVENT_TYPES.map((type) => [type, EFFECTS[type].duration]),
    );
    expect(seconds).toEqual({
      task_created: 2,
      task_completed: 2.6,
      task_uncompleted: 1.6,
      task_deleted: 2,
      overdue_postponed: 2.2,
      goal_progress: 1.4,
      goal_completed: 3,
      routine_checked: 1.8,
      routine_day_complete: 3,
      focus_started: 2.4,
      focus_break: 1.5,
      focus_completed: 2.8,
    });
  });

  it("starts at the tapped control only for the events that fly from it", () => {
    const fromControl = COSMIC_EVENT_TYPES.filter((t) => EFFECTS[t].origin === "control");
    expect(fromControl.sort()).toEqual(["routine_checked", "task_completed", "task_uncompleted"]);
  });

  it("moves the galaxy or the camera only for the focus events", () => {
    const moving = COSMIC_EVENT_TYPES.filter((t) => EFFECTS[t].motion);
    expect(moving.sort()).toEqual(["focus_break", "focus_completed", "focus_started"]);
  });

  it("plans each type as its own effect", () => {
    for (const type of COSMIC_EVENT_TYPES) {
      const player = new EffectPlayer();
      expect(offer(player, EVENTS[type], 1000), type).toBe("played");
      const [effect] = player.effects();
      expect(effect?.type, type).toBe(type);
      expect(effect?.duration, type).toBe(EFFECTS[type].duration);
      expect((effect?.target ?? -1) >= 0, type).toBe(EFFECTS[type].target === "arm-star");
      expect(Number.isNaN(effect?.u), type).toBe(EFFECTS[type].origin !== "control");
    }
  });

  it("draws every effect, start to finish, with finite particles inside the pool", () => {
    for (const type of COSMIC_EVENT_TYPES) {
      const player = new EffectPlayer();
      const s = stage();
      offer(player, EVENTS[type], 0);
      let drawn = 0;
      let moved = false;
      const duration = EFFECTS[type].duration * 1000;
      for (let now = 0; now < duration; now += 50) {
        s.particles.count = 0;
        s.core = 0;
        s.push = 0;
        s.time = now / 1000;
        expect(player.draw(s, now), `${type} @${now}`).toBe(1);
        const n = s.particles.count;
        drawn += n;
        expect(n).toBeLessThanOrEqual(PARTICLE_CAP);
        // One verdict a frame, not one assertion a particle: there are tens of thousands.
        let sound = true;
        for (let i = 0; i < n * 3; i++) sound &&= Number.isFinite(s.particles.position[i]);
        for (let i = 0; i < n; i++)
          sound &&= s.particles.size[i]! > 0 && s.particles.color[i * 4 + 3]! > 0;
        expect(sound, `${type} @${now}`).toBe(true);
        if (s.core !== 0 || s.push !== 0) moved = true;
      }
      expect(drawn, type).toBeGreaterThan(0);
      expect(moved, type).toBe(EFFECTS[type].motion);
      // Over: the slot goes back to the pool.
      expect(player.draw(s, duration + 1)).toBe(0);
      expect(player.idle).toBe(true);
    }
  });

  it("lands an item on the same arm star every time", () => {
    const a = new EffectPlayer();
    const b = new EffectPlayer();
    offer(a, { type: "task_completed", id: "task-42" }, 0);
    offer(b, { type: "task_deleted", id: "task-42" }, 5000);
    offer(b, { type: "task_completed", id: "task-43" }, 5010);
    const [first] = a.effects();
    const [second, other] = b.effects();
    expect(first!.target).toBeGreaterThanOrEqual(0);
    expect(second!.target).toBe(first!.target);
    expect(other!.target).not.toBe(first!.target);
    // And that star is on the disk, turning with the arm.
    const s = stage();
    const at0 = [0, 0, 0];
    const at9 = [0, 0, 0];
    targetPosition(s, first!.target, at0);
    s.time = 9;
    targetPosition(s, first!.target, at9);
    expect(Math.hypot(at0[0]!, at0[2]!)).toBeCloseTo(Math.hypot(at9[0]!, at9[2]!), 5);
    expect(at9[0]).not.toBeCloseTo(at0[0]!, 4);
  });

  it("plays the same item the same way, and different items differently", () => {
    const rand = (id: string) => {
      const player = new EffectPlayer();
      offer(player, { type: "task_completed", id }, 0);
      return Array.from(player.effects()[0]!.rand.subarray(0, 8));
    };
    expect(rand("x")).toEqual(rand("x"));
    expect(rand("x")).not.toEqual(rand("y"));
  });
});

describe("coalescing", () => {
  it("staggers the same type by 120 ms and lets other types start at once", () => {
    const player = new EffectPlayer();
    expect(offer(player, { type: "task_created", id: "a" }, 1000)).toBe("played");
    expect(offer(player, { type: "task_created", id: "b" }, 1000)).toBe("staggered");
    expect(offer(player, { type: "task_created", id: "c" }, 1010)).toBe("staggered");
    expect(offer(player, { type: "task_deleted", id: "a" }, 1010)).toBe("played");
    const starts = player.effects().map((e) => [e.type, e.startAt]);
    expect(starts).toEqual([
      ["task_created", 1000],
      ["task_created", 1000 + STAGGER_MS],
      ["task_created", 1000 + 2 * STAGGER_MS],
      ["task_deleted", 1010],
    ]);
    // Later on, nothing is held back.
    expect(offer(player, { type: "task_created", id: "d" }, 1900)).toBe("played");
  });

  it("does not draw a staggered effect before its start", () => {
    const player = new EffectPlayer();
    const s = stage();
    offer(player, { type: "task_created", id: "a" }, 0);
    offer(player, { type: "task_created", id: "b" }, 0);
    player.draw(s, 20);
    const one = s.particles.count;
    s.particles.count = 0;
    player.draw(s, STAGGER_MS + 20);
    expect(s.particles.count).toBeGreaterThan(one);
  });

  it("plays at most six of a type at once and drops the rest", () => {
    const player = new EffectPlayer();
    const results = [];
    for (let i = 0; i < 9; i++)
      results.push(offer(player, { type: "goal_completed", id: `g${i}` }, i));
    expect(results.filter((r) => r !== "dropped")).toHaveLength(MAX_PER_TYPE);
    expect(results.slice(MAX_PER_TYPE)).toEqual(["dropped", "dropped", "dropped"]);
    expect(player.effects()).toHaveLength(MAX_PER_TYPE);
  });

  it("turns a burst of more than six task completions into one meteor shower", () => {
    const player = new EffectPlayer();
    const results = [];
    for (let i = 0; i < 10; i++)
      results.push(offer(player, { type: "task_completed", id: `t${i}` }, i * 200));
    expect(results.slice(0, 6).every((r) => r === "played")).toBe(true);
    expect(results[6]).toBe("shower");
    expect(results.slice(7)).toEqual(["dropped", "dropped", "dropped"]);
    const showers = player.effects().filter((e) => e.type === "routine_day_complete");
    expect(showers).toHaveLength(1);
    expect(showers[0]!.burst).toBe(true);
  });

  it("makes room again once effects have finished", () => {
    const player = new EffectPlayer();
    for (let i = 0; i < 6; i++) offer(player, { type: "task_deleted", id: `t${i}` }, 0);
    expect(offer(player, { type: "task_deleted", id: "late" }, 100)).toBe("dropped");
    expect(offer(player, { type: "task_deleted", id: "later" }, 4000)).toBe("played");
  });

  it("never lets an event wait longer than a second and a half", () => {
    const player = new EffectPlayer();
    player.still = true;
    // Glows are short, so many can be offered at once without reaching the cap of six.
    const results = [];
    for (let i = 0; i < 40; i++) {
      results.push(offer(player, { type: "task_created", id: `t${i}` }, 0));
      player.draw(stage(), 0);
    }
    const waits = player.effects().map((e) => e.startAt);
    expect(Math.max(...waits)).toBeLessThanOrEqual(MAX_WAIT_MS);
    expect(results).toContain("dropped");
  });

  it("never runs out of slots, however many types arrive together", () => {
    const player = new EffectPlayer();
    let accepted = 0;
    for (let round = 0; round < 8; round++)
      for (const type of COSMIC_EVENT_TYPES)
        if (offer(player, EVENTS[type], round) !== "dropped") accepted++;
    expect(accepted).toBe(player.effects().length);
    expect(accepted).toBeLessThanOrEqual(40);
    const s = stage();
    player.draw(s, 600);
    expect(s.particles.count).toBeLessThanOrEqual(PARTICLE_CAP);
  });
});

describe("reduced motion", () => {
  it("turns every event into a brief glow that moves nothing", () => {
    for (const type of COSMIC_EVENT_TYPES) {
      const player = new EffectPlayer();
      player.still = true;
      offer(player, EVENTS[type], 0);
      const [effect] = player.effects();
      expect(effect!.glow).toBe(true);
      expect(effect!.duration).toBe(GLOW_SECONDS);
      expect(GLOW_SECONDS).toBeLessThanOrEqual(0.4);
      expect(player.needsMotion, type).toBe(false);
      const s = stage();
      player.draw(s, 200);
      // One soft point where the owner tapped; the camera stays where it is.
      expect(s.particles.count).toBe(1);
      expect(s.push).toBe(0);
      expect(player.draw(s, 401)).toBe(0);
    }
  });

  it("lets the core breathe once when nothing was tapped", () => {
    const player = new EffectPlayer();
    player.still = true;
    player.offer({ type: "focus_completed" }, null, galaxy.targetCount, 0);
    const s = stage();
    player.draw(s, 200);
    expect(s.particles.count).toBe(0);
    expect(s.core).toBeGreaterThan(0);
  });
});
