/**
 * Screenshots of every Checkwiz screen whose text or numbers can overflow, on
 * the tallest and the shortest phone worth caring about.
 *
 *     node tests/checkwiz/shots.mjs   # writes tests/checkwiz/shots/*.png
 *
 * Assertions cannot see a sentence running off the bottom of the screen. This
 * is the check for that: codex pages that lose their last card behind the
 * buttons on a 320-wide phone, tips clipped mid-word in the action bar. Both
 * look completely fine on a big screen. Look at the pictures.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, makeRun, piece } from "./harness.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
await mkdir(OUT, { recursive: true });

for (const device of ["iPhone 13", "iPhone SE"]) {
  const label = device.replace(/\s+/g, "-").toLowerCase();
  const game = await openGame({ device });
  const { page, settle, tapRect, tapCell, tapAside, tapSlot, resume, codex } = game;
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}-${label}.png`) });

  await shot("title");

  // The codex, page by page. Each has to fit above its buttons on its own.
  await tapRect(
    game.titleButtons(false).find((b) => b.id === "codex"),
    300,
  );
  await shot("codex-court");
  await tapRect(codex.next, 300);
  await shot("codex-souls");
  await tapRect(codex.next, 300);
  await shot("codex-rules");
  await tapRect(codex.next, 300);
  await shot("codex-relics");
  await tapRect(codex.back, 300);

  // The first chamber, as a new player meets it.
  await game.newRun();
  await settle(2400); // let the chamber banner clear
  await shot("chamber-1");

  // A deep board carrying everything at once: pillars, a stone, a guarded
  // throne, a queen's three-point lines, a full hand and a row of relics.
  const deep = makeRun({
    chamber: 9,
    hp: 5,
    maxHp: 8,
    slots: 4,
    hand: ["knight", "bishop", "rook", "queen"],
    relics: { outpost: 1, tempo: 1, stalemate: 1, pockets: 1 },
    size: 8,
    turn: 9,
    wizard: { r: 6, c: 4 },
    pillars: [
      { r: 3, c: 2 },
      { r: 4, c: 6 },
    ],
    stones: [{ r: 5, c: 1, life: 2 }],
    pieces: [
      piece(1, "king", 1, 3),
      piece(2, "pawn", 0, 2, { guard: true }),
      piece(3, "rook", 1, 6, { guard: true }),
      piece(4, "queen", 3, 0),
      piece(5, "bishop", 2, 5),
      piece(6, "knight", 5, 5),
      piece(7, "pawn", 2, 1),
    ],
  });
  await resume(deep);
  await settle(2400);
  await shot("board");

  await tapCell(8, 3, 0); // inspect the queen: her tip must not clip
  await shot("inspect-queen");
  await tapAside(8); // the whole row puts it away

  await tapSlot(8, 0, 4); // aim the Leap
  await shot("aim-leap");
  await tapAside(8);

  await tapCell(8, 5, 5); // a held knight, selected: the confirm and its price
  await shot("confirm-take");

  // The draft, with a Sovereign just taken — three relic blurbs to fit.
  await resume(
    makeRun({
      chamber: 7,
      hp: 3,
      relics: { tempo: 1 },
      size: 7,
      pieces: [piece(1, "king", 1, 2), piece(2, "knight", 6, 6)],
      wizard: { r: 2, c: 3 },
    }),
  );
  await tapCell(7, 1, 2);
  await game.tapMain(7);
  await settle(1800);
  await shot("draft");

  await game.close();
}

console.log(`screenshots written to ${OUT}`);
