/**
 * Checkwiz rules — everything that decides what happens, and nothing that
 * draws it. No DOM, no canvas, no storage: a run is plain JSON, and `act()`
 * turns one of the wizard's moves into the court's reply plus a list of events
 * for whoever is watching to animate.
 *
 * It is split out of game.js so the same rules can be played ten thousand
 * times in Node (tests/checkwiz/sim.mjs) — the only honest way to tune a
 * roguelite's difficulty — while the browser suite checks the real thing.
 *
 * The game in six rules:
 *
 *   1. Red squares strike. When your move ends, every piece attacking your
 *      square hits you, for what it hits: a pawn 1, a rook 2, a queen 3. The
 *      number on a square is exactly what standing there costs, and nothing
 *      ever hits you from a square you were not shown.
 *   2. A piece that strikes stays where it is to do it. Everything else moves.
 *   3. A piece you move up beside is held — it cannot move away. It can still
 *      strike, so the side you approach it from is the whole skill: behind a
 *      pawn, anywhere touching a knight, straight at a bishop, diagonal to a
 *      rook. Waiting holds nothing; the hold is the momentum of your move.
 *   4. Take a piece by moving onto it; the square's red is the price. Its soul
 *      is yours to spend: one move in its shape. Take a knight and you can
 *      leap; take a rook and you can charge down a file.
 *   5. Take the Sovereign to clear the chamber — by hand, with a step, never
 *      with a soul. Standing beside him is check, and the court gets one move
 *      to answer it. He never moves; his guards make his square cost.
 *   6. Clear a chamber without being touched and you heal.
 *
 * Nothing is forbidden, only priced: a defended piece, a guarded throne, a
 * queen's line all cost life, and whether it is worth paying is your call.
 * That is what lets one rule replace the wards and exceptions the first
 * version grew. The court defends the throne by making it expensive.
 *
 * "By hand" is the one rule about reach, and it earns its place. When a soul
 * could take the crown, the best play in every chamber was to walk past the
 * court and snipe the throne from across the board — simulated runs cleared a
 * dozen chambers that way without ever fighting. Walking up means giving
 * check, which gives the court its reply: the whole chamber comes down to
 * whether you stripped his guard before you got there.
 *
 * Threat model: all threat is computed as if the wizard were not on the board.
 * He never blocks a line, not for danger and not for defence. Cutting lines is
 * what stones are for.
 */

// --- Randomness ---------------------------------------------------------------
// Everything random goes through here, so a simulation can be seeded and
// replayed. The game itself never seeds.

let random = Math.random;

/** Seed the rules' RNG (mulberry32), or pass null to go back to Math.random. */
export function seedRandom(seed) {
  if (seed == null) {
    random = Math.random;
    return;
  }
  let a = seed >>> 0;
  random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A roll from the rules' RNG, for anything outside that wants to stay replayable. */
export const chance = () => random();
const rnd = (lo, hi) => lo + random() * (hi - lo);
const rint = (lo, hi) => Math.floor(rnd(lo, hi + 1));

// --- Board vocabulary ---------------------------------------------------------

export const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
export const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
export const ALL8 = [...ORTH, ...DIAG];
export const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
// The court marches down the board, so its pawns strike downward.
const PAWN_STRIKE = [
  [1, -1],
  [1, 1],
];

/**
 * The court. `dirs` slides until something blocks; `steps` is a fixed set of
 * offsets. `hit` is what a strike costs you. `value` is the chess value, which
 * is how much the court minds losing the piece. `soul` is the move it gives you
 * when you take it.
 */
export const KINDS = {
  pawn: {
    name: "Pawn",
    hit: 1,
    value: 1,
    steps: PAWN_STRIKE,
    soul: "Stone",
    tip: "Strikes the two squares diagonally below. Crowned a queen at the bottom.",
    soulTip: "Raise a stone within two squares. It blocks bodies and lines for 3 turns.",
  },
  knight: {
    name: "Knight",
    hit: 1,
    value: 3,
    steps: KNIGHT,
    soul: "Leap",
    tip: "Strikes in an L — never the eight squares touching it.",
    soulTip: "Jump an L, over anything in the way.",
  },
  bishop: {
    name: "Bishop",
    hit: 1,
    value: 3,
    dirs: DIAG,
    soul: "Glide",
    tip: "Rakes both diagonals. Come at it straight on.",
    soulTip: "Slide any distance on a diagonal.",
  },
  rook: {
    name: "Rook",
    hit: 2,
    value: 5,
    dirs: ORTH,
    soul: "Charge",
    tip: "Owns its rank and file, for two. Come at it on the diagonal.",
    soulTip: "Slide any distance on a rank or file.",
  },
  queen: {
    name: "Queen",
    hit: 3,
    value: 9,
    dirs: ALL8,
    soul: "Storm",
    tip: "Every line at once, for three. Only a knight's L is safe from her.",
    soulTip: "Slide any distance on any line.",
  },
  king: {
    name: "Sovereign",
    hit: 0,
    value: 0,
    steps: [],
    soul: null,
    tip: "Never moves, never strikes. Take him by hand — a step, not a soul.",
    soulTip: "",
  },
};

export const SAVE_V = 3;
export const HP_START = 6;
/** As big as a wizard gets. Past it, the only way to take less damage is to stand better. */
export const HP_CEILING = 9;
export const SLOTS_START = 3;
export const SLOTS_MAX = 5;
export const STONE_LIFE = 3;
/** Sliders cross at most this many squares a turn: they threaten far and travel slow. */
const SLIDE_RANGE = 2;

// --- Reading a board ----------------------------------------------------------

export const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export const same = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
export const inBoard = (b, r, c) => r >= 0 && c >= 0 && r < b.size && c < b.size;
export const pieceAt = (b, r, c) => b.pieces.find((p) => p.r === r && p.c === c) ?? null;
export const pillarAt = (b, r, c) => b.pillars.some((x) => x.r === r && x.c === c);
export const stoneAt = (b, r, c) => b.stones.find((x) => x.r === r && x.c === c) ?? null;
export const solidAt = (b, r, c) => pillarAt(b, r, c) || !!stoneAt(b, r, c);
export const kingOf = (b) => b.pieces.find((p) => p.kind === "king") ?? null;
const key = (r, c) => r * 16 + c;
const grid = (n, v) => Array.from({ length: n }, () => new Array(n).fill(v));

/** Every square a `kind` standing on (r,c) attacks. Pieces and solid squares stop a slide. */
export function raysFrom(b, kind, r, c) {
  const k = KINDS[kind];
  const out = [];
  if (k.dirs) {
    for (const [dr, dc] of k.dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inBoard(b, rr, cc) && !pillarAt(b, rr, cc)) {
        // A stone takes the hit rather than passing it on, so it is not on the
        // line either — it is simply where the line stops.
        if (stoneAt(b, rr, cc)) break;
        out.push({ r: rr, c: cc });
        if (pieceAt(b, rr, cc)) break;
        rr += dr;
        cc += dc;
      }
    }
  } else {
    for (const [dr, dc] of k.steps) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBoard(b, rr, cc) && !solidAt(b, rr, cc)) out.push({ r: rr, c: cc });
    }
  }
  return out;
}

/** What `p` attacks right now. A stunned piece attacks nothing. */
export function attacksOf(run, p) {
  if (p.stun > 0) return [];
  return raysFrom(run.board, p.kind, p.r, p.c);
}

/** Life each square would cost to stand on. A square holds life, not a count of attackers. */
export function dangerMap(run) {
  const b = run.board;
  const d = grid(b.size, 0);
  for (const p of b.pieces) for (const s of attacksOf(run, p)) d[s.r][s.c] += KINDS[p.kind].hit;
  return d;
}

/** The pieces that would strike a wizard standing on (r,c), leaving out `gone`. */
export function strikersAt(run, r, c, gone = null) {
  return run.board.pieces.filter(
    (p) => p !== gone && attacksOf(run, p).some((s) => s.r === r && s.c === c),
  );
}

const bill = (strikers) => strikers.reduce((n, p) => n + KINDS[p.kind].hit, 0);

// --- The wizard's moves -------------------------------------------------------

/**
 * Where a soul of `kind` can take the wizard from where he stands. Slides stop
 * on the first piece (a capture) and before anything solid; a leap only minds
 * where it lands. A pawn's soul is not a move at all but a stone to set down.
 */
export function soulTargets(b, kind, from = b.wizard) {
  const out = [];
  const k = KINDS[kind];
  if (kind === "pawn") {
    for (let r = from.r - 2; r <= from.r + 2; r++) {
      for (let c = from.c - 2; c <= from.c + 2; c++) {
        if (!inBoard(b, r, c) || (r === from.r && c === from.c)) continue;
        if (pieceAt(b, r, c) || solidAt(b, r, c)) continue;
        out.push({ r, c, stone: true });
      }
    }
  } else if (kind === "knight") {
    for (const [dr, dc] of KNIGHT) {
      const r = from.r + dr;
      const c = from.c + dc;
      if (inBoard(b, r, c) && !solidAt(b, r, c)) out.push({ r, c, target: pieceAt(b, r, c) });
    }
  } else if (k.dirs) {
    for (const [dr, dc] of k.dirs) {
      let r = from.r + dr;
      let c = from.c + dc;
      while (inBoard(b, r, c) && !solidAt(b, r, c)) {
        const target = pieceAt(b, r, c);
        out.push({ r, c, target });
        if (target) break;
        r += dr;
        c += dc;
      }
    }
  }
  return out;
}

/**
 * Everything the wizard may do this turn, each with its price — the life it
 * costs and exactly who will strike. The action bar reads from here, so what
 * you are told is what resolves.
 */
export function options(run) {
  const b = run.board;
  const w = b.wizard;
  const out = [];

  for (const [dr, dc] of ALL8) {
    const r = w.r + dr;
    const c = w.c + dc;
    if (!inBoard(b, r, c) || solidAt(b, r, c)) continue;
    const target = pieceAt(b, r, c);
    const strikers = strikersAt(run, r, c, target);
    out.push({ type: "step", r, c, target, strikers, cost: bill(strikers) });
  }
  if (run.phase === "bonus") return out;

  run.hand.forEach((kind, slot) => {
    for (const t of soulTargets(b, kind)) {
      if (t.target?.kind === "king") continue; // by hand only — see the top of the file
      let strikers;
      if (t.stone) {
        // He stays put, so the price is his own square with the stone set down.
        b.stones.push({ r: t.r, c: t.c, life: 1 });
        strikers = strikersAt(run, w.r, w.c);
        b.stones.pop();
      } else {
        strikers = strikersAt(run, t.r, t.c, t.target);
      }
      out.push({ type: "soul", slot, kind, ...t, strikers, cost: bill(strikers) });
    }
  });
  return out;
}

/** Every square the wizard could land on next turn — what the court fears. */
function reachOf(run) {
  const b = run.board;
  const w = b.wizard;
  const out = new Set();
  for (const [dr, dc] of ALL8) {
    const r = w.r + dr;
    const c = w.c + dc;
    if (inBoard(b, r, c) && !solidAt(b, r, c)) out.add(key(r, c));
  }
  for (const kind of new Set(run.hand)) {
    if (kind === "pawn") continue;
    for (const t of soulTargets(b, kind)) {
      if (t.target?.kind !== "king") out.add(key(t.r, t.c));
    }
  }
  return out;
}

/** Could the wizard take the Sovereign with his next move? That is check. */
export function inCheck(run) {
  const k = kingOf(run.board);
  return !!k && reachOf(run).has(key(k.r, k.c));
}

// --- Relics ---------------------------------------------------------------------

/**
 * Between chambers you take one of three. They bend a rule rather than add a
 * number, and most are named for the chess idea they borrow.
 *
 * `restore` marks the ones that give life back. A draft never offers two:
 * mending has to compete with getting stronger, or a run collapses into
 * walking through every line and healing it off afterwards.
 */
export const RELICS = [
  {
    id: "fortitude",
    name: "Fortitude",
    glyph: "✚",
    blurb: "+1 max life — an empty heart, for mending to fill.",
    stacks: true,
    when: (run) => run.maxHp < HP_CEILING,
    apply(run) {
      run.maxHp++;
    },
  },
  {
    id: "respite",
    name: "Respite",
    glyph: "❤",
    blurb: "Heal 2 life. Twice a run, no more.",
    restore: true,
    stacks: true,
    // A ceiling on what a run can mend. Offered every time you were hurt, it
    // topped a careful player up forever and the deep chambers never killed
    // anyone; with two, being untouched is the only healing that lasts.
    when: (run) => run.hp <= run.maxHp - 2 && run.spent.filter((x) => x === "respite").length < 2,
    apply(run) {
      run.hp = Math.min(run.maxHp, run.hp + 2);
    },
  },
  {
    id: "pockets",
    name: "Deep Pockets",
    glyph: "◫",
    blurb: "Carry one more soul.",
    when: (run) => run.slots < SLOTS_MAX,
    apply(run) {
      run.slots++;
    },
  },
  {
    id: "reliquary",
    name: "Reliquary",
    glyph: "⚱",
    blurb: "Your oldest soul survives the stairs.",
  },
  {
    id: "promotion",
    name: "Promotion",
    glyph: "♛",
    blurb: "Three pawn souls fuse into a queen's.",
  },
  {
    id: "zwischenzug",
    name: "Zwischenzug",
    glyph: "↯",
    blurb: "Once a chamber, after a soul move that takes a piece, take a free step.",
  },
  {
    id: "tempo",
    name: "Tempo",
    glyph: "⧗",
    blurb: "The court sleeps through your first move in every chamber.",
  },
  {
    id: "counterplay",
    name: "Counterplay",
    glyph: "⚔",
    blurb: "A piece that strikes you is stunned for a turn.",
  },
  {
    id: "stalemate",
    name: "Stalemate",
    glyph: "☉",
    blurb: "Once, a blow that would kill you leaves you on 1 life.",
  },
  {
    // Not "souls may take the crown": that relic existed, and three in four of
    // the runs that went on forever had it. Sniping the throne is the one
    // thing this game is built to deny; Blitz still makes you walk up.
    id: "blitz",
    name: "Blitz",
    glyph: "♔",
    blurb: "Check leaves the court no time to reply: it strikes, but cannot move.",
  },
  {
    id: "gambit",
    name: "Gambit",
    glyph: "♙",
    blurb: "Begin every chamber holding a pawn's soul.",
    stacks: true,
    when: (run) => (run.relics.gambit ?? 0) < 2,
  },
  {
    id: "masonry",
    name: "Masonry",
    glyph: "▩",
    blurb: "Your stones stand until the chamber ends.",
  },
  {
    id: "fianchetto",
    name: "Fianchetto",
    glyph: "♗",
    blurb: "A bishop's soul that takes a piece comes back to you.",
  },
  {
    id: "outpost",
    name: "Outpost",
    glyph: "♘",
    blurb: "A knight's soul that takes a piece comes back to you.",
  },
  {
    id: "discovery",
    name: "Discovered Attack",
    glyph: "✦",
    blurb: "Once a chamber, taking a piece stuns every piece it was defending.",
  },
];

export const relicById = (id) => RELICS.find((x) => x.id === id);

/** Soul echoes: which relic hands a soul of this kind back after a capture. */
const ECHO = { bishop: "fianchetto", knight: "outpost" };

function rollDraft(run) {
  const owned = (x) => (run.relics[x.id] ?? 0) > 0 || (!x.stacks && run.spent.includes(x.id));
  const pool = RELICS.filter((x) => (x.stacks || !owned(x)) && (!x.when || x.when(run)));
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const [taken] = pool.splice(rint(0, pool.length - 1), 1);
    picks.push(taken.id);
    if (taken.restore) {
      for (let i = pool.length - 1; i >= 0; i--) if (pool[i].restore) pool.splice(i, 1);
    }
  }
  return picks;
}

/** Take a relic from the draft and descend. */
export function choose(run, id) {
  if (run.phase !== "draft" || !run.draft.includes(id)) return false;
  const relic = relicById(id);
  relic.apply?.(run);
  // Pure mends are spent the moment they land; everything else is kept.
  if (id === "respite") run.spent.push(id);
  else run.relics[id] = (run.relics[id] ?? 0) + 1;
  startChamber(run);
  return true;
}

// --- Chambers -------------------------------------------------------------------

/**
 * A run is fifteen chambers in three acts, each ending in a castle, and the
 * last Sovereign castles twice. It used to go on forever, and forever could
 * not be balanced: by chamber sixteen a run held nearly every relic there is,
 * and simulated players cleared the deep chambers more easily than the middle
 * ones. An ending gives the difficulty somewhere to climb to.
 */
const CHAMBER_NAMES = [
  "the Pawn Gate",
  "the Knight's Stair",
  "the Bishop's Nave",
  "the Long Rank",
  "the Gatehouse",
  "the Broken File",
  "the Mirror Hall",
  "the Rook's Vault",
  "the Open Diagonal",
  "the Citadel",
  "the Queen's Garden",
  "the Fianchetto",
  "the Zugzwang",
  "the Endgame",
  "the Keep",
];
export const FINAL = CHAMBER_NAMES.length;
export const chamberName = (n) => CHAMBER_NAMES[Math.min(n, FINAL) - 1];
export const isBoss = (n) => n % 5 === 0;
/** How many times a chamber's Sovereign can hide behind a rook. */
const castles = (n) => (n === FINAL ? 2 : isBoss(n) ? 1 : 0);

/** What the court can field, what it costs from a chamber's budget, and from when. */
const GUARD_POOL = [
  { kind: "pawn", cost: 1, from: 1 },
  { kind: "knight", cost: 3, from: 2 },
  { kind: "bishop", cost: 3, from: 3 },
  { kind: "rook", cost: 5, from: 4 },
  { kind: "queen", cost: 9, from: 7 },
];

/** How often pawns step forward: every Nth turn, staggered so a rank never moves as one. */
const pawnPace = (n) => (n <= 2 ? 4 : 3);

/** The life his own square costs, at least, when the chamber opens. */
const throneNeed = (n) => Math.min(6, 1 + Math.floor(n / 2));

/**
 * Every Nth turn a fresh pawn enters the top rank. Without it a chamber whose
 * pawns are all gone has no clock left, and a queen that will not be caught
 * can keep a wizard dancing forever; with it, time spent is always a cost.
 */
const callEvery = (n) => (n <= 1 ? 10 : n <= 4 ? 7 : n <= 8 ? 6 : 5);

function emptyBoard(size, n) {
  return {
    size,
    pieces: [],
    pillars: [],
    stones: [],
    wizard: { r: size - 1, c: 0 },
    turn: 1,
    boss: isBoss(n),
    castle: castles(n),
    pace: pawnPace(n),
    need: throneNeed(n),
    call: callEvery(n),
    due: 1 + callEvery(n),
    hurt: 0,
    sleep: 0,
    check: false,
    nextId: 1,
  };
}

/**
 * `guard` splits the court in two. Palace guards stay near the Sovereign and
 * keep his square and the squares around it covered; the rest hunt. Without
 * the split every piece chased the wizard, the throne stood bare by the time
 * he got there, and a chamber was a four-move walk.
 */
function addPiece(b, kind, r, c, guard = false) {
  b.pieces.push({ id: b.nextId++, kind, r, c, stun: 0, guard });
}

/**
 * The first chamber is laid out by hand: it is the tutorial, and a first
 * impression is not something to leave to a dice roll. Three pawns and a
 * throne. One pawn shields him; one will reach the bottom and crown itself if
 * you dawdle, which is the clock, taught by example.
 */
function firstChamber() {
  const b = emptyBoard(6, 1);
  addPiece(b, "king", 1, 2);
  addPiece(b, "pawn", 0, 1, true); // strikes (1,0) and the throne
  addPiece(b, "pawn", 2, 4);
  addPiece(b, "pawn", 2, 0);
  b.wizard = { r: 5, c: 3 };
  return b;
}

/**
 * Build a chamber. Rejection-sampled rather than clever: lay the court out,
 * then insist on a guarded throne, a quiet square to start on, and a walkable
 * way to the throne. Anything failing is rerolled — cheap on a board this
 * small, and much harder to get subtly wrong than constructive placement.
 */
function genChamber(run) {
  const n = run.chamber;
  if (n === 1) return firstChamber();
  const size = n <= 2 ? 6 : n <= 5 ? 7 : 8;

  for (let attempt = 0; attempt < 300; attempt++) {
    const b = emptyBoard(size, n);
    const free = (r, c) =>
      inBoard(b, r, c) && !pieceAt(b, r, c) && !pillarAt(b, r, c) && !same(b.wizard, { r, c });

    // Pillars in the middle rows, never touching each other, so they carve
    // lines up without walling anything off.
    const pillars = n < 3 ? 0 : rint(1, Math.min(4, 1 + Math.floor(n / 3)));
    for (let i = 0, tries = 0; i < pillars && tries < 40; tries++) {
      const r = rint(2, size - 3);
      const c = rint(0, size - 1);
      if (b.pillars.some((x) => cheb(x, { r, c }) <= 1)) continue;
      b.pillars.push({ r, c });
      i++;
    }

    const kr = rint(0, 1);
    const kc = rint(1, size - 2);
    addPiece(b, "king", kr, kc);

    // Pawns diagonally above him shield his square — the classic shield.
    const shields = [
      [kr - 1, kc - 1],
      [kr - 1, kc + 1],
    ].filter(([r, c]) => free(r, c));
    for (const [r, c] of shields.slice(0, n <= 3 ? 1 : 2)) addPiece(b, "pawn", r, c, true);

    let budget = Math.round(2 + n * 2.2);
    const maxPieces = Math.min(size + 2, 3 + n);
    const pool = GUARD_POOL.filter((g) => n >= g.from);
    // A castle needs a rook for every time he castles.
    for (let i = 0, tries = 0; i < b.castle && tries < 20; tries++) {
      const r = rint(0, 2);
      const c = rint(0, size - 1);
      if (!free(r, c)) continue;
      addPiece(b, "rook", r, c, true);
      i++;
    }
    for (let tries = 0; tries < 80 && budget > 0 && b.pieces.length < maxPieces; tries++) {
      const affordable = pool.filter((g) => g.cost <= budget);
      if (!affordable.length) break;
      // The better of two rolls leans the court toward the top of what it can
      // afford: deeper chambers field a rook rather than five pawns.
      const g =
        affordable[Math.max(rint(0, affordable.length - 1), rint(0, affordable.length - 1))];
      const deepest = g.kind === "pawn" ? Math.floor(size / 2) - 1 : size - 4;
      const r = rint(0, deepest);
      const c = rint(0, size - 1);
      if (!free(r, c)) continue;
      // Every other officer joins the palace guard.
      const officers = b.pieces.filter((x) => x.kind !== "pawn" && x.kind !== "king");
      addPiece(
        b,
        g.kind,
        r,
        c,
        g.kind !== "pawn" && officers.filter((x) => x.guard).length * 2 <= officers.length,
      );
      budget -= g.cost;
    }

    const probe = { ...run, board: b, hand: [] };
    const king = kingOf(b);
    if (bill(strikersAt(probe, king.r, king.c, king)) < throneNeed(n)) continue;
    const start = findStart(probe);
    if (!start) continue;
    b.wizard = start;
    if (!walkable(b, start, king)) continue;
    return b;
  }
  return firstChamber();
}

/**
 * A quiet square in the bottom two rows, out of every piece's reach and grip,
 * with room to move and as far from the throne as it can be.
 */
function findStart(probe) {
  const b = probe.board;
  const d = dangerMap(probe);
  const king = kingOf(b);
  let best = null;
  let bestScore = -Infinity;
  for (let r = b.size - 1; r >= b.size - 2; r--) {
    for (let c = 0; c < b.size; c++) {
      if (d[r][c] > 0 || solidAt(b, r, c) || b.pieces.some((p) => cheb(p, { r, c }) <= 1)) continue;
      let quiet = 0;
      for (const [dr, dc] of ALL8) {
        const rr = r + dr;
        const cc = c + dc;
        if (inBoard(b, rr, cc) && !solidAt(b, rr, cc) && !pieceAt(b, rr, cc) && d[rr][cc] === 0)
          quiet++;
      }
      if (quiet < 2) continue;
      const score = quiet * 2 + cheb({ r, c }, king) + rnd(0, 1);
      if (score > bestScore) {
        bestScore = score;
        best = { r, c };
      }
    }
  }
  return best;
}

/** Can the wizard walk to the throne at all, around pillars? */
function walkable(b, from, to) {
  const seen = new Set([key(from.r, from.c)]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (cheb(at, to) <= 1) return true;
    for (const [dr, dc] of ALL8) {
      const r = at.r + dr;
      const c = at.c + dc;
      if (!inBoard(b, r, c) || pillarAt(b, r, c) || seen.has(key(r, c))) continue;
      seen.add(key(r, c));
      queue.push({ r, c });
    }
  }
  return false;
}

export function startChamber(run) {
  run.board = genChamber(run);
  run.phase = "play";
  run.draft = null;
  // Souls do not survive the stairs. Carried over, a Storm banked in one
  // chamber opened the next from across the board, and every chamber got
  // easier than the last; empty-handed, each one starts as a walk.
  run.hand = run.hand.slice(0, run.relics.reliquary ?? 0);
  for (let i = 0; i < (run.relics.gambit ?? 0) && run.hand.length < run.slots; i++) {
    run.hand.push("pawn");
  }
  if (run.relics.tempo) run.board.sleep = 1;
  run.board.check = inCheck(run);
}

export function newRun() {
  const run = {
    v: SAVE_V,
    chamber: 1,
    hp: HP_START,
    maxHp: HP_START,
    slots: SLOTS_START,
    hand: [],
    relics: {},
    spent: [],
    captures: 0,
    flawless: 0,
    turns: 0,
    phase: "play",
    draft: null,
    board: null,
  };
  startChamber(run);
  return run;
}

// --- Resolving a turn -----------------------------------------------------------

function hurt(run, dmg, ev) {
  run.hp -= dmg;
  run.board.hurt += dmg;
  if (run.hp > 0) return;
  if (run.relics.stalemate) {
    run.hp = 1;
    delete run.relics.stalemate;
    run.spent.push("stalemate");
    ev.push({ t: "saved" });
    return;
  }
  run.phase = "dead";
  ev.push({ t: "dead" });
}

/** Bank a taken piece's soul, if there is room for it. */
function gainSoul(run, kind, ev) {
  if (run.hand.length >= run.slots) {
    ev.push({ t: "full", kind });
    return;
  }
  run.hand.push(kind);
  ev.push({ t: "soul", kind });
  if (run.relics.promotion && run.hand.filter((k) => k === "pawn").length >= 3) {
    for (let i = 0; i < 3; i++) run.hand.splice(run.hand.indexOf("pawn"), 1);
    run.hand.push("queen");
    ev.push({ t: "fuse" });
  }
}

/**
 * Play one move for the wizard and resolve the court's reply. `action` is
 * `{ type: "step" | "soul", r, c, slot? }` or `{ type: "wait" }`. Returns the
 * events in the order they happened, or null if the move is not legal.
 */
export function act(run, action) {
  if (run.phase !== "play" && run.phase !== "bonus") return null;
  const b = run.board;
  const ev = [];
  run.turns++;

  if (action.type === "wait") {
    const skip = run.phase === "bonus";
    ev.push({ t: skip ? "skip" : "wait" });
    run.phase = "play";
    // Skipping a free step still answers the soul move that earned it.
    courtTurn(run, ev, skip);
    return ev;
  }

  const opt = options(run).find(
    (o) =>
      o.type === action.type &&
      o.r === action.r &&
      o.c === action.c &&
      (o.type !== "soul" || o.slot === action.slot),
  );
  if (!opt) {
    run.turns--;
    return null;
  }
  const bonus = run.phase === "bonus";
  run.phase = "play";

  if (opt.type === "soul") {
    run.hand.splice(opt.slot, 1);
    ev.push({ t: "spend", kind: opt.kind, slot: opt.slot });
  }

  if (opt.stone) {
    b.stones.push({ r: opt.r, c: opt.c, life: run.relics.masonry ? 99 : STONE_LIFE });
    ev.push({ t: "stone", r: opt.r, c: opt.c });
    courtTurn(run, ev, false);
    return ev;
  }

  const from = { ...b.wizard };
  b.wizard = { r: opt.r, c: opt.c };
  ev.push({ t: opt.type === "step" ? "walk" : opt.kind, from, to: { ...b.wizard } });

  let target = opt.target;
  let royal = false;
  if (target?.kind === "king") {
    const rooks = b.pieces.filter((p) => p.kind === "rook");
    if (b.castle > 0 && rooks.length) {
      // He castles: the rook takes his place and the blow, and he escapes to
      // where it stood. Only once, and only while he has a rook to hide behind.
      const rook = rooks.reduce((a, x) => (cheb(x, from) > cheb(a, from) ? x : a));
      const hide = { r: rook.r, c: rook.c };
      rook.r = target.r;
      rook.c = target.c;
      target.r = hide.r;
      target.c = hide.c;
      b.castle--;
      ev.push({ t: "castle", king: target.id, rook: rook.id, to: hide });
      target = rook;
    } else {
      royal = true;
    }
  }

  if (target) {
    // Once a chamber. Every time, it was worth more than every other relic put
    // together: a stunned defender defends nothing, so each capture made the
    // next one free, and simulated runs won six times as often with it.
    if (run.relics.discovery && !royal && !b.discovered) {
      for (const q of b.pieces) {
        if (q === target || q.kind === "king") continue;
        if (!attacksOf(run, target).some((x) => same(x, q))) continue;
        q.stun = Math.max(q.stun, 1);
        b.discovered = true;
        ev.push({ t: "stun", id: q.id, r: q.r, c: q.c });
      }
    }
    b.pieces = b.pieces.filter((p) => p !== target);
    run.captures++;
    ev.push({ t: "take", id: target.id, kind: target.kind, r: target.r, c: target.c });
    if (opt.type === "soul" && run.relics[ECHO[opt.kind]]) {
      run.hand.splice(opt.slot, 0, opt.kind);
      ev.push({ t: "echo", kind: opt.kind });
    }
    if (!royal) gainSoul(run, target.kind, ev);
  }

  if (royal) {
    // His court's last blow lands before it scatters: whatever guarded the
    // throne strikes whoever takes it. That is the price of the crown.
    for (const p of strikersAt(run, b.wizard.r, b.wizard.c)) {
      ev.push({
        t: "strike",
        id: p.id,
        kind: p.kind,
        from: { r: p.r, c: p.c },
        dmg: KINDS[p.kind].hit,
      });
      hurt(run, KINDS[p.kind].hit, ev);
      if (run.phase === "dead") return ev;
    }
    clearChamber(run, ev);
    return ev;
  }

  if (target && opt.type === "soul" && run.relics.zwischenzug && !bonus && !b.bonusUsed) {
    // Once a chamber: every time, it was the strongest relic in the pool by a
    // distance, because a free step after every capture is a combo engine.
    b.bonusUsed = true;
    run.phase = "bonus";
    ev.push({ t: "bonus" });
    return ev;
  }
  courtTurn(run, ev, true);
  return ev;
}

function clearChamber(run, ev) {
  const b = run.board;
  const flawless = b.hurt === 0;
  const before = run.hp;
  if (flawless) run.hp++;
  run.hp = Math.min(run.maxHp, run.hp);
  if (flawless) run.flawless++;
  b.pieces = [];
  ev.push({ t: "clear", flawless, healed: run.hp - before });
  const won = run.chamber === FINAL;
  run.chamber++;
  if (won) {
    run.phase = "won";
    ev.push({ t: "won" });
    return;
  }
  run.phase = "draft";
  run.draft = rollDraft(run);
}

/**
 * The court's turn. Who strikes is decided on the map the wizard was looking
 * at, before anything moves, so the red squares were the truth.
 */
function courtTurn(run, ev, moved) {
  const b = run.board;
  b.turn++;
  decayStones(b);

  if (b.sleep > 0) {
    b.sleep--;
    ev.push({ t: "sleep" });
    b.check = inCheck(run);
    return;
  }

  const w = b.wizard;
  const firing = b.pieces.filter((p) => attacksOf(run, p).some((s) => same(s, w)));
  for (const p of firing) {
    ev.push({
      t: "strike",
      id: p.id,
      kind: p.kind,
      from: { r: p.r, c: p.c },
      dmg: KINDS[p.kind].hit,
    });
    if (run.relics.counterplay) p.stun = Math.max(p.stun, 1);
    hurt(run, KINDS[p.kind].hit, ev);
    if (run.phase === "dead") return;
  }

  if (run.relics.blitz && inCheck(run)) {
    ev.push({ t: "blitz" });
    return;
  }

  // The big pieces choose first and the rest fit around them.
  const order = [...b.pieces].sort((a, x) => KINDS[x.kind].value - KINDS[a.kind].value);
  for (const p of order) {
    if (firing.includes(p)) continue;
    if (p.stun > 0) {
      p.stun--;
      continue;
    }
    // Held. Only by a move: when holding applied to waiting too, a wizard could
    // sit in a pocket of pieces that could neither strike his square nor leave
    // it, forever, while the reinforcements piled up into thirty queens.
    if (moved && cheb(p, w) === 1) continue;
    const m = chooseMove(run, p);
    if (m) {
      ev.push({ t: "move", id: p.id, from: { r: p.r, c: p.c }, to: m });
      p.r = m.r;
      p.c = m.c;
    }
    if (p.kind === "pawn" && p.r === b.size - 1) {
      p.kind = "queen";
      ev.push({ t: "crown", id: p.id, r: p.r, c: p.c });
    }
  }

  if (b.turn >= b.due) {
    const cols = [];
    for (let c = 0; c < b.size; c++) {
      if (!pieceAt(b, 0, c) && !solidAt(b, 0, c) && cheb(w, { r: 0, c }) > 1) cols.push(c);
    }
    if (cols.length) {
      const c = cols[rint(0, cols.length - 1)];
      addPiece(b, "pawn", 0, c);
      ev.push({ t: "arrive", id: b.nextId - 1, r: 0, c });
      // And each one comes sooner than the last. At a steady rate a patient
      // enough wizard could dodge forever; now waiting is always losing.
      b.call = Math.max(2, b.call - 1);
      b.due = b.turn + b.call;
    }
  }

  const check = inCheck(run);
  if (check && !b.check) ev.push({ t: "check" });
  b.check = check;
}

function decayStones(b) {
  for (const s of b.stones) s.life--;
  b.stones = b.stones.filter((s) => s.life > 0);
}

// --- The court's mind -------------------------------------------------------------

function moveCandidates(b, p) {
  const open = (r, c) =>
    inBoard(b, r, c) && !pieceAt(b, r, c) && !solidAt(b, r, c) && !same(b.wizard, { r, c });
  const out = [];
  const k = KINDS[p.kind];
  if (p.kind === "knight") {
    for (const [dr, dc] of KNIGHT)
      if (open(p.r + dr, p.c + dc)) out.push({ r: p.r + dr, c: p.c + dc });
  } else if (k.dirs) {
    for (const [dr, dc] of k.dirs) {
      for (let s = 1; s <= SLIDE_RANGE; s++) {
        const r = p.r + dr * s;
        const c = p.c + dc * s;
        if (!open(r, c)) break;
        out.push({ r, c });
      }
    }
  }
  return out;
}

/**
 * Where a piece goes. The court wants three things, in roughly this order:
 *
 *   - **A line on the wizard.** A piece that could strike his square from a
 *     candidate square wants it, because next turn it fires from there. That
 *     is the rhythm of the game: a rook swings onto your file, and you have
 *     exactly one move to be somewhere else. It also likes covering the squares
 *     around him, which is how a court boxes a wizard in without anyone having
 *     to plan it.
 *   - **A guarded throne.** A piece that covers the Sovereign's square makes
 *     taking him cost, and the fewer others are covering him the more it
 *     matters. In check the court drops everything to cover him, or to stand
 *     in the line the wizard would take to reach him.
 *   - **Not to be handed over.** Every square the wizard could land on next
 *     turn — souls included, so it fears the knight you are holding — is priced
 *     by what the capture would cost him against what the piece is worth. A
 *     pawn will trade itself for a hit; a queen will give up a great deal of
 *     position rather than stand where he can take her cheaply. A square two
 *     from him with a quiet square between is feared too, because walking up
 *     and holding a piece is how the wizard catches the ones that run.
 *
 * It is one ply and a little noise, which is the point: a court that sees
 * everything is a puzzle with no play in it. It can be baited.
 */
function chooseMove(run, p) {
  const b = run.board;
  const k = KINDS[p.kind];
  if (p.kind === "king") return null;
  if (p.kind === "pawn") {
    // A shield pawn holds its post. Left to march, it walked off the throne
    // on its own and handed the chamber over.
    if (p.guard) return null;
    const r = p.r + 1;
    if ((b.turn + p.id) % b.pace !== 0) return null;
    if (
      !inBoard(b, r, p.c) ||
      pieceAt(b, r, p.c) ||
      solidAt(b, r, p.c) ||
      same(b.wizard, { r, c: p.c })
    )
      return null;
    return { r, c: p.c };
  }

  const w = b.wizard;
  const home = { r: p.r, c: p.c };
  const candidates = [home, ...moveCandidates(b, p)];

  // Judge the board with the piece lifted off it, since it is leaving.
  const i = b.pieces.indexOf(p);
  b.pieces.splice(i, 1);
  const d = dangerMap(run);
  const reach = reachOf(run);
  const king = kingOf(b);
  const cover = king ? d[king.r][king.c] : 0;
  const checked = king && reach.has(key(king.r, king.c));

  let best = home;
  let bestScore = -Infinity;
  for (const m of candidates) {
    const lines = raysFrom(b, p.kind, m.r, m.c);
    const on = (s) => lines.some((x) => x.r === s.r && x.c === s.c);

    let score = rnd(0, 3) - cheb(m, w) * 3;
    if (same(m, home)) score -= 3; // a court that never sits still

    if (on(w)) score += 40 + k.hit * 12;
    for (const [dr, dc] of ALL8) {
      const s = { r: w.r + dr, c: w.c + dc };
      if (inBoard(b, s.r, s.c) && !solidAt(b, s.r, s.c) && on(s)) score += 8;
    }

    if (king && p.guard) {
      const alarm = checked ? 2 : 1;
      if (on(king)) score += (cover < b.need ? 70 : 20) * alarm;
      for (const [dr, dc] of ALL8) {
        const s = { r: king.r + dr, c: king.c + dc };
        if (inBoard(b, s.r, s.c) && !solidAt(b, s.r, s.c) && on(s)) score += 8 * alarm;
      }
      score -= Math.max(0, cheb(m, king) - 2) * 12;
    } else if (king && on(king)) {
      const want = cover === 0 ? 30 : 8;
      score += checked ? want * 2 : want;
    }

    if (reach.has(key(m.r, m.c))) {
      score -= Math.max(0, k.value * 14 - d[m.r][m.c] * 16);
    } else if (cheb(m, w) === 2) {
      // Walkable into a hold next turn, from a square nothing guards?
      for (const [dr, dc] of ALL8) {
        const s = { r: m.r + dr, c: m.c + dc };
        if (cheb(s, w) !== 1 || !inBoard(b, s.r, s.c) || solidAt(b, s.r, s.c)) continue;
        if (pieceAt(b, s.r, s.c) || d[s.r][s.c] > 0 || on(s)) continue;
        score -= k.value * 5;
        break;
      }
    }

    if (checked) {
      p.r = m.r;
      p.c = m.c;
      b.pieces.push(p);
      if (!inCheck(run)) score += 60;
      b.pieces.pop();
      p.r = home.r;
      p.c = home.c;
    }

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  b.pieces.splice(i, 0, p);
  return same(best, home) ? null : best;
}
