/**
 * Plays whole runs of Checkwiz in a real browser, from the title screen, on
 * real generated chambers, by tapping.
 *
 *     node tests/checkwiz/bot.mjs                  # a couple of runs
 *     RUNS=4 TRACE=1 node tests/checkwiz/bot.mjs   # move by move
 *
 * The moves come from policy.mjs — the same player the simulator uses — and
 * are turned into taps here. So this is not about how well it plays (sim.mjs
 * answers that, a thousand times faster); it is about whether the game people
 * touch survives being played: chambers that finish, drafts that open, souls
 * that can be aimed and spent, a console that stays clean on turn 300.
 *
 * Exits non-zero only on console errors or a run in which no move ever took
 * effect — how deep it gets is chance, and never a failure.
 */
import { openGame } from "./harness.mjs";
import { options, dangerMap } from "../../games/checkwiz/rules.js";
import { chooseAction, chooseRelic } from "./policy.mjs";

const RUNS = Number(process.env.RUNS ?? 2);
const CAP = Number(process.env.CAP ?? 250);
const TRACE = !!process.env.TRACE;

const game = await openGame();
const { read, tapCell, tapAside, tapMain, tapSlot, settle } = game;
const say = (...args) => TRACE && console.log("   ", ...args);
const stats = [];
let winsBefore = 0;

/** Perform one move the way a thumb would. */
async function perform(run, move) {
  const size = run.board.size;
  if (move.type === "wait") {
    const w = run.board.wizard;
    const costly = run.phase === "play" && dangerMap(run)[w.r][w.c] > 0;
    await tapAside(size); // Wait, or Skip during a free step
    if (costly) await tapMain(size); // standing in a line asks first
    return;
  }
  const o = options(run).find(
    (x) =>
      x.type === move.type &&
      x.r === move.r &&
      x.c === move.c &&
      (x.slot ?? -1) === (move.slot ?? -1),
  );
  if (move.type === "soul") await tapSlot(size, move.slot, run.slots);
  await tapCell(size, move.r, move.c);
  // Captures, and anything that costs life, wait for a yes.
  if (o && (o.target || o.cost > 0)) await tapMain(size);
}

for (let n = 0; n < RUNS; n++) {
  await game.newRun();
  await settle(600);
  let moves = 0;
  let stuck = 0;
  let last = "";
  let run = await read();
  const memory = new Map();

  for (; moves < CAP && run; moves++) {
    if (run.phase === "draft") {
      await settle(1500); // the fall plays out before the draft appears
      const pick = chooseRelic(run);
      say(`draft [${run.draft}] -> ${pick}`);
      await game.tapDraft(run.draft.indexOf(pick));
      memory.clear();
      run = await read();
      continue;
    }

    const move = chooseAction(run, memory);
    say(
      `ch${run.chamber} t${run.board.turn} hp ${run.hp} [${run.hand}]`,
      move.type === "wait" ? "wait" : `${move.type}${move.slot ?? ""} ${move.r},${move.c}`,
    );
    await perform(run, move);
    const next = await read();

    // Never spin without a turn passing. A refused tap leaves a panel open and
    // the next tap only dismisses it; a board frozen that way looks exactly
    // like a game bug, and once already it was a harness bug instead.
    const state = next ? `${next.chamber}/${next.board.turn}/${next.phase}/${next.hp}` : "over";
    if (state === last) {
      stuck++;
      if (stuck >= 3) throw new Error(`no move has taken effect in 3 tries at ${state}`);
      await tapAside(run.board.size); // dismiss whatever is open
    } else {
      stuck = 0;
    }
    last = state;
    if (next) {
      const at = next.board.wizard.r * 16 + next.board.wizard.c;
      memory.set(at, (memory.get(at) ?? 0) + 1);
    }
    run = next;
  }

  const [best, wins] = await game.page.evaluate(() => [
    localStorage.getItem("playground:checkwiz:best"),
    Number(localStorage.getItem("playground:checkwiz:wins") ?? 0),
  ]);
  const ending = run
    ? `alive in chamber ${run.chamber} at the move cap`
    : wins > winsBefore
      ? "took the Keep"
      : "died";
  winsBefore = wins;
  stats.push({ moves, alive: !!run });
  console.log(`run ${n + 1}: ${ending} after ${moves} moves · best ${best}`);
}

console.log(
  `console errors: ${game.errors.length}${game.errors.length ? ` — ${game.errors.join(" | ").slice(0, 300)}` : ""}`,
);
await game.close();
process.exit(game.errors.length || stats.every((s) => s.moves === 0) ? 1 : 0);
