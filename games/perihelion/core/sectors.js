/**
 * Sector definitions and procedural cosmic generator for Perihelion.
 * World coordinates are fixed at 400 x 720 so physics are identical across
 * every phone viewport size.
 */

export const WORLD_W = 400;
export const WORLD_H = 720;
export const FINAL_SECTOR = 12;

const PLANET_THEMES = {
  terra: { base: "#38bdf8", deep: "#0c4a6e", rim: "#bae6fd", glow: "rgba(56, 189, 248, 0.28)" },
  ice: { base: "#67e8f9", deep: "#164e63", rim: "#ecfeff", glow: "rgba(103, 232, 249, 0.28)" },
  gas: { base: "#c084fc", deep: "#4c1d95", rim: "#f3e8ff", glow: "rgba(192, 132, 252, 0.28)" },
  ember: { base: "#fb923c", deep: "#7c2d12", rim: "#ffedd5", glow: "rgba(251, 146, 60, 0.28)" },
  jade: { base: "#34d399", deep: "#064e3b", rim: "#d1fae5", glow: "rgba(52, 211, 153, 0.28)" },
  repulsor: { base: "#fde047", deep: "#a16207", rim: "#fefce8", glow: "rgba(250, 204, 21, 0.34)" },
  singularity: { base: "#a855f7", deep: "#090514", rim: "#fb923c", glow: "rgba(168, 85, 247, 0.42)" },
};

export function planetTheme(kind) {
  return PLANET_THEMES[kind] || PLANET_THEMES.terra;
}

function makeBody(id, x, y, r, gm, kind, extra = {}) {
  return {
    id,
    x,
    y,
    baseX: x,
    baseY: y,
    r,
    gm,
    kind, // terra | ice | gas | ember | jade | repulsor | singularity
    ring: Boolean(extra.ring),
    ringTilt: extra.ringTilt ?? -0.34,
    grazeR: r + (kind === "singularity" ? 32 : 24),
    orbit: extra.orbit || null, // { cx, cy, rx, ry, speed, phase }
    grazed: false,
    grazeFlash: 0,
  };
}

function makeCrystal(id, x, y, isKey = false) {
  return {
    id,
    x,
    y,
    r: isKey ? 12 : 9,
    isKey,
    alive: true,
    phase: (x * 0.03 + y * 0.02) % 6.28,
  };
}

function makeBumper(id, x, y, r = 15) {
  return { id, x, y, r, flash: 0 };
}

function makeMine(id, x, y, r = 12, patrol = null) {
  return {
    id,
    x,
    y,
    baseX: x,
    baseY: y,
    r,
    alive: true,
    patrol, // { dx, dy, speed, phase }
    phase: (x + y) * 0.05,
  };
}

function makeWormholePair(ax, ay, bx, by, r = 18) {
  return [
    { id: "wh_a", x: ax, y: ay, r, target: "wh_b", color: "#2dd4bf", spin: 0 },
    { id: "wh_b", x: bx, y: by, r, target: "wh_a", color: "#818cf8", spin: 0 },
  ];
}

/** Add an arc of crystals orbiting cleanly around a center point. */
function crystalArc(startId, cx, cy, rad, a0, a1, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = a0 + (a1 - a0) * t;
    const x = Math.max(32, Math.min(WORLD_W - 32, cx + Math.cos(a) * rad));
    const y = Math.max(125, Math.min(WORLD_H - 135, cy + Math.sin(a) * rad));
    out.push(makeCrystal(`c_${startId + i}`, x, y, false));
  }
  return out;
}

/** Helper to horizontally mirror a coordinate around WORLD_W / 2. */
const mx = (x, flip) => (flip < 0 ? WORLD_W - x : x);

/**
 * Generate sector `num` (1-indexed) deterministically from `rng`.
 */
export function generateSector(num, rng) {
  const flip = num === 1 ? 1 : rng.next() < 0.5 ? 1 : -1;
  const jitter = (amt) => rng.range(-amt, amt);

  let name = `Deep Sector ${num}`;
  let hint = "";
  let launch = { x: WORLD_W * 0.5, y: 626 };
  let gate = { x: WORLD_W * 0.5, y: 98, r: 26, pulse: 0 };
  let bodies = [];
  let crystals = [];
  let bumpers = [];
  let mines = [];
  let wormholes = [];

  if (num === 1) {
    name = "First Orbit";
    hint = "Pull anywhere to sling · Hold in flight to orbit";
    bodies = [
      makeBody("b1", 136 + jitter(8), 366 + jitter(8), 34, 1.05e7, "terra", { ring: true }),
    ];
    crystals = [
      ...crystalArc(1, bodies[0].x, bodies[0].y, 76, -1.05, 0.85, 5),
      makeCrystal("c_top", 200, 186),
    ];
  } else if (num === 2) {
    name = "Twin Wells";
    hint = "Hold mid-flight to grapple orbit & whip out";
    bodies = [
      makeBody("b1", mx(122 + jitter(8), flip), 445 + jitter(8), 30, 9.8e6, "ice"),
      makeBody("b2", mx(282 + jitter(8), flip), 268 + jitter(8), 34, 1.18e7, "gas", { ring: true }),
    ];
    crystals = [
      ...crystalArc(1, bodies[0].x, bodies[0].y, 68, -0.7, 0.9, 3),
      ...crystalArc(4, bodies[1].x, bodies[1].y, 72, Math.PI - 0.8, Math.PI + 0.8, 4),
    ];
  } else if (num === 3) {
    name = "Roche Corridor";
    hint = "Skim close to a planet's ring for a Graze bonus";
    gate.x = mx(210 + jitter(14), flip);
    bodies = [
      makeBody("b1", mx(196 + jitter(8), flip), 348 + jitter(6), 40, 1.38e7, "gas", {
        ring: true,
        ringTilt: flip * -0.35,
      }),
      makeBody("b2", mx(86, flip), 210 + jitter(10), 22, 6.2e6, "jade"),
    ];
    crystals = [
      ...crystalArc(1, bodies[0].x, bodies[0].y, 64, -Math.PI * 0.8, Math.PI * 0.35, 6),
      makeCrystal("c_side", mx(302, flip), 225),
    ];
    bumpers = [makeBumper("bp1", mx(324, flip), 390, 15)];
  } else if (num === 4) {
    name = "Repulsor Bank";
    hint = "Amber Magnetars push your probe away";
    gate.x = mx(268 + jitter(10), flip);
    bodies = [
      makeBody("b1", mx(126 + jitter(8), flip), 388 + jitter(8), 28, -9.2e6, "repulsor"),
      makeBody("b2", mx(274 + jitter(8), flip), 296 + jitter(8), 32, 1.12e7, "ember"),
    ];
    crystals = [
      makeCrystal("c1", mx(196, flip), 482),
      makeCrystal("c2", mx(222, flip), 426),
      makeCrystal("c3", mx(216, flip), 362),
      ...crystalArc(4, bodies[1].x, bodies[1].y, 70, Math.PI * 0.7, Math.PI * 1.35, 4),
    ];
    bumpers = [makeBumper("bp1", mx(84, flip), 232, 15)];
  } else if (num === 5) {
    name = "Prism Lock";
    hint = "Shatter the gold Key Prisms to unlock the gate";
    bodies = [
      makeBody("b1", mx(200 + jitter(8), flip), 354, 34, 1.15e7, "terra", { ring: true }),
      makeBody("b2", mx(92, flip), 240, 22, 6.5e6, "ice"),
    ];
    crystals = [
      makeCrystal("k1", mx(112, flip), 362, true),
      makeCrystal("k2", mx(292, flip), 268, true),
      ...crystalArc(1, bodies[0].x, bodies[0].y, 78, -0.5, 1.3, 4),
    ];
    bumpers = [
      makeBumper("bp1", mx(316, flip), 430, 15),
      makeBumper("bp2", mx(312, flip), 186, 15),
    ];
  } else if (num === 6) {
    name = "Binary Dance";
    hint = "Orbiting moons bend gravity in real time";
    const cx = WORLD_W * 0.5;
    const cy = 352;
    bodies = [
      makeBody("b1", cx - 72, cy, 24, 8.2e6, "ice", {
        orbit: { cx, cy, rx: 76, ry: 54, speed: 0.72 * flip, phase: 0 },
      }),
      makeBody("b2", cx + 72, cy, 24, 8.2e6, "ember", {
        orbit: { cx, cy, rx: 76, ry: 54, speed: 0.72 * flip, phase: Math.PI },
      }),
    ];
    crystals = [
      makeCrystal("c1", cx, cy),
      makeCrystal("c2", cx - 95, cy - 95),
      makeCrystal("c3", cx + 95, cy - 95),
      makeCrystal("c4", cx - 95, cy + 95),
      makeCrystal("c5", cx + 95, cy + 95),
      makeCrystal("c6", cx, 200),
    ];
  } else if (num === 7) {
    name = "Wormhole Fold";
    hint = "Thread the teal portal to bypass the guardian";
    gate.x = mx(200, flip);
    bodies = [
      makeBody("b1", mx(200, flip), 262, 42, 1.45e7, "gas", { ring: true }),
      makeBody("b2", mx(106, flip), 472, 24, 7.6e6, "jade"),
    ];
    wormholes = makeWormholePair(mx(312, flip), 442, mx(92, flip), 162, 20);
    crystals = [
      makeCrystal("c1", mx(244, flip), 516),
      makeCrystal("c2", mx(284, flip), 482),
      makeCrystal("c3", mx(134, flip), 140),
      makeCrystal("c4", mx(166, flip), 120),
      ...crystalArc(5, bodies[0].x, bodies[0].y, 76, 0.25, 1.4, 3),
    ];
  } else if (num === 8) {
    name = "Minefield Drift";
    hint = "Avoid crimson mines — or bounce with bumpers";
    gate.x = mx(148 + jitter(16), flip);
    bodies = [
      makeBody("b1", mx(214, flip), 374, 34, 1.2e7, "ember"),
      makeBody("b2", mx(112, flip), 246, 24, -7.8e6, "repulsor"),
    ];
    mines = [
      makeMine("m1", mx(110, flip), 456, 12, { dx: 24, dy: 0, speed: 1.1, phase: 0 }),
      makeMine("m2", mx(302, flip), 296, 12, { dx: 0, dy: 28, speed: 1.0, phase: 1.5 }),
      makeMine("m3", mx(234, flip), 192, 12, { dx: 26, dy: 0, speed: 1.2, phase: 2.8 }),
    ];
    bumpers = [makeBumper("bp1", mx(322, flip), 462, 16)];
    crystals = [
      ...crystalArc(1, bodies[0].x, bodies[0].y, 70, -1.6, 0.9, 5),
      makeCrystal("k1", mx(296, flip), 382, true),
    ];
  } else if (num === 9) {
    name = "Twin Pulsars";
    hint = "Ride the magnetic corridor between repulsors";
    bodies = [
      makeBody("b1", 104, 366, 27, -9.8e6, "repulsor"),
      makeBody("b2", 296, 366, 27, -9.8e6, "repulsor"),
      makeBody("b3", 200, 224, 30, 1.1e7, "terra", { ring: true }),
    ];
    crystals = [
      makeCrystal("c1", 200, 466),
      makeCrystal("c2", 200, 412),
      makeCrystal("c3", 200, 358),
      makeCrystal("k1", mx(116, flip), 224, true),
      makeCrystal("k2", mx(284, flip), 224, true),
      makeCrystal("c6", 200, 152),
    ];
    mines = [
      makeMine("m1", 86, 480, 11),
      makeMine("m2", 314, 480, 11),
    ];
  } else if (num === 10) {
    name = "Event Horizon";
    hint = "Singularities pull hard — graze & whip for 3×!";
    bodies = [
      makeBody("b1", mx(196 + jitter(8), flip), 354, 26, 1.95e7, "singularity"),
      makeBody("b2", mx(98, flip), 206, 20, 6.2e6, "ice"),
    ];
    wormholes = makeWormholePair(mx(322, flip), 344, mx(296, flip), 156, 19);
    crystals = [
      ...crystalArc(1, bodies[0].x, bodies[0].y, 76, 0, Math.PI * 1.65, 7),
      makeCrystal("k1", mx(262, flip), 184, true),
    ];
    mines = [makeMine("m1", mx(92, flip), 458, 12)];
  } else if (num === 11) {
    name = "Grand Orrery";
    hint = "Master binaries, keys & repulsors together";
    const cx = WORLD_W * 0.5;
    const cy = 342;
    bodies = [
      makeBody("b1", cx - 78, cy, 22, 8.8e6, "jade", {
        orbit: { cx, cy, rx: 84, ry: 60, speed: 0.82 * flip, phase: 0.4 },
      }),
      makeBody("b2", cx + 78, cy, 22, 8.8e6, "gas", {
        orbit: { cx, cy, rx: 84, ry: 60, speed: 0.82 * flip, phase: 0.4 + Math.PI },
      }),
      makeBody("b3", mx(200, flip), 488, 22, -7.6e6, "repulsor"),
    ];
    crystals = [
      makeCrystal("k1", 88, 232, true),
      makeCrystal("k2", 312, 232, true),
      makeCrystal("c1", cx, cy),
      makeCrystal("c2", 112, 412),
      makeCrystal("c3", 288, 412),
      makeCrystal("c4", cx, 188),
    ];
    bumpers = [
      makeBumper("bp1", 64, 342, 15),
      makeBumper("bp2", 336, 342, 15),
    ];
    mines = [
      makeMine("m1", cx, 260, 11, { dx: 48, dy: 0, speed: 1.15, phase: 0 }),
    ];
  } else if (num === 12) {
    name = "The Perihelion";
    hint = "Break the Solar Crown to reach the Apex Gate";
    bodies = [
      makeBody("b1", 122, 378, 25, 1.75e7, "singularity"),
      makeBody("b2", 278, 272, 25, 1.75e7, "singularity"),
    ];
    wormholes = makeWormholePair(68, 240, 332, 434, 18);
    crystals = [
      makeCrystal("k1", 200, 325, true),
      makeCrystal("k2", 112, 190, true),
      makeCrystal("k3", 288, 174, true),
      ...crystalArc(1, 122, 378, 68, 0.2, 2.2, 4),
      ...crystalArc(5, 278, 272, 68, -2.5, -0.5, 4),
    ];
    bumpers = [makeBumper("bp1", 200, 480, 15)];
    mines = [
      makeMine("m1", 316, 514, 11),
      makeMine("m2", 84, 514, 11),
    ];
  } else {
    // Endless Deep Space (13+): clean procedural composition
    const tier = num - FINAL_SECTOR;
    name = `Deep Space ${num}`;
    hint = "";
    gate.x = rng.range(115, 285);
    launch.x = rng.range(155, 245);

    const bodyCount = Math.min(4, 2 + (tier % 3));
    const kinds = ["terra", "ice", "gas", "ember", "jade", "repulsor", "singularity"];
    for (let i = 0; i < bodyCount; i++) {
      let placed = null;
      for (let tries = 0; tries < 30; tries++) {
        const kind = rng.pick(kinds);
        const r = kind === "singularity" ? 24 : kind === "repulsor" ? 25 : rng.range(23, 36);
        const x = rng.range(68, WORLD_W - 68);
        const y = rng.range(195, 515);
        const tooClose =
          Math.hypot(x - launch.x, y - launch.y) < r + 96 ||
          Math.hypot(x - gate.x, y - gate.y) < r + 88 ||
          bodies.some((b) => Math.hypot(x - b.x, y - b.y) < r + b.r + 56);
        if (!tooClose) {
          const gm =
            kind === "singularity"
              ? rng.range(1.65e7, 2.05e7)
              : kind === "repulsor"
                ? -rng.range(7.8e6, 1.05e7)
                : rng.range(7.8e6, 1.38e7);
          placed = makeBody(`b${i + 1}`, x, y, r, gm, kind, {
            ring: kind === "gas" || (kind === "terra" && rng.next() < 0.35),
          });
          break;
        }
      }
      if (placed) bodies.push(placed);
    }

    // Add wormhole on every other endless sector
    if (tier % 2 === 1) {
      wormholes = makeWormholePair(
        mx(72, flip),
        rng.range(410, 480),
        mx(328, flip),
        rng.range(175, 240),
        18,
      );
    }

    // Keys + crystals along safe arcs
    const keyCount = Math.min(3, 1 + Math.floor(tier / 2));
    for (let k = 0; k < keyCount; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = rng.range(62, WORLD_W - 62);
        const y = rng.range(175, 485);
        const blocked =
          bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + 34) ||
          crystals.some((c) => Math.hypot(x - c.x, y - c.y) < 42);
        if (!blocked) {
          crystals.push(makeCrystal(`k${k + 1}`, x, y, true));
          break;
        }
      }
    }

    let cid = 1;
    for (const b of bodies.slice(0, 2)) {
      const a0 = rng.range(0, Math.PI * 2);
      const pts = crystalArc(cid, b.x, b.y, b.r + 38, a0, a0 + 1.8, 3);
      cid += 3;
      for (const c of pts) {
        if (!bodies.some((ob) => Math.hypot(c.x - ob.x, c.y - ob.y) < ob.r + 20)) {
          crystals.push(c);
        }
      }
    }

    // Mines scaling gently
    const mineCount = Math.min(4, 1 + Math.floor(tier / 2));
    for (let m = 0; m < mineCount; m++) {
      for (let tries = 0; tries < 25; tries++) {
        const x = rng.range(54, WORLD_W - 54);
        const y = rng.range(190, 515);
        const blocked =
          Math.hypot(x - launch.x, y - launch.y) < 88 ||
          Math.hypot(x - gate.x, y - gate.y) < 76 ||
          bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + 34) ||
          crystals.some((c) => Math.hypot(x - c.x, y - c.y) < 34) ||
          mines.some((om) => Math.hypot(x - om.x, y - om.y) < 44);
        if (!blocked) {
          mines.push(
            makeMine(
              `m${m + 1}`,
              x,
              y,
              12,
              rng.next() < 0.5 ? { dx: 24, dy: 0, speed: 1.1, phase: rng.range(0, 6.28) } : null,
            ),
          );
          break;
        }
      }
    }

    if (rng.next() < 0.65) {
      bumpers.push(makeBumper("bp1", mx(332, flip), rng.range(280, 440), 15));
    }
  }

  return {
    num,
    name,
    hint,
    launch,
    gate,
    bodies,
    crystals,
    bumpers,
    mines,
    wormholes,
    clock: 0,
    totalCrystals: crystals.length,
    aegisUsed: false,
  };
}

/** Count remaining Resonance Keys locking the Warp Gate. */
export function remainingKeys(sector) {
  let n = 0;
  for (const c of sector.crystals) if (c.alive && c.isKey) n++;
  return n;
}

export function isGateUnlocked(sector) {
  return remainingKeys(sector) === 0;
}

/**
 * Advance animated orbits & patrolling mines deterministically.
 */
export function updateSectorMotion(sector, dt, timeScale = 1) {
  const step = dt * timeScale;
  sector.clock += step;
  sector.gate.pulse += dt * 3.1;

  for (const b of sector.bodies) {
    if (b.orbit) {
      const a = b.orbit.phase + sector.clock * b.orbit.speed;
      b.x = b.orbit.cx + Math.cos(a) * b.orbit.rx;
      b.y = b.orbit.cy + Math.sin(a) * b.orbit.ry;
    }
    if (b.grazeFlash > 0) b.grazeFlash = Math.max(0, b.grazeFlash - dt * 2.2);
  }

  for (const m of sector.mines) {
    if (!m.alive) continue;
    m.phase += step * 2.4;
    if (m.patrol) {
      const s = Math.sin(m.patrol.phase + sector.clock * m.patrol.speed);
      m.x = m.baseX + m.patrol.dx * s;
      m.y = m.baseY + m.patrol.dy * s;
    }
  }

  for (const bp of sector.bumpers) {
    if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 3.5);
  }

  for (const w of sector.wormholes) {
    w.spin += dt * 2.8;
  }
}
