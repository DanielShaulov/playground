/**
 * The look (ui.md §6): the palette from shared/style.css, side colours,
 * role glyphs and banner charges, drawn in code. Nothing here decides
 * anything; it only knows how things look.
 */
import { CULTURES } from "../rules/data/troops.js";

export const BG = "#10131a";
export const RAISED = "#191e29";
export const CARD = "#232a38";
export const LINE = "#2a3242";
export const FG = "#e8ecf4";
export const DIM = "#8d98ad";
export const ACCENT = "#4ade80";
export const GOLD = "#fbbf24";
export const DANGER = "#f87171";
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** You are always red with a star; the enemy fly their culture's colours. */
export const YOU = { color: "#e05561", dark: "#5e1820", light: "#f08a93", charge: "star" };

export function sideLook(b, side) {
  if (side === 0) return YOU;
  const c = CULTURES[b.sides[1].culture];
  if (!c) return { color: "#8a8f98", dark: "#363a42", light: "#c4c8cf", charge: "knives" };
  return { color: c.color, dark: c.dark, light: c.light, charge: c.charge };
}

/** What a chip calls a squad: its lead troop, short enough for 74 px. */
const SHORT = {
  levy: "Levy",
  militia: "Militia",
  footman: "Foot",
  manatarms: "Men-at-arms",
  spearman: "Spears",
  pikeman: "Pikes",
  bowman: "Bowmen",
  archer: "Archers",
  longbow: "Longbows",
  crossbow: "Crossbows",
  squire: "Squires",
  horseman: "Horse",
  knight: "Knights",
  horsearcher: "H.Archers",
  bannerknight: "Bn.Knights",
  warden: "Wardens",
  hearthguard: "Hearthguard",
  keshig: "Keshig",
  wolf: "Wolves",
  troll: "Trolls",
};

export function squadName(s, troopOf) {
  const lead = s.units.find((u) => !troopOf(u.type).hero && u.n > 0) ?? s.units[0];
  const t = troopOf(lead.type);
  if (t.name === "Steppe Lancer") return "Lancers";
  const many = s.units.filter((u) => u.n > 0 && !troopOf(u.type).hero).length > 1;
  return (SHORT[t.type] ?? ROLE_NAME[s.role]) + (many ? "+" : "");
}

/** Short names for squads, by role, in chips and on the field. */
export const ROLE_NAME = {
  inf: "Foot",
  spear: "Spear",
  ranged: "Bows",
  cav: "Horse",
  ha: "H.Bows",
  monster: "Beast",
};

export function mix(hexA, hexB, t) {
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const c = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** A role glyph on canvas: shield, spear, bow, horseshoe (ui.md §6). */
export function roleGlyph(ctx, role, x, y, color, k = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (role === "inf" || role === "monster") {
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 0);
    ctx.quadraticCurveTo(4, 3, 0, 5);
    ctx.quadraticCurveTo(-4, 3, -4, 0);
    ctx.closePath();
    ctx.fill();
  } else if (role === "spear") {
    ctx.moveTo(-4, 5);
    ctx.lineTo(3, -3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -5);
    ctx.lineTo(1, -4);
    ctx.lineTo(4, -1);
    ctx.closePath();
    ctx.fill();
  } else if (role === "ranged" || role === "ha") {
    ctx.arc(-2, 0, 5, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.5, -4.5);
    ctx.lineTo(-0.5, 4.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (role === "ha") {
      ctx.beginPath();
      ctx.arc(4.5, 3, 2, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else {
    ctx.arc(0, -0.5, 4, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** A banner charge: star (you), chevron, tree, anvil, crescent, knives. */
export function charge(ctx, kind, x, y, s, color = "#f4f1e8") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "chevron") {
    ctx.lineWidth = s * 0.28;
    ctx.moveTo(x - s * 0.5, y + s * 0.25);
    ctx.lineTo(x, y - s * 0.25);
    ctx.lineTo(x + s * 0.5, y + s * 0.25);
    ctx.stroke();
  } else if (kind === "tree") {
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x + s * 0.45, y + s * 0.25);
    ctx.lineTo(x - s * 0.45, y + s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - s * 0.08, y + s * 0.2, s * 0.16, s * 0.3);
  } else if (kind === "anvil") {
    ctx.moveTo(x - s * 0.55, y - s * 0.2);
    ctx.lineTo(x + s * 0.5, y - s * 0.2);
    ctx.lineTo(x + s * 0.3, y);
    ctx.lineTo(x + s * 0.12, y + s * 0.05);
    ctx.lineTo(x + s * 0.22, y + s * 0.35);
    ctx.lineTo(x - s * 0.28, y + s * 0.35);
    ctx.lineTo(x - s * 0.15, y + s * 0.05);
    ctx.lineTo(x - s * 0.4, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "crescent") {
    const r = s * 0.42;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(x - r, y - r, r * 2, r * 2);
    ctx.arc(x + s * 0.18, y - s * 0.1, s * 0.36, 0, Math.PI * 2);
    ctx.fill("evenodd");
  } else if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.22 : s * 0.5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.lineWidth = s * 0.16;
    ctx.moveTo(x - s * 0.4, y - s * 0.4);
    ctx.lineTo(x + s * 0.4, y + s * 0.4);
    ctx.moveTo(x + s * 0.4, y - s * 0.4);
    ctx.lineTo(x - s * 0.4, y + s * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** The same role glyphs as inline SVG, for the DOM chips. */
const SVG_PATHS = {
  inf: '<path d="M-4-4H4V0Q4 3 0 5Q-4 3-4 0Z" fill="currentColor"/>',
  spear:
    '<path d="M-4 5L3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5-5L1-4L4-1Z" fill="currentColor"/>',
  ranged:
    '<path d="M-0.5-4.5A5 5 0 0 1-0.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M-0.5-4.5V4.5" stroke="currentColor" stroke-width="0.8"/>',
  cav: '<path d="M-3.3 2.2A4 4 0 1 1 3.3 2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
SVG_PATHS.ha = SVG_PATHS.ranged;
SVG_PATHS.monster = SVG_PATHS.inf;

export function glyphSVG(role, banner = false) {
  if (banner)
    return '<svg viewBox="-6 -6 12 12" width="14" height="14" aria-hidden="true"><path d="M0-5.5L1.6-1.8L5.5-1.7L2.5 0.8L3.5 4.6L0 2.5L-3.5 4.6L-2.5 0.8L-5.5-1.7L-1.6-1.8Z" fill="#fbbf24"/></svg>';
  return `<svg viewBox="-6 -6 12 12" width="14" height="14" aria-hidden="true">${SVG_PATHS[role] ?? SVG_PATHS.inf}</svg>`;
}
