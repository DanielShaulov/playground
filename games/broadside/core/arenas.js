/**
 * Handcrafted Naval Encounter Arenas for Broadside!
 *
 * Each arena pairs:
 * - Bulletproof circle-chain collision (`islands`) for ship grounding, LOS, and torpedo raycasting
 * - Sculpted visual terrain (`landforms`, `piers`, `lighthouses`, `buoys`, `fogZones`, `weather`)
 *   rendered identically at full scale in battle and as crisp thumbnails on The Bridge!
 *
 * Arena coordinate space: 360 × 520 (Player spawns at 180, 448; Enemies at y = 86..175).
 */

/**
 * Generate a deterministic organic rocky polygon around a chain of circles
 * (for rocky headlands, peninsulas, and skerries) or curved stone breakwaters.
 */
function buildOrganicBlob(cx, cy, rx, ry, seed, lobes = 11, jag = 0.14) {
  const pts = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const wave = 1 + Math.sin(a * 3 + seed) * jag + Math.cos(a * 5 - seed * 1.7) * (jag * 0.55);
    pts.push({
      x: Math.round(cx + Math.cos(a) * rx * wave),
      y: Math.round(cy + Math.sin(a) * ry * wave),
    });
  }
  return pts;
}

export const ARENAS = {
  // 1. SUNLIT HEADLANDS — Iconic starter archipelago with rocky coves & eastern lighthouse
  archipelago: {
    id: "archipelago",
    label: "Sunlit Headlands",
    weather: "clear",
    islands: [
      { x: 86, y: 286, r: 26, fortIsland: false },
      { x: 108, y: 270, r: 17, fortIsland: false },
      { x: 272, y: 222, r: 25, fortIsland: false },
      { x: 252, y: 236, r: 15, fortIsland: false },
    ],
    landforms: [
      {
        kind: "rock",
        cx: 94,
        cy: 280,
        pts: buildOrganicBlob(94, 280, 34, 26, 1.4, 12, 0.14),
        trees: [
          { x: 84, y: 282, r: 9 },
          { x: 96, y: 274, r: 7 },
          { x: 78, y: 292, r: 6 },
        ],
      },
      {
        kind: "rock",
        cx: 266,
        cy: 226,
        pts: buildOrganicBlob(266, 226, 32, 24, 3.8, 12, 0.13),
        trees: [
          { x: 274, y: 218, r: 8 },
          { x: 260, y: 226, r: 7 },
        ],
      },
    ],
    piers: [{ x: 106, y: 292, ang: 0.72, len: 18 }],
    lighthouses: [{ x: 248, y: 237, phase: 0.4 }],
    buoys: [
      { x: 164, y: 318, color: "#ef4444" },
      { x: 204, y: 196, color: "#f8fafc" },
    ],
    fogZones: [],
    mines: [{ id: "m0", x: 184, y: 256 }],
  },

  // 2. TWIN FANG NARROWS — Jagged S-curve rocky canyon + southern Fang Rock
  twin_narrows: {
    id: "twin_narrows",
    label: "Twin Fang Narrows",
    weather: "clear",
    islands: [
      // West cliff headland jutting in from left wall
      { x: 28, y: 216, r: 30, fortIsland: false },
      { x: 66, y: 228, r: 24, fortIsland: false },
      { x: 90, y: 242, r: 17, fortIsland: false },
      // East cliff headland jutting in from right wall
      { x: 332, y: 262, r: 30, fortIsland: false },
      { x: 294, y: 250, r: 24, fortIsland: false },
      { x: 270, y: 238, r: 17, fortIsland: false },
      // Southern rocky fang split
      { x: 178, y: 352, r: 19, fortIsland: false },
    ],
    landforms: [
      {
        kind: "cliff",
        cx: 54,
        cy: 228,
        pts: [
          { x: -6, y: 178 },
          { x: 42, y: 186 },
          { x: 82, y: 206 },
          { x: 108, y: 236 },
          { x: 96, y: 260 },
          { x: 54, y: 258 },
          { x: 18, y: 264 },
          { x: -6, y: 252 },
        ],
        trees: [
          { x: 24, y: 212, r: 10 },
          { x: 46, y: 222, r: 9 },
          { x: 68, y: 232, r: 7 },
        ],
      },
      {
        kind: "cliff",
        cx: 306,
        cy: 252,
        pts: [
          { x: 366, y: 218 },
          { x: 320, y: 222 },
          { x: 274, y: 218 },
          { x: 252, y: 238 },
          { x: 264, y: 262 },
          { x: 302, y: 276 },
          { x: 342, y: 294 },
          { x: 366, y: 292 },
        ],
        trees: [
          { x: 334, y: 256, r: 10 },
          { x: 310, y: 250, r: 9 },
          { x: 288, y: 242, r: 7 },
        ],
      },
      {
        kind: "rock",
        cx: 178,
        cy: 352,
        pts: buildOrganicBlob(178, 352, 22, 18, 5.2, 10, 0.16),
        trees: [{ x: 176, y: 350, r: 6 }],
      },
    ],
    piers: [],
    lighthouses: [{ x: 98, y: 240, phase: 2.1 }],
    buoys: [
      { x: 146, y: 266, color: "#ef4444" },
      { x: 216, y: 212, color: "#f8fafc" },
      { x: 126, y: 360, color: "#ef4444" },
      { x: 230, y: 360, color: "#f8fafc" },
    ],
    fogZones: [],
    mines: [
      { id: "m0", x: 148, y: 214 },
      { id: "m1", x: 212, y: 272 },
    ],
  },

  // 3. FOGGY SHIPPING LANE — Drifting stealth Sea-Fog banks + buoy-marked convoy channel!
  shipping_lane: {
    id: "shipping_lane",
    label: "Foggy Shipping Lane",
    weather: "fog",
    islands: [
      { x: 56, y: 192, r: 26, fortIsland: false },
      { x: 80, y: 206, r: 16, fortIsland: false },
      { x: 304, y: 316, r: 26, fortIsland: false },
      { x: 280, y: 304, r: 16, fortIsland: false },
    ],
    landforms: [
      {
        kind: "rock",
        cx: 66,
        cy: 198,
        pts: buildOrganicBlob(66, 198, 34, 24, 2.2, 12, 0.14),
        trees: [
          { x: 56, y: 192, r: 9 },
          { x: 72, y: 202, r: 7 },
        ],
      },
      {
        kind: "rock",
        cx: 294,
        cy: 310,
        pts: buildOrganicBlob(294, 310, 34, 24, 4.7, 12, 0.14),
        trees: [
          { x: 302, y: 316, r: 9 },
          { x: 286, y: 306, r: 7 },
        ],
      },
    ],
    piers: [{ x: 276, y: 322, ang: 2.35, len: 18 }],
    lighthouses: [{ x: 84, y: 210, phase: 0.9 }],
    buoys: [
      { x: 144, y: 140, color: "#ef4444" },
      { x: 216, y: 140, color: "#f8fafc" },
      { x: 144, y: 260, color: "#ef4444" },
      { x: 216, y: 260, color: "#f8fafc" },
      { x: 144, y: 378, color: "#ef4444" },
      { x: 216, y: 378, color: "#f8fafc" },
    ],
    fogZones: [
      { x: 118, y: 322, baseX: 118, r: 44, driftX: 18, phase: 0.2 },
      { x: 242, y: 206, baseX: 242, r: 42, driftX: 16, phase: 2.8 },
    ],
    mines: [{ id: "m0", x: 180, y: 310 }],
  },

  // 4. BREAKWATER HARBOR — Curved stone seawall, piers, lighthouse & coastal fort!
  harbor_fort: {
    id: "harbor_fort",
    label: "Breakwater Harbor",
    weather: "clear",
    islands: [
      // Central Fort Bastion (index 0: fortIsland = true so fort spawns here!)
      { x: 190, y: 174, r: 22, fortIsland: true },
      // Curved stone breakwater arm shielding the eastern flank
      { x: 242, y: 166, r: 16, fortIsland: false },
      { x: 276, y: 192, r: 16, fortIsland: false },
      { x: 274, y: 232, r: 15, fortIsland: false },
      // Western rocky headland
      { x: 74, y: 302, r: 26, fortIsland: false },
      { x: 96, y: 290, r: 15, fortIsland: false },
    ],
    landforms: [
      {
        kind: "breakwater",
        cx: 244,
        cy: 192,
        pts: [
          { x: 172, y: 160 },
          { x: 224, y: 148 },
          { x: 266, y: 164 },
          { x: 292, y: 196 },
          { x: 290, y: 242 },
          { x: 262, y: 248 },
          { x: 256, y: 210 },
          { x: 236, y: 184 },
          { x: 178, y: 194 },
        ],
        trees: [],
      },
      {
        kind: "rock",
        cx: 82,
        cy: 298,
        pts: buildOrganicBlob(82, 298, 32, 25, 6.1, 12, 0.14),
        trees: [
          { x: 72, y: 300, r: 9 },
          { x: 88, y: 292, r: 7 },
        ],
      },
    ],
    piers: [
      { x: 234, y: 186, ang: 2.35, len: 20 },
      { x: 256, y: 214, ang: 2.95, len: 18 },
    ],
    lighthouses: [{ x: 274, y: 236, phase: 1.5 }],
    buoys: [
      { x: 148, y: 254, color: "#ef4444" },
      { x: 224, y: 278, color: "#f8fafc" },
    ],
    fogZones: [],
    mines: [{ id: "m0", x: 168, y: 282 }],
  },

  // 5. SQUALL SKERRIES — Stormy sea stacks, rain streaks & drifting squall mist!
  open_squall: {
    id: "open_squall",
    label: "Squall Skerries",
    weather: "squall",
    islands: [
      { x: 104, y: 220, r: 21, fortIsland: false },
      { x: 126, y: 208, r: 12, fortIsland: false },
      { x: 256, y: 304, r: 22, fortIsland: false },
      { x: 234, y: 316, r: 12, fortIsland: false },
    ],
    landforms: [
      {
        kind: "cliff",
        cx: 112,
        cy: 216,
        pts: buildOrganicBlob(112, 216, 28, 20, 7.3, 10, 0.18),
        trees: [{ x: 104, y: 218, r: 7 }],
      },
      {
        kind: "cliff",
        cx: 248,
        cy: 308,
        pts: buildOrganicBlob(248, 308, 28, 20, 2.9, 10, 0.18),
        trees: [{ x: 256, y: 306, r: 7 }],
      },
    ],
    piers: [],
    lighthouses: [{ x: 124, y: 208, phase: 3.3 }],
    buoys: [
      { x: 180, y: 170, color: "#f8fafc" },
      { x: 180, y: 354, color: "#ef4444" },
    ],
    fogZones: [{ x: 182, y: 262, baseX: 182, r: 42, driftX: 22, phase: 1.1 }],
    mines: [
      { id: "m0", x: 238, y: 196 },
      { id: "m1", x: 124, y: 322 },
    ],
  },

  // 6. CALDERA STRONGHOLD — Twin crescent atoll jaws framing the Sector Flagship!
  flagship_basin: {
    id: "flagship_basin",
    label: "Caldera Stronghold",
    weather: "ash",
    islands: [
      // West crescent arm
      { x: 56, y: 266, r: 24, fortIsland: false },
      { x: 84, y: 288, r: 19, fortIsland: false },
      // East crescent arm
      { x: 304, y: 266, r: 24, fortIsland: false },
      { x: 276, y: 288, r: 19, fortIsland: false },
      // Southern sea stack
      { x: 180, y: 356, r: 16, fortIsland: false },
    ],
    landforms: [
      {
        kind: "cliff",
        cx: 68,
        cy: 276,
        pts: [
          { x: 32, y: 244 },
          { x: 64, y: 238 },
          { x: 96, y: 266 },
          { x: 104, y: 298 },
          { x: 80, y: 310 },
          { x: 50, y: 292 },
          { x: 28, y: 272 },
        ],
        trees: [
          { x: 58, y: 266, r: 8 },
          { x: 80, y: 286, r: 7 },
        ],
      },
      {
        kind: "cliff",
        cx: 292,
        cy: 276,
        pts: [
          { x: 328, y: 244 },
          { x: 296, y: 238 },
          { x: 264, y: 266 },
          { x: 256, y: 298 },
          { x: 280, y: 310 },
          { x: 310, y: 292 },
          { x: 332, y: 272 },
        ],
        trees: [
          { x: 302, y: 266, r: 8 },
          { x: 280, y: 286, r: 7 },
        ],
      },
      {
        kind: "rock",
        cx: 180,
        cy: 356,
        pts: buildOrganicBlob(180, 356, 19, 15, 8.4, 9, 0.16),
        trees: [],
      },
    ],
    piers: [
      { x: 88, y: 264, ang: -0.5, len: 16 },
      { x: 272, y: 264, ang: -2.6, len: 16 },
    ],
    lighthouses: [
      { x: 94, y: 292, phase: 0.0 },
      { x: 266, y: 292, phase: Math.PI },
    ],
    buoys: [
      { x: 146, y: 294, color: "#ef4444" },
      { x: 214, y: 294, color: "#f8fafc" },
    ],
    fogZones: [{ x: 180, y: 224, baseX: 180, r: 38, driftX: 14, phase: 0.6 }],
    mines: [
      { id: "m0", x: 138, y: 226 },
      { id: "m1", x: 222, y: 226 },
    ],
  },
};

export function getArenaTemplate(id) {
  return ARENAS[id] || ARENAS.archipelago;
}
