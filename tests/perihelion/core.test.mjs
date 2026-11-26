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
  isOrbitSolvable,
} from "../../games/perihelion/core/physics.js";
import {
  createProfile,
  sanitizeProfile,
  totalStars,
  isChapterUnlocked,
  isOrbitUnlocked,
  selectShip,
  createSession,
  buildVerifiedDailyOrbit,
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

test("All 24 handcrafted orbits and 60 days (300 stages) of Daily Gauntlets have clean geometry and verified solvability", () => {
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

  // Sweep 60 consecutive dates starting at 2026-11-25 (including 2026-11-26!)
  const startDay = new Date("2026-11-25T12:00:00Z").getTime();
  for (let day = 0; day < 60; day++) {
    const info = dailySeedInfo(new Date(startDay + day * 86400_000));
    for (let st = 1; st <= 5; st++) {
      const orbit = buildVerifiedDailyOrbit(info.seed, st);
      assert.ok(orbit.bodies.length >= 1, `${info.label} stage ${st} has bodies`);
      for (const b of orbit.bodies) {
        assert.ok(Math.hypot(b.x - orbit.launch.x, b.y - orbit.launch.y) > b.r + 50);
        assert.ok(Math.hypot(b.x - orbit.gate.x, b.y - orbit.gate.y) > b.r + 45);
      }
      for (const w of orbit.wormholes) {
        for (const b of orbit.bodies) {
          assert.ok(
            Math.hypot(w.x - b.x, w.y - b.y) >= b.r + w.r + 30,
            `${info.label} stage ${st} wormhole overlaps body`,
          );
        }
      }
      for (const bp of orbit.bumpers) {
        for (const b of orbit.bodies) {
          assert.ok(
            Math.hypot(bp.x - b.x, bp.y - b.y) >= b.r + 30,
            `${info.label} stage ${st} bumper overlaps body`,
          );
        }
      }
      assert.ok(
        isOrbitSolvable(orbit, "solaris"),
        `${info.label} stage ${st} must be solvable by pure aim`,
      );
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

test("Solar Bumper ricochet matches trajectory prediction 1:1 after impact", () => {
  const orbit = buildOrbit("p2"); // Ricochet Bell
  const vel = pullToVelocity(51.49, -59.91, "solaris");
  assert.ok(vel);
  const pred = predictTrajectory(orbit, orbit.launch.x, orbit.launch.y, vel.vx, vel.vy, "solaris", 78);
  assert.equal(pred.hitGate, true, "Ricochet Bell bumper bank should predict hitting Warp Gate");

  // 1. Exact step-for-step match after bounce
  const flight = createFlight(orbit, vel.vx, vel.vy, "solaris");
  let bounced = false;
  for (let i = 0; i < 78 && !flight.settled; i++) {
    const evs = stepFlight(orbit, flight, 0.024, false, "solaris");
    if (evs.some((e) => e.type === "bumper")) bounced = true;
    if (bounced && !flight.settled && i < pred.points.length) {
      const p = flight.probes[0];
      const exp = pred.points[i];
      const err = Math.hypot(p.x - exp.x, p.y - exp.y);
      assert.ok(err < 2.0, `post-bumper step ${i} diverged by ${err.toFixed(2)}u`);
    }
  }
  assert.ok(bounced, "probe should bounce off the Solar Bumper");
  assert.equal(flight.outcome, "warp");

  // 2. Real 60Hz frame rate (different dt from prediction) must also hit the Warp Gate!
  const orbit60 = buildOrbit("p2");
  const fl60 = createFlight(orbit60, vel.vx, vel.vy, "solaris");
  for (let f = 0; f < 240 && !fl60.settled; f++) stepFlight(orbit60, fl60, 1 / 60, false, "solaris");
  assert.equal(fl60.outcome, "warp", "60Hz live bumper ricochet must match prediction");
  assert.equal(fl60.crystalsThisShot, 4);
});

test("Orbit 1 (First Curve) earns 3/3 stars with pure aim and unlocks Orbit 2", () => {
  const profile = createProfile();
  assert.equal(isOrbitUnlocked(profile, "h1"), true);
  assert.equal(isOrbitUnlocked(profile, "h2"), false);

  const s = createSession({ mode: "campaign", orbitId: "h1", shipId: "solaris" });
  const vel = pullToVelocity(-61.5, -82.6, "solaris");
  launchSessionProbe(s, profile, vel.vx, vel.vy);
  for (let f = 0; f < 300 && s.phase === "flight"; f++) {
    stepSession(s, profile, 1 / 60, false);
  }
  assert.equal(s.phase, "clear", "Orbit 1 should clear on the sculpted outer gravity curve");
  assert.equal(s.clearResult.parMet, true);
  assert.equal(s.clearResult.allCrystals, true, "Orbit 1 curve should sweep all 5 crystals");
  assert.equal(s.clearResult.starsThisAttempt, 3);
  assert.equal(profile.seenPullTutorial, true);
  assert.equal(isOrbitUnlocked(profile, "h2"), true);
  assert.equal(totalStars(profile), 3);
});

test("Orbit Grapple orbits calmly, engages golden gate detent, and releases WYSIWYG into Warp Gate", () => {
  const profile = createProfile();
  const s = createSession({ mode: "campaign", orbitId: "h2", shipId: "solaris" });
  launchSessionProbe(s, profile, 120, -340);

  const b = s.orbit.bodies[0];
  const main = s.flight.probes[0];
  main.x = b.x + b.r + 48;
  main.y = b.y;
  main.vx = 0;
  main.vy = -270;

  // Tutorial assist slows time before grapple
  stepSession(s, profile, 1 / 60, false);
  assert.equal(s.flight.nearestGrappleId, b.id);
  stepSession(s, profile, 1 / 60, false);
  assert.equal(s.tutorialAssistActive, true);

  // Hold thumb calmly until live curved exit arc locks onto the Warp Gate!
  let hitNotch = false;
  let notchFrames = 0;
  for (let i = 0; i < 420; i++) {
    stepSession(s, profile, 1 / 60, true);
    if (s.flight && s.flight.grappleExit && s.flight.grappleExit.hitGate) {
      hitNotch = true;
      notchFrames++;
      // Wait a couple frames inside the detent window, then release!
      if (notchFrames >= 4) break;
    }
  }
  assert.ok(hitNotch, "calm grapple orbit should sweep its curved exit arc onto the Warp Gate");
  assert.ok(main.tether.aimingGate, "magnetic detent should be active on gate alignment");

  // Release now -> must fly along the exact predicted curve straight into the Warp Gate!
  const relEvs = stepSession(s, profile, 1 / 60, false);
  assert.ok(relEvs.some((e) => e.type === "tether_release"));
  assert.equal(profile.seenGrappleTutorial, true);

  for (let f = 0; f < 240 && s.phase === "flight"; f++) {
    stepSession(s, profile, 1 / 60, false);
  }
  assert.equal(s.phase, "clear", "releasing on the golden exit arc should hit the Warp Gate WYSIWYG!");
});

test("Ships and chapters unlock in strict order without skipping ahead", () => {
  assert.equal(SHIPS.length, 4);
  const profile = createProfile();
  assert.equal(isShipUnlocked("solaris", 0), true);
  assert.equal(isShipUnlocked("aegis", 0), false);
  assert.equal(selectShip(profile, "aegis"), false);

  // 9 stars unlocks Aegis, but Pulsar requires 10 stars (or Helios 6)
  for (const id of ["h1", "h2", "h3"]) {
    profile.orbits[id] = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  }
  assert.equal(totalStars(profile), 9);
  assert.equal(isShipUnlocked("aegis", 9), true);
  assert.equal(selectShip(profile, "aegis"), true);
  assert.equal(isChapterUnlocked(profile, 1), false);

  // 3-starring all of Helios (18 stars) unlocks Pulsar ONLY — never Harmonic!
  for (const id of ["h4", "h5", "h6"]) {
    profile.orbits[id] = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  }
  assert.equal(totalStars(profile), 18);
  assert.equal(isChapterUnlocked(profile, 1), true);
  assert.equal(isChapterUnlocked(profile, 2), false, "Harmonic must stay locked until Pulsar is played");
  assert.equal(isChapterUnlocked(profile, 3), false);

  // 3-starring all of Pulsar too (36 stars total) unlocks Harmonic ONLY — never Singularity!
  for (const id of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
    profile.orbits[id] = { clear: true, par: true, sweep: true, stars: 3, bestShots: 1, bestScore: 1000 };
  }
  assert.equal(totalStars(profile), 36);
  assert.equal(isChapterUnlocked(profile, 2), true);
  assert.equal(isChapterUnlocked(profile, 3), false, "Singularity must stay locked until Harmonic is played");

  // Playing Harmonic and reaching 38 stars unlocks Singularity!
  profile.orbits.m1 = { clear: true, par: true, sweep: false, stars: 2, bestShots: 1, bestScore: 900 };
  assert.equal(totalStars(profile), 38);
  assert.equal(isChapterUnlocked(profile, 3), true);

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

test("Keyed gates stay locked until keys break, and trajectory highlights Key Prisms instead of locked gate", () => {
  const orbit = buildOrbit("p4");
  assert.equal(isGateUnlocked(orbit), false);

  // Shooting straight at the locked gate from just below it must NOT trigger gold/detent
  const lockedPred = predictTrajectory(orbit, orbit.gate.x, orbit.gate.y + 80, 0, -420, "solaris", 30);
  assert.equal(lockedPred.hitGate, false);
  assert.equal(lockedPred.hitKey, false);
  assert.equal(lockedPred.hitObjective, false);

  // Shooting at a remaining Key Prism DOES trigger gold/detent
  const key = orbit.crystals.find((c) => c.isKey);
  const keyPred = predictTrajectory(orbit, key.x, key.y + 60, 0, -400, "solaris", 24);
  assert.equal(keyPred.hitKey, true);
  assert.equal(keyPred.hitObjective, true);
  assert.equal(keyPred.hitGate, false);

  // Once all keys are broken, shooting at the gate triggers hitGate + hitObjective!
  for (const c of orbit.crystals) if (c.isKey) c.alive = false;
  assert.equal(isGateUnlocked(orbit), true);
  const openPred = predictTrajectory(orbit, orbit.gate.x, orbit.gate.y + 80, 0, -420, "solaris", 30);
  assert.equal(openPred.hitGate, true);
  assert.equal(openPred.hitObjective, true);

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
