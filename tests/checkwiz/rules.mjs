/**
 * Checkwiz rules suite — the balance rules that keep the game honest.
 *
 * Every check here exists because a specific cheap win existed. Three of them
 * made the game solvable without playing it:
 *
 *   1. Stand still and the queen walked into your hand, because the court
 *      scored moves purely on getting closer.
 *   2. Beam the Sovereign on turn one and skip the guard entirely.
 *   3. Walk through any line you liked, because every strike cost exactly one.
 *
 * Run it against an older build to see it earn its keep:
 *
 *     SAVE_V=1 node tests/checkwiz/rules.mjs   # against the pre-tuning game
 *
 * The old build fails half of these. That is the point of writing them as
 * positions rather than unit tests — they describe the *game*, so they survive
 * the code being rearranged underneath.
 */
import {
  openGame,
  makeRun,
  piece,
  createReport,
  guardsOf,
  defended,
  ALL8,
  cheb,
  raysOf,
} from "./harness.mjs";

const game = await openGame();
const { check, finish } = createReport();
const { resume, read, tapCell, tapAside, tapConfirm, tapSpell, settle } = game;

/** A cleared chamber only persists after its ~1.1s death burst — outwait it. */
const CLEAR_DELAY = 1600;

// --- The game still boots ----------------------------------------------------
{
  const shot = await game.page.screenshot();
  check("boots and paints a title screen", shot.length > 5000, `${shot.length} bytes`);
}

// --- The ward is the court, and one man is not a court ----------------------
{
  // Wizard standing right beside the throne with the court still up. Nothing
  // defends the king's square — that used to be a free win.
  await resume(
    makeRun({
      size: 7,
      pieces: [piece(1, "king", 1, 5), piece(2, "pawn", 3, 4), piece(3, "pawn", 3, 1)],
      wizard: { r: 2, c: 5 },
    }),
  );

  await tapCell(7, 1, 5); // select the throne
  await tapCell(7, 1, 5); // tapping a pending target again commits it
  await settle(CLEAR_DELAY); // outwait the clear-chamber timeout before believing it
  let s = await read();
  check(
    "an undefended Sovereign is untouchable while the court holds",
    s && s.chamber === 1 && s.board.pieces.length === 3,
    `chamber ${s?.chamber}, ${s?.board.pieces.length} pieces`,
  );

  // Take one from its blind side — a pawn never attacks backwards.
  await tapCell(7, 3, 4);
  await tapConfirm(7);
  s = await read();
  check("a guard falls to a capture from behind", s.board.pieces.length === 2 && s.captures === 1);

  // Down to one guard the ward fails with the court, and his aura goes out with
  // it — so the walk in costs nothing even though a guard is still alive.
  await tapCell(7, 2, 4);
  s = await read();
  check("the aura dies with the ward", s.hp === 6, `hp ${s.hp}`);

  await tapCell(7, 1, 5);
  await tapCell(7, 1, 5);
  await settle(CLEAR_DELAY);
  s = await read();
  check(
    "one guard cannot hold the ward alone",
    s.chamber === 2,
    `chamber ${s.chamber} with a guard still standing`,
  );
}

// --- The knight that could not be caught ------------------------------------
{
  // Every other piece can be run down, because a piece attacking the wizard
  // fires instead of moving — stand beside a rook and it stays to shoot you.
  // A knight never attacks what touches it, so it is never that piece, and left
  // to its own judgement it hopped clear every time the wizard closed. A lone
  // knight was untakeable by hand at any price.
  await resume(
    makeRun({
      chamber: 3,
      size: 8,
      mana: 0,
      pieces: [piece(1, "king", 0, 0), piece(2, "knight", 4, 4), piece(3, "pawn", 0, 7)],
      wizard: { r: 4, c: 5 }, // beside it, and off every square it attacks
    }),
  );

  await tapAside(8); // Hold — give it a full turn to run
  let s = await read();
  const knight = s?.board.pieces.find((p) => p.kind === "knight");
  check(
    "a knight the wizard has closed on holds its square",
    knight && knight.r === 4 && knight.c === 4,
    knight ? `knight at ${knight.r},${knight.c}` : "knight gone",
  );

  await tapCell(8, 4, 4);
  await tapConfirm(8);
  s = await read();
  check(
    "and can then be taken by hand",
    !s?.board.pieces.some((p) => p.kind === "knight"),
    `${s?.board.pieces.length} pieces left`,
  );
}

// --- Cheese #2: spells do not reach the throne -------------------------------
{
  await resume(
    makeRun({
      chamber: 4, // Leap, Bulwark, Beam and Dispel all unlocked
      mana: 10,
      size: 7,
      // The throne sits on the wizard's diagonal with a clear line to it.
      pieces: [piece(1, "king", 2, 2), piece(2, "knight", 0, 6), piece(3, "pawn", 0, 1)],
      wizard: { r: 5, c: 5 },
    }),
  );

  await tapSpell(7, 2, 4); // Beam
  await tapCell(7, 2, 2);
  await settle(CLEAR_DELAY);
  let s = await read();
  check(
    "beam cannot take a warded Sovereign",
    s?.board.pieces.some((p) => p.kind === "king") && s.mana === 10,
    `mana ${s?.mana}, ${s?.board.pieces.length} pieces`,
  );
  check("a refused beam costs neither mana nor the turn", s?.board.turn === 1);

  await tapAside(7); // dismiss the refusal
  await tapSpell(7, 3, 4); // Dispel
  await tapCell(7, 2, 2);
  await settle(CLEAR_DELAY);
  s = await read();
  check(
    "dispel cannot touch a warded Sovereign",
    s?.board.pieces.find((p) => p.kind === "king")?.stun === 0 && s.mana === 10,
    `mana ${s?.mana}`,
  );

  // The rule is the ward, not blanket immunity: alone, he is beamable.
  await resume(
    makeRun({
      chamber: 4,
      mana: 10,
      size: 7,
      pieces: [piece(1, "king", 2, 2)],
      wizard: { r: 5, c: 5 },
    }),
  );
  await tapSpell(7, 2, 4);
  await tapCell(7, 2, 2);
  await settle(CLEAR_DELAY);
  s = await read();
  check("beam takes the Sovereign once his ward fails", s.chamber === 5, `chamber ${s.chamber}`);
}

// --- Cheese #1: the queen will not walk into your hand -----------------------
{
  // The actual tactic: step off her lines every turn so she never gets to fire.
  // A court that only wants to get closer marches her straight into your arms;
  // this counts how often she ends a turn beside the wizard, undefended.
  await resume(
    makeRun({
      chamber: 7,
      mana: 0,
      hp: 40, // padded so twelve turns of being shot at cannot end the run
      maxHp: 40,
      size: 8,
      pieces: [piece(1, "king", 0, 0), piece(2, "queen", 1, 6)],
      wizard: { r: 6, c: 3 },
    }),
  );

  let gifts = 0;
  let closest = 99;
  for (let turn = 0; turn < 16; turn++) {
    const s = await read();
    if (!s) break;
    const b = s.board;
    const w = b.wizard;
    const q = b.pieces.find((p) => p.kind === "queen");
    if (!q) break;
    const near = cheb(q, w);
    closest = Math.min(closest, near);
    if (near === 1 && !defended(b, q)) {
      gifts++;
      break; // four mana and the end of the queen problem: the cheese, in one line
    }
    // Dodge to any quiet neighbouring square; never trade, never attack.
    const quiet = ALL8.map(([dr, dc]) => ({ r: w.r + dr, c: w.c + dc })).find(
      (m) =>
        m.r >= 0 &&
        m.c >= 0 &&
        m.r < b.size &&
        m.c < b.size &&
        !b.pieces.some((p) => p.r === m.r && p.c === m.c) &&
        !b.pieces.some((p) => raysOf(b, p).some((s2) => s2.r === m.r && s2.c === m.c)),
    );
    if (quiet) await tapCell(8, quiet.r, quiet.c);
    else await tapAside(8);
  }
  check("dodging her lines never wins you a free queen", gifts === 0, `${gifts} free captures`);
  check("the queen still presses the attack", closest <= 3, `closed to ${closest}`);
}

// --- Cheese #3: a strike is worth whatever threw it --------------------------
{
  // The wizard has to be standing somewhere the piece genuinely attacks, which
  // is not the same square for all of them: a rook owns the rank it sits on, a
  // pawn only the two squares diagonally ahead. Put a pawn on the rank and it
  // threatens nothing, the turn passes quietly, and a test that meant to prove
  // "one damage" proves that zero equals zero instead.
  const costOfStandingOn = async (kind, at) => {
    await resume(
      makeRun({
        chamber: 7,
        hp: 9,
        maxHp: 9,
        mana: 0,
        size: 8,
        // King parked in the far corner, out of range of everything.
        pieces: [piece(1, "king", 0, 7), piece(2, kind, at.r, at.c)],
        wizard: { r: 4, c: 4 },
      }),
    );
    await tapAside(8); // Hold — take the hit
    const s = await read();
    return 9 - s.hp;
  };

  check("a pawn's line costs 1", (await costOfStandingOn("pawn", { r: 3, c: 3 })) === 1);
  check("a rook's line costs 2", (await costOfStandingOn("rook", { r: 4, c: 0 })) === 2);
  check("a queen's line costs 3", (await costOfStandingOn("queen", { r: 4, c: 0 })) === 3);
}

// --- Standing still is a real decision, not a free one -----------------------
{
  await resume(
    makeRun({
      chamber: 7,
      mana: 0,
      hp: 40,
      maxHp: 40,
      size: 8,
      pieces: [piece(1, "king", 1, 1), piece(2, "queen", 1, 6)],
      wizard: { r: 6, c: 3 },
    }),
  );

  let hp = 40;
  for (let turn = 0; turn < 12; turn++) {
    const s = await read();
    if (!s) break;
    hp = s.hp;
    await tapAside(8); // Hold
  }
  check("standing still under a queen is punished", hp <= 40 - 12, `wizard at ${hp}/40`);
  const s = await read();
  check("holding gathers mana", s && s.mana > 0, `mana ${s?.mana}`);
  check("guards are all that hold the ward up", s && guardsOf(s.board).length > 0);
}

check("console clean", game.errors.length === 0, game.errors.join(" | ").slice(0, 300));

await game.close();
process.exit(finish() ? 1 : 0);
