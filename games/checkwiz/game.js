/**
 * Checkwiz — a wizard alone on a board full of the enemy's chess pieces.
 *
 * Not chess. There is one of you, you have no army, and nobody is trying to
 * mate you. What is borrowed is the part of chess that is actually interesting
 * on a phone: *geometry*. Every piece projects the threat it would project in
 * a real game — a rook owns its rank and file, a knight attacks only the eight
 * squares it can never stand next to — and the game is reading those lines and
 * walking between them.
 *
 * Three rules carry everything:
 *
 *   1. A piece either strikes or moves, never both. The red squares you can
 *      see are exactly the damage you will take; nothing ever hits you from a
 *      square you weren't shown.
 *   2. You cannot capture a defended piece. To take a guard you must first
 *      take whatever defends it — capture order *is* the puzzle, and it is the
 *      same skill as counting an exchange in a real game.
 *   3. Every piece is safe to stand beside *somewhere*, and where depends on
 *      what it is: behind a pawn, anywhere touching a knight, straight on at a
 *      bishop, diagonal from a rook. A queen has no safe side at all, which
 *      makes her a spell problem rather than a walking problem.
 *
 * A chamber ends when the Sovereign falls, and he starts every chamber
 * defended — so the shape of a level is always "dismantle the guard, then take
 * the king". Pawns march while you work and promote to queens if you dawdle,
 * which is the clock.
 *
 * Threat model: all threat is computed as if the wizard were not on the board.
 * He never blocks a line — not for danger, not for defence. One rule, no edge
 * cases about whether standing somewhere shields the thing behind you, and it
 * leaves interposition to Bulwark, which is a spell you pay for.
 *
 * Everything is canvas, menus included — this is a UI-heavy game and one
 * drawing path beats a canvas board wired to DOM chrome. The board floats up
 * top where it can be seen, and everything tapped every turn sits in the
 * bottom third under a thumb.
 */

import { createLoop, createInput, vibrate, clamp, rand, randInt } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Chess glyphs come from a different font on every platform; keep a deep
// fallback chain so none of them ever render as tofu.
const GLYPH = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", serif';

const FG = "#e8ecf4";
const DIM = "#8d98ad";
const CARD = "#1c2331";
const RAISED = "#232b3c";
const ACCENT = "#4ade80"; // the wizard
const MANA = "#60a5fa";
const DANGER = "#f87171";
const GOLD = "#fbbf24";
const ROYAL = "#c084fc"; // the Sovereign

// --- Board vocabulary -------------------------------------------------------

const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ALL8 = [...ORTH, ...DIAG];
const KNIGHT_STEPS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
// The court marches down the board, so its pawns attack downward.
const PAWN_ATTACK = [
  [1, -1],
  [1, 1],
];

/**
 * The court. `dirs` slides until something blocks; `steps` attacks a fixed set
 * of offsets. `mana` is what capturing it pays. `tip` is the one thing worth
 * knowing about approaching it — shown in the codex and when inspecting.
 */
const KINDS = {
  pawn: {
    name: "Pawn",
    glyph: "♟",
    mana: 1,
    steps: PAWN_ATTACK,
    move: "pawn",
    tip: "Attacks the two squares diagonally ahead — never the one in front. Walk up behind it.",
  },
  knight: {
    name: "Knight",
    glyph: "♞",
    mana: 2,
    steps: KNIGHT_STEPS,
    move: "knight",
    tip: "Attacks in an L, so the eight squares touching it are the safest place on the board.",
  },
  bishop: {
    name: "Bishop",
    glyph: "♝",
    mana: 2,
    dirs: DIAG,
    move: "slide",
    tip: "Rakes both diagonals until a body blocks the line. Come at it straight on.",
  },
  rook: {
    name: "Rook",
    glyph: "♜",
    mana: 3,
    dirs: ORTH,
    move: "slide",
    tip: "Owns its whole rank and file. Come at it on the diagonal.",
  },
  queen: {
    name: "Queen",
    glyph: "♛",
    mana: 4,
    dirs: ALL8,
    move: "slide",
    tip: "Every line at once. No square beside her is safe — beam her down, or dispel her first.",
  },
  king: {
    name: "Sovereign",
    glyph: "♚",
    mana: 0,
    steps: ALL8,
    move: "still",
    tip: "Untouchable while a guard defends his square. Alone, his ward fails and he strikes no one.",
  },
};

/** Sliders cross at most this many squares a turn — they threaten far, travel slow. */
const SLIDE_RANGE = 2;
const MANA_CAP = 10;

/**
 * The spellbook. Each spell answers a specific dead end the three rules
 * create: no way in (Leap), a line you cannot cross (Bulwark), a defended
 * piece (Beam), a queen (Dispel), being surrounded (Zugzwang). They unlock by
 * depth, so the first chamber is only ever about walking.
 */
const SPELLS = [
  {
    id: "leap",
    name: "Leap",
    glyph: "♞",
    cost: 2,
    from: 1,
    target: "knight",
    blurb: "Jump an L-move away, straight through anything in between.",
  },
  {
    id: "bulwark",
    name: "Bulwark",
    glyph: "▩",
    cost: 2,
    from: 1,
    target: "near",
    blurb:
      "Raise a stone. It blocks movement and cuts lines — including the one defending a piece.",
  },
  {
    id: "beam",
    name: "Beam",
    glyph: "♝",
    cost: 3,
    from: 2,
    target: "diagonal",
    blurb: "Fire down a diagonal. Destroys the first piece it reaches, defended or not.",
  },
  {
    id: "dispel",
    name: "Dispel",
    glyph: "✦",
    cost: 4,
    from: 4,
    target: "piece",
    blurb:
      "Snuff a piece out for two turns: no threat, no movement — and it can be taken even while defended.",
  },
  {
    id: "zugzwang",
    name: "Zugzwang",
    glyph: "⧗",
    cost: 6,
    from: 6,
    target: "self",
    blurb: "The whole court loses its next turn.",
  },
];

const spellById = (id) => SPELLS.find((s) => s.id === id);

/** What a spell costs right now, after upgrades. */
function spellCost(spell) {
  const discount = spell.id === "leap" ? (run.up.alacrity ?? 0) : 0;
  return Math.max(1, spell.cost - discount);
}

/**
 * Between chambers you take one of three. Most are counters in `run.up` read
 * where they matter; a couple resolve on the spot.
 */
const UPGRADES = [
  {
    id: "ward",
    name: "Ward",
    glyph: "✚",
    blurb: "+1 max life, healed now.",
    apply() {
      run.maxHp++;
      run.hp++;
    },
  },
  {
    id: "mend",
    name: "Mend",
    glyph: "❤",
    blurb: "Heal 2 life.",
    when: () => run.hp < run.maxHp,
    apply() {
      run.hp = Math.min(run.maxHp, run.hp + 2);
    },
  },
  {
    id: "leyline",
    name: "Leyline",
    glyph: "◈",
    blurb: "Every capture pays +1 mana.",
    apply() {
      run.up.leyline = (run.up.leyline ?? 0) + 1;
    },
  },
  {
    id: "vigil",
    name: "Vigil",
    glyph: "◉",
    blurb: "Begin each chamber with +2 mana.",
    apply() {
      run.up.vigil = (run.up.vigil ?? 0) + 1;
      run.mana = clamp(run.mana + 2, 0, MANA_CAP);
    },
  },
  {
    id: "alacrity",
    name: "Alacrity",
    glyph: "♞",
    blurb: "Leap costs 1 less.",
    when: () => (run.up.alacrity ?? 0) < 1,
    apply() {
      run.up.alacrity = 1;
    },
  },
  {
    id: "masonry",
    name: "Masonry",
    glyph: "▩",
    blurb: "Bulwarks stand 3 turns longer.",
    apply() {
      run.up.masonry = (run.up.masonry ?? 0) + 1;
    },
  },
  {
    id: "riposte",
    name: "Riposte",
    glyph: "⚔",
    blurb: "A piece that strikes you is stunned for a turn.",
    when: () => (run.up.riposte ?? 0) < 1,
    apply() {
      run.up.riposte = 1;
    },
  },
  {
    id: "harvest",
    name: "Harvest",
    glyph: "✧",
    blurb: "Taking a rook or a queen heals 1 life.",
    when: () => (run.up.harvest ?? 0) < 1,
    apply() {
      run.up.harvest = 1;
    },
  },
];

// --- Shell and persistence --------------------------------------------------

const shell = createShell({ title: "Checkwiz", stats: ["Chamber", "Best"] });
const { stage } = shell;
const ctx = stage.ctx;
const store = createStore("checkwiz");

const SAVE_V = 1;

const freshRun = () => ({
  v: SAVE_V,
  chamber: 1,
  hp: 4,
  maxHp: 4,
  mana: 3,
  captures: 0,
  up: {},
  board: null,
});

let run = freshRun();
let scene = "title"; // title | play | draft | codex | over
let codexFrom = "title"; // where the codex's Back button goes
let savedRun = null; // the run on disk, read once at boot rather than every frame

function loadRun() {
  const saved = store.get("run", null);
  // A save from an older shape is not worth migrating for a game this size.
  if (!saved || saved.v !== SAVE_V || !saved.board) return null;
  return saved;
}

function persist() {
  run.board = board;
  store.set("run", run);
}

const best = () => store.get("best", 0);

function syncHud() {
  shell.setStat("Chamber", run.chamber);
  shell.setStat("Best", best());
}

const unlocked = (spell) => run.chamber >= spell.from;
const spellbook = () => SPELLS.filter(unlocked);

// --- Live state -------------------------------------------------------------

let board = null; // { size, pieces, walls, wizard, turn, royal, cleared }
let threat = null; // { danger, byPiece } — recomputed whenever a body moves
let sel = null; // a board action awaiting confirmation
let inspect = null; // piece whose lines are on show
let aiming = null; // spell being targeted
let draft = []; // the three upgrades on offer
let codexPage = 0;

let floaters = [];
let sparks = [];
let beams = [];
let wizAnim = null; // the wizard's drawn position, chasing his real square
let shake = 0;
let banner = null;
let elapsed = 0;
let hits = []; // tappable rects, rebuilt every frame while drawing

const inBoard = (r, c) => r >= 0 && c >= 0 && r < board.size && c < board.size;
const pieceAt = (r, c) => board.pieces.find((p) => p.r === r && p.c === c) ?? null;
const wallAt = (r, c) => board.walls.find((w) => w.r === r && w.c === c) ?? null;
const same = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

/** What stops a ray. Never the wizard — see the threat-model note up top. */
function blocks(r, c, ignore) {
  const p = pieceAt(r, c);
  if (p && p !== ignore) return true;
  return !!wallAt(r, c);
}

/**
 * Every square a piece of `kind` at (r,c) would attack. `ignore` lets the AI
 * ask "what would I hit from over there" without its own body — still sitting
 * on its old square — blocking the answer.
 */
function raysFrom(kind, r, c, ignore = null) {
  const k = KINDS[kind];
  const out = [];
  if (k.dirs) {
    for (const [dr, dc] of k.dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inBoard(rr, cc)) {
        out.push({ r: rr, c: cc });
        if (blocks(rr, cc, ignore)) break;
        rr += dr;
        cc += dc;
      }
    }
  } else {
    for (const [dr, dc] of k.steps) {
      const rr = r + dr;
      const cc = c + dc;
      if (inBoard(rr, cc)) out.push({ r: rr, c: cc });
    }
  }
  return out;
}

/**
 * A Sovereign alone on the board projects nothing. Without this a chamber can
 * strand you: his aura covers every square you would have to stand on to reach
 * him, so the last capture always costs a life — and at one life with no mana
 * left there is no move that wins. It reads as well as it plays. The king is
 * only dangerous because of the court around him.
 */
const warded = (p) => p.kind === "king" && board.pieces.length === 1;

const attacksOf = (p) => (p.stun > 0 || warded(p) ? [] : raysFrom(p.kind, p.r, p.c, p));

/** Recompute the threat map. Called after anything that moves a body. */
function refresh() {
  const danger = Array.from({ length: board.size }, () => new Array(board.size).fill(0));
  const byPiece = new Map();
  for (const p of board.pieces) {
    const squares = attacksOf(p);
    byPiece.set(p.id, squares);
    for (const s of squares) danger[s.r][s.c]++;
  }
  threat = { danger, byPiece };
}

const dangerAt = (r, c) => (inBoard(r, c) ? threat.danger[r][c] : 0);
const attacksBy = (p) => threat.byPiece.get(p.id) ?? attacksOf(p);

/** Who is holding a piece up. Empty means you can take it. */
function defendersOf(piece) {
  const out = [];
  for (const p of board.pieces) {
    if (p === piece || p.stun > 0) continue;
    if (attacksBy(p).some((s) => same(s, piece))) out.push(p);
  }
  return out;
}

// --- Chamber generation -----------------------------------------------------

const CHAMBER_NAMES = [
  "the Pawn Gate",
  "the Knight's Stair",
  "the Bishop's Nave",
  "the Long Rank",
  "the Broken File",
  "the Mirror Hall",
  "the Rook's Vault",
  "the Queen's Garden",
  "the Endgame",
];

const chamberName = (n) => CHAMBER_NAMES[(n - 1) % CHAMBER_NAMES.length];
const boardSize = (n) => (n <= 2 ? 6 : n <= 6 ? 7 : 8);

/** What the court can field, and how deep you must be before it shows up. */
const GUARD_POOL = [
  { kind: "pawn", cost: 1, from: 1 },
  { kind: "knight", cost: 3, from: 2 },
  { kind: "bishop", cost: 3, from: 3 },
  { kind: "rook", cost: 5, from: 5 },
  { kind: "queen", cost: 8, from: 7 },
];

/**
 * Build a chamber. Generation is rejection-sampled rather than clever: lay the
 * court out, then insist on a defended Sovereign and a safe square to start
 * from. Anything failing those is thrown away and rerolled, which is cheap on
 * a board this small and much harder to get subtly wrong than a constructive
 * placement algorithm.
 */
function genChamber(n) {
  const size = boardSize(n);
  const royal = n % 5 === 0; // the Grandmaster walks
  const maxPieces = size + 1;

  for (let attempt = 0; attempt < 80; attempt++) {
    let nextId = 1;
    const pieces = [];
    const add = (kind, r, c) => pieces.push({ id: nextId++, kind, r, c, stun: 0, ax: c, ay: r });
    const free = (r, c) =>
      r >= 0 && c >= 0 && r < size && c < size && !pieces.some((p) => p.r === r && p.c === c);

    // The Sovereign sits high, with room above him for a shield.
    const kr = randInt(1, 2);
    const kc = randInt(0, size - 1);
    add("king", kr, kc);

    // Pawns diagonally above him defend his square — the classic shield, and
    // the reason no chamber is won by walking straight at the throne.
    const wanted = n >= 6 ? 2 : 1;
    const shields = [
      [kr - 1, kc - 1],
      [kr - 1, kc + 1],
    ].filter(([r, c]) => free(r, c));
    if (shields.length < wanted) continue;
    for (let i = 0; i < wanted; i++) add("pawn", shields[i][0], shields[i][1]);

    // Spend the rest of the budget on whatever the depth allows.
    let budget = Math.round(n * 1.8);
    const available = GUARD_POOL.filter((g) => n >= g.from);
    for (let tries = 0; tries < 60 && budget > 0 && pieces.length < maxPieces; tries++) {
      const affordable = available.filter((g) => g.cost <= budget);
      if (!affordable.length) break;
      const pick = affordable[randInt(0, affordable.length - 1)];
      // Guards fill the top; the bottom two rows are the wizard's to arrive in.
      // Pawns keep to the top half so promotion is always several turns away.
      const deepest = pick.kind === "pawn" ? Math.floor(size / 2) - 1 : size - 3;
      const r = randInt(0, deepest);
      const c = randInt(0, size - 1);
      if (!free(r, c)) continue;
      add(pick.kind, r, c);
      budget -= pick.cost;
    }

    const candidate = { size, pieces, walls: [], wizard: { r: size - 1, c: 0 }, turn: 1, royal };
    const start = findStart(candidate);
    if (!start) continue;
    candidate.wizard = start;
    return candidate;
  }

  // Fall back to something trivially safe rather than looping forever.
  return {
    size,
    pieces: [
      { id: 1, kind: "king", r: 1, c: 2, stun: 0, ax: 2, ay: 1 },
      { id: 2, kind: "pawn", r: 0, c: 1, stun: 0, ax: 1, ay: 0 },
    ],
    walls: [],
    wizard: { r: size - 1, c: size - 1 },
    turn: 1,
    royal,
  };
}

/**
 * Pick a starting square on a freshly built board: unthreatened, with room to
 * move, as far from the court as the bottom rows allow. Returns null when the
 * layout left the wizard nowhere to stand, which rejects the whole chamber.
 */
function findStart(candidate) {
  const previous = board;
  board = candidate;
  refresh();

  const king = candidate.pieces.find((p) => p.kind === "king");
  let bestSquare = null;
  let bestScore = -Infinity;

  for (let r = candidate.size - 1; r >= candidate.size - 2; r--) {
    for (let c = 0; c < candidate.size; c++) {
      if (dangerAt(r, c) > 0 || pieceAt(r, c)) continue;
      let escapes = 0;
      for (const [dr, dc] of ALL8) {
        const rr = r + dr;
        const cc = c + dc;
        if (inBoard(rr, cc) && !pieceAt(rr, cc) && dangerAt(rr, cc) === 0) escapes++;
      }
      if (escapes < 2) continue;
      const score = escapes * 2 + cheb({ r, c }, king);
      if (score > bestScore) {
        bestScore = score;
        bestSquare = { r, c };
      }
    }
  }

  board = previous;
  if (board) refresh();
  return bestSquare;
}

// --- Effects ----------------------------------------------------------------

function say(text, color, at = null) {
  const p = at ?? board.wizard;
  floaters.push({ text, color, r: p.r, c: p.c, life: 1.2, max: 1.2 });
}

function burst(r, c, color, count = 12, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(0.6, 2.6) * power;
    sparks.push({
      r,
      c,
      vr: Math.sin(a) * v,
      vc: Math.cos(a) * v,
      life: rand(0.35, 0.8),
      max: 0.8,
      color,
      size: rand(1.5, 3.5),
    });
  }
}

const announce = (text, color = FG) => (banner = { text, color, life: 2.4, max: 2.4 });

// --- Reading a square -------------------------------------------------------

/**
 * What tapping (r,c) would do. Everything the action bar says about a move —
 * the damage number, the glyphs of the pieces defending your target — comes
 * from here, so what you are told is exactly what resolves.
 */
function readSquare(r, c) {
  if (!inBoard(r, c)) return null;
  const w = board.wizard;
  const piece = pieceAt(r, c);
  const adjacent = cheb(w, { r, c }) === 1;

  if (!adjacent) return piece ? { kind: "inspect", r, c, piece } : null;
  if (wallAt(r, c)) return { kind: "blocked", r, c, reason: "Your own stone is in the way." };

  if (piece) {
    const guards = piece.stun > 0 ? [] : defendersOf(piece);
    if (guards.length) {
      return {
        kind: "blocked",
        r,
        c,
        piece,
        guards,
        reason: `Defended by ${guards.map((g) => KINDS[g.kind].glyph).join(" ")}`,
      };
    }
    return {
      kind: "capture",
      r,
      c,
      piece,
      // You end up standing where it stood, and taking it cannot open a line
      // onto that square: any slider whose ray reached this square would be
      // attacking it, which is exactly what "defended" means — and a defended
      // piece never gets this far. So the square's current danger is honest.
      damage: dangerAt(r, c),
      label: `Take ${KINDS[piece.kind].name}`,
    };
  }

  return { kind: "move", r, c, damage: dangerAt(r, c), label: "Step here" };
}

// --- Player actions ---------------------------------------------------------

function stepTo(r, c) {
  board.wizard = { r, c };
  vibrate(8);
}

function capture(piece, { bySpell = false } = {}) {
  const kind = KINDS[piece.kind];
  board.pieces = board.pieces.filter((p) => p !== piece);
  const royalKill = piece.kind === "king";
  burst(piece.r, piece.c, royalKill ? ROYAL : GOLD, royalKill ? 34 : 14, royalKill ? 1.6 : 1.2);
  shake = Math.max(shake, royalKill ? 11 : 5);
  vibrate(royalKill ? 40 : 16);

  if (royalKill) {
    refresh();
    clearChamber();
    return;
  }

  run.captures++;
  const gain = kind.mana + (run.up.leyline ?? 0);
  run.mana = clamp(run.mana + gain, 0, MANA_CAP);
  say(`+${gain} mana`, MANA, piece);

  if (run.up.harvest && (piece.kind === "rook" || piece.kind === "queen") && run.hp < run.maxHp) {
    run.hp++;
    say("+1 life", ACCENT);
  }
  if (!bySpell) stepTo(piece.r, piece.c);
  refresh();

  if (board.pieces.length === 1) announce("The last guard falls — his ward fails", ROYAL);
}

/** Commit whatever a pending selection describes, then hand over the turn. */
function commit(action) {
  sel = null;
  inspect = null;
  if (action.kind === "move") {
    stepTo(action.r, action.c);
    refresh();
    enemyTurn();
  } else if (action.kind === "capture") {
    capture(action.piece);
    if (!board.cleared) enemyTurn();
  }
}

function hold() {
  sel = null;
  inspect = null;
  say("hold", DIM);
  enemyTurn();
}

// --- Spells -----------------------------------------------------------------

/** Where a spell may be aimed, as {r, c, piece?} — also what gets highlighted. */
function spellTargets(id) {
  const w = board.wizard;
  const { target } = spellById(id);
  const out = [];

  if (target === "knight") {
    for (const [dr, dc] of KNIGHT_STEPS) {
      const r = w.r + dr;
      const c = w.c + dc;
      if (inBoard(r, c) && !pieceAt(r, c) && !wallAt(r, c)) out.push({ r, c });
    }
  } else if (target === "near") {
    for (let r = w.r - 2; r <= w.r + 2; r++) {
      for (let c = w.c - 2; c <= w.c + 2; c++) {
        if (!inBoard(r, c) || (r === w.r && c === w.c)) continue;
        if (pieceAt(r, c) || wallAt(r, c)) continue;
        out.push({ r, c });
      }
    }
  } else if (target === "diagonal") {
    for (const [dr, dc] of DIAG) {
      let r = w.r + dr;
      let c = w.c + dc;
      while (inBoard(r, c)) {
        if (wallAt(r, c)) break;
        const p = pieceAt(r, c);
        if (p) {
          out.push({ r, c, piece: p });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  } else if (target === "piece") {
    for (const p of board.pieces) if (p.stun <= 0) out.push({ r: p.r, c: p.c, piece: p });
  }

  return out;
}

function castSpell(id, target) {
  const spell = spellById(id);
  const cost = spellCost(spell);
  if (run.mana < cost) return;

  run.mana -= cost;
  aiming = null;
  sel = null;
  inspect = null;

  if (id === "leap") {
    burst(board.wizard.r, board.wizard.c, ACCENT, 12);
    stepTo(target.r, target.c);
    burst(target.r, target.c, ACCENT, 12);
  } else if (id === "bulwark") {
    board.walls.push({ r: target.r, c: target.c, life: 4 + 3 * (run.up.masonry ?? 0) });
    burst(target.r, target.c, "#94a3b8", 10);
  } else if (id === "beam") {
    const w = board.wizard;
    beams.push({
      r1: w.r,
      c1: w.c,
      r2: target.r,
      c2: target.c,
      life: 0.45,
      max: 0.45,
      color: "#a78bfa",
    });
    // A beam does not care what defends its target. That is the whole point.
    capture(target.piece, { bySpell: true });
    if (board.cleared) return;
  } else if (id === "dispel") {
    target.piece.stun = 2;
    burst(target.r, target.c, MANA, 14);
    say("dispelled", MANA, target);
  } else if (id === "zugzwang") {
    for (const p of board.pieces) p.stun = Math.max(p.stun, 1);
    announce("Zugzwang — the court freezes", MANA);
    burst(board.wizard.r, board.wizard.c, MANA, 22, 1.6);
  }

  vibrate(14);
  refresh();

  if (id === "zugzwang") {
    // It already spends the court's turn; handing them one now would waste it.
    board.turn++;
    decayWalls();
    refresh();
    persist();
  } else {
    enemyTurn();
  }
}

// --- The court's turn -------------------------------------------------------

/**
 * Where a piece could go. Sliders cross at most SLIDE_RANGE squares; nobody
 * walks onto the wizard, because pieces strike from where they stand.
 */
function moveCandidates(p) {
  const out = [];
  const k = KINDS[p.kind];
  const open = (r, c) =>
    inBoard(r, c) && !pieceAt(r, c) && !wallAt(r, c) && !same(board.wizard, { r, c });

  if (k.move === "still") {
    if (!board.royal) return out;
    for (const [dr, dc] of ALL8) {
      if (open(p.r + dr, p.c + dc)) out.push({ r: p.r + dr, c: p.c + dc });
    }
  } else if (k.move === "pawn") {
    // Pawns march at half speed, staggered by id so the rank never advances as
    // one wall. Promotion is meant to be a slow clock you can hear ticking —
    // at full speed on a six-square board it is an alarm going off.
    if ((board.turn + p.id) % 2 === 0 && open(p.r + 1, p.c)) out.push({ r: p.r + 1, c: p.c });
  } else if (k.move === "knight") {
    for (const [dr, dc] of KNIGHT_STEPS) {
      if (open(p.r + dr, p.c + dc)) out.push({ r: p.r + dr, c: p.c + dc });
    }
  } else {
    for (const [dr, dc] of k.dirs) {
      for (let step = 1; step <= SLIDE_RANGE; step++) {
        const r = p.r + dr * step;
        const c = p.c + dc * step;
        if (!open(r, c)) break;
        out.push({ r, c });
      }
    }
  }
  return out;
}

/**
 * Court AI. It wants to line up on the wizard — a piece that could attack his
 * square from a candidate square takes it, because next turn it fires from
 * there. That is the game's rhythm: you watch a rook swing onto your file, and
 * you have exactly one turn to be somewhere else.
 */
function pickMove(p) {
  const w = board.wizard;
  const options = moveCandidates(p);
  if (!options.length) return null;

  let choice = null;
  let bestScore = -Infinity;
  for (const m of options) {
    const aims = raysFrom(p.kind, m.r, m.c, p).some((s) => same(s, w));
    const travel = Math.max(Math.abs(m.r - p.r), Math.abs(m.c - p.c));
    const score = (aims ? 100 : 0) - cheb(m, w) * 6 - travel + rand(0, 1.5);
    if (score > bestScore) {
      bestScore = score;
      choice = m;
    }
  }

  // Shuffling out of a square you already cover is worse than holding it.
  const holds = raysFrom(p.kind, p.r, p.c, p).some((s) => same(s, w));
  if (holds && bestScore < 100) return null;
  return choice;
}

function strikeWizard(p) {
  beams.push({
    r1: p.r,
    c1: p.c,
    r2: board.wizard.r,
    c2: board.wizard.c,
    life: 0.4,
    max: 0.4,
    color: DANGER,
    hop: p.kind === "knight",
  });
  run.hp--;
  shake = Math.max(shake, 9);
  vibrate(30);
  say("−1", DANGER);
  burst(board.wizard.r, board.wizard.c, DANGER, 10);
  if (run.up.riposte) p.stun = Math.max(p.stun, 1);
}

function decayWalls() {
  for (const wall of board.walls) wall.life--;
  board.walls = board.walls.filter((wall) => wall.life > 0);
}

function enemyTurn() {
  board.turn++;

  // Who fires is decided from the map the player was just looking at. A piece
  // that moves this turn never also strikes, so the red squares were the truth.
  const firing = board.pieces.filter(
    (p) => p.stun <= 0 && attacksBy(p).some((s) => same(s, board.wizard)),
  );

  for (const p of board.pieces) {
    if (p.stun > 0) {
      p.stun--;
      continue;
    }
    if (firing.includes(p)) continue;

    const move = pickMove(p);
    if (move) {
      p.r = move.r;
      p.c = move.c;
    }
    // A pawn reaching the far rank comes back as a queen. This is the clock.
    if (p.kind === "pawn" && p.r === board.size - 1) {
      p.kind = "queen";
      burst(p.r, p.c, ROYAL, 18, 1.3);
      announce("A pawn promotes!", ROYAL);
      vibrate(30);
    }
  }

  decayWalls();
  refresh();

  for (const p of firing) strikeWizard(p);

  if (run.hp <= 0) {
    gameOver();
    return;
  }
  persist();
}

// --- Run flow ---------------------------------------------------------------

function startChamber() {
  board = genChamber(run.chamber);
  run.mana = clamp(run.mana + 2 * (run.up.vigil ?? 0), 0, MANA_CAP);
  sel = null;
  inspect = null;
  aiming = null;
  // Effects are addressed in board coordinates, so they cannot outlive a board.
  beams = [];
  sparks = [];
  floaters = [];
  wizAnim = null;
  refresh();
  scene = "play";
  syncHud();
  announce(`Chamber ${run.chamber} — ${chamberName(run.chamber)}`, board.royal ? ROYAL : FG);

  const queue = [];
  if (board.royal) queue.push(["The Grandmaster walks.", ROYAL]);
  const fresh = SPELLS.find((s) => s.from === run.chamber);
  if (fresh && run.chamber > 1) queue.push([`${fresh.name} unlocked`, MANA]);
  queue.forEach(([text, color], i) => setTimeout(() => announce(text, color), 1500 * (i + 1)));

  persist();
}

function clearChamber() {
  board.cleared = true;
  const record = store.setBest("best", run.chamber);
  announce(record ? "The Sovereign falls — deepest yet" : "The Sovereign falls", ROYAL);
  run.chamber++;
  syncHud();
  // Let the death burst land before the board is swapped out from under it.
  setTimeout(() => {
    draft = rollDraft();
    scene = "draft";
    persist();
  }, 1100);
}

function rollDraft() {
  const pool = UPGRADES.filter((u) => !u.when || u.when());
  const picks = [];
  while (picks.length < 3 && pool.length)
    picks.push(...pool.splice(randInt(0, pool.length - 1), 1));
  return picks;
}

function gameOver() {
  scene = "over";
  const reached = run.chamber;
  const cleared = reached - 1;
  store.clear("run");
  savedRun = null;
  syncHud();
  shell.overlay.show({
    heading: "The court closes in",
    // The score is what you got through, not the chamber you died in.
    score: cleared,
    body:
      `Cut down in chamber ${reached}, ${chamberName(reached)}, with ` +
      `${run.captures} ${run.captures === 1 ? "piece" : "pieces"} taken. ` +
      `Chambers cleared: ${cleared}. Deepest run: ${best()}.`,
    button: "New run",
    onButton: newRun,
  });
}

function newRun() {
  shell.overlay.hide();
  savedRun = null;
  run = freshRun();
  startChamber();
}

function resumeRun(saved) {
  run = saved;
  board = run.board;
  // A save holds plain data; give the pieces their animation state back.
  for (const p of board.pieces) {
    p.ax = p.c;
    p.ay = p.r;
  }
  refresh();
  scene = "play";
  syncHud();
  shell.overlay.hide();
  announce(`Chamber ${run.chamber} — ${chamberName(run.chamber)}`);
}

// --- Layout -----------------------------------------------------------------

/**
 * Everything is measured off the stage every frame, so a rotation or the iOS
 * URL bar collapsing just re-lays-out. Nothing about the game state is stored
 * in pixels: the board is rows and columns, and only the draw step knows where
 * that lands on glass.
 */
function layout() {
  const W = stage.width;
  const H = stage.height;
  const pad = 10;
  const topH = 44;
  // The action row plus the spell row, kept in the bottom third under a thumb.
  const barH = Math.min(158, Math.max(132, H * 0.24));
  const barY = H - barH;
  const avail = barY - topH - pad;
  const size = board ? board.size : 8;
  const cell = Math.floor(Math.min((W - pad * 2) / size, avail / size));
  const span = cell * size;
  return {
    W,
    H,
    pad,
    topH,
    barY,
    barH,
    cell,
    span,
    bx: Math.round((W - span) / 2),
    by: Math.round(topH + (avail - span) / 2),
  };
}

const cellX = (L, c) => L.bx + c * L.cell;
const cellY = (L, r) => L.by + r * L.cell;
const midX = (L, c) => L.bx + (c + 0.5) * L.cell;
const midY = (L, r) => L.by + (r + 0.5) * L.cell;

// --- Drawing helpers --------------------------------------------------------

function text(str, x, y, opts = {}) {
  const {
    size = 14,
    color = FG,
    align = "center",
    baseline = "middle",
    weight = 400,
    font = FONT,
    alpha = 1,
  } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function panel(x, y, w, h, { fill = CARD, stroke = "rgba(255,255,255,0.07)", radius = 14 } = {}) {
  roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Wrap `str` to `width`, returning the lines. */
function wrap(str, width, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const words = str.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Nothing tappable is ever shorter than a thumb; disabled buttons don't register. */
function button(x, y, w, h, label, { sub, tone = "accent", disabled = false, action, glyph } = {}) {
  const bg = disabled
    ? "#171d29"
    : tone === "accent"
      ? ACCENT
      : tone === "danger"
        ? DANGER
        : tone === "mana"
          ? MANA
          : RAISED;
  const fg = disabled ? "#4b5566" : tone === "plain" ? FG : "#06210f";

  roundRect(x, y, w, h, 13);
  ctx.fillStyle = bg;
  ctx.fill();
  if (tone === "plain" && !disabled) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const cx = x + w / 2;
  if (glyph) {
    text(glyph, cx, y + h / 2 - 12, { size: 22, font: GLYPH, color: fg });
    text(label, cx, y + h / 2 + 14, { size: 11, weight: 600, color: fg });
  } else {
    text(label, cx, y + h / 2 + (sub ? -8 : 0), { size: 16, weight: 600, color: fg });
    if (sub) text(sub, cx, y + h / 2 + 12, { size: 11, color: fg, alpha: 0.8 });
  }

  if (!disabled && action) hits.push({ x, y, w, h, action });
}

// --- Board -----------------------------------------------------------------

/** A faint drift of chess glyphs behind everything, so the board isn't floating in a void. */
const MOTES = Array.from({ length: 14 }, () => ({
  x: Math.random(),
  y: Math.random(),
  glyph: "♜♞♝♛♚♟"[randInt(0, 5)],
  size: rand(26, 70),
  speed: rand(0.004, 0.016),
}));

function drawBackdrop(L) {
  const grad = ctx.createRadialGradient(L.W / 2, L.H * 0.34, 20, L.W / 2, L.H * 0.34, L.H * 0.8);
  grad.addColorStop(0, "#161d2b");
  grad.addColorStop(1, "#0c0f16");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, L.W, L.H);

  for (const m of MOTES) {
    const y = ((m.y - elapsed * m.speed) % 1.2) * L.H;
    text(m.glyph, m.x * L.W, y, { size: m.size, font: GLYPH, color: "#ffffff", alpha: 0.022 });
  }
}

function drawSquares(L) {
  panel(L.bx - 6, L.by - 6, L.span + 12, L.span + 12, {
    fill: "#141a26",
    stroke: "rgba(255,255,255,0.06)",
    radius: 16,
  });

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4);

  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const x = cellX(L, c);
      const y = cellY(L, r);
      ctx.fillStyle = (r + c) % 2 === 0 ? "#1b2231" : "#151a26";
      ctx.fillRect(x, y, L.cell, L.cell);

      const d = dangerAt(r, c);
      if (d > 0) {
        // Light and dark squares take the same wash differently, so lift the
        // light ones — a threatened square has to read as threatened on both.
        const lift = (r + c) % 2 === 0 ? 0.04 : 0;
        ctx.fillStyle = `rgba(248,113,113,${0.15 + lift + Math.min(d, 3) * 0.08 + pulse * 0.04})`;
        ctx.fillRect(x, y, L.cell, L.cell);
        // A tick per attacker: two rooks on a square is a different
        // proposition from one, and the count is worth reading at a glance.
        for (let i = 0; i < Math.min(d, 3); i++) {
          ctx.fillStyle = "rgba(252,165,165,0.9)";
          ctx.fillRect(x + 4 + i * 6, y + 4, 4, 4);
        }
      }
    }
  }

  // Grid lines last, so they sit over the tints.
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < board.size; i++) {
    ctx.moveTo(L.bx + i * L.cell, L.by);
    ctx.lineTo(L.bx + i * L.cell, L.by + L.span);
    ctx.moveTo(L.bx, L.by + i * L.cell);
    ctx.lineTo(L.bx + L.span, L.by + i * L.cell);
  }
  ctx.stroke();
}

/** The squares you may step to right now — the quiet ones outlined, the costly ones not. */
function drawMoveHints(L) {
  if (aiming || sel) return;
  const w = board.wizard;
  for (const [dr, dc] of ALL8) {
    const r = w.r + dr;
    const c = w.c + dc;
    if (!inBoard(r, c) || pieceAt(r, c) || wallAt(r, c) || dangerAt(r, c) > 0) continue;
    ctx.strokeStyle = "rgba(74,222,128,0.28)";
    ctx.lineWidth = 2;
    roundRect(cellX(L, c) + 4, cellY(L, r) + 4, L.cell - 8, L.cell - 8, 8);
    ctx.stroke();
  }
}

/** The lines of the piece being inspected — this is the game's teaching tool. */
function drawInspection(L) {
  if (!inspect || !board.pieces.includes(inspect)) return;
  const squares = attacksBy(inspect);
  const pulse = 0.55 + 0.45 * Math.sin(elapsed * 4);

  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.25 + pulse * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of squares) {
    ctx.moveTo(midX(L, inspect.c), midY(L, inspect.r));
    ctx.lineTo(midX(L, s.c), midY(L, s.r));
  }
  ctx.stroke();

  for (const s of squares) {
    roundRect(cellX(L, s.c) + 3, cellY(L, s.r) + 3, L.cell - 6, L.cell - 6, 8);
    ctx.strokeStyle = `rgba(251,191,36,${0.4 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpellTargets(L) {
  if (!aiming) return;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5);
  for (const t of spellTargets(aiming)) {
    roundRect(cellX(L, t.c) + 3, cellY(L, t.r) + 3, L.cell - 6, L.cell - 6, 9);
    ctx.fillStyle = `rgba(96,165,250,${0.12 + pulse * 0.1})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(96,165,250,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function drawSelection(L) {
  if (!sel) return;
  const bad = sel.kind === "blocked";
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
  roundRect(cellX(L, sel.c) + 2, cellY(L, sel.r) + 2, L.cell - 4, L.cell - 4, 9);
  ctx.strokeStyle = bad ? DANGER : sel.damage > 0 ? GOLD : ACCENT;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Point at whatever is stopping you, rather than just refusing.
  if (bad && sel.guards) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(248,113,113,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const g of sel.guards) {
      ctx.moveTo(midX(L, g.c), midY(L, g.r));
      ctx.lineTo(midX(L, sel.c), midY(L, sel.r));
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawWalls(L) {
  for (const wall of board.walls) {
    const x = cellX(L, wall.c) + 4;
    const y = cellY(L, wall.r) + 4;
    const s = L.cell - 8;
    roundRect(x, y, s, s, 6);
    ctx.fillStyle = "#3d4759";
    ctx.fill();
    ctx.strokeStyle = "#5a6779";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    roundRect(x, y, s, s, 6);
    ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + s / 2);
    ctx.lineTo(x + s, y + s / 2);
    ctx.moveTo(x + s / 2, y);
    ctx.lineTo(x + s / 2, y + s / 2);
    ctx.moveTo(x + s * 0.25, y + s / 2);
    ctx.lineTo(x + s * 0.25, y + s);
    ctx.stroke();
    ctx.restore();
    text(String(wall.life), x + s - 7, y + s - 7, { size: 9, color: "#9aa6b8" });
  }
}

function drawPieces(L) {
  const w = board.wizard;
  for (const p of board.pieces) {
    const x = L.bx + (p.ax + 0.5) * L.cell;
    const y = L.by + (p.ay + 0.5) * L.cell;
    const royal = p.kind === "king";
    const stunned = p.stun > 0;
    const color = stunned ? "#5f6b80" : royal ? ROYAL : GOLD;

    // Ring language: slate = something defends it, green = you can take it now.
    const adjacent = cheb(w, p) === 1;
    const guarded = stunned ? [] : defendersOf(p);
    if (guarded.length || (adjacent && !guarded.length)) {
      const takeable = adjacent && !guarded.length;
      ctx.beginPath();
      ctx.arc(x, y, L.cell * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = takeable ? ACCENT : "rgba(148,163,184,0.5)";
      ctx.lineWidth = takeable ? 2.5 : 1.5;
      if (!takeable) ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = royal ? 18 : 10;
    text(KINDS[p.kind].glyph, x, y + 1, {
      size: L.cell * (royal ? 0.66 : 0.6),
      font: GLYPH,
      color,
      alpha: stunned ? 0.45 : 1,
    });
    ctx.restore();

    if (stunned) {
      text("✦", x + L.cell * 0.28, y - L.cell * 0.28, { size: 12, font: GLYPH, color: MANA });
    }
    if (royal) {
      // The aura goes quiet with his court: the board should show the moment
      // he stops being dangerous, not just the tooltip.
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2);
      ctx.beginPath();
      ctx.arc(x, y, L.cell * 0.46, 0, Math.PI * 2);
      ctx.strokeStyle = warded(p)
        ? "rgba(148,163,184,0.22)"
        : `rgba(192,132,252,${0.2 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawWizard(L) {
  const x = L.bx + (wizAnim.x + 0.5) * L.cell;
  const y = L.by + (wizAnim.y + 0.5) * L.cell;
  const s = L.cell / 44; // sprite is drawn at 44px and scaled to the square
  const bob = Math.sin(elapsed * 2.5) * 1.2;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, "rgba(74,222,128,0.30)");
  glow.addColorStop(1, "rgba(74,222,128,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-26, -26, 52, 52);

  // Robe.
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.quadraticCurveTo(11, -2, 13, 17);
  ctx.lineTo(-13, 17);
  ctx.quadraticCurveTo(-11, -2, 0, -13);
  ctx.closePath();
  ctx.fillStyle = "#1f6f45";
  ctx.fill();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hood and the dark under it.
  ctx.beginPath();
  ctx.arc(0, -13, 7.5, Math.PI, 0);
  ctx.lineTo(6, -7);
  ctx.quadraticCurveTo(0, -3, -6, -7);
  ctx.closePath();
  ctx.fillStyle = "#2a8a58";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -10.5, 4.6, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1a12";
  ctx.fill();

  // Two green eyes in the dark.
  ctx.fillStyle = "#9dffc4";
  ctx.fillRect(-2.6, -11.4, 1.7, 2.2);
  ctx.fillRect(1, -11.4, 1.7, 2.2);

  // Staff, with the orb pulsing on the mana you have.
  ctx.strokeStyle = "#8a6a45";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(11, 17);
  ctx.lineTo(9, -17);
  ctx.stroke();
  const orb = 2.6 + (run.mana / MANA_CAP) * 1.6 + Math.sin(elapsed * 4) * 0.35;
  ctx.beginPath();
  ctx.arc(9, -18, orb, 0, Math.PI * 2);
  ctx.fillStyle = MANA;
  ctx.shadowColor = MANA;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
}

// --- Effects ----------------------------------------------------------------

function drawEffects(L) {
  for (const b of beams) {
    const t = b.life / b.max;
    const x1 = midX(L, b.c1);
    const y1 = midY(L, b.r1);
    const x2 = midX(L, b.c2);
    const y2 = midY(L, b.r2);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2 + t * 4;
    ctx.beginPath();
    if (b.hop) {
      // A knight's strike arcs, because a knight's move is not a line.
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.28;
      const my = (y1 + y2) / 2 - (x2 - x1) * 0.28;
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
    } else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(midX(L, s.c), midY(L, s.r), s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const f of floaters) {
    const t = f.life / f.max;
    text(f.text, midX(L, f.c), midY(L, f.r) - (1 - t) * 26, {
      size: 15,
      weight: 700,
      color: f.color,
      alpha: Math.min(1, t * 1.6),
    });
  }
}

function drawBanner(L) {
  if (!banner) return;
  const t = banner.life / banner.max;
  const alpha = Math.min(1, t * 3);
  const y = L.by + L.span / 2;
  ctx.font = `700 18px ${FONT}`;
  const width = Math.min(L.W - 32, ctx.measureText(banner.text).width + 44);
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  panel(L.W / 2 - width / 2, y - 26, width, 52, {
    fill: "rgba(12,15,22,0.86)",
    stroke: "rgba(255,255,255,0.08)",
  });
  ctx.restore();
  text(banner.text, L.W / 2, y, { size: 18, weight: 700, color: banner.color, alpha });
}

// --- Top strip and action bar ----------------------------------------------

function drawTop(L) {
  const y = L.topH / 2;

  for (let i = 0; i < run.maxHp; i++) {
    const filled = i < run.hp;
    text("♥", 16 + i * 19, y, {
      size: 17,
      font: GLYPH,
      color: filled ? "#fb7185" : "#333c4d",
      alpha: filled ? 1 : 0.9,
    });
  }

  // Mana as pips, so "can I afford this" is a glance and not a subtraction.
  const pipR = 3.5;
  const gap = 10;
  const manaW = MANA_CAP * gap;
  const startX = L.W - 52 - manaW;
  for (let i = 0; i < MANA_CAP; i++) {
    const x = startX + i * gap + pipR;
    ctx.beginPath();
    ctx.arc(x, y, pipR, 0, Math.PI * 2);
    if (i < run.mana) {
      ctx.fillStyle = MANA;
      ctx.shadowColor = MANA;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = "rgba(96,165,250,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  button(L.W - 44, 4, 36, 36, "?", {
    tone: "plain",
    action: () => openCodex("play"),
  });
}

/** The line under the bar when nothing is selected — teaching early, status later. */
function hintText() {
  if (board.turn <= 2 && run.chamber === 1) return "Tap any piece to see what it attacks.";
  if (run.chamber === 1 && board.turn <= 5)
    return "Green outline: a quiet square. Red: it strikes.";
  const guards = board.pieces.filter((p) => p.kind !== "king").length;
  if (guards === 0) return "His ward has failed. Walk up and take him.";
  return `Turn ${board.turn} · ${guards} ${guards === 1 ? "guard" : "guards"} still standing`;
}

function drawBar(L) {
  panel(0, L.barY, L.W, L.barH + 40, {
    fill: "rgba(16,20,29,0.94)",
    stroke: "rgba(255,255,255,0.06)",
    radius: 20,
  });

  const pad = 10;
  const rowY = L.barY + 10;
  const rowH = 54;
  const width = L.W - pad * 2;

  if (aiming) {
    const spell = spellById(aiming);
    if (spell.target === "self") {
      // Nothing to point at: the bar itself is the confirmation.
      button(pad, rowY, width - 100, rowH, `Cast ${spell.name}`, {
        sub: "the court loses its next turn",
        tone: "mana",
        action: () => castSpell(spell.id, null),
      });
    } else {
      const targets = spellTargets(aiming);
      panel(pad, rowY, width - 100, rowH, { fill: "rgba(29,58,95,0.7)" });
      text(targets.length ? `Aim ${spell.name}` : `${spell.name}: no target`, pad + 16, rowY + 20, {
        size: 15,
        weight: 700,
        align: "left",
        color: targets.length ? MANA : DIM,
      });
      text(
        targets.length ? "tap a highlighted square" : "nowhere to put it from here",
        pad + 16,
        rowY + 38,
        {
          size: 11,
          align: "left",
          color: DIM,
        },
      );
    }
    button(L.W - pad - 90, rowY, 90, rowH, "Cancel", {
      tone: "plain",
      action: () => (aiming = null),
    });
  } else if (sel && sel.kind === "blocked") {
    button(pad, rowY, width - 100, rowH, sel.reason, {
      sub: "take its defenders first",
      tone: "plain",
    });
    button(L.W - pad - 90, rowY, 90, rowH, "OK", { tone: "plain", action: () => (sel = null) });
  } else if (sel) {
    const cost =
      sel.damage > 0
        ? `${sel.damage} damage — ${sel.damage >= run.hp ? "this kills you" : "confirm"}`
        : "clear square";
    button(pad, rowY, width - 100, rowH, sel.label, {
      sub: cost,
      tone: sel.damage > 0 ? "danger" : "accent",
      action: () => commit(sel),
    });
    button(L.W - pad - 90, rowY, 90, rowH, "Cancel", { tone: "plain", action: () => (sel = null) });
  } else if (inspect && board.pieces.includes(inspect)) {
    const kind = KINDS[inspect.kind];
    panel(pad, rowY, width - 100, rowH, { fill: RAISED });
    text(kind.glyph, pad + 26, rowY + rowH / 2, {
      size: 24,
      font: GLYPH,
      color: inspect.kind === "king" ? ROYAL : GOLD,
    });
    text(kind.name, pad + 48, rowY + 15, { size: 13, weight: 700, align: "left" });
    const lines = wrap(kind.tip, width - 100 - 56, 11);
    lines.slice(0, 2).forEach((line, i) => {
      text(line, pad + 48, rowY + 32 + i * 13, { size: 11, color: DIM, align: "left" });
    });
    button(L.W - pad - 90, rowY, 90, rowH, "Close", {
      tone: "plain",
      action: () => (inspect = null),
    });
  } else {
    panel(pad, rowY, width - 100, rowH, { fill: "rgba(35,43,60,0.6)" });
    text(hintText(), pad + 16, rowY + rowH / 2, { size: 12.5, color: DIM, align: "left" });
    button(L.W - pad - 90, rowY, 90, rowH, "Hold", {
      sub: "pass a turn",
      tone: "plain",
      action: hold,
    });
  }

  // Spellbook.
  const book = spellbook();
  const gap = 8;
  const bw = (width - gap * (book.length - 1)) / book.length;
  const by = rowY + rowH + 10;
  const bh = Math.max(56, L.barH - rowH - 26);

  book.forEach((spell, i) => {
    const cost = spellCost(spell);
    const poor = run.mana < cost;
    const active = aiming === spell.id;
    const x = pad + i * (bw + gap);

    roundRect(x, by, bw, bh, 13);
    ctx.fillStyle = active ? "#1d3a5f" : poor ? "#161b26" : RAISED;
    ctx.fill();
    ctx.strokeStyle = active ? MANA : "rgba(255,255,255,0.07)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    const tint = poor ? "#4b5566" : active ? MANA : FG;
    text(spell.glyph, x + bw / 2, by + bh * 0.34, { size: 22, font: GLYPH, color: tint });
    text(spell.name, x + bw / 2, by + bh * 0.63, { size: 10.5, weight: 600, color: tint });
    text(`${cost}◈`, x + bw / 2, by + bh * 0.84, {
      size: 10,
      color: poor ? "#4b5566" : MANA,
      font: FONT,
    });

    if (!poor) {
      hits.push({
        x,
        y: by,
        w: bw,
        h: bh,
        action: () => {
          sel = null;
          inspect = null;
          aiming = aiming === spell.id ? null : spell.id;
          // Nothing to aim at: cast it where you stand.
          if (aiming === "zugzwang") return;
          if (aiming && !spellTargets(aiming).length) vibrate(4);
        },
      });
    }
  });
}

// --- Screens ----------------------------------------------------------------

function openCodex(from) {
  codexFrom = from;
  codexPage = 0;
  scene = "codex";
}

function drawTitle(L) {
  const saved = savedRun;
  const cx = L.W / 2;
  const top = L.H * 0.17;

  ctx.save();
  ctx.shadowColor = ROYAL;
  ctx.shadowBlur = 30;
  text("♞", cx, top, { size: 92, font: GLYPH, color: ROYAL });
  ctx.restore();

  text("CHECKWIZ", cx, top + 84, { size: 34, weight: 800 });
  text("Dismantle the guard. Take the Sovereign.", cx, top + 116, { size: 14, color: DIM });

  const bw = Math.min(280, L.W - 60);
  const bx = cx - bw / 2;
  let y = top + 160;

  if (saved) {
    button(bx, y, bw, 58, "Continue run", {
      sub: `chamber ${saved.chamber} · ${saved.hp} life`,
      action: () => resumeRun(saved),
    });
    y += 68;
    button(bx, y, bw, 52, "New run", { tone: "plain", action: newRun });
  } else {
    button(bx, y, bw, 58, "Enter the first chamber", { action: newRun });
  }
  y += 68;
  button(bx, y, bw, 52, "How to play", { tone: "plain", action: () => openCodex("title") });

  text(`Deepest run: chamber ${best() || 1}`, cx, L.H - 34, { size: 12, color: DIM });
}

const RULES = [
  ["1", "A piece strikes or moves, never both. The red squares are exactly what will hit you."],
  ["2", "You cannot take a defended piece. Clear its defenders first — that ordering is the game."],
  ["3", "Every piece has a safe side. Learn where, and you can walk through a court untouched."],
  ["4", "Take the Sovereign's last guard and his ward fails: he stops striking, and he is yours."],
];

function drawCodex(L) {
  ctx.fillStyle = "rgba(8,10,15,0.9)";
  ctx.fillRect(0, 0, L.W, L.H);

  const pad = 16;
  const width = L.W - pad * 2;
  text(codexPage === 0 ? "The Court" : "Spells & Rules", L.W / 2, 34, { size: 22, weight: 700 });

  let y = 62;
  if (codexPage === 0) {
    for (const key of ["pawn", "knight", "bishop", "rook", "queen", "king"]) {
      const k = KINDS[key];
      const lines = wrap(k.tip, width - 76, 11.5);
      const h = Math.max(52, 26 + lines.length * 14);
      panel(pad, y, width, h, { fill: CARD });
      text(k.glyph, pad + 26, y + h / 2, {
        size: 26,
        font: GLYPH,
        color: key === "king" ? ROYAL : GOLD,
      });
      text(k.name, pad + 50, y + 15, { size: 13.5, weight: 700, align: "left" });
      lines.forEach((line, i) => {
        text(line, pad + 50, y + 33 + i * 14, { size: 11.5, color: DIM, align: "left" });
      });
      y += h + 7;
    }
  } else {
    for (const spell of SPELLS) {
      const lines = wrap(spell.blurb, width - 86, 11.5);
      const h = Math.max(46, 24 + lines.length * 14);
      const known = unlocked(spell);
      panel(pad, y, width, h, { fill: CARD });
      text(spell.glyph, pad + 24, y + h / 2, {
        size: 20,
        font: GLYPH,
        color: known ? MANA : "#4b5566",
      });
      text(`${spell.name} · ${spell.cost}◈`, pad + 46, y + 14, {
        size: 12.5,
        weight: 700,
        align: "left",
        color: known ? FG : "#6b7688",
      });
      lines.forEach((line, i) => {
        text(line, pad + 46, y + 30 + i * 13, { size: 11, color: DIM, align: "left" });
      });
      if (!known) {
        text(`chamber ${spell.from}`, L.W - pad - 10, y + 14, {
          size: 10,
          color: "#6b7688",
          align: "right",
        });
      }
      y += h + 6;
    }
    y += 4;
    for (const [n, rule] of RULES) {
      const lines = wrap(rule, width - 46, 11.5);
      const h = 18 + lines.length * 14;
      text(n, pad + 12, y + 12, { size: 15, weight: 800, color: ROYAL });
      lines.forEach((line, i) => {
        text(line, pad + 30, y + 8 + i * 14, { size: 11.5, color: DIM, align: "left" });
      });
      y += h;
    }
  }

  const bw = (L.W - pad * 2 - 10) / 2;
  const by = L.H - 70;
  button(pad, by, bw, 52, codexPage === 0 ? "Spells & rules" : "The court", {
    tone: "plain",
    action: () => (codexPage = codexPage === 0 ? 1 : 0),
  });
  button(pad + bw + 10, by, bw, 52, "Back", { action: () => (scene = codexFrom) });
}

function drawDraft(L) {
  ctx.fillStyle = "rgba(8,10,15,0.86)";
  ctx.fillRect(0, 0, L.W, L.H);

  const cx = L.W / 2;
  text("Chamber cleared", cx, L.H * 0.13, { size: 26, weight: 800, color: ROYAL });
  text(`The way down opens to chamber ${run.chamber}.`, cx, L.H * 0.13 + 28, {
    size: 13,
    color: DIM,
  });
  text("Take one.", cx, L.H * 0.13 + 52, { size: 13, color: FG });

  const pad = 18;
  const width = L.W - pad * 2;
  const h = 84;
  let y = L.H * 0.13 + 78;

  for (const upgrade of draft) {
    panel(pad, y, width, h, { fill: CARD, stroke: "rgba(96,165,250,0.25)" });
    text(upgrade.glyph, pad + 34, y + h / 2, { size: 28, font: GLYPH, color: MANA });
    text(upgrade.name, pad + 64, y + 30, { size: 17, weight: 700, align: "left" });
    text(upgrade.blurb, pad + 64, y + 54, { size: 12, color: DIM, align: "left" });
    hits.push({
      x: pad,
      y,
      w: width,
      h,
      action: () => {
        upgrade.apply();
        vibrate(20);
        startChamber();
      },
    });
    y += h + 12;
  }

  text(`${run.hp}/${run.maxHp} life · ${run.mana} mana · ${run.captures} taken`, cx, L.H - 40, {
    size: 12,
    color: DIM,
  });
}

// --- Frame ------------------------------------------------------------------

function update(dt) {
  elapsed += dt;

  if (board) {
    if (!wizAnim) wizAnim = { x: board.wizard.c, y: board.wizard.r };
    // A chamber change teleports the wizard; anything shorter is a real move.
    if (Math.hypot(board.wizard.c - wizAnim.x, board.wizard.r - wizAnim.y) > 2.6) {
      wizAnim = { x: board.wizard.c, y: board.wizard.r };
    }
    const k = Math.min(1, dt * 14);
    wizAnim.x += (board.wizard.c - wizAnim.x) * k;
    wizAnim.y += (board.wizard.r - wizAnim.y) * k;
    for (const p of board.pieces) {
      p.ax += (p.c - p.ax) * k;
      p.ay += (p.r - p.ay) * k;
    }
  }

  for (const s of sparks) {
    s.r += s.vr * dt;
    s.c += s.vc * dt;
    s.vr += dt * 1.6;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);

  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter((f) => f.life > 0);

  for (const b of beams) b.life -= dt;
  beams = beams.filter((b) => b.life > 0);

  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }

  shake = Math.max(0, shake - dt * 34);
}

createLoop((dt) => {
  update(dt);

  const L = layout();
  hits = [];

  ctx.clearRect(0, 0, L.W, L.H);
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawBackdrop(L);

  if (board) {
    drawSquares(L);
    drawMoveHints(L);
    drawInspection(L);
    drawSpellTargets(L);
    drawSelection(L);
    drawWalls(L);
    drawPieces(L);
    if (scene === "play" || scene === "over") drawWizard(L);
    drawEffects(L);
  }
  ctx.restore();

  if (scene === "play") {
    drawTop(L);
    drawBar(L);
    drawBanner(L);
  } else if (scene === "title") {
    ctx.fillStyle = "rgba(8,10,15,0.72)";
    ctx.fillRect(0, 0, L.W, L.H);
    drawTitle(L);
  } else if (scene === "codex") {
    drawCodex(L);
  } else if (scene === "draft") {
    drawDraft(L);
  }
});

// --- Input ------------------------------------------------------------------

function tapSquare(r, c) {
  if (aiming) {
    const target = spellTargets(aiming).find((t) => t.r === r && t.c === c);
    if (target) castSpell(aiming, target);
    else aiming = null;
    return;
  }

  // Tapping a pending target again commits it, so a confident player never
  // has to reach for the bar.
  if (sel && sel.r === r && sel.c === c && sel.kind !== "blocked") {
    commit(sel);
    return;
  }

  const read = readSquare(r, c);
  if (!read) {
    sel = null;
    inspect = null;
    return;
  }
  if (read.kind === "inspect") {
    inspect = inspect === read.piece ? null : read.piece;
    sel = null;
    return;
  }
  if (read.kind === "blocked") {
    sel = read;
    inspect = read.piece ?? null;
    vibrate(4);
    return;
  }
  // A quiet step is just a step. Anything that costs something waits for a yes.
  if (read.kind === "move" && read.damage === 0) {
    commit(read);
    return;
  }
  sel = read;
  inspect = read.piece ?? null;
}

createInput(stage, {
  onTap({ x, y }) {
    // The beat between the Sovereign falling and the draft appearing belongs
    // to the animation, not to another turn.
    if (scene === "play" && board?.cleared) return;

    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        h.action();
        return;
      }
    }
    if (scene !== "play" || !board) return;

    const L = layout();
    const c = Math.floor((x - L.bx) / L.cell);
    const r = Math.floor((y - L.by) / L.cell);
    if (!inBoard(r, c)) {
      sel = null;
      inspect = null;
      aiming = null;
      return;
    }
    tapSquare(r, c);
  },
});

// --- Boot -------------------------------------------------------------------

// The title screen wants a board glowing behind it, and a fresh run needs one
// anyway. A run left mid-chamber is offered back on the title screen.
savedRun = loadRun();
board = genChamber(1);
refresh();
syncHud();
