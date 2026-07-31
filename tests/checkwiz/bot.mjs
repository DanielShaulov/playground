/**
 * Plays whole runs of Checkwiz from the title screen, on real generated
 * chambers, with a deliberately plain policy.
 *
 *     node tests/checkwiz/bot.mjs            # a few runs, summary per run
 *     RUNS=6 TRACE=1 node tests/checkwiz/bot.mjs   # turn-by-turn commentary
 *
 * It is a smoke test, not a difficulty oracle. What it is good for is the class
 * of bug that a hand-written position never finds: chambers that cannot be
 * finished, courts that lock themselves solid, promotions that avalanche, a
 * console that starts throwing on turn 200. What it is *not* good for is
 * judging how hard the game feels — it has no lookahead, it will not spend life
 * to buy a capture, and it barely uses the spellbook, so it dies of things a
 * person would walk around. Read its depth as a floor, never as a score.
 *
 * The policy, in order: take anything free and safe, else walk toward a square
 * you could take something *from* — which is the game's own lesson that every
 * piece has a safe side — else spend mana, else hold and gather.
 */
import {
  openGame,
  makeRun,
  dangerMap,
  defended,
  guardsOf,
  raysOf,
  bookSize,
  cheb,
  ALL8,
  DIAG,
  SHAPE,
} from "./harness.mjs";

const RUNS = Number(process.env.RUNS ?? 3);
const CAP = Number(process.env.CAP ?? 400);
const TRACE = !!process.env.TRACE;

const game = await openGame();
const { read, tapCell, tapAside, tapConfirm, tapSpell, settle, layout, tap, rect } = game;

const say = (...args) => TRACE && console.log("   ", ...args);
const stats = [];

for (let run = 0; run < RUNS; run++) {
  await game.newRun();

  let turns = 0;
  let deepest = 1;
  let captures = 0;
  let idle = 0;
  let stuck = 0;
  let lastState = "";
  let lastBoard = "";

  for (; turns < CAP; turns++) {
    const s = await read();
    if (!s) break; // the run ended and cleared itself out of storage
    deepest = s.chamber;
    captures = s.captures;
    const b = s.board;

    // No king on the board means the chamber is won and the draft is showing.
    if (!b.pieces.some((p) => p.kind === "king")) {
      await tap(rect.width / 2, rect.height * 0.13 + 78 + 42); // take the first upgrade
      await settle(400);
      continue;
    }

    const size = b.size;
    const w = b.wizard;
    if (TRACE && turns % 20 === 0) {
      say(
        `t${turns} ch${s.chamber} hp${s.hp}/${s.maxHp} mana${s.mana} ::`,
        b.pieces.map((p) => `${p.kind}@${p.r},${p.c}`).join(" "),
      );
    }

    // Never spin without taking a turn. A tap the game refuses leaves a panel
    // open, and the next tap only dismisses it — without this the bot can sit
    // there "playing" forever while the clock never moves. (It did, for 500
    // turns, and the frozen board looked exactly like a game bug.)
    const state = `${s.hp}/${s.mana}/${b.turn}/${w.r},${w.c}`;
    idle = state === lastState ? idle + 1 : 0;
    lastState = state;
    if (idle >= 3) {
      await tapAside(size); // dismiss whatever is open
      await tapAside(size); // and now actually Hold
      idle = 0;
      continue;
    }

    const board = b.pieces.map((p) => `${p.kind}${p.r}${p.c}`).join(",");
    stuck = board === lastBoard ? stuck + 1 : 0;
    lastBoard = board;

    const d = dangerMap(b);
    const on = (r, c) => r >= 0 && c >= 0 && r < size && c < size;
    const free = (r, c) =>
      on(r, c) &&
      !b.pieces.some((p) => p.r === r && p.c === c) &&
      !b.walls.some((x) => x.r === r && x.c === c);

    // 1. Take what it can afford. Free first, but a capture worth a pawn's toll
    // is one a person takes without thinking, and a bot that only ever accepts
    // free ones circles a chamber forever waiting for a gift.
    const prey = b.pieces
      .filter(
        (p) =>
          cheb(w, p) === 1 &&
          !(p.kind === "king" && guardsOf(b).length) &&
          (p.stun > 0 || !defended(b, p)),
      )
      .map((p) => ({ p, cost: d[p.r][p.c] }))
      .filter((x) => x.cost === 0 || x.cost <= s.hp - 3)
      .sort((a, x) => a.cost - x.cost || SHAPE[x.p.kind].hit - SHAPE[a.p.kind].hit)[0];
    if (prey) {
      say(`t${turns} take ${prey.p.kind} for ${prey.cost}`);
      await tapCell(size, prey.p.r, prey.p.c);
      await tapConfirm(size);
      continue;
    }

    // 2. Walk toward somewhere a capture can be launched from: a quiet square
    // beside an undefended guard. Falls back to closing on the court at all.
    const launch = [];
    for (const g of guardsOf(b).filter((p) => !defended(b, p))) {
      for (const [dr, dc] of ALL8) {
        const m = { r: g.r + dr, c: g.c + dc };
        if (free(m.r, m.c) && d[m.r][m.c] === 0) launch.push(m);
      }
    }
    const fallback = guardsOf(b).length ? guardsOf(b) : b.pieces;
    const near = (m) =>
      launch.length
        ? Math.min(...launch.map((a) => cheb(m, a)))
        : Math.min(...fallback.map((p) => cheb(m, p)));
    // Don't wander into a pocket with no way out — a cornered wizard is how
    // three pawns get to hit you at once.
    const escapes = (m) =>
      ALL8.filter(([dr, dc]) => free(m.r + dr, m.c + dc) && (d[m.r + dr]?.[m.c + dc] ?? 1) === 0)
        .length;
    const steps = ALL8.map(([dr, dc]) => ({ r: w.r + dr, c: w.c + dc }))
      .filter((m) => free(m.r, m.c) && d[m.r][m.c] === 0)
      .sort((a, x) => escapes(x) * 2 - near(x) * 3 - (escapes(a) * 2 - near(a) * 3));

    // 3. Nothing is moving and nothing is takeable: burn a beam on whatever is
    // down a diagonal. The throne is not a legal target while the court stands.
    if (stuck >= 3 && s.chamber >= 2 && s.mana >= 4) {
      let shot = null;
      for (const [dr, dc] of DIAG) {
        let r = w.r + dr;
        let c = w.c + dc;
        while (on(r, c)) {
          if (b.walls.some((x) => x.r === r && x.c === c)) break;
          const p = b.pieces.find((q) => q.r === r && q.c === c);
          if (p) {
            if (!(p.kind === "king" && guardsOf(b).length)) shot = p;
            break;
          }
          r += dr;
          c += dc;
        }
        if (shot) break;
      }
      if (shot) {
        say(`t${turns} beam ${shot.kind}`);
        await tapSpell(size, 2, bookSize(s.chamber));
        await tapCell(size, shot.r, shot.c);
        continue;
      }
    }

    if (steps.length) {
      await tapCell(size, steps[0].r, steps[0].c);
      await tapConfirm(size);
      continue;
    }
    say(`t${turns} hold — no quiet square`);
    await tapAside(size); // gather a mote of mana and take the hit
  }

  const alive = !!(await read());
  stats.push({ deepest, cleared: deepest - 1, captures, turns, alive });
  console.log(
    `run ${run + 1}: reached chamber ${deepest} (${deepest - 1} cleared), ` +
      `${captures} taken, ${turns} turns${alive ? " — alive at the turn cap" : " — died"}`,
  );
}

const cleared = stats.reduce((n, s) => n + s.cleared, 0);
const best = await game.page.evaluate(() => localStorage.getItem("playground:checkwiz:best"));
console.log(`\n${cleared} chambers cleared across ${RUNS} runs, deepest recorded: ${best ?? "—"}`);
console.log(
  `console errors: ${game.errors.length}${game.errors.length ? " — " + game.errors.join(" | ").slice(0, 300) : ""}`,
);

await game.close();
// Exit code means "the game broke", never "the bot played badly". How deep it
// got is stochastic — chambers are generated, and a bad roll of a first chamber
// can end a run honestly — so only a console error or a run in which not one
// piece was ever taken counts as a failure. Read the depth, don't gate on it.
const taken = stats.reduce((n, s) => n + s.captures, 0);
process.exit(game.errors.length || taken === 0 ? 1 : 0);
