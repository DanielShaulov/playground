/**
 * Hand-crafted 24-Orbit Constellation Campaign (4 Chapters x 6 Orbits)
 * plus a deterministic 5-Orbit Daily Gauntlet generator.
 *
 * World coordinates are fixed at 400 x 720 so every curve and par shot is
 * identical across every phone screen size.
 */

export const WORLD_W = 400;
export const WORLD_H = 720;

export const CHAPTERS = [
  {
    id: "helios",
    num: 1,
    name: "Helios",
    subtitle: "Gravity & Grapple",
    accent: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.11)",
    bgTop: "#050918",
    bgMid: "#0b142c",
    bgBot: "#12102a",
    starsToUnlock: 0,
  },
  {
    id: "pulsar",
    num: 2,
    name: "Pulsar",
    subtitle: "Repulsors & Bumpers",
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.10)",
    bgTop: "#0a0814",
    bgMid: "#191229",
    bgBot: "#24131c",
    starsToUnlock: 10,
  },
  {
    id: "harmonic",
    num: 3,
    name: "Harmonic",
    subtitle: "Binaries & Wormholes",
    accent: "#34d399",
    glow: "rgba(52, 211, 153, 0.10)",
    bgTop: "#041016",
    bgMid: "#09212a",
    bgBot: "#13132b",
    starsToUnlock: 22,
  },
  {
    id: "singularity",
    num: 4,
    name: "Singularity",
    subtitle: "Event Horizons",
    accent: "#f97316",
    glow: "rgba(249, 115, 22, 0.11)",
    bgTop: "#09040e",
    bgMid: "#1b0b22",
    bgBot: "#240a16",
    starsToUnlock: 38,
  },
];

const PLANET_THEMES = {
  terra: { base: "#38bdf8", deep: "#0c4a6e", rim: "#bae6fd", glow: "rgba(56, 189, 248, 0.30)" },
  ice: { base: "#67e8f9", deep: "#164e63", rim: "#ecfeff", glow: "rgba(103, 232, 249, 0.30)" },
  gas: { base: "#c084fc", deep: "#4c1d95", rim: "#f3e8ff", glow: "rgba(192, 132, 252, 0.30)" },
  ember: { base: "#fb923c", deep: "#7c2d12", rim: "#ffedd5", glow: "rgba(251, 146, 60, 0.30)" },
  jade: { base: "#34d399", deep: "#064e3b", rim: "#d1fae5", glow: "rgba(52, 211, 153, 0.30)" },
  repulsor: { base: "#fde047", deep: "#a16207", rim: "#fefce8", glow: "rgba(250, 204, 21, 0.36)" },
  singularity: { base: "#a855f7", deep: "#070410", rim: "#fb923c", glow: "rgba(168, 85, 247, 0.45)" },
};

export function planetTheme(kind) {
  return PLANET_THEMES[kind] || PLANET_THEMES.terra;
}

function body(id, x, y, r, gm, kind, extra = {}) {
  return {
    id,
    x,
    y,
    baseX: x,
    baseY: y,
    r,
    gm,
    kind,
    ring: Boolean(extra.ring),
    ringTilt: extra.ringTilt ?? -0.34,
    grazeR: r + (kind === "singularity" ? 32 : 24),
    orbit: extra.orbit || null,
    grazed: false,
    grazeFlash: 0,
  };
}

function crystal(id, x, y, isKey = false) {
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

function bumper(id, x, y, r = 16) {
  return { id, x, y, r, flash: 0 };
}

function mine(id, x, y, r = 12, patrol = null) {
  return {
    id,
    x,
    y,
    baseX: x,
    baseY: y,
    r,
    alive: true,
    patrol,
    phase: (x + y) * 0.05,
  };
}

function wormholes(ax, ay, bx, by, r = 19) {
  return [
    { id: "wh_a", x: ax, y: ay, r, target: "wh_b", color: "#2dd4bf", spin: 0 },
    { id: "wh_b", x: bx, y: by, r, target: "wh_a", color: "#818cf8", spin: 0 },
  ];
}

function arc(prefix, cx, cy, rad, a0, a1, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = a0 + (a1 - a0) * t;
    out.push(
      crystal(
        `${prefix}_${i}`,
        Math.max(30, Math.min(WORLD_W - 30, cx + Math.cos(a) * rad)),
        Math.max(120, Math.min(WORLD_H - 135, cy + Math.sin(a) * rad)),
      ),
    );
  }
  return out;
}

/**
 * Metadata for all 24 handcrafted Constellation Orbits (6 per chapter).
 * `mapPos` places each star along an authentic constellation silhouette on the Star Chart.
 */
export const ORBIT_SPECS = [
  // ================= CHAPTER 1: HELIOS =================
  {
    id: "h1",
    chapter: 0,
    index: 1,
    name: "First Curve",
    par: 1,
    tutorial: "pull",
    mapPos: { x: 86, y: 422 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 112, r: 28, pulse: 0 },
      bodies: [body("b1", 126, 368, 34, 1.08e7, "terra", { ring: true })],
      crystals: [
        crystal("c_0", 147, 543),
        crystal("c_1", 98, 462),
        crystal("c_2", 69, 351),
        crystal("c_3", 98, 246),
        crystal("c_4", 136, 166),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 200, y: 112, text: "WARP GATE", side: "right", color: "#fde047" },
        { x: 126, y: 368, text: "GRAVITY WELL", side: "right", color: "#38bdf8" },
      ],
    }),
  },
  {
    id: "h2",
    chapter: 0,
    index: 2,
    name: "Orbit Whip",
    par: 1,
    tutorial: "grapple",
    mapPos: { x: 174, y: 364 },
    build: () => ({
      launch: { x: 110, y: 616 },
      gate: { x: 96, y: 120, r: 28, pulse: 0 },
      bodies: [body("b1", 214, 348, 38, 1.18e7, "ice", { ring: true })],
      crystals: [
        ...arc("c", 214, 348, 84, -1.7, 0.45, 5),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 214, y: 348, text: "HOLD MID-FLIGHT TO SLOW-ORBIT", side: "left", color: "#5eead4" },
      ],
    }),
  },
  {
    id: "h3",
    chapter: 0,
    index: 3,
    name: "Roche Skim",
    par: 1,
    tutorial: "graze",
    mapPos: { x: 286, y: 324 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 244, y: 108, r: 27, pulse: 0 },
      bodies: [
        body("b1", 192, 360, 40, 1.38e7, "gas", { ring: true }),
      ],
      crystals: [
        crystal("c_0", 278, 551),
        crystal("c_1", 325, 488),
        crystal("c_2", 358, 405),
        crystal("c_3", 365, 321),
        crystal("c_4", 348, 236),
        crystal("c_5", 315, 163),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 192, y: 360, text: "SKIM DASHED RING = GRAZE", side: "left", color: "#fbbf24" },
      ],
    }),
  },
  {
    id: "h4",
    chapter: 0,
    index: 4,
    name: "Figure Eight",
    par: 1,
    mapPos: { x: 234, y: 242 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 104, r: 26, pulse: 0 },
      bodies: [
        body("b1", 122, 446, 30, 1.02e7, "terra"),
        body("b2", 278, 266, 32, 1.14e7, "gas", { ring: true }),
      ],
      crystals: [
        crystal("c_0", 129, 554),
        crystal("c_1", 78, 484),
        crystal("c_2", 66, 389),
        crystal("c_3", 85, 308),
        crystal("c_4", 114, 238),
        crystal("c_5", 147, 181),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "h5",
    chapter: 0,
    index: 5,
    name: "Lagrange Drift",
    par: 1,
    mapPos: { x: 122, y: 208 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 108, 356, 30, 1.15e7, "ice"),
        body("b2", 292, 356, 30, 1.15e7, "ember"),
      ],
      crystals: [
        crystal("c1", 200, 470),
        crystal("c2", 200, 412),
        crystal("c3", 200, 356),
        crystal("c4", 200, 298),
        crystal("c5", 200, 236),
        crystal("c6", 200, 178),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "h6",
    chapter: 0,
    index: 6,
    name: "Helios Crown",
    par: 2,
    mapPos: { x: 214, y: 138 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 354, 36, 1.32e7, "gas", { ring: true }),
        body("b2", 88, 222, 22, 6.8e6, "terra"),
        body("b3", 312, 222, 22, 6.8e6, "jade"),
      ],
      crystals: [
        crystal("c_0", 269, 561),
        crystal("c_1", 313, 508),
        crystal("c_2", 348, 442),
        crystal("c_3", 369, 355),
        crystal("c_4", 366, 263),
        crystal("c_5", 299, 164),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },

  // ================= CHAPTER 2: PULSAR =================
  {
    id: "p1",
    chapter: 1,
    index: 1,
    name: "Magnetar Push",
    par: 1,
    mapPos: { x: 96, y: 416 },
    build: () => ({
      launch: { x: 185, y: 616 },
      gate: { x: 280, y: 112, r: 26, pulse: 0 },
      bodies: [
        body("b1", 142, 372, 28, -9.8e6, "repulsor"),
        body("b2", 282, 286, 30, 1.08e7, "ember"),
      ],
      crystals: [
        crystal("c1", 203, 536),
        crystal("c2", 227, 469),
        crystal("c3", 270, 404),
        crystal("c4", 328, 311),
        crystal("c5", 328, 189),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 142, y: 372, text: "MAGNETAR · PUSHES AWAY", side: "right", color: "#fde047" },
      ],
    }),
  },
  {
    id: "p2",
    chapter: 1,
    index: 2,
    name: "Ricochet Bell",
    par: 1,
    mapPos: { x: 196, y: 372 },
    build: () => ({
      launch: { x: 140, y: 616 },
      gate: { x: 116, y: 112, r: 26, pulse: 0 },
      bodies: [
        body("b1", 136, 356, 36, 1.15e7, "terra", { ring: true }),
      ],
      crystals: [
        crystal("c1", 248, 468),
        crystal("c2", 286, 396),
        crystal("c3", 252, 282),
        crystal("c4", 190, 198),
      ],
      bumpers: [
        bumper("bp1", 304, 344, 22),
      ],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 304, y: 344, text: "SOLAR BUMPER", side: "left", color: "#fbbf24" },
      ],
    }),
  },
  {
    id: "p3",
    chapter: 1,
    index: 3,
    name: "Twin Pulsars",
    par: 1,
    mapPos: { x: 298, y: 320 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 104, r: 26, pulse: 0 },
      bodies: [
        body("b1", 104, 386, 28, -1.04e7, "repulsor"),
        body("b2", 296, 386, 28, -1.04e7, "repulsor"),
        body("b3", 200, 224, 28, 1.05e7, "ice"),
      ],
      crystals: [
        crystal("c1", 218, 511),
        crystal("c2", 230, 452),
        crystal("c3", 232, 410),
        crystal("c4", 209, 378),
        crystal("c5", 175, 324),
        crystal("c6", 159, 234),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "p4",
    chapter: 1,
    index: 4,
    name: "Pinball Vault",
    par: 2,
    mapPos: { x: 256, y: 234 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 352, 34, 1.22e7, "ember"),
      ],
      crystals: [
        crystal("k1", 92, 352, true),
        crystal("k2", 308, 352, true),
        ...arc("c", 200, 352, 74, -2.3, -0.8, 4),
      ],
      bumpers: [
        bumper("bp1", 72, 466, 16),
        bumper("bp2", 328, 466, 16),
        bumper("bp3", 72, 228, 16),
        bumper("bp4", 328, 228, 16),
      ],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 92, y: 352, text: "KEY PRISM · UNLOCKS GATE", side: "right", color: "#fde047" },
      ],
    }),
  },
  {
    id: "p5",
    chapter: 1,
    index: 5,
    name: "Deflector Alley",
    par: 2,
    mapPos: { x: 142, y: 196 },
    build: () => ({
      launch: { x: 98, y: 616 },
      gate: { x: 302, y: 108, r: 26, pulse: 0 },
      bodies: [
        body("b1", 220, 444, 26, -9.2e6, "repulsor"),
        body("b2", 168, 254, 28, -9.2e6, "repulsor"),
        body("b3", 304, 314, 26, 9.6e6, "jade"),
      ],
      crystals: [
        crystal("c1", 116, 480),
        crystal("c2", 104, 386),
        crystal("c3", 184, 354),
        crystal("c4", 268, 212),
        crystal("k1", 102, 232, true),
      ],
      bumpers: [bumper("bp1", 62, 310, 16)],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "p6",
    chapter: 1,
    index: 6,
    name: "Pulsar Citadel",
    par: 2,
    mapPos: { x: 214, y: 132 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 434, 25, -9.4e6, "repulsor"),
        body("b2", 112, 268, 30, 1.15e7, "gas", { ring: true }),
        body("b3", 288, 268, 30, 1.15e7, "ember"),
      ],
      crystals: [
        crystal("k1", 112, 182, true),
        crystal("k2", 288, 182, true),
        crystal("c1", 200, 332),
        crystal("c2", 200, 268),
        crystal("c3", 200, 204),
      ],
      bumpers: [
        bumper("bp1", 66, 434, 16),
        bumper("bp2", 334, 434, 16),
      ],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },

  // ================= CHAPTER 3: HARMONIC =================
  {
    id: "m1",
    chapter: 2,
    index: 1,
    name: "Binary Waltz",
    par: 1,
    mapPos: { x: 92, y: 420 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 104, r: 26, pulse: 0 },
      bodies: [
        body("b1", 124, 356, 24, 8.6e6, "ice", {
          orbit: { cx: 200, cy: 356, rx: 78, ry: 56, speed: 0.72, phase: 0 },
        }),
        body("b2", 276, 356, 24, 8.6e6, "jade", {
          orbit: { cx: 200, cy: 356, rx: 78, ry: 56, speed: 0.72, phase: Math.PI },
        }),
      ],
      crystals: [
        crystal("c1", 200, 356),
        crystal("c2", 104, 266),
        crystal("c3", 296, 266),
        crystal("c4", 104, 446),
        crystal("c5", 296, 446),
        crystal("c6", 200, 194),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 200, y: 356, text: "ORBITING BINARIES", side: "right", color: "#34d399" },
      ],
    }),
  },
  {
    id: "m2",
    chapter: 2,
    index: 2,
    name: "Wormhole Fold",
    par: 1,
    mapPos: { x: 184, y: 368 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 268, 44, 1.48e7, "gas", { ring: true }),
        body("b2", 104, 476, 24, 7.6e6, "jade"),
      ],
      crystals: [
        crystal("c1", 248, 520),
        crystal("c2", 286, 480),
        crystal("c3", 132, 144),
        crystal("c4", 168, 120),
        ...arc("c5", 200, 268, 80, 0.35, 1.35, 3),
      ],
      bumpers: [],
      mines: [],
      wormholes: wormholes(312, 434, 92, 168, 20),
      callouts: [
        { x: 312, y: 434, text: "WORMHOLE · TELEPORTS", side: "left", color: "#2dd4bf" },
      ],
    }),
  },
  {
    id: "m3",
    chapter: 2,
    index: 3,
    name: "Quantum Loop",
    par: 2,
    mapPos: { x: 292, y: 314 },
    build: () => ({
      launch: { x: 108, y: 616 },
      gate: { x: 294, y: 108, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 360, 36, 1.32e7, "terra", { ring: true }),
      ],
      crystals: [
        crystal("k1", 312, 360, true),
        crystal("c1", 118, 456),
        crystal("c2", 96, 360),
        crystal("c3", 286, 214),
        crystal("c4", 200, 250),
      ],
      bumpers: [bumper("bp1", 326, 268, 15)],
      mines: [],
      wormholes: wormholes(86, 248, 306, 472, 19),
      callouts: [],
    }),
  },
  {
    id: "m4",
    chapter: 2,
    index: 4,
    name: "Orrery Keys",
    par: 2,
    mapPos: { x: 244, y: 226 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 122, 344, 22, 8.6e6, "jade", {
          orbit: { cx: 200, cy: 344, rx: 82, ry: 58, speed: 0.78, phase: 0.4 },
        }),
        body("b2", 278, 344, 22, 8.6e6, "gas", {
          orbit: { cx: 200, cy: 344, rx: 82, ry: 58, speed: 0.78, phase: 0.4 + Math.PI },
        }),
        body("b3", 200, 488, 22, -7.8e6, "repulsor"),
      ],
      crystals: [
        crystal("k1", 86, 232, true),
        crystal("k2", 314, 232, true),
        crystal("c1", 200, 344),
        crystal("c2", 112, 412),
        crystal("c3", 288, 412),
      ],
      bumpers: [bumper("bp1", 62, 344, 15), bumper("bp2", 338, 344, 15)],
      mines: [],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "m5",
    chapter: 2,
    index: 5,
    name: "Mirror Fold",
    par: 2,
    mapPos: { x: 132, y: 194 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 118, 360, 28, 1.05e7, "ice"),
        body("b2", 282, 360, 28, -9.5e6, "repulsor"),
        body("b3", 200, 214, 26, 9.8e6, "jade"),
      ],
      crystals: [
        crystal("k1", 80, 206, true),
        crystal("k2", 320, 206, true),
        crystal("c1", 200, 456),
        crystal("c2", 200, 360),
        crystal("c3", 200, 294),
      ],
      bumpers: [],
      mines: [],
      wormholes: wormholes(324, 486, 82, 268, 18),
      callouts: [],
    }),
  },
  {
    id: "m6",
    chapter: 2,
    index: 6,
    name: "Harmonic Gate",
    par: 2,
    mapPos: { x: 212, y: 128 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 136, 366, 22, 9.2e6, "terra", {
          orbit: { cx: 200, cy: 366, rx: 72, ry: 48, speed: -0.82, phase: 0 },
        }),
        body("b2", 264, 366, 22, 9.2e6, "ember", {
          orbit: { cx: 200, cy: 366, rx: 72, ry: 48, speed: -0.82, phase: Math.PI },
        }),
      ],
      crystals: [
        crystal("k1", 92, 214, true),
        crystal("k2", 308, 214, true),
        crystal("k3", 200, 366, true),
        crystal("c1", 200, 250),
        crystal("c2", 200, 482),
      ],
      bumpers: [bumper("bp1", 200, 186, 15)],
      mines: [],
      wormholes: wormholes(74, 460, 326, 268, 18),
      callouts: [],
    }),
  },

  // ================= CHAPTER 4: SINGULARITY =================
  {
    id: "s1",
    chapter: 3,
    index: 1,
    name: "Event Horizon",
    par: 1,
    mapPos: { x: 88, y: 418 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 196, 356, 26, 1.92e7, "singularity"),
      ],
      crystals: [
        ...arc("c", 196, 356, 76, -0.35, Math.PI * 1.45, 7),
      ],
      bumpers: [],
      mines: [],
      wormholes: [],
      callouts: [
        { x: 196, y: 356, text: "SINGULARITY · EXTREME PULL", side: "right", color: "#fb923c" },
      ],
    }),
  },
  {
    id: "s2",
    chapter: 3,
    index: 2,
    name: "Minefield Drift",
    par: 1,
    mapPos: { x: 186, y: 366 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 150, y: 106, r: 26, pulse: 0 },
      bodies: [
        body("b1", 216, 374, 34, 1.24e7, "ember"),
        body("b2", 112, 244, 24, -8.2e6, "repulsor"),
      ],
      crystals: [
        ...arc("c", 216, 374, 72, -1.6, 0.9, 5),
        crystal("k1", 300, 382, true),
      ],
      bumpers: [bumper("bp1", 326, 466, 16)],
      mines: [
        mine("m1", 108, 456, 12, { dx: 24, dy: 0, speed: 1.1, phase: 0 }),
        mine("m2", 302, 286, 12, { dx: 0, dy: 26, speed: 1.0, phase: 1.4 }),
      ],
      wormholes: [],
      callouts: [
        { x: 108, y: 456, text: "ASTEROID MINE", side: "right", color: "#f87171" },
      ],
    }),
  },
  {
    id: "s3",
    chapter: 3,
    index: 3,
    name: "Accretion Fold",
    par: 2,
    mapPos: { x: 294, y: 318 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 196, 356, 26, 1.98e7, "singularity"),
        body("b2", 96, 206, 20, 6.4e6, "ice"),
      ],
      crystals: [
        ...arc("c", 196, 356, 76, 0.2, Math.PI * 1.55, 6),
        crystal("k1", 268, 184, true),
      ],
      bumpers: [],
      mines: [mine("m1", 92, 462, 12)],
      wormholes: wormholes(324, 346, 298, 156, 19),
      callouts: [],
    }),
  },
  {
    id: "s4",
    chapter: 3,
    index: 4,
    name: "Crimson Patrol",
    par: 2,
    mapPos: { x: 244, y: 230 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 118, 366, 24, 1.55e7, "singularity"),
        body("b2", 282, 366, 24, -9.8e6, "repulsor"),
      ],
      crystals: [
        crystal("k1", 118, 224, true),
        crystal("k2", 282, 224, true),
        crystal("c1", 200, 444),
        crystal("c2", 200, 366),
        crystal("c3", 200, 286),
      ],
      bumpers: [bumper("bp1", 332, 272, 15)],
      mines: [
        mine("m1", 200, 212, 11, { dx: 48, dy: 0, speed: 1.2, phase: 0 }),
        mine("m2", 200, 496, 11, { dx: 46, dy: 0, speed: 1.15, phase: 2.2 }),
      ],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "s5",
    chapter: 3,
    index: 5,
    name: "Binary Abyss",
    par: 2,
    mapPos: { x: 130, y: 192 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 102, r: 26, pulse: 0 },
      bodies: [
        body("b1", 200, 356, 25, 1.85e7, "singularity"),
        body("b2", 90, 356, 18, 6.2e6, "ember", {
          orbit: { cx: 200, cy: 356, rx: 112, ry: 88, speed: 0.72, phase: 0 },
        }),
        body("b3", 310, 356, 18, 6.2e6, "ice", {
          orbit: { cx: 200, cy: 356, rx: 112, ry: 88, speed: 0.72, phase: Math.PI },
        }),
      ],
      crystals: [
        crystal("k1", 86, 216, true),
        crystal("k2", 314, 216, true),
        crystal("c1", 200, 252),
        crystal("c2", 200, 464),
        crystal("c3", 122, 356),
        crystal("c4", 278, 356),
      ],
      bumpers: [],
      mines: [mine("m1", 84, 488, 11), mine("m2", 316, 488, 11)],
      wormholes: [],
      callouts: [],
    }),
  },
  {
    id: "s6",
    chapter: 3,
    index: 6,
    name: "The Perihelion",
    par: 3,
    mapPos: { x: 214, y: 126 },
    build: () => ({
      launch: { x: 200, y: 616 },
      gate: { x: 200, y: 100, r: 27, pulse: 0 },
      bodies: [
        body("b1", 122, 382, 25, 1.78e7, "singularity"),
        body("b2", 278, 272, 25, 1.78e7, "singularity"),
      ],
      crystals: [
        crystal("k1", 200, 326, true),
        crystal("k2", 110, 186, true),
        crystal("k3", 290, 174, true),
        ...arc("c1", 122, 382, 68, 0.2, 2.2, 4),
        ...arc("c2", 278, 272, 68, -2.5, -0.5, 4),
      ],
      bumpers: [bumper("bp1", 200, 484, 15)],
      mines: [mine("m1", 84, 514, 11), mine("m2", 316, 514, 11)],
      wormholes: wormholes(68, 240, 332, 434, 18),
      callouts: [],
    }),
  },
];

export const ORBIT_BY_ID = Object.fromEntries(ORBIT_SPECS.map((o) => [o.id, o]));

export function buildOrbit(orbitId) {
  const spec = ORBIT_BY_ID[orbitId] || ORBIT_SPECS[0];
  const data = spec.build();
  const chapter = CHAPTERS[spec.chapter];
  return {
    id: spec.id,
    chapter: spec.chapter,
    chapterName: chapter.name,
    index: spec.index,
    globalNum: spec.chapter * 6 + spec.index,
    name: spec.name,
    par: spec.par,
    tutorial: spec.tutorial || null,
    launch: { ...data.launch },
    gate: { ...data.gate },
    bodies: data.bodies,
    crystals: data.crystals,
    bumpers: data.bumpers,
    mines: data.mines,
    wormholes: data.wormholes,
    callouts: data.callouts || [],
    clock: 0,
    totalCrystals: data.crystals.length,
    aegisUsed: false,
  };
}

/**
 * Generate a 5-stage deterministic Daily Gauntlet orbit using `rng`.
 */
export function buildDailyOrbit(stageNum, rng) {
  const flip = rng.next() < 0.5 ? 1 : -1;
  const mx = (x) => (flip < 0 ? WORLD_W - x : x);
  const launch = { x: WORLD_W * 0.5 + rng.range(-36, 36), y: 616 };
  const gate = { x: WORLD_W * 0.5 + rng.range(-72, 72), y: 104, r: 26, pulse: 0 };

  const bodies = [];
  const crystals = [];
  const bumpers = [];
  const mines = [];
  let wh = [];

  const bodyCount = Math.min(3, 1 + Math.ceil(stageNum / 2));
  const pool =
    stageNum === 1
      ? ["terra", "ice", "gas"]
      : stageNum <= 3
        ? ["terra", "gas", "ember", "jade", "repulsor"]
        : ["gas", "ember", "repulsor", "singularity"];

  for (let i = 0; i < bodyCount; i++) {
    for (let tries = 0; tries < 36; tries++) {
      const kind = rng.pick(pool);
      const r = kind === "singularity" ? 25 : kind === "repulsor" ? 26 : rng.range(24, 36);
      const x = rng.range(72, WORLD_W - 72);
      const y = rng.range(210, 505);
      const repulsorBlocksGate =
        kind === "repulsor" &&
        (Math.hypot(x - gate.x, y - gate.y) < r + 150 || (y < 300 && Math.abs(x - gate.x) < 70));
      const blocked =
        repulsorBlocksGate ||
        Math.hypot(x - launch.x, y - launch.y) < r + 98 ||
        Math.hypot(x - gate.x, y - gate.y) < r + 96 ||
        bodies.some((b) => Math.hypot(x - b.x, y - b.y) < r + b.r + 62);
      if (!blocked) {
        const gm =
          kind === "singularity"
            ? rng.range(1.65e7, 1.95e7)
            : kind === "repulsor"
              ? -rng.range(8.4e6, 1.04e7)
              : rng.range(8.6e6, 1.34e7);
        bodies.push(body(`db${i}`, x, y, r, gm, kind, { ring: kind === "gas" }));
        break;
      }
    }
  }

  // Place wormhole pair only when both portals have generous clearance from all bodies
  if (stageNum >= 3 && rng.next() < 0.65) {
    const whR = 19;
    let placedA = null;
    let placedB = null;
    for (let tries = 0; tries < 36; tries++) {
      const ax = mx(rng.range(58, 128));
      const ay = rng.range(395, 505);
      const okA =
        Math.hypot(ax - launch.x, ay - launch.y) >= 96 &&
        Math.hypot(ax - gate.x, ay - gate.y) >= 120 &&
        bodies.every((b) => Math.hypot(ax - b.x, ay - b.y) >= b.r + whR + 36);
      if (okA) {
        placedA = { x: ax, y: ay };
        break;
      }
    }
    if (placedA) {
      for (let tries = 0; tries < 36; tries++) {
        const bx = mx(rng.range(272, 342));
        const by = rng.range(168, 285);
        const okB =
          Math.hypot(bx - launch.x, by - launch.y) >= 120 &&
          Math.hypot(bx - gate.x, by - gate.y) >= 88 &&
          Math.hypot(bx - placedA.x, by - placedA.y) >= 170 &&
          bodies.every((b) => Math.hypot(bx - b.x, by - b.y) >= b.r + whR + 36);
        if (okB) {
          placedB = { x: bx, y: by };
          break;
        }
      }
    }
    if (placedA && placedB) {
      wh = wormholes(placedA.x, placedA.y, placedB.x, placedB.y, whR);
    }
  }

  if (stageNum >= 2) {
    const keys = stageNum >= 4 ? 2 : 1;
    for (let k = 0; k < keys; k++) {
      for (let tries = 0; tries < 36; tries++) {
        const x = rng.range(64, WORLD_W - 64);
        const y = rng.range(178, 470);
        const blocked =
          bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + 38) ||
          wh.some((w) => Math.hypot(x - w.x, y - w.y) < w.r + 34) ||
          crystals.some((c) => Math.hypot(x - c.x, y - c.y) < 48);
        if (!blocked) {
          crystals.push(crystal(`dk${k}`, x, y, true));
          break;
        }
      }
    }
  }

  for (let i = 0; i < Math.min(2, bodies.length); i++) {
    const b = bodies[i];
    const a0 = rng.range(0, Math.PI * 2);
    const pts = arc(`dc${i}`, b.x, b.y, b.r + 40, a0, a0 + 1.65, 3);
    for (const c of pts) {
      if (
        !bodies.some((ob) => Math.hypot(c.x - ob.x, c.y - ob.y) < ob.r + 22) &&
        !wh.some((w) => Math.hypot(c.x - w.x, c.y - w.y) < w.r + 26)
      ) {
        crystals.push(c);
      }
    }
  }

  if (stageNum >= 3) {
    const mineCount = stageNum >= 5 ? 2 : 1;
    for (let m = 0; m < mineCount; m++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = rng.range(60, WORLD_W - 60);
        const y = rng.range(200, 500);
        const blocked =
          Math.hypot(x - launch.x, y - launch.y) < 96 ||
          Math.hypot(x - gate.x, y - gate.y) < 88 ||
          bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + 38) ||
          wh.some((w) => Math.hypot(x - w.x, y - w.y) < w.r + 36) ||
          crystals.some((c) => Math.hypot(x - c.x, y - c.y) < 38) ||
          mines.some((om) => Math.hypot(x - om.x, y - om.y) < 48);
        if (!blocked) {
          mines.push(mine(`dm${m}`, x, y, 12));
          break;
        }
      }
    }
  }

  if (rng.next() < 0.6) {
    for (let tries = 0; tries < 24; tries++) {
      const bx = mx(rng.range(280, 342));
      const by = rng.range(250, 460);
      const ok =
        Math.hypot(bx - launch.x, by - launch.y) >= 92 &&
        Math.hypot(bx - gate.x, by - gate.y) >= 88 &&
        bodies.every((b) => Math.hypot(bx - b.x, by - b.y) >= b.r + 36) &&
        wh.every((w) => Math.hypot(bx - w.x, by - w.y) >= w.r + 36) &&
        crystals.every((c) => Math.hypot(bx - c.x, by - c.y) >= 34) &&
        mines.every((m) => Math.hypot(bx - m.x, by - m.y) >= 40);
      if (ok) {
        bumpers.push(bumper("dbp1", bx, by, 18));
        break;
      }
    }
  }

  return {
    id: `daily_${stageNum}`,
    chapter: Math.min(3, stageNum - 1),
    chapterName: "Daily Orbit",
    index: stageNum,
    globalNum: stageNum,
    name: `Daily Sector ${stageNum} / 5`,
    par: stageNum >= 4 ? 2 : 1,
    tutorial: null,
    launch,
    gate,
    bodies,
    crystals,
    bumpers,
    mines,
    wormholes: wh,
    callouts: [],
    clock: 0,
    totalCrystals: crystals.length,
    aegisUsed: false,
  };
}

export function remainingKeys(orbit) {
  let n = 0;
  for (const c of orbit.crystals) if (c.alive && c.isKey) n++;
  return n;
}

export function isGateUnlocked(orbit) {
  return remainingKeys(orbit) === 0;
}

export function updateOrbitMotion(orbit, dt, timeScale = 1) {
  const step = dt * timeScale;
  orbit.clock += step;
  orbit.gate.pulse += dt * 3.1;

  for (const b of orbit.bodies) {
    if (b.orbit) {
      const a = b.orbit.phase + orbit.clock * b.orbit.speed;
      b.x = b.orbit.cx + Math.cos(a) * b.orbit.rx;
      b.y = b.orbit.cy + Math.sin(a) * b.orbit.ry;
    }
    if (b.grazeFlash > 0) b.grazeFlash = Math.max(0, b.grazeFlash - dt * 2.2);
  }

  for (const m of orbit.mines) {
    if (!m.alive) continue;
    m.phase += step * 2.4;
    if (m.patrol) {
      const s = Math.sin(m.patrol.phase + orbit.clock * m.patrol.speed);
      m.x = m.baseX + m.patrol.dx * s;
      m.y = m.baseY + m.patrol.dy * s;
    }
  }

  for (const bp of orbit.bumpers) {
    if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 3.5);
  }

  for (const w of orbit.wormholes) {
    w.spin += dt * 2.8;
  }
}
