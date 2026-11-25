import test from "node:test";
import assert from "node:assert/strict";

import { createRng, dailySeedInfo } from "../../games/perihelion/core/rng.js";
import { SHIPS, isShipUnlocked } from "../../games/perihelion/core/ships.js";
import {
  WORLD_W,
  WORLD_H,
  CHAPTERS,
  ORBIT_SPECS,
  buildOrbit,
  buildDailyOrbit,
  isGateUnlocked,
} from "../../games/perihelion/core/campaign.js";
import {
  pullToVelocity,
  predictTrajectory,
  predictGrappleExit,
  createFlight,
  stepFlight,
} from "../../games/perihelion/core/physics.js";
import {
  createProfile,
  sanitizeProfile,
  totalStars,
  isChapterUnlocked,
  isOrbitUnlocked,
  selectShip,
  createSession,
  launchSessionProbe,
  recallSessionProbe,
  stepSession,
} from "../../games/perihelion/core/progress.js";

test("PRNG and daily seed are deterministic", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
  const d1 = dailySeedInfo(new Date("2026-11-25T08:00:00Z"));
  const d2 = dailySeedInfo(new Date("2026-11-25T23:59:00Z"));
  assert.equal(d1.seed, d2.seed);
  assert.equal(d1.label, "2026-11-25");
});

test("All 24 handcrafted orbits and 5-stage Daily Gauntlets have clean geometry", () => {
  assert.equal(CHAPTERS.length, 4);
  assert.equal(ORBIT_SPECS.length, 24);
  for (const spec of ORBIT_SPECS) {
    const orbit = buildOrbit(spec.id);
    assert.ok(orbit.launch.x > 40 && orbit.launch.x < WORLD_W - 40, `${spec.id} launch`);
    assert.ok(orbit.gate.x > 40 && orbit.gate.x < WORLD_W - 40, `${spec.id} gate`);
    for (const b of orbit.bodies) {
      assert.ok(Math.hypot(b.x - orbit.launch.x, b.y - orbit.launch.y) > b.r + 50, `${spec.id} body near launch`);
      assert.ok(Math.hypot(b.x - orbit.gate.x, b.y - orbit.gate.y) > b.r + 45, `${spec.id} body near gate`);
    }
    for (const c of orbit.crystals) {
      for (const b of orbit.bodies) {
        if (b.orbit) continue;
        assert.ok(Math.hypot(c.x - b.x, c.y - b.y) > b.r + 6, `${spec.id} crystal ${c.id} inside ${b.id}`);
      }
    }
  }

  for (const seed of [1, 42, 20261125]) {
    for (let st = 1; st <= 5; st++) {
      const orbit = buildDailyOrbit(st, createRng((seed ^ (st * 2654435761)) >>> 0));
      assert.ok(orbit.bodies.length >= 1);
      for (const b of orbit.bodies) {
        assert.ok(Math.hypot(b.x - orbit.launch.x, b.y - orbit.launch.y) > b.r + 50);
        assert.ok(Math.hypot(b.x - orbit.gate.x, b.y - orbit.gate.y) > b.r + 45);
      }
    }
  }
});

test("Trajectory prediction matches actual RK4 flight path", () => {
  const orbit = buildOrbit("h1");
  const vel = pullToVelocity(70, -110, "solaris");
  assert.ok(vel);
  const pred = predictTrajectory(orbit, orbit.launch.x, orbit.launch.y, vel.vx, vel.vy, "solaris");
  assert.ok(pred.points.length > 12);

  const flight = createFlight(orbit, vel.vx, vel.vy, "solaris");
  for (let i = 0; i < 20; i++) stepFlight(orbit, flight, 0.024, false, "solaris");
  const p = flight.probes[0];
  const expected = pred.points[19];
  assert.ok(Math.hypot(p.x - expected.x, p.y - expected.y) < 1.5);
});

test("Orbit 1 (First Curve) is solvable in 1 shot and earns stars + unlocks Orbit 2", () => {
  const profile = createProfile();
  assert.equal(isOrbitUnlocked(profile, "h1"), true);
  assert.equal(isOrbitUnlocked(profile, "h2"), false);

  let cleared = false;
  for (let angle = -1.0; angle <= 1.0 && !cleared; angle += 0.08) {
    for (let mag = 60; mag <= 145 && !cleared; mag += 15) {
      const s = createSession({ mode: "campaign", orbitId: "h1", shipId: "solaris" });
      const vel = pullToVelocity(Math.sin(angle) * mag, -Math.cos(angle) * mag, "solaris");
      launchSessionProbe(s, profile, vel.vx, vel.vy);
      for (let f = 0; f < 300 && s.phase === "flight"; f++) {
        stepSession(s, profile, 1 / 60, false);
      }
      if (s.phase === "clear") {
        cleared = true;
        assert.equal(s.clearResult.parMet, true);
        assert.ok(s.clearResult.starsThisAttempt >= 2);
      }
    }
  }
  assert.ok(cleared, "Orbit 1 should be cleanly solvable in 1 shot");
  assert.equal(profile.seenPullTutorial, true);
  assert.equal(isOrbitUnlocked(profile, "h2"), true);
  assert.ok(totalStars(profile) >= 2);
});

test("Orbit Grapple circularizes, predicts live curved exit trajectory, and activates Orbit-2 tutorial assist", () => {
  const profile = createProfile();
  const s = createSession({ mode: "campaign", orbitId: "h2", shipId: "solaris" });
  launchSessionProbe(s, profile, 120, -340);

  // Move probe into grapple zone beside the Ice Planet
  const b = s.orbit.bodies[0];
  const main = s.flight.probes[0];
  main.x = b.x + b.r + 48;
  main.y = b.y;
  main.vx = 0;
  main.vy = -270;

  // Step without holding: tutorial assist should engage slow-mo on first run
  stepSession(s, profile, 1 / 60, false);
  assert.ok(s.flight.nearestGrappleId === b.id);
  stepSession(s, profile, 1 / 60, false);
  assert.equal(s.tutorialAssistActive, true);

  // Now hold thumb: tether locks, circularizes, and predicts live exit curve
  for (let i = 0; i < 45; i++) stepSession(s, profile, 1 / 60, true);
  assert.ok(main.tether && main.tether.charge > 0.35);
  assert.ok(s.flight.grappleExit && s.flight.grappleExit.points.length > 5);
  const directExit = predictGrappleExit(s.orbit, main, "solaris");
  assert.ok(directExit && directExit.points.length > 5);

  // Release: emits tether_release and marks grapple tutorial seen
  const evs = stepSession(s, profile, 1 / 60, false);
  assert.ok(evs.some((e) => e.type === "tether_release"));
  assert.equal(profile.seenGrappleTutorial, true);
});

test("Ships unlock at star milestones and apply their flight traits", () => {
  assert.equal(SHIPS.length, 4);
  const profile = createProfile();
  assert.equal(isShipUnlocked("solaris", 0), true);
  assert.equal(isShipUnlocked("aegis", 0), false);
  assert.equal(selectShip(profile, "aegis"), false);

  // Grant 10 stars -> unlocks Aegis and Chapter 2 (Pulsar)
  profile.orbits.h1 = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  profile.orbits.h2 = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  profile.orbits.h3 = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  assert.equal(totalStars(profile), 9);
  assert.equal(isShipUnlocked("aegis", 9), true);
  assert.equal(isChapterUnlocked(profile, 1), true);
  assert.equal(selectShip(profile, "aegis"), true);

  // Aegis shield bounces off planet once; Gemini launches 2 probes
  const orbit = buildOrbit("h1");
  const fl = createFlight(orbit, 0, -250, "aegis");
  const m = fl.probes[0];
  m.x = orbit.bodies[0].x;
  m.y = orbit.bodies[0].y + orbit.bodies[0].r + 10;
  const evs = stepFlight(orbit, fl, 0.05, false, "aegis");
  assert.ok(evs.some((e) => e.type === "aegis_bounce"));
  assert.equal(m.alive, true);

  const gemFlight = createFlight(orbit, 0, -250, "gemini");
  assert.equal(gemFlight.probes.length, 2);
});

test("Keyed gates stay locked until keys break, and Daily Gauntlet tracks probes & profile save roundtrip", () => {
  const orbit = buildOrbit("p4");
  assert.equal(isGateUnlocked(orbit), false);
  for (const c of orbit.crystals) if (c.isKey) c.alive = false;
  assert.equal(isGateUnlocked(orbit), true);

  const profile = createProfile();
  const daily = createSession({ mode: "daily", seed: 999, dateLabel: "2026-11-25" });
  assert.equal(daily.probes, 4);
  for (let i = 0; i < 4; i++) {
    launchSessionProbe(daily, profile, 0, -250);
    recallSessionProbe(daily, profile);
  }
  assert.equal(daily.phase, "daily_over");
  assert.equal(daily.probes, 0);

  // Profile sanitize roundtrip
  profile.orbits.h1 = { clear: true, par: true, sweep: false, stars: 2, bestShots: 1, bestScore: 950 };
  const restored = sanitizeProfile(JSON.parse(JSON.stringify(profile)));
  assert.equal(restored.orbits.h1.stars, 2);
  assert.equal(restored.orbits.h1.bestScore, 950);
});
