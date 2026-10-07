/**
 * The world map, drawn (ui.md §3, §6; tech.md §6): the visible hexes each
 * frame, then rivers, roads, places, the fog, your path and your banner.
 * The realm overview is the same map fitted to the screen, cached.
 *
 * Nothing here decides anything. It is handed the state, the realm, what is
 * explored and in sight, and where the camera is.
 */
import { centre, neighbours, SQ3 } from "../rules/hex.js";
import { TERRAIN, T, FORD, BRIDGE, REGIONS } from "../rules/data/world.js";
import { CULTURES } from "../rules/data/troops.js";
import { toScreen, overview } from "./map-layout.js";
import { BG, FG, DIM, ACCENT, GOLD, LINE, FONT, YOU, charge, mix } from "./theme.js";

/** Terrain colours (ui.md §6), by terrain id. */
const FILL = {
  sea: "#22405e",
  lake: "#2b4c6f",
  plains: "#6f8f4e",
  farm: "#8a9a52",
  steppe: "#a39a5c",
  forest: "#2f5d3a",
  marsh: "#4d6b5a",
  hills: "#7d7350",
  mountains: "#6b6b72",
  pass: "#857b5c",
  river: "#6f8f4e",
};
const FOG = "#1a1f2a";
const WATER = "#3f6f9a";
const WATER_EDGE = "#24435f";

/** A stable number in [0, 1) for a hex and a salt. */
function hash(i, k = 0) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function hexPath(ctx, x, y, R) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    const px = x + R * Math.cos(a);
    const py = y + R * Math.sin(a);
    if (k) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function text(
  ctx,
  str,
  x,
  y,
  { size = 13, weight = 400, color = FG, align = "left", halo = null } = {},
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (halo) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.lineJoin = "round";
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  return ctx.measureText(str).width;
}

function pill(ctx, x, y, w, h, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function polyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length < 3) {
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    return;
  }
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k].x + pts[k + 1].x) / 2;
    const my = (pts[k].y + pts[k + 1].y) / 2;
    ctx.quadraticCurveTo(pts[k].x, pts[k].y, mx, my);
  }
  ctx.lineTo(pts.at(-1).x, pts.at(-1).y);
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function terrainHex(ctx, realm, i, x, y, R, fills) {
  const t = realm.terrain[i];
  hexPath(ctx, x, y, R + 0.5);
  ctx.fillStyle = fills[i];
  ctx.fill();
  const id = TERRAIN[t].id;
  const h = (k) => hash(i, k);
  const s = R / 26;
  ctx.save();
  hexPath(ctx, x, y, R);
  ctx.clip();
  if (id === "forest") {
    for (let k = 0; k < 5; k++) {
      const tx = x + (h(k) - 0.5) * R * 1.3;
      const ty = y + (h(k + 9) - 0.5) * R * 1.1;
      const z = R * (0.28 + h(k + 3) * 0.12);
      ctx.beginPath();
      ctx.moveTo(tx, ty - z);
      ctx.lineTo(tx + z * 0.7, ty + z * 0.6);
      ctx.lineTo(tx - z * 0.7, ty + z * 0.6);
      ctx.closePath();
      ctx.fillStyle = "#1d3f27";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, ty - z);
      ctx.lineTo(tx + z * 0.7, ty + z * 0.6);
      ctx.lineTo(tx, ty + z * 0.6);
      ctx.closePath();
      ctx.fillStyle = "#3a6e45";
      ctx.fill();
    }
  } else if (id === "hills" || id === "pass") {
    for (let k = 0; k < 2; k++) {
      const hx = x + (k ? 0.32 : -0.22) * R;
      const hy = y + (k ? 0.25 : -0.1) * R;
      const z = R * (0.42 - k * 0.08);
      ctx.beginPath();
      ctx.moveTo(hx - z, hy + z * 0.35);
      ctx.quadraticCurveTo(hx, hy - z * 0.9, hx + z, hy + z * 0.35);
      ctx.fillStyle = id === "pass" ? "#9a9070" : "#968a5f";
      ctx.fill();
      ctx.lineWidth = 1.2 * s;
      ctx.strokeStyle = "#5f573a";
      ctx.stroke();
    }
  } else if (id === "mountains") {
    for (let k = 0; k < 2; k++) {
      const mx = x + (k ? 0.3 : -0.18) * R;
      const my = y + (k ? 0.3 : 0.05) * R;
      const z = R * (k ? 0.48 : 0.62);
      ctx.beginPath();
      ctx.moveTo(mx - z, my + z * 0.5);
      ctx.lineTo(mx, my - z * 0.8);
      ctx.lineTo(mx + z, my + z * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#8b8b93";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx, my - z * 0.8);
      ctx.lineTo(mx + z, my + z * 0.5);
      ctx.lineTo(mx + z * 0.1, my + z * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#5c5c64";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - z * 0.3, my - z * 0.32);
      ctx.lineTo(mx, my - z * 0.8);
      ctx.lineTo(mx + z * 0.3, my - z * 0.32);
      ctx.lineTo(mx + z * 0.1, my - z * 0.4);
      ctx.lineTo(mx - z * 0.08, my - z * 0.28);
      ctx.closePath();
      ctx.fillStyle = "#eef1f5";
      ctx.fill();
    }
  } else if (id === "marsh") {
    ctx.strokeStyle = "#7fa08c";
    ctx.lineWidth = s;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const rx = x + (h(k) - 0.5) * R * 1.3;
      const ry = y + (h(k + 5) - 0.5) * R;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 1.5 * s, ry - 5 * s);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 1.5 * s, ry - 4 * s);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(43,76,111,.7)";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const wy = y + (k ? 0.35 : -0.25) * R;
      ctx.moveTo(x - R * 0.5, wy);
      ctx.lineTo(x + R * 0.3, wy);
    }
    ctx.stroke();
  } else if (id === "steppe") {
    ctx.strokeStyle = "#857c46";
    ctx.lineWidth = s;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const sx = x + (h(k) - 0.5) * R * 1.3;
      const sy = y + (h(k + 7) - 0.5) * R;
      ctx.moveTo(sx - 2.5 * s, sy - 3 * s);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + 2.5 * s, sy - 3 * s);
    }
    ctx.stroke();
  } else if (id === "farm") {
    ctx.strokeStyle = "rgba(120,110,60,.55)";
    ctx.lineWidth = 1.2 * s;
    const a = h(1) * Math.PI;
    ctx.beginPath();
    for (let k = -4; k <= 4; k++) {
      const ox = Math.cos(a + Math.PI / 2) * k * 5 * s;
      const oy = Math.sin(a + Math.PI / 2) * k * 5 * s;
      ctx.moveTo(x + ox - Math.cos(a) * R, y + oy - Math.sin(a) * R);
      ctx.lineTo(x + ox + Math.cos(a) * R, y + oy + Math.sin(a) * R);
    }
    ctx.stroke();
  } else if (id === "plains" || id === "river") {
    ctx.strokeStyle = "rgba(60,90,40,.6)";
    ctx.lineWidth = s;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const gx = x + (h(k) - 0.5) * R * 1.2;
      const gy = y + (h(k + 4) - 0.5) * R;
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - s, gy - 3 * s);
      ctx.moveTo(gx + 2 * s, gy);
      ctx.lineTo(gx + 2.5 * s, gy - 3 * s);
    }
    ctx.stroke();
  } else if (id === "sea" || id === "lake") {
    ctx.strokeStyle = "rgba(160,200,235,.18)";
    ctx.lineWidth = s;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const wx = x + (h(k) - 0.5) * R;
      const wy = y + (h(k + 3) - 0.5) * R;
      ctx.moveTo(wx - 4 * s, wy);
      ctx.quadraticCurveTo(wx - 2 * s, wy - 2 * s, wx, wy);
      ctx.quadraticCurveTo(wx + 2 * s, wy + 2 * s, wx + 4 * s, wy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

function flag(ctx, x, y, color, h) {
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h - 6);
  ctx.lineTo(x + h, y - h - 3);
  ctx.lineTo(x, y - h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function disc(ctx, x, y, r, rim) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,19,26,.82)";
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function ingot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.55);
  ctx.lineTo(x - r * 0.6, y - r * 0.45);
  ctx.lineTo(x + r * 0.6, y - r * 0.45);
  ctx.lineTo(x + r, y + r * 0.55);
  ctx.closePath();
  ctx.fillStyle = "#9fb0c4";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#4b5868";
  ctx.stroke();
}

function horseshoe(ctx, x, y, r, color = "#d9b38c") {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.75, Math.PI * 0.85, Math.PI * 2.15, false);
  ctx.lineWidth = r * 0.45;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
}

function coin(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#a36d05";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
}

/** A place's icon, `s` px across (ui.md §6: shapes first, colour second). */
export function placeIcon(ctx, p, x, y, s) {
  const owner = p.culture ? CULTURES[p.culture] : null;
  const stone = "#d8cfb8";
  const shade = "#8c8270";
  ctx.lineWidth = 1.2;
  if (p.kind === "town") {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = stone;
    ctx.fill();
    ctx.strokeStyle = "#3a352c";
    ctx.stroke();
    ctx.fillStyle = shade;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      ctx.fillRect(
        x + Math.cos(a) * s * 0.5 - s * 0.11,
        y + Math.sin(a) * s * 0.5 - s * 0.11,
        s * 0.22,
        s * 0.22,
      );
    }
    ctx.fillStyle = "#a8432f";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.22, y);
    ctx.lineTo(x, y - s * 0.24);
    ctx.lineTo(x + s * 0.22, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stone;
    ctx.fillRect(x - s * 0.17, y, s * 0.34, s * 0.2);
    flag(ctx, x + s * 0.05, y - s * 0.2, owner.color, s * 0.32);
  } else if (p.kind === "castle") {
    ctx.fillStyle = stone;
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.rect(x - s * 0.3, y - s * 0.25, s * 0.6, s * 0.55);
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < 3; k++)
      ctx.fillRect(x - s * 0.3 + k * s * 0.24, y - s * 0.36, s * 0.12, s * 0.12);
    ctx.fillStyle = "#3a352c";
    ctx.fillRect(x - s * 0.07, y + s * 0.08, s * 0.14, s * 0.22);
    flag(ctx, x, y - s * 0.36, owner.color, s * 0.3);
  } else if (p.kind === "village") {
    for (const [dx, dy] of [
      [-0.25, 0.08],
      [0.22, 0.12],
      [0, -0.16],
    ]) {
      const hx = x + dx * s;
      const hy = y + dy * s;
      const w = s * 0.24;
      ctx.fillStyle = "#e3d6b6";
      ctx.fillRect(hx - w / 2, hy - w * 0.1, w, w * 0.7);
      ctx.beginPath();
      ctx.moveTo(hx - w * 0.65, hy);
      ctx.lineTo(hx, hy - w * 0.6);
      ctx.lineTo(hx + w * 0.65, hy);
      ctx.closePath();
      ctx.fillStyle = "#8d4a2f";
      ctx.fill();
    }
    ctx.fillStyle = owner.color;
    ctx.fillRect(x + s * 0.32, y - s * 0.32, s * 0.12, s * 0.09);
  } else if (p.kind === "crownhold") {
    ctx.fillStyle = "#b9b3a3";
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.arc(x, y + s * 0.05, s * 0.55, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(x + s * 0.55, y + s * 0.3);
    ctx.lineTo(x - s * 0.55, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    charge(ctx, "knives", x, y - s * 0.02, s * 0.45, "#5a5446");
  } else if (p.kind === "iron" || p.kind === "ranch" || p.kind === "gold") {
    disc(ctx, x, y, s * 0.3, "#cfc6b0");
    if (p.kind === "iron") ingot(ctx, x, y, s * 0.18);
    else if (p.kind === "ranch") horseshoe(ctx, x, y, s * 0.2, "#cfc6b0");
    else coin(ctx, x, y, s * 0.15);
  } else if (p.kind === "shrine") {
    disc(ctx, x, y, s * 0.3, GOLD);
    charge(ctx, "star", x, y, s * 0.42, GOLD);
  } else if (p.kind === "stone") {
    ctx.fillStyle = "#9b9a92";
    ctx.strokeStyle = "#3e3d38";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.14, y + s * 0.3);
    ctx.lineTo(x - s * 0.1, y - s * 0.28);
    ctx.quadraticCurveTo(x, y - s * 0.38, x + s * 0.1, y - s * 0.28);
    ctx.lineTo(x + s * 0.14, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (p.kind === "tower") {
    ctx.fillStyle = stone;
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.13, y + s * 0.32);
    ctx.lineTo(x - s * 0.1, y - s * 0.22);
    ctx.lineTo(x + s * 0.1, y - s * 0.22);
    ctx.lineTo(x + s * 0.13, y + s * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(x - s * 0.16, y - s * 0.32, s * 0.32, s * 0.12);
    ctx.strokeRect(x - s * 0.16, y - s * 0.32, s * 0.32, s * 0.12);
  } else if (p.kind === "camp") {
    ctx.fillStyle = "#c9a46a";
    ctx.strokeStyle = "#4a3a22";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.32, y + s * 0.25);
    ctx.lineTo(x, y - s * 0.3);
    ctx.lineTo(x + s * 0.32, y + s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a3a22";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.08, y + s * 0.25);
    ctx.lineTo(x, y + s * 0.02);
    ctx.lineTo(x + s * 0.08, y + s * 0.25);
    ctx.fill();
  } else if (p.kind === "lair" || p.kind === "great") {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.36, y + s * 0.22);
    ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.35, x, y - s * 0.36);
    ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.35, x + s * 0.36, y + s * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#4a4136";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y + s * 0.22);
    ctx.quadraticCurveTo(x, y - s * 0.22, x + s * 0.18, y + s * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#0b0b0b";
    ctx.fill();
    ctx.fillStyle = "#e05a3a";
    ctx.fillRect(x - s * 0.07, y + s * 0.02, s * 0.04, s * 0.04);
    ctx.fillRect(x + s * 0.03, y + s * 0.02, s * 0.04, s * 0.04);
    if (p.kind === "great") {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (p.kind === "pickup") {
    const r = s * 0.2;
    if (p.pickup === "gold") coin(ctx, x, y, r * 0.8);
    else if (p.pickup === "iron") ingot(ctx, x, y, r);
    else if (p.pickup === "horses") horseshoe(ctx, x, y, r);
    else if (p.pickup === "chest") {
      ctx.fillStyle = "#8a5a2b";
      ctx.strokeStyle = "#3b2611";
      ctx.fillRect(x - r, y - r * 0.6, r * 2, r * 1.3);
      ctx.strokeRect(x - r, y - r * 0.6, r * 2, r * 1.3);
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - r * 0.15, y - r * 0.2, r * 0.3, r * 0.35);
    } else charge(ctx, "knives", x, y, r * 2, "#d8dde6");
  }
}

/** How the parties on the map look: grey brigands with knives, wolves with eyes. */
export const PARTY_LOOKS = {
  brigands: { color: "#8a8f98", dark: "#363a42", charge: "knives" },
  wolves: { color: "#6e6458", dark: "#26211c", charge: "eyes" },
};

/** A party's shield, a count beneath it (the mockup's look for every party). */
function shield(ctx, x, y, s, look, { rim = null, label = null } = {}) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y + s * 0.05);
  ctx.quadraticCurveTo(x + s / 2, y + s * 0.45, x, y + s * 0.62);
  ctx.quadraticCurveTo(x - s / 2, y + s * 0.45, x - s / 2, y + s * 0.05);
  ctx.closePath();
  ctx.fillStyle = look.color;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = rim ? 2.2 : 1.2;
  ctx.strokeStyle = rim ?? look.dark;
  ctx.stroke();
  if (look.charge === "eyes") {
    // Two slanted red eyes, as at the den.
    ctx.fillStyle = "#e05a3a";
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.08, y + s * 0.02);
      ctx.lineTo(x + k * s * 0.3, y - s * 0.1);
      ctx.lineTo(x + k * s * 0.24, y + s * 0.08);
      ctx.closePath();
      ctx.fill();
    }
  } else charge(ctx, look.charge, x, y + s * 0.02, s * 0.62);
  if (label != null) {
    ctx.font = `700 11px ${FONT}`;
    const w = ctx.measureText(label).width + 10;
    pill(ctx, x - w / 2, y + s * 0.62 + 1, w, 15, "rgba(16,19,26,.88)");
    text(ctx, label, x, y + s * 0.62 + 9, { size: 11, weight: 700, align: "center" });
  }
}

/** Your banner: a red shield with a star, gold-rimmed, your men beneath. */
export function banner(ctx, x, y, s, label) {
  shield(ctx, x, y, s, YOU, { rim: GOLD, label });
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export function createMapView() {
  let fills = null; // per-hex colours, per realm
  let fillsFor = null;
  let hatch = null;
  let ov = null; // the overview's cached image

  function prepare(realm) {
    if (fillsFor === realm) return;
    fillsFor = realm;
    fills = Array.from(realm.terrain, (t, i) => {
      const base = FILL[TERRAIN[t].id];
      const tint = (hash(i, 99) - 0.5) * 0.12;
      return tint > 0 ? mix(base, "#ffffff", tint) : mix(base, "#000000", -tint);
    });
    // Each river runs on into the water it ends in.
    realm.riverLines = realm.rivers.map((rv) => {
      const last = rv.at(-1);
      const mouth = neighbours(realm.grid, last).find(
        (j) => !rv.includes(j) && [T.sea, T.lake, T.river].includes(realm.terrain[j]),
      );
      return mouth == null ? rv : [...rv, mouth];
    });
    ov = null;
  }

  function hatchPattern(ctx) {
    if (hatch) return hatch;
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d");
    g.fillStyle = FOG;
    g.fillRect(0, 0, 8, 8);
    g.strokeStyle = "#232a39";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-2, 10);
    g.lineTo(10, -2);
    g.moveTo(6, 10);
    g.lineTo(10, 6);
    g.moveTo(-2, 2);
    g.lineTo(2, -2);
    g.stroke();
    hatch = ctx.createPattern(c, "repeat");
    return hatch;
  }

  /**
   * One frame of the map.
   * @param {object} o
   *   state, realm, seen(i) explored?, sight (Set of hexes in sight), party
   *   ({x, y} in world px), sel (hex or −1), plan ({path, hours, arrive} or
   *   null), night, men (your banner's label)
   */
  function draw(ctx, L, cam, o) {
    const { realm, seen, sight, sel, plan } = o;
    prepare(realm);
    const g = realm.grid;
    const R = L.R;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L.W, L.viewH);
    ctx.clip();
    ctx.fillStyle = FOG;
    ctx.fillRect(0, 0, L.W, L.viewH);

    // The hexes on screen.
    const x0 = cam.x - L.W / 2 - R * 2;
    const x1 = cam.x + L.W / 2 + R * 2;
    const y0 = cam.y - L.viewH / 2 - R * 2;
    const y1 = cam.y + L.viewH / 2 + R * 2;
    const r0 = Math.max(0, Math.floor((y0 / R - 1) / 1.5));
    const r1 = Math.min(g.rows - 1, Math.ceil((y1 / R - 1) / 1.5));
    const c0 = Math.max(0, Math.floor(x0 / R / SQ3) - 1);
    const c1 = Math.min(g.cols - 1, Math.ceil(x1 / R / SQ3));
    const visible = [];
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * g.cols + c;
        const w = centre(g, i);
        visible.push([i, w.x * R - cam.x + L.W / 2, w.y * R - cam.y + L.viewH / 2]);
      }
    const at = (i) => {
      const w = centre(g, i);
      return toScreen(L, cam, w.x * R, w.y * R);
    };

    for (const [i, x, y] of visible) if (seen(i)) terrainHex(ctx, realm, i, x, y, R, fills);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    for (const [i, x, y] of visible) {
      if (!seen(i)) continue;
      hexPath(ctx, x, y, R);
      ctx.stroke();
    }

    // Rivers, then roads, then fords and bridges.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const rv of realm.riverLines) {
      polyline(ctx, rv.map(at));
      ctx.strokeStyle = WATER_EDGE;
      ctx.lineWidth = R * 0.36;
      ctx.stroke();
      ctx.strokeStyle = WATER;
      ctx.lineWidth = R * 0.24;
      ctx.stroke();
    }
    for (const rd of realm.roads) {
      polyline(ctx, rd.map(at));
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(60,48,30,.5)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "#c2a878";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const [i, x, y] of visible) {
      const f = realm.flags[i];
      if (realm.terrain[i] !== T.river || !(f & (FORD | BRIDGE))) continue;
      if (f & BRIDGE) {
        ctx.fillStyle = "#7a5a36";
        ctx.strokeStyle = "#3b2a16";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - R * 0.3, y - R * 0.16, R * 0.6, R * 0.32, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#c9c2b0";
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.arc(x + k * R * 0.2, y + (k & 1 ? 2 : -2), R * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.lineCap = "butt";

    // Places, then the fog over everything not yet seen.
    const icon = (p) => (p.kind === "castle" ? 28 : 30);
    for (const [i, x, y] of visible) {
      const id = realm.placeAt[i];
      if (id < 0 || !seen(i)) continue;
      const p = realm.places[id];
      if (p.hidden || o.gone?.(id)) continue;
      placeIcon(ctx, p, x, y, icon(p) * (R / 26));
    }
    const pattern = hatchPattern(ctx);
    for (const [i, x, y] of visible) {
      if (!seen(i)) {
        hexPath(ctx, x, y, R + 0.7);
        ctx.fillStyle = pattern;
        ctx.fill();
      } else if (!sight.has(i)) {
        hexPath(ctx, x, y, R + 0.7);
        ctx.fillStyle = "rgba(16,19,26,.42)";
        ctx.fill();
      }
    }
    if (o.night) {
      ctx.fillStyle = "rgba(8,12,40,.28)";
      ctx.fillRect(0, 0, L.W, L.viewH);
    }

    // Labels on top of the fog's veil; where you or a party stand, the
    // shield's count would cover the name, so it gives way.
    const under = new Set((o.parties ?? []).map((pt) => pt.hex));
    for (const [i, x, y] of visible) {
      const id = realm.placeAt[i];
      if (id < 0 || !seen(i) || i === o.here || under.has(i)) continue;
      const p = realm.places[id];
      if (!p.name) continue;
      text(ctx, p.name, x, y + R * 0.78, {
        size: p.kind === "village" ? 10 : 11,
        weight: 700,
        align: "center",
        halo: "rgba(10,12,16,.9)",
        color: p.kind === "village" ? "#d6dae3" : FG,
      });
    }

    // The path: a dot every few pixels, a tick every 6 hours, the arrival.
    if (plan) {
      const pts = plan.path.map(at);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      let acc = 0;
      let next = 6;
      for (let k = 1; k < pts.length; k++) {
        const a = k === 1 && o.party ? toScreen(L, cam, o.party.x, o.party.y) : pts[k - 1];
        const b = pts[k];
        const hrs = plan.hours[k];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 4; d < len; d += 7) {
          ctx.beginPath();
          ctx.arc(
            a.x + ((b.x - a.x) * d) / len,
            a.y + ((b.y - a.y) * d) / len,
            1.8,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        while (acc + hrs >= next && k < pts.length - 1) {
          const f = (next - acc) / hrs;
          const tx = a.x + (b.x - a.x) * f;
          const ty = a.y + (b.y - a.y) * f;
          const label = `${next}`;
          ctx.font = `700 9px ${FONT}`;
          const w = Math.max(18, ctx.measureText(label).width + 8);
          pill(ctx, tx - w / 2, ty - 7, w, 14, "rgba(16,19,26,.85)", "rgba(255,255,255,.6)");
          text(ctx, label, tx, ty + 0.5, { size: 9, weight: 700, align: "center" });
          ctx.fillStyle = "rgba(255,255,255,.92)";
          next += 6;
        }
        acc += hrs;
      }
      const d = pts.at(-1);
      hexPath(ctx, d.x, d.y, R - 1.5);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
      if (plan.eta) {
        ctx.font = `700 11px ${FONT}`;
        const w = ctx.measureText(plan.eta).width + 14;
        const ey = Math.max(4, d.y - R - 24);
        pill(ctx, d.x - w / 2, ey, w, 20, ACCENT);
        text(ctx, plan.eta, d.x, ey + 10, {
          size: 11,
          weight: 700,
          align: "center",
          color: "#06210f",
        });
      }
    } else if (sel >= 0) {
      const p = at(sel);
      hexPath(ctx, p.x, p.y, R - 1.5);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = o.selOk ? ACCENT : "rgba(248,113,113,.9)";
      ctx.stroke();
    }

    // Parties in sight; a dashed red line runs from any that's coming for
    // you, partway towards you (the mockup's cue).
    const you = o.party ? toScreen(L, cam, o.party.x, o.party.y) : null;
    // A party right on top of you is drawn a little aside, so both show.
    const spots = (o.parties ?? []).map((pt) => {
      const q = toScreen(L, cam, pt.x, pt.y);
      if (!you) return q;
      const d = Math.hypot(q.x - you.x, q.y - you.y);
      const min = R * 0.9;
      if (d >= min) return q;
      const ux = d > 0.01 ? (q.x - you.x) / d : -1;
      const uy = d > 0.01 ? (q.y - you.y) / d : 0;
      return { x: you.x + ux * min, y: you.y + uy * min };
    });
    (o.parties ?? []).forEach((pt, k) => {
      const q = spots[k];
      if (pt.hunting && you) {
        ctx.strokeStyle = "rgba(248,113,113,.9)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + (you.x - q.x) * 0.45, q.y + (you.y - q.y) * 0.45);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    (o.parties ?? []).forEach((pt, k) => {
      const q = spots[k];
      const s = 20 * (R / 26);
      if (pt.sel) {
        ctx.beginPath();
        ctx.arc(q.x, q.y - 1, s * 0.95, 0, Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = ACCENT;
        ctx.stroke();
      }
      shield(ctx, q.x, q.y - 3, s, PARTY_LOOKS[pt.kind], {
        rim: pt.hunting ? "rgba(248,113,113,.95)" : null,
        label: pt.label,
      });
    });

    // You.
    if (o.party) {
      const p = toScreen(L, cam, o.party.x, o.party.y);
      banner(ctx, p.x, p.y - 3, 26 * (R / 26), o.men);
    }
    ctx.restore();
  }

  /** The whole realm at a glance (ui.md §3): territories, places, you. */
  function drawOverview(ctx, L, o) {
    const { realm, seen } = o;
    prepare(realm);
    const g = realm.grid;
    const v = overview(L, g);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, L.W, L.viewH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${realm.used}:${o.exploredKey}:${L.W}x${L.viewH}:${dpr}`;
    if (!ov || ov.key !== key) {
      const c = document.createElement("canvas");
      c.width = Math.ceil(v.w * dpr);
      c.height = Math.ceil(v.h * dpr);
      const x = c.getContext("2d");
      x.scale(dpr, dpr);
      for (let i = 0; i < g.n; i++) {
        const w = centre(g, i);
        const px = w.x * v.R;
        const py = w.y * v.R;
        hexPath(x, px, py, v.R + 0.4);
        if (!seen(i)) {
          x.fillStyle = "#1c2230";
        } else {
          const reg = REGIONS[realm.region[i]];
          const t = TERRAIN[realm.terrain[i]].id;
          const base = t === "river" ? WATER : FILL[t];
          x.fillStyle =
            reg === "crown" || t === "sea" || t === "lake"
              ? base
              : mix(base, CULTURES[reg].color, 0.3);
        }
        x.fill();
      }
      x.strokeStyle = "rgba(194,168,120,.55)";
      x.lineWidth = 1;
      x.beginPath();
      for (const rd of realm.roads)
        for (let k = 1; k < rd.length; k++) {
          if (!seen(rd[k - 1]) || !seen(rd[k])) continue;
          const a = centre(g, rd[k - 1]);
          const b = centre(g, rd[k]);
          x.moveTo(a.x * v.R, a.y * v.R);
          x.lineTo(b.x * v.R, b.y * v.R);
        }
      x.stroke();
      for (const p of realm.places) {
        if (!seen(p.i) || p.hidden) continue;
        if (!["town", "castle", "crownhold", "village"].includes(p.kind)) continue;
        const w = centre(g, p.i);
        const r = p.kind === "village" ? 1.6 : p.kind === "castle" ? 2.6 : 3.4;
        x.beginPath();
        x.arc(w.x * v.R, w.y * v.R, r, 0, Math.PI * 2);
        x.fillStyle = p.culture ? CULTURES[p.culture].light : "#d8cfb8";
        x.fill();
        x.lineWidth = 1;
        x.strokeStyle = "#10131a";
        x.stroke();
      }
      ov = { key, c };
    }
    ctx.drawImage(ov.c, v.ox, v.oy, v.w, v.h);
    // Town names, then you.
    for (const p of realm.places) {
      if (!seen(p.i) || (p.kind !== "town" && p.kind !== "crownhold")) continue;
      const w = centre(g, p.i);
      text(ctx, p.name, v.ox + w.x * v.R, v.oy + w.y * v.R - 9, {
        size: 10,
        weight: 700,
        align: "center",
        halo: "rgba(10,12,16,.9)",
      });
    }
    if (o.party) {
      const x = v.ox + (o.party.x / L.R) * v.R;
      const y = v.oy + (o.party.y / L.R) * v.R;
      banner(ctx, x, y - 2, 16, null);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(v.ox - 0.5, v.oy - 0.5, v.w + 1, v.h + 1);
    text(ctx, "Tap anywhere to look there", L.W / 2, Math.min(L.viewH - 14, v.oy + v.h + 14), {
      size: 12,
      weight: 600,
      align: "center",
      color: DIM,
      halo: "rgba(10,12,16,.9)",
    });
  }

  return { draw, drawOverview };
}

/** Where your party is, in world pixels: between two hexes while stepping. */
export function partyAt(realm, at, R) {
  const a = centre(realm.grid, at.i);
  if (at.to < 0) return { x: a.x * R, y: a.y * R };
  const b = centre(realm.grid, at.to);
  return { x: (a.x + (b.x - a.x) * at.progress) * R, y: (a.y + (b.y - a.y) * at.progress) * R };
}
