import test from "node:test";
import assert from "node:assert/strict";

import { createRng, dailySeedInfo } from "../../games/perihelion/core/rng.js";
import { RELICS, draftRelics } from "../../games/perihelion/core/relics.js";
import {
  WORLD_W,
  WORLD_H,
  FINAL_SECTOR,
  generateSector,
  isGateUnlocked,
} from "../../games/perihelion/core/sectors.js";
import {
  pullToVelocity,
  predictTrajectory,
  createFlight,
  stepFlight,
} from "../../games/perihelion/core/physics.js";
import {
  createRun,
  launchProbe,
  stepRun,
  recallProbe,
  pickRelic,
  continueEndless,
  serializeRun,
  deserializeRun,
} from "../../games/perihelion/core/run.js";

test("PRNG and daily seed are deterministic", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 20; i++) {
    assert.equal(a.next(), b.next());
  }
  const d1 = dailySeedInfo(new Date("2026-11-25T08:00:00Z"));
  const d2 = dailySeedInfo(new Date("2026-11-25T23:59:00Z"));
  assert.equal(d1.seed, d2.seed);
  assert.equal(d1.label, "2026-11-25");
});

test("All 12 curated sectors + 15 endless sectors have clean non-overlapping geometry", () => {
  for (const seed of [1, 42, 999, 20261125]) {
    for (let num = 1; num <= FINAL_SECTOR + 15; num++) {
      const rng = createRng((seed ^ (num * 2654435761)) >>> 0);
      const sec = generateSector(num, rng);
      assert.ok(sec.launch.x > 40 && sec.launch.x < WORLD_W - 40);
      assert.ok(sec.gate.x > 40 && sec.gate.x < WORLD_W - 40);
      for (const b of sec.bodies) {
        assert.ok(Math.hypot(b.x - sec.launch.x, b.y - sec.launch.y) > b.r + 50, `sector ${num} body near launch`);
        assert.ok(Math.hypot(b.x - sec.gate.x, b.y - sec.gate.y) > b.r + 45, `sector ${num} body near gate`);
      }
      for (const c of sec.crystals) {
        assert.ok(c.x >= 20 && c.x <= WORLD_W - 20);
        assert.ok(c.y >= 80 && c.y <= WORLD_H - 90);
        for (const b of sec.bodies) {
          if (b.orbit) continue;
          assert.ok(
            Math.hypot(c.x - b.x, c.y - b.y) > b.r + 6,
            `sector ${num} crystal ${c.id} inside body ${b.id}`,
          );
        }
      }
    }
  }
});

test("Trajectory prediction matches actual RK4 flight path", () => {
  const sec = generateSector(1, createRng(77));
  const vel = pullToVelocity(70, -110, []);
  assert.ok(vel);
  const pred = predictTrajectory(sec, sec.launch.x, sec.launch.y, vel.vx, vel.vy, []);
  assert.ok(pred.points.length > 10);

  const flight = createFlight(sec, vel.vx, vel.vy, []);
  // Step exactly 20 prediction frames (20 * 0.024s = 0.48s)
  for (let i = 0; i < 20; i++) {
    stepFlight(sec, flight, 0.024, false, []);
  }
  const p = flight.probes[0];
  const expected = pred.points[19];
  const err = Math.hypot(p.x - expected.x, p.y - expected.y);
  assert.ok(err < 1.5, `prediction diverged by ${err.toFixed(3)}u`);
});

test("Sector 1 is cleanly solvable in 1 shot across multiple seeds", () => {
  for (const seed of [1, 7, 42, 31415]) {
    let solved = false;
    for (let angle = -1.1; angle <= 1.1 && !solved; angle += 0.09) {
      for (let mag = 60; mag <= 140 && !solved; mag += 20) {
        const run = createRun({ seed });
        const vel = pullToVelocity(Math.sin(angle) * mag, -Math.cos(angle) * mag, []);
        launchProbe(run, vel.vx, vel.vy);
        for (let f = 0; f < 300 && run.phase === "flight"; f++) {
          stepRun(run, 1 / 60, false);
        }
        if (run.phase === "draft") {
          solved = true;
          assert.ok(run.score > 400);
          assert.equal(run.draftChoices.length, 3);
        }
      }
    }
    assert.ok(solved, `Sector 1 not solved on seed ${seed}`);
  }
});

test("Orbit grapple tether circularizes, charges, and whip-boosts on release", () => {
  const sec = generateSector(1, createRng(10));
  const body = sec.bodies[0];
  // Place probe flying tangentially near the planet
  const flight = createFlight(sec, 0, -300, []);
  const main = flight.probes[0];
  main.x = body.x + body.r + 45;
  main.y = body.y;
  main.vx = 0;
  main.vy = -260;

  let locked = false;
  for (let i = 0; i < 45; i++) {
    const evs = stepFlight(sec, flight, 1 / 60, true, []);
    if (evs.some((e) => e.type === "tether_lock")) locked = true;
  }
  assert.ok(locked, "tether should lock onto planet");
  assert.ok(main.alive, "tether should not crash probe into planet");
  assert.ok(main.tether && main.tether.charge > 0.5, "tether should build charge");

  const speedBefore = Math.hypot(main.vx, main.vy);
  const releaseEvs = stepFlight(sec, flight, 1 / 60, false, []);
  assert.ok(
    releaseEvs.some((e) => e.type === "tether_release"),
    "releasing charged tether emits tether_release",
  );
  const speedAfter = Math.hypot(main.vx, main.vy);
  assert.ok(speedAfter > speedBefore * 1.15, "release should whip-boost probe speed");
});

test("Relics: Aegis bounces once, Twin Probe launches 2, Forcefield bounces walls", () => {
  // Aegis Hull bounce
  const sec = generateSector(1, createRng(12));
  const body = sec.bodies[0];
  const flight = createFlight(sec, 0, -200, ["aegis_hull", "twin_probe", "ricochet_field"]);
  assert.equal(flight.probes.length, 2, "Twin Probe spawns 2 probes");

  const main = flight.probes[0];
  main.x = body.x;
  main.y = body.y + body.r + 10;
  main.vx = 0;
  main.vy = -220;
  const evs = stepFlight(sec, flight, 0.05, false, ["aegis_hull"]);
  assert.ok(evs.some((e) => e.type === "aegis_bounce"), "Aegis Hull bounces off planet");
  assert.ok(main.alive, "Probe survives first hit with Aegis");
  assert.equal(sec.aegisUsed, true);

  // Wall bounce
  main.x = 12;
  main.y = 500;
  main.vx = -300;
  main.vy = 0;
  const wallEvs = stepFlight(sec, flight, 0.05, false, ["ricochet_field"]);
  assert.ok(wallEvs.some((e) => e.type === "wall_bounce"), "Edge Shield reflects probe off wall");
  assert.ok(main.vx > 0);
});

test("Keyed gate stays locked until all Key Prisms are shattered", () => {
  const sec = generateSector(5, createRng(55));
  assert.equal(isGateUnlocked(sec), false);

  // Launch directly at locked gate: should bounce, not warp
  const flight = createFlight(sec, 0, -300, []);
  const main = flight.probes[0];
  main.x = sec.gate.x;
  main.y = sec.gate.y + sec.gate.r + 12;
  main.vx = 0;
  main.vy = -300;
  const evs = stepFlight(sec, flight, 0.05, false, []);
  assert.ok(evs.some((e) => e.type === "gate_locked"));
  assert.equal(flight.settled, false);

  // Shatter all keys -> gate unlocks and warps!
  for (const c of sec.crystals) if (c.isKey) c.alive = false;
  assert.equal(isGateUnlocked(sec), true);
  main.x = sec.gate.x;
  main.y = sec.gate.y + sec.gate.r + 12;
  main.vx = 0;
  main.vy = -300;
  const evs2 = stepFlight(sec, flight, 0.05, false, []);
  assert.ok(evs2.some((e) => e.type === "gate_warp"));
  assert.equal(flight.outcome, "warp");
});

test("Run progression, probe loss -> game over, relic drafting, and save/load roundtrip", () => {
  const run = createRun({ seed: 4242 });
  assert.equal(run.probes, 4);

  // Recall 3 times -> 1 probe left; 4th -> game over
  for (let i = 0; i < 3; i++) {
    launchProbe(run, 0, -250);
    recallProbe(run);
    assert.equal(run.phase, "aim");
  }
  assert.equal(run.probes, 1);

  // Save/load roundtrip while in aim
  run.score = 1350;
  run.relics.push("long_sight");
  run.sector.crystals[0].alive = false;
  const saved = serializeRun(run);
  const restored = deserializeRun(saved);
  assert.equal(restored.score, 1350);
  assert.deepEqual(restored.relics, ["long_sight"]);
  assert.equal(restored.sector.crystals[0].alive, false);
  assert.equal(restored.probes, 1);

  // Losing final probe triggers game over
  launchProbe(restored, 0, -250);
  recallProbe(restored);
  assert.equal(restored.phase, "over");
  assert.equal(restored.probes, 0);
  assert.equal(serializeRun(restored), null);

  // Victory -> Endless transition
  const vRun = createRun({ seed: 99 });
  vRun.sectorNum = FINAL_SECTOR;
  vRun.phase = "victory";
  assert.equal(continueEndless(vRun), true);
  assert.equal(vRun.endless, true);
  assert.equal(vRun.phase, "draft");
  assert.equal(vRun.draftChoices.length, 3);
  pickRelic(vRun, vRun.draftChoices[0]);
  assert.equal(vRun.sectorNum, FINAL_SECTOR + 1);
  assert.equal(vRun.phase, "aim");

  // Relic catalog integrity
  assert.equal(RELICS.length, 12);
  const picks = draftRelics(createRng(7), [], 3);
  assert.equal(new Set(picks).size, 3);
});
