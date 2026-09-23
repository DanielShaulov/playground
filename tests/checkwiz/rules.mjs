/**
 * Checkwiz rules suite — the game's rules, checked in the game people touch.
 *
 *     npm start                   # in another terminal
 *     node tests/checkwiz/rules.mjs
 *
 * Every check seeds a position through the save file, plays it with real taps,
 * and reads the result back the same way. Expected numbers are literals worked
 * out by hand from the position, never asked of rules.js: a test that asks the
 * rules what the rules should do cannot fail.
 *
 * Several of these exist because a specific cheap win existed in an earlier
 * version, and are there to keep it closed:
 *
 *   - Sniping the throne with a soul from across the board, skipping the court.
 *   - A queen that walked into arm's reach and could be taken for nothing.
 *   - A knight, or any runner, that could never be caught on foot.
 *   - Tanking every blow and healing it all back between chambers.
 */
import { openGame, makeRun, piece, createReport } from "./harness.mjs";
import { dangerMap, ALL8 } from "../../games/checkwiz/rules.js";

const game = await openGame();
const { check, finish } = createReport();
const { resume, read, tapCell, tapAside, tapMain, tapSlot, settle } = game;

const kinds = (s) => s.board.pieces.map((p) => p.kind).sort();
const at = (s, id) => s.board.pieces.find((p) => p.id === id);

// --- It boots, and the first chamber is the one written by hand ----------------
{
  const shot = await game.page.screenshot();
  check("boots and paints a title screen", shot.length > 5000, `${shot.length} bytes`);

  await game.newRun();
  const s = await read();
  check(
    "a new run opens on the tutorial chamber",
    s?.board.size === 6 &&
      s.board.wizard.r === 5 &&
      s.board.wizard.c === 3 &&
      kinds(s).join() === "king,pawn,pawn,pawn",
    s ? `${s.board.size}×${s.board.size}, ${kinds(s)}` : "no save",
  );
}

// --- 1. Red squares strike, for what the piece hits ------------------------------
{
  // The wizard has to stand somewhere the piece really attacks, which is not
  // the same square for every piece: a rook owns the rank it sits on, a pawn
  // only the two squares diagonally below it. Get that wrong and the turn
  // passes quietly, and the check proves zero equals zero.
  const costOf = async (kind, where) => {
    await resume(
      makeRun({
        hp: 9,
        maxHp: 9,
        size: 8,
        pieces: [piece(1, "king", 0, 7), piece(2, kind, where.r, where.c)],
        wizard: { r: 4, c: 4 },
      }),
    );
    await tapAside(8); // Wait — standing in a line asks first
    await tapMain(8); // yes
    const s = await read();
    return { hurt: 9 - s.hp, piece: at(s, 2) };
  };

  const pawn = await costOf("pawn", { r: 3, c: 3 });
  check("a pawn's strike costs 1", pawn.hurt === 1, `lost ${pawn.hurt}`);
  const rook = await costOf("rook", { r: 4, c: 0 });
  check("a rook's strike costs 2", rook.hurt === 2, `lost ${rook.hurt}`);
  check(
    "2. a piece that strikes stays where it is",
    rook.piece.r === 4 && rook.piece.c === 0,
    `rook at ${rook.piece.r},${rook.piece.c}`,
  );
  const queen = await costOf("queen", { r: 4, c: 0 });
  check("a queen's strike costs 3", queen.hurt === 3, `lost ${queen.hurt}`);
}

// --- 3. A piece you move up beside is held ------------------------------------
{
  // Neither of these attacks the square the wizard steps to, so neither fires
  // — and left to themselves both would move: the rook one square over to line
  // up on him, the knight away, since a knight can never strike what touches
  // it. A knight that hopped clear every time you closed used to be uncatchable.
  await resume(
    makeRun({
      size: 8,
      pieces: [piece(1, "king", 0, 0), piece(2, "knight", 4, 4), piece(3, "rook", 3, 6)],
      wizard: { r: 5, c: 5 },
    }),
  );
  await tapCell(8, 4, 5); // step up beside both: quiet, so it is just made
  const s = await read();
  const knight = at(s, 2);
  const rook = at(s, 3);
  check(
    "a knight you step up to cannot hop away",
    knight.r === 4 && knight.c === 4,
    `${knight.r},${knight.c}`,
  );
  check(
    "a rook you step up to cannot slide onto your line",
    rook.r === 3 && rook.c === 6,
    `${rook.r},${rook.c}`,
  );
  check(
    "a step to a quiet square costs nothing",
    s.hp === 6 && s.board.wizard.c === 5,
    `hp ${s.hp}`,
  );

  await tapCell(8, 4, 4);
  await tapMain(8);
  const after = await read();
  check(
    "4. and a held piece is taken by stepping onto it, keeping its soul",
    !at(after, 2) && after.hand.join() === "knight" && after.captures === 1,
    `hand [${after.hand}]`,
  );
}

// --- 4. A defended piece is a price, not a wall -------------------------------------
{
  // The pawn at (3,4) strikes (4,3) and (4,5), so (4,4) under it is quiet. The
  // rook on the same rank defends it: taking it means standing in the rook's
  // line, and the rook is exactly the bill.
  await resume(
    makeRun({
      size: 7,
      pieces: [piece(1, "king", 0, 6), piece(2, "pawn", 3, 4), piece(3, "rook", 3, 0)],
      wizard: { r: 4, c: 4 },
    }),
  );
  await tapCell(7, 3, 4);
  await tapMain(7);
  const s = await read();
  check(
    "taking a defended pawn costs its defender's strike",
    s.hp === 4 && !at(s, 2) && s.board.wizard.r === 3,
    `hp ${s.hp}, wizard ${s.board.wizard.r},${s.board.wizard.c}`,
  );
}

// --- Souls: one move in the shape of what you took -----------------------------------
{
  await resume(
    makeRun({
      size: 7,
      hand: ["knight"],
      // Bodies in the way: a leap goes over them.
      pieces: [
        piece(1, "king", 0, 0),
        piece(2, "pawn", 4, 4),
        piece(3, "pawn", 5, 3),
        piece(4, "pawn", 5, 4),
      ],
      wizard: { r: 6, c: 3 },
    }),
  );
  await tapSlot(7, 0);
  await tapCell(7, 4, 4); // an L away, over the two pawns
  await tapMain(7);
  const s = await read();
  check(
    "a knight's soul leaps an L over bodies and takes what it lands on",
    s.board.wizard.r === 4 && s.board.wizard.c === 4 && !at(s, 2),
    `wizard ${s.board.wizard.r},${s.board.wizard.c}`,
  );
  check(
    "the spent soul is gone and the new one kept",
    s.hand.join() === "pawn",
    `hand [${s.hand}]`,
  );
}

{
  await resume(
    makeRun({
      size: 8,
      hand: ["pawn"],
      pieces: [piece(1, "king", 0, 7), piece(2, "rook", 4, 0)],
      wizard: { r: 4, c: 4 },
    }),
  );
  await tapSlot(8, 0);
  await tapCell(8, 4, 2); // raise a stone in the rook's line
  const s = await read();
  check(
    "a pawn's soul raises a stone that cuts a line",
    s.hp === 6 && s.board.stones.some((x) => x.r === 4 && x.c === 2),
    `hp ${s.hp}, stones ${s.board.stones.map((x) => `${x.r},${x.c}`)}`,
  );
}

// --- 5. The crown is taken by hand ------------------------------------------------------
{
  // Cheap win #1 of this version: walk nowhere near the court, glide down a
  // diagonal and take the throne from across the board.
  await resume(
    makeRun({
      size: 7,
      hand: ["bishop"],
      pieces: [piece(1, "king", 2, 2), piece(2, "pawn", 0, 6)],
      wizard: { r: 5, c: 5 },
    }),
  );
  await tapSlot(7, 0);
  await tapCell(7, 2, 2);
  await tapMain(7);
  await settle(400);
  const s = await read();
  check(
    "no soul can take the Sovereign",
    s.phase === "play" && at(s, 1) && s.hand.join() === "bishop" && s.board.turn === 1,
    `phase ${s.phase}, hand [${s.hand}], turn ${s.board.turn}`,
  );
}

{
  // His guard's line is the price of the crown: the pawn at (0,1) covers him.
  await resume(
    makeRun({
      chamber: 3,
      size: 7,
      pieces: [
        piece(1, "king", 1, 2),
        piece(2, "pawn", 0, 1, { guard: true }),
        piece(3, "knight", 6, 6),
      ],
      wizard: { r: 2, c: 3 },
    }),
  );
  await tapCell(7, 1, 2);
  await tapMain(7);
  const s = await read();
  check(
    "taking him by hand clears the chamber, at his guard's price",
    s.phase === "draft" && s.chamber === 4 && s.hp === 5,
    `phase ${s.phase}, chamber ${s.chamber}, hp ${s.hp}`,
  );
  check("and the draft offers three relics", s.draft?.length === 3, `[${s.draft}]`);

  await settle(1600); // the fall plays out before the draft is shown
  const offered = s.draft[0];
  await game.tapDraft(0);
  const next = await read();
  check(
    "taking a relic opens the next chamber with it",
    next.phase === "play" && next.chamber === 4 && (next.relics[offered] || offered === "respite"),
    `phase ${next.phase}, relics ${Object.keys(next.relics)}`,
  );
}

// --- 6. Untouched, you heal — and only then ----------------------------------------------
{
  // Cheap win #3 of the first version: soak every blow, mend it all between
  // chambers. Healing now has to be earned inside the chamber.
  const clearWith = async (hurt) => {
    const run = makeRun({
      hp: 4,
      size: 7,
      pieces: [piece(1, "king", 1, 2), piece(2, "knight", 6, 6)],
      wizard: { r: 2, c: 3 },
    });
    run.board.hurt = hurt;
    await resume(run);
    await tapCell(7, 1, 2);
    await tapMain(7);
    return read();
  };
  const clean = await clearWith(0);
  check(
    "a chamber cleared untouched heals 1",
    clean.hp === 5 && clean.flawless === 1,
    `hp ${clean.hp}`,
  );
  const bruised = await clearWith(1);
  check("a chamber cleared after one blow heals nothing", bruised.hp === 4, `hp ${bruised.hp}`);
}

// --- Check: the court gets one reply -----------------------------------------------------
{
  // The rook is a palace guard off the throne's lines. Once the wizard stands
  // beside the Sovereign, the rook drops everything to cover his square.
  await resume(
    makeRun({
      size: 8,
      pieces: [piece(1, "king", 0, 3), piece(2, "rook", 2, 6, { guard: true })],
      wizard: { r: 2, c: 1 },
    }),
  );
  await tapCell(8, 1, 2); // beside him: check
  const s = await read();
  const rook = at(s, 2);
  const covers = (rook.r === 0 && rook.c > 3) || (rook.c === 3 && rook.r > 0);
  check(
    "in check, a guard moves to cover the throne",
    s.board.check && covers,
    `rook ${rook.r},${rook.c}`,
  );
}

// --- Boss chambers: he castles ------------------------------------------------------------
{
  await resume(
    makeRun({
      chamber: 5,
      boss: true,
      size: 7,
      pieces: [piece(1, "king", 1, 3), piece(2, "rook", 6, 0)],
      wizard: { r: 2, c: 3 },
    }),
  );
  await tapCell(7, 1, 3);
  await tapMain(7);
  const s = await read();
  const king = at(s, 1);
  check(
    "the first blow at a castle's Sovereign takes his rook instead",
    s.phase === "play" && king?.r === 6 && king?.c === 0 && !at(s, 2) && s.hand.join() === "rook",
    `phase ${s.phase}, king ${king?.r},${king?.c}, hand [${s.hand}]`,
  );
}

{
  // The last chamber, his rooks already gone: taking him ends the run in a win.
  await resume(
    makeRun({
      chamber: 15,
      boss: true,
      castle: 0,
      size: 8,
      pieces: [piece(1, "king", 1, 3), piece(2, "knight", 7, 7)],
      wizard: { r: 2, c: 3 },
    }),
  );
  await tapCell(8, 1, 3);
  await tapMain(8);
  await settle(2200);
  const s = await read();
  const wins = await game.page.evaluate(() => localStorage.getItem("playground:checkwiz:wins"));
  const shown = await game.page.evaluate(() => document.querySelector(".overlay h1")?.textContent);
  check(
    "taking the fifteenth Sovereign wins the run",
    s === null && wins === "1" && shown === "The Keep is yours",
    `save ${s ? s.phase : "cleared"}, wins ${wins}, overlay "${shown}"`,
  );
}

// --- The clocks: promotion and reinforcements -----------------------------------------------
{
  await resume(
    makeRun({
      size: 7,
      pace: 1, // this pawn marches every turn
      call: 1, // and a fresh one arrives after a single turn
      pieces: [piece(1, "king", 0, 6), piece(2, "pawn", 5, 0)],
      wizard: { r: 2, c: 3 },
    }),
  );
  await tapAside(7);
  const s = await read();
  check(
    "a pawn reaching the bottom rank is crowned a queen",
    at(s, 2)?.kind === "queen",
    at(s, 2)?.kind,
  );
  check(
    "and every so often a fresh pawn enters the top rank",
    s.board.pieces.some((p) => p.id === 3 && p.kind === "pawn" && p.r === 0),
    kinds(s).join(),
  );
}

// --- The queen will not walk into your hands ---------------------------------------------
{
  // Cheap win #2 of the first version: step off her lines every turn, and a
  // court that only wanted to get closer marched her into arm's reach, where
  // she could be taken for nothing. This dodges for sixteen turns and counts
  // how often she ends a turn beside the wizard with nothing defending her.
  await resume(
    makeRun({
      hp: 40,
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
    const b = s.board;
    const w = b.wizard;
    const q = at(s, 2);
    const near = Math.max(Math.abs(q.r - w.r), Math.abs(q.c - w.c));
    closest = Math.min(closest, near);
    const d = dangerMap(s);
    if (near === 1 && d[q.r][q.c] === 0) gifts++;
    // Dodge to a quiet neighbouring square; never attack.
    const quiet = ALL8.map(([dr, dc]) => ({ r: w.r + dr, c: w.c + dc })).find(
      (m) =>
        m.r >= 0 &&
        m.c >= 0 &&
        m.r < b.size &&
        m.c < b.size &&
        !b.pieces.some((p) => p.r === m.r && p.c === m.c) &&
        d[m.r][m.c] === 0,
    );
    if (quiet) {
      await tapCell(8, quiet.r, quiet.c);
    } else {
      await tapAside(8);
      await tapMain(8);
    }
  }
  check("dodging her lines never hands you a free queen", gifts === 0, `${gifts} free captures`);
  check("the queen still presses the attack", closest <= 4, `closed to ${closest}`);
}

check("console clean", game.errors.length === 0, game.errors.join(" | ").slice(0, 300));

await game.close();
process.exit(finish() ? 1 : 0);
