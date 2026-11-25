/**
 * Relic catalog and drafting logic for Perihelion.
 * Twelve high-impact passive upgrades that reshape aiming, orbiting, and scoring.
 */

export const RELICS = [
  {
    id: "long_sight",
    name: "Long Sight",
    glyph: "◎",
    color: "#38bdf8",
    short: "Trajectory arc +65% longer & traces warps.",
  },
  {
    id: "graviton_drive",
    name: "Graviton Coil",
    glyph: "⟳",
    color: "#2dd4bf",
    short: "Orbit grapple +30% range & +45% whip charge.",
  },
  {
    id: "twin_probe",
    name: "Twin Probe",
    glyph: "✦",
    color: "#fde047",
    short: "Launches a companion micro-probe beside you.",
  },
  {
    id: "aegis_hull",
    name: "Aegis Hull",
    glyph: "⬡",
    color: "#60a5fa",
    short: "First planet or mine crash each sector bounces safely.",
  },
  {
    id: "magnetic_wake",
    name: "Magnetic Wake",
    glyph: "∿",
    color: "#a78bfa",
    short: "Pulls nearby crystals into your flight path.",
  },
  {
    id: "perihelion_nova",
    name: "Perihelion Nova",
    glyph: "✹",
    color: "#fb923c",
    short: "Roche-ring grazes blast nearby crystals & mines.",
  },
  {
    id: "chrono_tether",
    name: "Chrono Tether",
    glyph: "⧖",
    color: "#67e8f9",
    short: "Holding orbit grapple slows moving hazards to 35%.",
  },
  {
    id: "solar_capacitor",
    name: "Solar Cell",
    glyph: "⚡",
    color: "#fbbf24",
    short: "First-shot sector clears grant +1 bonus probe & +500.",
  },
  {
    id: "resonance_prism",
    name: "Prism Core",
    glyph: "◆",
    color: "#e879f9",
    short: "Crystal combo climbs 2× faster & +50% crystal pts.",
  },
  {
    id: "tachyon_launch",
    name: "Tachyon Rail",
    glyph: "»",
    color: "#f472b6",
    short: "+22% max slingshot launch velocity.",
  },
  {
    id: "starlight_siphon",
    name: "Star Siphon",
    glyph: "✧",
    color: "#4ade80",
    short: "Every 7 crystals shattered restores +1 probe.",
  },
  {
    id: "ricochet_field",
    name: "Edge Shield",
    glyph: "║",
    color: "#818cf8",
    short: "Side walls bounce your probe back into play (3×).",
  },
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export function hasRelic(ownedIds, id) {
  return ownedIds.includes(id);
}

/**
 * Draft `count` unique relics the player does not yet own (or fallback to any
 * relics if the player has collected almost everything in deep endless play).
 */
export function draftRelics(rng, ownedIds, count = 3) {
  const pool = RELICS.filter((r) => !ownedIds.includes(r.id));
  const source = pool.length >= count ? pool : RELICS;
  return rng.shuffle(source).slice(0, count).map((r) => r.id);
}
