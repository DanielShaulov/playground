/**
 * Unlockable Probe Ships for Perihelion.
 * Instead of random between-level powerup cards, earning Constellation Stars
 * permanently unlocks 4 distinct spacecraft chassis with real flight traits.
 */

export const SHIPS = [
  {
    id: "solaris",
    name: "Solaris",
    tagline: "Balanced orbital explorer",
    starsRequired: 0,
    color: "#fde047",
    accent: "#38bdf8",
    traits: {
      speedMult: 1.0,
      trajectorySteps: 78,
      grappleRangeMult: 1.0,
      grappleChargeMult: 1.0,
      chronoGrapple: false,
      aegisShield: false,
      magneticWake: false,
      twinProbe: false,
    },
    perk: "Crisp long gravity arc & calm orbit whip.",
  },
  {
    id: "aegis",
    name: "Aegis",
    tagline: "Armored cruiser",
    starsRequired: 9,
    color: "#60a5fa",
    accent: "#a78bfa",
    traits: {
      speedMult: 0.98,
      trajectorySteps: 78,
      grappleRangeMult: 1.12,
      grappleChargeMult: 1.0,
      chronoGrapple: false,
      aegisShield: true,
      magneticWake: true,
      twinProbe: false,
    },
    perk: "Bounces safely off 1 crash + pulls nearby crystals.",
  },
  {
    id: "tachyon",
    name: "Tachyon",
    tagline: "Precision interceptor",
    starsRequired: 20,
    color: "#2dd4bf",
    accent: "#f472b6",
    traits: {
      speedMult: 1.18,
      trajectorySteps: 108,
      grappleRangeMult: 1.25,
      grappleChargeMult: 1.38,
      chronoGrapple: true,
      aegisShield: false,
      magneticWake: false,
      twinProbe: false,
    },
    perk: "+18% launch speed, ultra-long sight & extra-slow orbit.",
  },
  {
    id: "gemini",
    name: "Gemini",
    tagline: "Twin-core sweeper",
    starsRequired: 34,
    color: "#fb923c",
    accent: "#fde047",
    traits: {
      speedMult: 1.04,
      trajectorySteps: 84,
      grappleRangeMult: 1.1,
      grappleChargeMult: 1.15,
      chronoGrapple: false,
      aegisShield: false,
      magneticWake: false,
      twinProbe: true,
    },
    perk: "Deploys a companion micro-probe on launch.",
  },
];

export const SHIP_BY_ID = Object.fromEntries(SHIPS.map((s) => [s.id, s]));

export function getShip(id) {
  return SHIP_BY_ID[id] || SHIPS[0];
}

export function isShipUnlocked(shipId, totalStars) {
  const ship = getShip(shipId);
  return totalStars >= ship.starsRequired;
}
