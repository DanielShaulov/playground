/**
 * Who decides what each squad does this round (battle.md §5).
 *
 * `plan` is the plain AI: the role preferences and one rule of doctrine from
 * the theory model, plus what the model lacked — a banner that keeps behind
 * its line, Valor spent by plain rules, and a squad whose line overhangs
 * nothing splitting off to flank. It commands enemy armies, auto-resolve and
 * the odds alike, so it is a floor on what a player gets.
 *
 * `command` turns a person's standing commands (`squad.cmd`) into the same
 * per-round orders the step reads (`squad.order`).
 */
import {
  standing,
  alive,
  dist,
  ROUND_S,
  DT,
  FIELD_W,
  FIELD_H,
  STEPS,
  breadth,
  extent,
  files,
  depthOf,
  halfW,
  FORMATIONS,
  useAbility,
} from "./battle.js";
import { troop } from "./data/troops.js";

const horse = (s) => s.role === "cav" || s.role === "ha";

/** The nearest standing enemy of `a` that passes `filter`, and how far. */
export function nearest(b, a, filter = () => true) {
  let best = null;
  let bd = Infinity;
  for (const c of b.squads) {
    if (c.side === a.side || !standing(c) || !filter(c)) continue;
    const d = dist(a.x, a.y, c.x, c.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best ? { s: best, d: bd } : null;
}

/** What a squad is going for: its contact, else its order's target. */
export function aimOf(b, s) {
  if (s.contacts.length) return b.squads[s.contacts[0]];
  return s.order.target != null ? b.squads[s.order.target] : null;
}

const rangedPower = (b, side) =>
  b.squads
    .filter((s) => s.side === side && standing(s) && s.range && s.ammo > 0)
    .reduce((p, s) => {
      if (s.units.length === 1) {
        const t = troop(s.units[0].type);
        return p + s.n * t.mdmg * t.acc * (s.range / 70);
      }
      for (const u of s.units) {
        const t = troop(u.type);
        if (t.range) p += u.n * t.mdmg * t.acc * (s.range / 70);
      }
      return p;
    }, 0);

/**
 * Role preferences: who a squad goes for when nobody told it (battle.md §5).
 * Horse: archers, then horse, then the nearest. Spears: horse, then the
 * nearest. Everyone else: the nearest that isn't horse.
 */
export function preferred(b, a) {
  if (a.role === "cav")
    return (
      nearest(b, a, (c) => c.role === "ranged") ??
      nearest(b, a, (c) => c.role === "cav" || c.role === "ha") ??
      nearest(b, a)
    );
  if (a.role === "spear") return nearest(b, a, (c) => c.role === "cav") ?? nearest(b, a);
  if (a.role === "ha") return nearest(b, a, (c) => !c.range || c.role === "cav") ?? nearest(b, a);
  if (a.role === "ranged") return nearest(b, a);
  return nearest(b, a, (c) => c.role !== "cav" && c.role !== "ha") ?? nearest(b, a);
}

// ---------------------------------------------------------------------------
// The plain AI
// ---------------------------------------------------------------------------

export function plan(b, side, tl = null, seen = null) {
  plainOrders(b, side, seen);
  if (b.opts.model) return;
  const sd = b.sides[side];
  if (sd.banner != null) {
    const ban = b.squads[sd.banner];
    if (standing(ban)) escort(b, ban);
  }
  splitIdle(b, side, tl);
  spendValor(b, side);
}

/**
 * The theory model's AI (battle.md §5). One change: spears read the enemy's
 * orders as the last round left them, as both sides now plan from one picture.
 */
function plainOrders(b, side, seen) {
  const mine = rangedPower(b, side);
  const theirs = rangedPower(b, 1 - side);
  // The side that out-shoots the other waits for it to come; the other must go.
  // Waiting has a limit, or two cautious armies stare at each other all day.
  const wait = mine > theirs * 1.2 && b.round < 8;
  for (const a of b.squads) {
    if (a.side !== side || !standing(a)) continue;
    const role = a.role;
    const near = nearest(b, a);
    if (!near) continue;
    if (role === "ranged") {
      a.order =
        near.d <= a.range * 0.95 && a.ammo > 0
          ? { kind: "hold", target: null }
          : { kind: "advance", target: near.s.id };
      continue;
    }
    if (role === "ha") {
      const melee = nearest(b, a, (c) => !c.range || c.role === "cav");
      a.order =
        a.ammo > 0
          ? { kind: "kite", target: (melee ?? near).s.id }
          : { kind: "charge", target: near.s.id };
      continue;
    }
    if (role === "cav") {
      if (cycle(b, a, near)) continue;
      // Ride for their archers, then their horse, then whatever is closest.
      a.order = { kind: "charge", target: preferred(b, a).s.id };
      continue;
    }
    if (role === "spear" && bracing(b, a, side, seen)) {
      a.order = { kind: "hold", target: null };
      continue;
    }
    if (wait && near.d > 25) {
      a.order = { kind: "hold", target: null };
      continue;
    }
    const t =
      role === "spear"
        ? (nearest(b, a, (c) => c.role === "cav") ?? near)
        : (nearest(b, a, (c) => c.role !== "cav" && c.role !== "ha") ?? near);
    a.order = { kind: "advance", target: t.s.id };
  }
}

/** Spears hold and brace when enemy horse is riding at a friend within 45 m. */
function bracing(b, a, side, seen) {
  const cav = nearest(b, a, (c) => c.role === "cav");
  if (!cav || cav.d >= 45) return false;
  const t = seen ? seen[cav.s.id] : cav.s.order.target;
  return t != null && b.squads[t].side === side;
}

/**
 * Cycle charge: a horseman stuck in a scrum is a slow footman. After a round
 * in contact with anything but archers or men already running, pull out, ride
 * clear, and come again with a fresh run-up. Returns true if it set an order.
 */
function cycle(b, a, near) {
  const cur = a.order.target != null ? b.squads[a.order.target] : null;
  if (a.order.withdraw) {
    if (near.d < 22) return true; // keep riding clear
  } else if (
    a.engagedFor >= ROUND_S - DT / 2 &&
    cur &&
    cur.state === "ok" &&
    cur.role !== "ranged"
  ) {
    const dx = a.x - cur.x;
    const dy = a.y - cur.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    a.order = { kind: "move", x: a.x + (dx / d) * 30, y: a.y + (dy / d) * 30, withdraw: true };
    return true;
  }
  return false;
}

/**
 * The banner keeps 14 m behind the middle of its own line, close enough for
 * the aura to reach it, and fights only what comes to it.
 */
function escort(b, a) {
  const near = nearest(b, a);
  if (!near) return;
  if (near.d < 15 || a.contacts.length) {
    a.order = { kind: "advance", target: near.s.id };
    return;
  }
  const others = b.squads.filter((s) => s.side === a.side && standing(s) && !s.banner);
  const line = others.filter((s) => s.role === "inf" || s.role === "spear" || s.role === "monster");
  const ref = line.length ? line : others;
  if (!ref.length) {
    a.order = { kind: "advance", target: near.s.id };
    return;
  }
  const n = ref.reduce((m, s) => m + s.n, 0);
  const cx = ref.reduce((m, s) => m + s.x * s.n, 0) / n;
  const cy = ref.reduce((m, s) => m + s.y * s.n, 0) / n;
  const back = a.side === 0 ? 1 : -1;
  a.order = {
    kind: "move",
    x: Math.max(5, Math.min(FIELD_W - 5, cx)),
    y: Math.max(5, Math.min(FIELD_H - 5, cy + back * 14)),
  };
}

/**
 * Numbers saturate: past about twice the frontage, the extra men stand idle
 * (battle.md §10.9, rule 4). A foot squad locked with one enemy whose line
 * overhangs it by more than its wrap sends the idle files round the end.
 */
function splitIdle(b, side, tl) {
  if (!b.opts.split) return;
  let count = b.squads.filter((s) => s.side === side && alive(s)).length;
  for (const a of [...b.squads]) {
    if (count >= 12) break;
    if (a.side !== side || !standing(a) || a.banner) continue;
    if ((a.role !== "inf" && a.role !== "spear") || a.contacts.length !== 1 || a.n < 24) continue;
    const o = b.squads[a.contacts[0]];
    const dx = o.x - a.x;
    const dy = o.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const ux = dx / d;
    const uy = dy / d;
    const ba = breadth(a, ux, uy);
    const bo = breadth(o, ux, uy);
    const wrap = FORMATIONS[a.formation].wraps
      ? Math.max(0, Math.min(ba - bo, 4 * extent(o, ux, uy)))
      : 0;
    const f = files(a);
    const idleFiles = Math.min(Math.floor((ba - bo - wrap) / a.spacing), Math.floor(f / 2));
    if (idleFiles < 4) continue;
    const ranks = depthOf(a);
    const men = Math.min(Math.floor(a.n / 2), idleFiles * ranks);
    if (men < 8) continue;
    // Take the files from the end farther from the enemy's middle.
    const px = -a.fy;
    const py = a.fx;
    const k = (o.x - a.x) * px + (o.y - a.y) * py;
    const sign = k >= 0 ? 1 : -1;
    const newW = idleFiles * a.spacing;
    const s = JSON.parse(JSON.stringify(a));
    s.id = b.squads.length;
    s.units = [];
    let left = men;
    a.units.forEach((u, i) => {
      const take = i === a.units.length - 1 ? left : Math.min(left, Math.round((men * u.n) / a.n));
      const n0 = Math.min(u.n0 - (u.n - take), Math.round((u.n0 * take) / Math.max(1, u.n)));
      s.units.push({ type: u.type, n: take, n0: Math.max(take, n0), pool: 0 });
      u.n -= take;
      u.n0 -= Math.max(take, n0);
      left -= take;
    });
    s.units = s.units.filter((u) => u.n > 0 || u.n0 > 0);
    s.n = men;
    s.n0 = s.units.reduce((m, u) => m + u.n0, 0);
    a.n -= men;
    a.n0 -= s.n0;
    s.deaths = 0;
    s.files0 = idleFiles;
    a.files0 = Math.max(1, f - idleFiles);
    const half = halfW({ ...a, n: a.n + men, files0: f });
    s.x = a.x - sign * px * (half - newW / 2);
    s.y = a.y - sign * py * (half - newW / 2);
    a.x += sign * px * (newW / 2);
    a.y += sign * py * (newW / 2);
    s.contacts = [];
    s.since = {};
    s.everEngaged = false;
    s.engagedFor = 0;
    s.order = { kind: "advance", target: o.id };
    b.squads.push(s);
    count++;
    if (tl) tl.events.push({ k: "split", step: 0, id: s.id, from: a.id });
  }
}

/**
 * Valor, spent as soon as an ability's trigger holds (battle.md §5): Rally
 * when two squads near the banner waver or run; Hold the Line on a squad
 * enemy horse is riding at; the culture's ability on its trigger; Charge!
 * when eight horsemen will reach their target this round; Loose! when twenty bowmen have
 * targets; Inspire when two squads are in melee.
 */
function spendValor(b, side) {
  const sd = b.sides[side];
  if (!sd.hero || sd.heroDown) return;
  const known = new Set(sd.hero.abilities ?? []);
  const use = (id, squad = null) => known.has(id) && !useAbility(b, side, id, squad);
  const mine = b.squads.filter((s) => s.side === side && standing(s));
  const foes = b.squads.filter((s) => s.side !== side && standing(s));
  const ban = sd.banner != null ? b.squads[sd.banner] : null;
  const within = (a, c, r) => dist(a.x, a.y, c.x, c.y) <= r;

  if (ban && known.has("rally")) {
    const shaken = b.squads.filter(
      (s) =>
        s.side === side &&
        alive(s) &&
        (s.state === "wavering" || s.state === "routing") &&
        within(s, ban, 35),
    );
    if (shaken.length >= 2) use("rally");
  }
  if (known.has("holdline")) {
    for (const f of foes) {
      const t = f.order.target != null ? b.squads[f.order.target] : null;
      if (f.role !== "cav" || !t || t.side !== side || !standing(t) || !within(f, t, 40)) continue;
      if (use("holdline", t.id)) break;
    }
  }
  const culture = {
    // It can't move behind a shield wall, so only a squad that wasn't going
    // to: one holding under arrows, or one locked face to face in a melee.
    shieldwall: () =>
      mine.find(
        (s) =>
          s.role === "inf" &&
          !s.banner &&
          ((s.order.kind === "hold" &&
            !s.contacts.length &&
            foes.some((f) => f.range && f.ammo > 0 && within(f, s, f.range))) ||
            (s.contacts.length > 0 && s.flankedRound === 0 && s.n >= 12)),
      ),
    stakes: () =>
      mine.find(
        (s) =>
          s.role === "ranged" &&
          !s.contacts.length &&
          foes.some((f) => f.role === "cav" && f.order.target === s.id && within(f, s, 50)),
      ),
    lance: () =>
      mine.find((s) => {
        const t = s.order.target != null ? b.squads[s.order.target] : null;
        return s.role === "cav" && !s.contacts.length && t && t.brace && within(s, t, 40);
      }),
    feint: () =>
      mine.find((s) => {
        const t = s.contacts.length ? b.squads[s.contacts[0]] : null;
        return (
          s.role === "cav" &&
          s.engagedFor >= ROUND_S - DT / 2 &&
          t &&
          t.state === "ok" &&
          t.role !== "ranged"
        );
      }),
  };
  for (const [id, find] of Object.entries(culture)) {
    if (!known.has(id)) continue;
    const s = find();
    if (s) use(id, s.id);
  }
  // Charge! and Loose! are army-wide: worth it once enough men can use them.
  const men = (list) => list.reduce((m, s) => m + s.n, 0);
  if (known.has("charge")) {
    const ready = mine.filter((s) => {
      if (s.role !== "cav" || s.contacts.length) return false;
      const t = s.order.target != null ? b.squads[s.order.target] : null;
      return t && t.side !== side && within(s, t, 35); // contact this round
    });
    if (men(ready) >= 8) use("charge");
  }
  if (known.has("loose")) {
    const ready = mine.filter(
      (s) => s.range && s.ammo > 0 && !s.contacts.length && foes.some((f) => within(s, f, s.range)),
    );
    if (men(ready) >= 20) use("loose");
  }
  if (known.has("inspire") && mine.filter((s) => s.contacts.length).length >= 2) use("inspire");
}

// ---------------------------------------------------------------------------
// A person's commands
// ---------------------------------------------------------------------------

/**
 * Commands (battle.md §5) are standing: `squad.cmd` keeps what the player
 * said, and each round it is turned into this round's order.
 *
 *   hold      stand; spears brace; ranged shoot at will (or `target`)
 *   advance   go for `target` (or the role's preference) and fight; ranged
 *             walk until in range and shoot; horse archers skirmish round it
 *   charge    as advance at ×1.15, into melee whatever the role
 *   move      to (x, y), keeping facing; stops if engaged
 *   fallback  to (x, y) or your own edge, out of a melee if need be
 *   skirmish  ranged: keep 60–80% of range from enemy melee, shooting
 *   escort    the banner's default: keep behind the line
 *
 * Flags: `fire: "hold"` holds fire; `cycle: false` stops horse cycling.
 */
export function command(b, side) {
  for (const a of b.squads) {
    if (a.side !== side || !standing(a) || !a.cmd) continue;
    resolve(b, a);
  }
}

function resolve(b, a) {
  const c = a.cmd;
  let tgt = c.target != null ? b.squads[c.target] : null;
  if (tgt && !standing(tgt)) {
    // The target broke: on to the next by role preference.
    tgt = null;
    c.target = null;
  }
  const holdFire = c.fire === "hold";
  const near = nearest(b, a);
  const pick = () => tgt ?? preferred(b, a)?.s ?? null;
  switch (c.kind) {
    case "hold":
      a.order = { kind: "hold", target: tgt?.id ?? null, holdFire };
      return;
    case "move":
    case "fallback": {
      const x = c.x ?? a.x;
      const y = c.y ?? (a.side === 0 ? FIELD_H - 8 : 8);
      a.order = {
        kind: "move",
        x,
        y,
        keepFacing: c.kind === "move",
        withdraw: c.kind === "fallback",
        holdFire,
      };
      return;
    }
    case "escort":
      escort(b, a);
      return;
    case "skirmish":
      if (a.range && a.ammo > 0) {
        skirmish(b, a, tgt, holdFire);
        return;
      }
      break;
    default:
      break;
  }
  if (!near) {
    a.order = { kind: "hold", target: null };
    return;
  }
  const kind = c.kind === "charge" ? "charge" : "advance";
  if (kind === "advance" && a.role === "ranged" && a.ammo > 0) {
    const t = tgt ?? near.s;
    const d = dist(a.x, a.y, t.x, t.y);
    a.order =
      d <= a.range * 0.95
        ? { kind: "hold", target: t.id, holdFire }
        : { kind: "advance", target: t.id, holdFire };
    return;
  }
  if (kind === "advance" && a.role === "ha" && a.ammo > 0) {
    const t = tgt ?? preferred(b, a).s;
    a.order = { kind: "kite", target: t.id, holdFire };
    return;
  }
  if (a.role === "cav" && c.cycle !== false && cycle(b, a, near)) return;
  const t = pick();
  a.order = t ? { kind, target: t.id, holdFire } : { kind: "hold", target: null };
}

/** Keep 60–80% of range from the nearest enemy melee, shooting what's in reach. */
function skirmish(b, a, tgt, holdFire) {
  const melee = nearest(b, a, (c) => !c.range);
  const near = nearest(b, a);
  if (melee && melee.d < 0.6 * a.range) {
    const m = melee.s;
    const dx = a.x - m.x;
    const dy = a.y - m.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const want = 0.75 * a.range;
    a.order = {
      kind: "move",
      x: Math.max(3, Math.min(FIELD_W - 3, m.x + (dx / d) * want)),
      y: Math.max(3, Math.min(FIELD_H - 3, m.y + (dy / d) * want)),
      holdFire,
    };
  } else if (near && near.d <= a.range * 0.95) {
    a.order = { kind: "hold", target: tgt?.id ?? null, holdFire };
  } else if (near) {
    a.order = { kind: "advance", target: (tgt ?? near.s).id, holdFire };
  } else a.order = { kind: "hold", target: null };
}

/**
 * After a round: commanded squads that reached their point stand there; the
 * view pauses on it in continuous play.
 */
export function settle(b, tl = null) {
  for (const a of b.squads) {
    const c = a.cmd;
    if (!c || !standing(a) || (c.kind !== "move" && c.kind !== "fallback")) continue;
    const x = c.x ?? a.x;
    const y = c.y ?? (a.side === 0 ? FIELD_H - 8 : 8);
    const stopped = c.kind === "move" && a.contacts.length > 0; // a move stops if engaged
    if (dist(a.x, a.y, x, y) > 1.5 && !stopped) continue;
    a.cmd = { kind: "hold", fire: c.fire, cycle: c.cycle };
    if (tl) tl.events.push({ k: "moveDone", step: STEPS, id: a.id });
  }
}

export { horse };

/**
 * Give a standing command to some of `side`'s squads (battle.md §5). Fire
 * mode and cycling stay as they were unless the command says otherwise.
 * Returns the ids it was given to.
 */
export function give(b, side, ids, cmd) {
  const done = [];
  for (const id of ids) {
    const s = b.squads[id];
    if (!s || s.side !== side || !standing(s) || b.sides[side].ai) continue;
    const prev = s.cmd ?? {};
    const next = { fire: prev.fire, cycle: prev.cycle, ...cmd };
    if (next.target != null) {
      const t = b.squads[next.target];
      if (!t || t.side === side) next.target = null;
    }
    if (next.kind === "skirmish" && !(s.range && s.ammo > 0)) next.kind = "hold";
    s.cmd = next;
    done.push(id);
  }
  return done;
}
