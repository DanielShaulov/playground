/**
 * A Checkwiz player: a short lookahead through the real rules.
 *
 * For every legal move it plays the move *and the court's reply* on a copy of
 * the run, then scores the position that comes back — and for the most
 * promising few, looks one exchange further. Shared by the simulator
 * (sim.mjs, thousands of runs in Node) and the browser bot (bot.mjs, which
 * turns the chosen move into taps), so both play the same game the same way.
 *
 * It is a decent player, not a strong one. It sees two exchanges ahead at
 * most, knows nothing of relics beyond picking them, and never sets a trap. Read the
 * depth it reaches as roughly what a careful first-timer manages.
 */
import {
  act,
  options,
  dangerMap,
  kingOf,
  cheb,
  KINDS,
  strikersAt,
  ALL8,
  inBoard,
  solidAt,
  pieceAt,
  chance,
} from "../../games/checkwiz/rules.js";

const clone = (x) => JSON.parse(JSON.stringify(x));

/** What a soul in hand is worth to have, in the same units as a point of life. */
const SOUL_WORTH = { pawn: 0.15, knight: 0.5, bishop: 0.4, rook: 0.5, queen: 0.8 };

/** How much a piece still on the board weighs on the wizard. A pawn near the bottom is a queen-to-be. */
function menace(b, p) {
  if (p.kind === "pawn") return 1 + (p.r / (b.size - 1)) ** 2 * 6;
  return KINDS[p.kind].value;
}

function evaluate(before, after, memory) {
  if (after.phase === "dead") return -1e9;
  if (after.chamber > before.chamber) return 1e6 + after.hp * 1e4;

  const b = after.board;
  const w = b.wizard;
  const open = (r, c) => inBoard(b, r, c) && !solidAt(b, r, c) && !pieceAt(b, r, c);
  let s = after.hp * 1000;
  for (const k of after.hand) s += SOUL_WORTH[k] * 1000;

  // How much the position will cost to get out of next turn.
  const d = dangerMap(after);
  let escape = d[w.r][w.c];
  for (const [dr, dc] of ALL8) {
    if (open(w.r + dr, w.c + dc)) escape = Math.min(escape, d[w.r + dr][w.c + dc]);
  }
  s -= escape * 700;

  // Prey: the closest quiet square to stand beside something and hold it.
  let prey = 0;
  for (const p of b.pieces) {
    if (p.kind === "king") continue;
    let near = Infinity;
    for (const [dr, dc] of ALL8) {
      const r = p.r + dr;
      const c = p.c + dc;
      if (open(r, c) && d[r][c] === 0) near = Math.min(near, cheb(w, { r, c }));
    }
    if (near < Infinity) prey = Math.max(prey, menace(b, p) * 40 + 120 - near * 60);
  }
  s += prey;

  const king = kingOf(b);
  if (king) {
    s -= cheb(w, king) * 30;
    const throne = strikersAt(after, king.r, king.c, king).reduce(
      (n, p) => n + KINDS[p.kind].hit,
      0,
    );
    s -= throne * 160;
    // One ply cannot see a win two moves out, and walking up to him always
    // costs his aura first. Check is the promise of the next move, so price it.
    if (b.check) s += 2500 - throne * 1000;
  }
  for (const p of b.pieces) s -= menace(b, p) * 60;

  // Don't pace. A square already stood on this chamber is worth a little less each time.
  s -= (memory?.get(w.r * 16 + w.c) ?? 0) * 45;
  return s;
}

const movesOf = (run) => [
  { type: "wait" },
  ...options(run).map(({ type, r, c, slot }) => ({ type, r, c, slot })),
];

/** Play `m` on a copy; null if illegal. */
function after(run, m) {
  const copy = clone(run);
  return act(copy, m) ? copy : null;
}

/**
 * The move to play, as `{ type, r, c, slot }` — the shape `act()` takes.
 *
 * Every move is scored one exchange deep; the best few are then looked at one
 * exchange deeper, taking the best reply to each. That second look is what
 * lets it see "step next to the rook now, take it for free next turn".
 *
 * `memory` counts the wizard's visits per square this chamber (key r*16+c);
 * the caller keeps it, and clears it between chambers.
 */
export function chooseAction(run, memory = null, { wide = 4 } = {}) {
  const scored = [];
  for (const m of movesOf(run)) {
    const next = after(run, m);
    if (next) scored.push({ m, next, score: evaluate(run, next, memory) + chance() * 20 });
  }
  scored.sort((a, b) => b.score - a.score);

  let best = scored[0];
  let bestScore = -Infinity;
  for (const cand of scored.slice(0, wide)) {
    let deep = cand.score;
    if (cand.next.phase === "play" || cand.next.phase === "bonus") {
      deep = -Infinity;
      for (const m2 of movesOf(cand.next)) {
        const next2 = after(cand.next, m2);
        if (next2) deep = Math.max(deep, evaluate(run, next2, memory));
      }
      // A win now beats the same win later; a line that only works if the
      // court blunders is worth a bit less than one that is already banked.
      deep = deep * 0.97 + cand.score * 0.03;
    }
    if (deep > bestScore) {
      bestScore = deep;
      best = cand;
    }
  }
  return best.m;
}

const TASTE = [
  "fortitude",
  "discovery",
  "zwischenzug",
  "reliquary",
  "pockets",
  "stalemate",
  "blitz",
  "fianchetto",
  "tempo",
  "outpost",
  "counterplay",
  "promotion",
  "gambit",
  "masonry",
  "respite",
];

/** Relics the player refuses, for measuring what one relic is worth: `BAN=blitz,tempo`. */
const BANNED = new Set((globalThis.process?.env?.BAN ?? "").split(",").filter(Boolean));

/** Which relic to take from a draft. */
export function chooseRelic(run) {
  if (run.draft.includes("respite") && run.hp <= run.maxHp - 3) return "respite";
  const rank = (id) => (BANNED.has(id) ? 99 : TASTE.indexOf(id));
  return [...run.draft].sort((a, b) => rank(a) - rank(b))[0];
}
