/**
 * Screenshots of every Checkwiz screen whose text or numbers can overflow, on
 * the tallest and the shortest phone worth caring about.
 *
 *     node tests/checkwiz/shots.mjs   # writes tests/checkwiz/shots/*.png
 *
 * Assertions cannot see a sentence running off the bottom of the screen. This
 * caught two real ones: the codex lost its last card behind the buttons on a
 * 320-wide phone, and the piece tips were being clipped mid-word by the two
 * line clamp in the action bar. Both looked completely fine on a big screen.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, makeRun, piece, KEY } from "./harness.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
await mkdir(OUT, { recursive: true });

for (const device of ["iPhone 13", "iPhone SE"]) {
  const label = device.replace(/\s+/g, "-").toLowerCase();
  const game = await openGame({ device });
  const { page, layout, tap, settle, tapCell, tapAside, resume } = game;
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}-${label}.png`) });

  // The codex, page by page. Each has to fit above the buttons on its own.
  const L = layout(6);
  const nextPage = () => tap(L.pad + (L.W - L.pad * 2 - 10) / 4, L.H - 44);
  await tap(L.W / 2, L.H * 0.17 + 160 + 68 + 26); // "How to play"
  await settle(300);
  await shot("codex-court");
  await nextPage();
  await settle(300);
  await shot("codex-spells");
  await nextPage();
  await settle(300);
  await shot("codex-rules");
  await tap(L.pad + (L.W - L.pad * 2 - 10) * 0.75 + 10, L.H - 44); // Back
  await settle(300);

  // A board carrying every weight of threat at once: a queen's squares show
  // three ticks, a rook's two, a pawn's one, and the throne rings as held.
  await resume(
    makeRun({
      chamber: 4,
      hp: 5,
      maxHp: 6,
      mana: 8,
      captures: 3,
      size: 7,
      turn: 9,
      wizard: { r: 5, c: 4 },
      pieces: [
        piece(1, "king", 1, 2),
        piece(2, "queen", 3, 1),
        piece(3, "rook", 2, 5),
        piece(4, "pawn", 4, 3),
      ],
    }),
  );
  await shot("board");

  // Inspecting a piece — the tip has two lines and must not clip mid-word.
  await tapCell(7, 3, 1);
  await shot("inspect-queen");
  await tapAside(7);

  // Aiming a beam with the throne on the diagonal: it draws barred, not absent.
  await game.tapSpell(7, 2, 4);
  await shot("aim-beam");

  await game.close();
  void KEY;
}

console.log(`screenshots written to ${OUT}`);
