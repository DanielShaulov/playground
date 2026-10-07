/**
 * The battlefield on canvas (ui.md §5–7, tech.md §6): ground, woods, the
 * fallen, every soldier, pennants, volleys, dust, and the numbers that float
 * off a squad that lost men.
 *
 * It never decides anything. A round arrives already computed as a timeline
 * (rules/battle.js `playRound`): 31 frames of every squad's position, facing,
 * men and state, plus the volleys, charges and routs that happened, by step.
 * The view plays that back over three seconds and otherwise draws the battle
 * as the rules left it.
 */
import { DT, STEPS, STATE_NAMES, FIELD_W, FIELD_H } from "../rules/battle.js";
import { troop } from "../rules/data/troops.js";
import { band } from "../rules/battle-setup.js";
import { toScreen, squadHalf } from "./layout.js";
import {
  FG,
  GOLD,
  ACCENT,
  DANGER,
  FONT,
  LINE,
  mix,
  roleGlyph,
  charge as drawCharge,
  sideLook,
} from "./theme.js";

const ROUND_S = STEPS * DT;

/** A stable number in [0, 1) for a pair of integers. */
function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createBattleView({ onImpact = () => {} } = {}) {
  let b = null;
  let tl = null; // the timeline being played, or null
  let t = 0; // seconds into it
  let clock = 0; // battle seconds the view has shown, for fading the fallen
  let fired = 0; // events already triggered
  let lastStep = 0;
  let skipping = false; // finish the round on the next update
  let fallen = [];
  let volleys = [];
  let floats = [];
  let dust = [];
  let flashes = new Map(); // squad id -> seconds of white pennant left
  let shake = 0;
  let ground = null; // cached ground for the whole-field view
  let groundKey = "";

  function setBattle(battle) {
    b = battle;
    tl = null;
    t = 0;
    fallen = [];
    volleys = [];
    floats = [];
    dust = [];
    flashes = new Map();
    shake = 0;
    groundKey = "";
  }

  /** Where a squad is drawn right now: {x, y, fx, fy, n, state, engaged, speed}. */
  function at(id) {
    const s = b.squads[id];
    if (!tl || !tl.frames.length) {
      return {
        x: s.x,
        y: s.y,
        fx: s.fx,
        fy: s.fy,
        n: s.n,
        state: s.state,
        engaged: s.contacts.length,
        speed: 0,
      };
    }
    const f = Math.min(STEPS, t / DT);
    const i = Math.min(STEPS - 1, Math.floor(f));
    const k = f - i;
    const A = tl.frames[i][id];
    const B = tl.frames[i + 1][id];
    if (!A || !B)
      return { x: s.x, y: s.y, fx: s.fx, fy: s.fy, n: s.n, state: s.state, engaged: 0, speed: 0 };
    let fx = lerp(A[2], B[2], k);
    let fy = lerp(A[3], B[3], k);
    const m = Math.hypot(fx, fy) || 1;
    fx /= m;
    fy /= m;
    return {
      x: lerp(A[0], B[0], k),
      y: lerp(A[1], B[1], k),
      fx,
      fy,
      n: k < 0.5 ? A[4] : B[4],
      state: STATE_NAMES[k < 0.5 ? A[5] : B[5]],
      engaged: B[6],
      speed: Math.hypot(B[0] - A[0], B[1] - A[1]) / DT,
    };
  }

  /** Play a computed round's timeline. */
  function play(timeline) {
    tl = timeline;
    t = 0;
    skipping = false;
    fired = 0;
    lastStep = 0;
    tl.lost = b.squads.map((s, id) => {
      const first = tl.frames[0][id];
      return first ? first[4] - s.n : 0;
    });
  }

  const playing = () => !!tl;
  const progress = () => (tl ? t / ROUND_S : 0);

  /** Advance the animation; returns true on the frame it finishes. */
  function update(dt, speed = 1) {
    shake = Math.max(0, shake - dt);
    for (const [id, v] of flashes) {
      if (v - dt <= 0) flashes.delete(id);
      else flashes.set(id, v - dt);
    }
    floats = floats.filter((f) => (f.life -= dt) > 0);
    dust = dust.filter((d) => (d.life -= dt) > 0);
    if (!tl) return false;
    const before = t;
    t = skipping ? ROUND_S : Math.min(ROUND_S, t + dt * speed);
    clock += t - before;
    const stepNow = Math.min(STEPS, Math.floor(t / DT + 1e-9));
    // Men who fell between the frames we just passed.
    for (let st = lastStep; st < stepNow; st++) {
      const A = tl.frames[st];
      const B = tl.frames[st + 1];
      for (let id = 0; id < B.length; id++) {
        if (!A[id]) continue;
        const lost = A[id][4] - B[id][4];
        if (lost > 0) addFallen(id, B[id], A[id][4], lost);
      }
    }
    lastStep = stepNow;
    while (fired < tl.events.length && tl.events[fired].step <= t / DT) {
      trigger(tl.events[fired]);
      fired++;
    }
    if (t >= ROUND_S) {
      finish();
      return true;
    }
    return false;
  }

  /**
   * Jump to the end of the round being played. The next update() finishes it
   * and returns true, so the round still ends where the caller looks for it.
   */
  function skip() {
    if (tl) skipping = true;
  }

  function finish() {
    for (; fired < tl.events.length; fired++) trigger(tl.events[fired]);
    b.squads.forEach((s, id) => {
      const lost = tl.lost[id] ?? 0;
      if (lost > 0 && s.state !== "fled")
        floats.push({ id, text: `−${lost}`, side: s.side, life: 1.8, max: 1.8 });
    });
    tl = null;
  }

  function trigger(e) {
    if (e.k === "volley") {
      const a = at(e.id);
      const o = at(e.target);
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      volleys.push({
        from: { x: a.x, y: a.y },
        to: { x: o.x, y: o.y },
        w: squadHalf(b.squads[e.target], o.n).hw * 2,
        n: e.n,
        t0: clock,
        flight: Math.max(0.35, d / 38),
        seed: (e.id * 131 + e.step) | 0,
      });
    } else if (e.k === "charge") {
      const a = at(e.id);
      const o = at(e.target);
      const x = (a.x + o.x) / 2;
      const y = (a.y + o.y) / 2;
      for (let i = 0; i < 8; i++)
        dust.push({
          x: x + (hash(i, e.step) - 0.5) * 8,
          y: y + (hash(e.step, i) - 0.5) * 6,
          r: 2 + hash(i + 7, e.id) * 3,
          life: 1.2,
          max: 1.2,
        });
      shake = 0.25;
      onImpact("charge", e);
    } else if (e.k === "rout") {
      flashes.set(e.id, 0.8);
      onImpact("rout", e);
    }
  }

  function addFallen(id, f, nBefore, lost) {
    const s = b.squads[id];
    const slots = soldierSlots(
      s,
      { x: f[0], y: f[1], fx: f[2], fy: f[3], n: nBefore, state: "ok" },
      0,
    );
    for (let j = 0; j < lost; j++) {
      const k = f[6]
        ? j % Math.max(1, Math.min(slots.length, s.files0)) // the front rank, in melee
        : Math.floor(hash(id * 97 + j, Math.round(clock * 10)) * slots.length);
      const p = slots[k];
      if (!p) continue;
      fallen.push({
        x: p.x + (hash(j, id) - 0.5) * 1.5,
        y: p.y + (hash(id, j) - 0.5) * 1.5,
        side: s.side,
        t: clock,
      });
    }
    if (fallen.length > 900) fallen = fallen.slice(-700);
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  /**
   * @param ctx canvas context, CSS-pixel transform already applied
   * @param L layout (view/layout.js)
   * @param ui {selected: Set, deploy: bool, targeting: bool, tactics: number, now: number}
   */
  function draw(ctx, L, ui) {
    if (!b) return;
    const P = (x, y) => toScreen(L, x, y);
    const sc = L.scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L.W, L.viewH);
    ctx.clip();
    if (shake > 0) ctx.translate((hash(ui.now * 60) - 0.5) * 5, (hash(7, ui.now * 60) - 0.5) * 5);
    drawGround(ctx, L);

    // The fallen, oldest faintest.
    for (const f of fallen) {
      const age = clock - f.t;
      if (age > 10) continue;
      const p = P(f.x, f.y);
      ctx.globalAlpha = clamp(0.9 - age / 11, 0.05, 0.9);
      ctx.fillStyle = sideLook(b, f.side).dark;
      if (L.follow) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 0.5 * sc, 0.25 * sc, hash(f.x * 10, f.y * 10) * 6, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(p.x - 1.6, p.y - 0.8, 3.2, 1.6);
      ctx.fillStyle = "rgba(90,20,20,.6)";
      ctx.fillRect(p.x - 0.6, p.y + 0.6, 1.4, 1);
    }
    fallen = fallen.filter((f) => clock - f.t <= 10);
    ctx.globalAlpha = 1;

    const ats = b.squads.map((s) => at(s.id));
    const shown = (s) =>
      ats[s.id].n > 0 && ats[s.id].state !== "fled" && ats[s.id].state !== "dead";

    // Dust: behind horse at speed, and where a charge landed.
    for (const s of b.squads) {
      const a = ats[s.id];
      if (!shown(s) || !s.charges || a.speed < 4) continue;
      for (let i = 0; i < 7; i++) {
        const back = 3 + hash(s.id, i) * 9;
        const side = (hash(i, s.id) - 0.5) * s.files0 * s.spacing;
        puff(
          ctx,
          P(a.x - a.fx * back - a.fy * side, a.y - a.fy * back + a.fx * side),
          (2 + hash(i, s.id + 9) * 3) * sc,
          0.4,
        );
      }
    }
    for (const d of dust)
      puff(ctx, P(d.x, d.y), d.r * sc * (1.6 - d.life / d.max / 2), 0.55 * (d.life / d.max));

    // Your deployment band.
    if (ui.deploy) {
      const bd = band(0, b.sides[0].hero?.tactics ?? 0);
      const a = P(bd.x0, bd.y0);
      const z = P(bd.x1, bd.y1);
      ctx.fillStyle = "rgba(74,222,128,.08)";
      ctx.fillRect(a.x, a.y, z.x - a.x, z.y - a.y);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(74,222,128,.55)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x, a.y, z.x - a.x, z.y - a.y);
      ctx.setLineDash([]);
      text(ctx, "your deployment", (a.x + z.x) / 2, a.y + 12, {
        size: 11,
        color: "rgba(74,222,128,.8)",
        align: "center",
      });
    }

    // Orders: where your squads are going; with Tactics, where their horse is.
    if (!tl) {
      for (const s of b.squads) {
        if (!shown(s) || s.state === "routing") continue;
        const a = ats[s.id];
        const o = s.order;
        const tgt = o.target != null ? b.squads[o.target] : null;
        if (s.side === 0) {
          if (s.contacts.length) continue;
          if (tgt && tgt.side !== s.side && o.kind !== "hold")
            arrow(ctx, L, a, ats[tgt.id], "rgba(255,255,255,.7)", [6, 5]);
          else if (o.kind === "move" && s.cmd) {
            arrow(ctx, L, a, o, "rgba(255,255,255,.7)", [6, 5]);
            marker(ctx, P(o.x, o.y));
          }
        } else if (tgt && tgt.side === 0 && !s.contacts.length) {
          const see = ui.tactics >= 2 || (ui.tactics >= 1 && (s.role === "cav" || s.role === "ha"));
          if (see) arrow(ctx, L, a, ats[tgt.id], "rgba(248,113,113,.85)", [3, 4]);
        }
      }
    }

    // Selection, and the enemy you can pick when choosing a target.
    for (const s of b.squads) {
      if (!shown(s)) continue;
      if (ui.selected.has(s.id)) outline(ctx, L, s, ats[s.id], ACCENT, 2);
      else if (ui.targeting && s.side === 1 && s.state !== "routing")
        outline(
          ctx,
          L,
          s,
          ats[s.id],
          `rgba(248,113,113,${0.45 + 0.35 * Math.sin(ui.now * 6)})`,
          1.5,
        );
    }

    // Soldiers.
    if (L.follow) {
      for (const s of b.squads) if (shown(s)) drawFigures(ctx, L, s, ats[s.id]);
    } else drawMarks(ctx, L, ats, shown);

    // Clash marks along fronts in melee.
    for (const s of b.squads) {
      const a = ats[s.id];
      if (!shown(s) || !a.engaged || s.side !== 0) continue;
      for (const o of b.squads) {
        if (o.side === s.side || !shown(o)) continue;
        const c = ats[o.id];
        const gap = Math.hypot(c.x - a.x, c.y - a.y);
        const reach = squadHalf(s, a.n).hd + squadHalf(o, c.n).hd + squadHalf(s, a.n).hw;
        if (gap > reach) continue;
        const mx = (a.x + c.x) / 2;
        const my = (a.y + c.y) / 2;
        const w = Math.min(squadHalf(s, a.n).hw, squadHalf(o, c.n).hw) * 0.9;
        ctx.strokeStyle = "rgba(255,248,220,.85)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          if (hash(i + Math.floor(ui.now * 8), s.id * 7 + o.id) < 0.35) continue;
          const off = (hash(i, o.id + s.id * 7) - 0.5) * 2 * w;
          const p = P(mx - a.fy * off, my + a.fx * off);
          const k = 2;
          ctx.moveTo(p.x - k, p.y - k);
          ctx.lineTo(p.x + k, p.y + k);
          ctx.moveTo(p.x + k, p.y - k);
          ctx.lineTo(p.x - k, p.y + k);
        }
        ctx.stroke();
      }
    }

    // Volleys in the air: one shaft for every three or four bowmen.
    volleys = volleys.filter((v) => clock - v.t0 < v.flight + 0.1);
    ctx.lineWidth = 1.2;
    for (const v of volleys) {
      const prog = (clock - v.t0) / v.flight;
      if (prog <= 0 || prog >= 1) continue;
      const count = Math.max(2, Math.ceil(v.n / 3.5));
      for (let i = 0; i < count; i++) {
        const sx = v.from.x + (hash(i, v.seed) - 0.5) * 8;
        const sy = v.from.y + (hash(v.seed, i) - 0.5) * 3;
        const ex = v.to.x + (hash(i + 3, v.seed) - 0.5) * v.w;
        const ey = v.to.y + (hash(v.seed, i + 3) - 0.5) * 6;
        const p = clamp(prog + (hash(i, 77) - 0.5) * 0.12, 0, 1);
        const x = lerp(sx, ex, p);
        const y = lerp(sy, ey, p);
        const d = Math.hypot(ex - sx, ey - sy) || 1;
        const ux = (ex - sx) / d;
        const uy = (ey - sy) / d;
        const a = P(x, y);
        const lift = Math.sin(Math.PI * p) * 9 * (L.scale / L.fit);
        const len = 6 * Math.sqrt(L.scale / L.fit);
        ctx.strokeStyle = "rgba(0,0,0,.28)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + ux * len, a.y + uy * len);
        ctx.stroke();
        ctx.strokeStyle = "#fff4d8";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - lift);
        ctx.lineTo(a.x + ux * len, a.y + uy * len - lift);
        ctx.stroke();
      }
    }

    // Pennants and counts.
    for (const s of b.squads) if (shown(s)) pennant(ctx, L, s, ats[s.id], ui);

    // This round's losses, floating up.
    for (const f of floats) {
      const s = b.squads[f.id];
      const a = ats[f.id];
      const p = P(a.x, a.y);
      const k = 1 - f.life / f.max;
      const top = p.y - squadHalf(s, a.n).hd * sc - 30 - k * 18;
      ctx.globalAlpha = clamp(f.life / 0.6, 0, 1);
      text(ctx, f.text, p.x - 4, top, {
        size: 13,
        weight: 800,
        align: "right",
        color: f.side === 0 ? "#ffb3b3" : "#ffe08a",
        halo: "rgba(10,12,16,.9)",
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (L.follow) minimap(ctx, L, ats, shown);
  }

  function drawGround(ctx, L) {
    const f = L.field;
    const key = `${L.W}x${L.viewH}:${L.follow}:${b.woods.length}:${b.seed}`;
    if (!L.follow) {
      if (key !== groundKey) {
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        ground = document.createElement("canvas");
        ground.width = Math.ceil(f.w * dpr);
        ground.height = Math.ceil(f.h * dpr);
        const g = ground.getContext("2d");
        g.scale(dpr, dpr);
        paintGround(g, { ...L, ox: 0, oy: 0 }, b);
        groundKey = key;
      }
      ctx.fillStyle = "#2c4227";
      ctx.fillRect(0, 0, L.W, L.viewH);
      ctx.drawImage(ground, f.x, f.y, f.w, f.h);
    } else {
      ctx.fillStyle = "#2c4227";
      ctx.fillRect(0, 0, L.W, L.viewH);
      paintGround(ctx, L, b);
    }
  }

  function pennant(ctx, L, s, a, ui) {
    const look = sideLook(b, s.side);
    const m = toScreen(L, a.x, a.y);
    const { hw, hd } = squadHalf(s, a.n);
    // The pole stands at the squad's left end, so neighbours' flags don't collide.
    const c = { x: m.x - Math.max(0, hw * L.scale - 6), y: m.y };
    const top = m.y - (Math.abs(a.fy) * hd + Math.abs(a.fx) * hw) * L.scale - 5;
    const isBanner = s.banner;
    const routing = a.state === "routing" || flashes.has(s.id);
    const pole = isBanner ? 22 : 15;
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(c.x, top);
    ctx.lineTo(c.x, top - pole);
    ctx.stroke();
    const fw = isBanner ? 22 : 16;
    const fh = isBanner ? 15 : 11;
    const y0 = top - pole;
    ctx.beginPath();
    ctx.moveTo(c.x, y0);
    ctx.lineTo(c.x + fw, y0);
    ctx.lineTo(c.x + fw - 4, y0 + fh / 2);
    ctx.lineTo(c.x + fw, y0 + fh);
    ctx.lineTo(c.x, y0 + fh);
    ctx.closePath();
    ctx.fillStyle = routing ? "#f4f4f4" : look.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = routing ? "#9aa0a8" : look.dark;
    ctx.stroke();
    const gx = c.x + fw / 2 - 1.5;
    const gy = y0 + fh / 2;
    if (isBanner) drawCharge(ctx, look.charge, gx, gy, 12, s.side === 0 ? GOLD : "#f4f1e8");
    else roleGlyph(ctx, s.role, gx, gy, routing ? "#555" : "#f4f1e8", 0.9);
    const label = a.state === "routing" ? `${a.n} runs` : `${a.n}`;
    ctx.font = `700 10px ${FONT}`;
    const w = ctx.measureText(label).width + 7;
    ctx.beginPath();
    ctx.roundRect(c.x + fw + 3, y0 + 1, w, 12, 6);
    ctx.fillStyle = "rgba(16,19,26,.82)";
    ctx.fill();
    text(ctx, label, c.x + fw + 3 + w / 2, y0 + 7.5, {
      size: 10,
      weight: 700,
      align: "center",
      color: a.state === "routing" ? DANGER : a.state === "wavering" ? GOLD : FG,
    });
    if (ui.selected.has(s.id)) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(c.x, top + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Whole field: every man a mark, one path per colour (tech.md §6). */
  function drawMarks(ctx, L, ats, shown) {
    for (const side of [0, 1]) {
      const look = sideLook(b, side);
      // One arc a man: filled with his colour, stroked with the side's dark
      // outline, which reaches from r to r + 0.75 as two arcs did.
      const bodies = new Map();
      const ticks = new Path2D();
      const shields = new Path2D();
      const horses = new Path2D();
      const knights = new Path2D();
      const lances = new Path2D();
      const body = (color) => {
        if (!bodies.has(color)) bodies.set(color, new Path2D());
        return bodies.get(color);
      };
      for (const s of b.squads) {
        if (s.side !== side || !shown(s)) continue;
        const a = ats[s.id];
        const routing = a.state === "routing";
        const base = routing ? mix(look.color, "#9aa0a8", 0.6) : look.color;
        const lead = troop(s.units.find((u) => !troop(u.type).hero)?.type ?? s.units[0].type);
        const slots = soldierSlots(s, a, routing ? 1.6 : a.engaged ? 0.45 : 0.18);
        const ang = Math.atan2(a.fy, a.fx);
        const horse = s.role === "cav" || s.role === "ha";
        const ranged = s.role === "ranged";
        for (const m of slots) {
          const p = toScreen(L, m.x, m.y);
          if (horse) {
            const heavy = lead.armor >= 5;
            const path = heavy ? knights : horses;
            path.moveTo(p.x + Math.cos(ang) * 3.1, p.y + Math.sin(ang) * 3.1);
            path.ellipse(p.x, p.y, 3.1, 1.6, ang, 0, Math.PI * 2);
            const r = 1.45 + 0.35;
            const rx = p.x - Math.cos(ang) * 0.4;
            const ry = p.y - Math.sin(ang) * 0.4;
            const bp = body(base);
            bp.moveTo(rx + r, ry);
            bp.arc(rx, ry, r, 0, Math.PI * 2);
            if (a.speed > 4 && !routing) {
              lances.moveTo(p.x + Math.cos(ang) * 1, p.y + Math.sin(ang) * 1);
              lances.lineTo(p.x + Math.cos(ang) * 6.5, p.y + Math.sin(ang) * 6.5);
            }
            continue;
          }
          const big = s.role === "monster";
          const r = (big ? 3.4 : ranged ? 1.45 : 1.75) + 0.375;
          const bp = body(ranged && !routing ? mix(look.color, "#ffffff", 0.22) : base);
          bp.moveTo(p.x + r, p.y);
          bp.arc(p.x, p.y, r, 0, Math.PI * 2);
          if (s.role === "spear" && !routing) {
            ticks.moveTo(p.x + a.fx * 1.5, p.y + a.fy * 1.5);
            ticks.lineTo(p.x + a.fx * 6.5, p.y + a.fy * 6.5);
          }
          if (lead.shield > 0.35 && !routing) {
            shields.moveTo(p.x + a.fx * 1.4 + 1.1, p.y + a.fy * 1.4);
            shields.arc(p.x + a.fx * 1.4, p.y + a.fy * 1.4, 1.1, 0, Math.PI * 2);
          }
        }
      }
      ctx.fillStyle = "#6b4a33";
      ctx.fill(horses);
      ctx.fillStyle = "#e9e4d8";
      ctx.fill(knights);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "#1c140e";
      ctx.stroke(horses);
      ctx.stroke(knights);
      ctx.strokeStyle = look.dark;
      ctx.lineWidth = 0.75;
      for (const [color, p] of bodies) {
        ctx.fillStyle = color;
        ctx.fill(p);
        ctx.stroke(p);
      }
      ctx.strokeStyle = "#d8d2c0";
      ctx.lineWidth = 0.7;
      ctx.stroke(ticks);
      ctx.stroke(lances);
      ctx.fillStyle = "#cfc8b4";
      ctx.fill(shields);
    }
  }

  /** Follow camera: every man a small top-down figure (ui.md §6). */
  function drawFigures(ctx, L, s, a) {
    const look = sideLook(b, s.side);
    const routing = a.state === "routing";
    const body = routing ? mix(look.color, "#9aa0a8", 0.6) : look.color;
    const ang = Math.atan2(a.fy, a.fx);
    const lead = troop(s.units.find((u) => !troop(u.type).hero)?.type ?? s.units[0].type);
    const slots = soldierSlots(s, a, routing ? 1.6 : a.engaged ? 0.45 : 0.18);
    const sc = L.scale * 1.4;
    const lw = 0.7 / sc;
    for (let i = 0; i < slots.length; i++) {
      const p = toScreen(L, slots[i].x, slots[i].y);
      if (p.x < -10 || p.y < -10 || p.x > L.W + 10 || p.y > L.viewH + 10) continue;
      const horse = s.role === "cav" || s.role === "ha";
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.scale(sc, sc);
      ctx.lineWidth = lw;
      if (horse) {
        const coat =
          lead.armor >= 5
            ? "#d9d4c8"
            : ["#6b4a33", "#8a5a35", "#3a2c24", "#a19a8e"][Math.floor(hash(s.id, i) * 4)];
        ctx.beginPath();
        ctx.ellipse(-0.08, 0, 0.62, 0.27, 0, 0, Math.PI * 2);
        ctx.fillStyle = coat;
        ctx.fill();
        ctx.strokeStyle = "#1e1611";
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0.62, 0, 0.26, 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-0.06, 0, 0.17, 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = look.dark;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 0.15, 0, Math.PI * 2);
        ctx.fillStyle = lead.armor >= 2 ? "#aeb4bd" : "#7b6248";
        ctx.fill();
        if (!routing) {
          ctx.beginPath();
          ctx.moveTo(0.05, 0.24);
          ctx.lineTo(a.speed > 4 ? 1.7 : 0.7, 0.27);
          ctx.lineWidth = 0.07;
          ctx.strokeStyle = "#e6dfcc";
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (!routing && s.role === "spear") {
        ctx.beginPath();
        ctx.moveTo(-0.5, 0.26);
        ctx.lineTo(2.2, 0.26);
        ctx.lineWidth = 0.07;
        ctx.strokeStyle = "#9c8058";
        ctx.stroke();
      }
      if (!routing && s.role === "ranged") {
        ctx.beginPath();
        ctx.arc(-0.12, 0, 0.5, -1.05, 1.05);
        ctx.lineWidth = 0.08;
        ctx.strokeStyle = "#8b5a2b";
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.21, 0.36, 0, 0, Math.PI * 2);
      ctx.fillStyle = s.role === "ranged" && !routing ? mix(look.color, "#ffffff", 0.22) : body;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = look.dark;
      ctx.stroke();
      if (!routing && s.role === "inf") {
        ctx.beginPath();
        ctx.moveTo(0.1, 0.3);
        ctx.lineTo(0.62, 0.38);
        ctx.lineWidth = 0.07;
        ctx.strokeStyle = "#c9ccd2";
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0.03, 0, 0.18, 0, Math.PI * 2);
      ctx.fillStyle = s.role === "ranged" ? "#5c4a32" : lead.armor >= 2 ? "#aeb4bd" : "#7b6248";
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = "#1c1c1c";
      ctx.stroke();
      if (!routing && lead.shield > 0) {
        const r = lead.shield >= 0.4 ? 0.28 : 0.2;
        ctx.beginPath();
        ctx.arc(0.28, -0.24, r, 0, Math.PI * 2);
        ctx.fillStyle = mix(look.color, "#ffffff", 0.35);
        ctx.fill();
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = look.dark;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function minimap(ctx, L, ats, shown) {
    const mw = 62;
    const mh = mw * 1.4;
    const x0 = L.W - mw - 10;
    const y0 = 10;
    const k = mw / 100;
    ctx.beginPath();
    ctx.roundRect(x0 - 3, y0 - 3, mw + 6, mh + 6, 8);
    ctx.fillStyle = "rgba(16,19,26,.82)";
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.stroke();
    ctx.fillStyle = "#3f5d37";
    ctx.fillRect(x0, y0, mw, mh);
    for (const s of b.squads) {
      if (!shown(s)) continue;
      const a = ats[s.id];
      ctx.fillStyle = a.state === "routing" ? "#e6e6e6" : sideLook(b, s.side).color;
      const { hw, hd } = squadHalf(s, a.n);
      const w = Math.max(2, hw * 2 * k);
      const h = Math.max(2, hd * 2 * k);
      ctx.fillRect(x0 + a.x * k - w / 2, y0 + a.y * k - h / 2, w, h);
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0 + L.view.x * k, y0 + L.view.y * k, L.view.w * k, L.view.h * k);
  }

  /** The fighting, for the follow camera to frame (ui.md §6). */
  function focus() {
    if (!b) return { x: 50, y: 70 };
    const ats = b.squads.map((s) => at(s.id));
    const up = (s) => ats[s.id].state === "ok" || ats[s.id].state === "wavering";
    const melee = b.squads.filter((s) => up(s) && ats[s.id].engaged);
    const core = melee.length ? melee : b.squads.filter(up);
    if (!core.length) return { x: 50, y: 70 };
    const n = core.reduce((m, s) => m + ats[s.id].n, 0) || 1;
    const cx = core.reduce((m, s) => m + ats[s.id].x * ats[s.id].n, 0) / n;
    const cy = core.reduce((m, s) => m + ats[s.id].y * ats[s.id].n, 0) / n;
    const near = b.squads.filter(
      (s) =>
        up(s) &&
        (core.includes(s) || (s.side === 0 && Math.hypot(ats[s.id].x - cx, ats[s.id].y - cy) < 50)),
    );
    const ys = near.map((s) => ats[s.id].y);
    return { x: cx, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  return { setBattle, play, update, skip, draw, at, playing, progress, focus };
}

/** Where each man of a squad stands: ranks behind the front, facing f. */
export function soldierSlots(s, a, jitter = 0.18) {
  const n = a.n;
  const files = Math.max(1, Math.min(s.files0, n));
  const ranks = Math.ceil(n / files);
  const sp = s.spacing;
  const { fx, fy } = a;
  const px = -fy;
  const py = fx;
  const halfD = (ranks * sp) / 2;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = i % files;
    const k = Math.floor(i / files);
    const inRank = k === ranks - 1 ? n - k * files : files;
    const across = (f - (inRank - 1) / 2) * sp;
    const along = halfD - sp / 2 - k * sp;
    const jx = (hash(s.id * 1000 + i, 1) - 0.5) * 2 * jitter;
    const jy = (hash(s.id * 1000 + i, 2) - 0.5) * 2 * jitter;
    out[i] = { x: a.x + px * across + fx * along + jx, y: a.y + py * across + fy * along + jy };
  }
  return out;
}

function puff(ctx, p, r, alpha) {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(196,176,132,${alpha})`);
  g.addColorStop(1, "rgba(196,176,132,0)");
  ctx.fillStyle = g;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
}

function arrow(ctx, L, from, to, color, dash) {
  const a = toScreen(L, from.x, from.y);
  const z = toScreen(L, to.x, to.y);
  const d = Math.hypot(z.x - a.x, z.y - a.y);
  if (d < 24) return;
  const ux = (z.x - a.x) / d;
  const uy = (z.y - a.y) / d;
  const end = { x: z.x - ux * 12, y: z.y - uy * 12 };
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x + ux * 10, a.y + uy * 10);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(end.x + ux * 7, end.y + uy * 7);
  ctx.lineTo(end.x - uy * 5, end.y + ux * 5);
  ctx.lineTo(end.x + uy * 5, end.y - ux * 5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function marker(ctx, p) {
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.stroke();
}

function outline(ctx, L, s, a, color, lw) {
  const { hw, hd } = squadHalf(s, a.n);
  const c = toScreen(L, a.x, a.y);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.atan2(a.fy, a.fx) - Math.PI / 2);
  ctx.beginPath();
  const pad = 1.8;
  ctx.roundRect(
    -(hw + pad) * L.scale,
    -(hd + pad) * L.scale,
    (hw + pad) * 2 * L.scale,
    (hd + pad) * 2 * L.scale,
    5,
  );
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
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
}

/** Grass, soft patches, a cart track and the woods, in field coordinates. */
function paintGround(g, L, b) {
  const P = (x, y) => toScreen(L, x, y);
  const sc = L.scale;
  const tl = P(0, 0);
  g.fillStyle = "#3f5d37";
  g.fillRect(tl.x, tl.y, FIELD_W * sc, FIELD_H * sc);
  const seed = b.seed % 9973;
  for (let i = 0; i < 40; i++) {
    const p = P(hash(i, 11 + seed) * 100, hash(i, 12 + seed) * 140);
    const r = (4.5 + hash(i, 13 + seed) * 12) * sc;
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, i % 2 ? "rgba(84,116,70,.38)" : "rgba(46,70,40,.38)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  // A cart track across the middle.
  const y1 = 55 + hash(seed, 3) * 30;
  const t0 = P(-5, y1 + 18);
  const t1 = P(40, y1);
  const t2 = P(105, y1 - 12);
  g.beginPath();
  g.moveTo(t0.x, t0.y);
  g.quadraticCurveTo(t1.x, t1.y, t2.x, t2.y);
  g.strokeStyle = "rgba(122,108,72,.32)";
  g.lineWidth = 2.3 * sc;
  g.stroke();
  g.strokeStyle = "rgba(110,150,90,.35)";
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 260; i++) {
    const p = P(hash(i, 21 + seed) * 100, hash(i, 22 + seed) * 140);
    g.moveTo(p.x, p.y);
    g.lineTo(p.x + 1, p.y - 3);
  }
  g.stroke();
  // Woods: clustered dark crowns (battle.md §7 — slow going, poor shooting).
  for (const [k, w] of b.woods.entries()) {
    const trees = [];
    const n = Math.round((w.rx * w.ry) / 3.2);
    for (let i = 0; i < n; i++) {
      const a = hash(i, k * 31 + seed) * Math.PI * 2;
      const d = Math.sqrt(hash(k * 31 + seed, i));
      trees.push({
        ...P(w.x + Math.cos(a) * w.rx * d, w.y + Math.sin(a) * w.ry * d),
        r: (2 + hash(i + k, 5) * 2) * sc,
      });
    }
    trees.sort((a, c) => a.y - c.y);
    g.fillStyle = "rgba(15,25,12,.45)";
    for (const t of trees) {
      g.beginPath();
      g.arc(t.x + 2, t.y + 3, t.r, 0, Math.PI * 2);
      g.fill();
    }
    for (const t of trees) {
      g.beginPath();
      g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      g.fillStyle = "#284726";
      g.fill();
      g.beginPath();
      g.arc(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.6, 0, Math.PI * 2);
      g.fillStyle = "#37603a";
      g.fill();
    }
  }
}
