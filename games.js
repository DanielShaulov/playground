/**
 * The game registry. Add an entry here and it shows up on the home screen.
 * `scripts/new-game.sh` appends to this automatically.
 *
 * id       — folder name under games/
 * title    — shown on the launcher tile
 * blurb    — one line of "what is this"
 * icon     — an emoji, used as the tile art
 */
export const GAMES = [
  {
    id: "tap-rush",
    title: "Tap Rush",
    blurb: "Hit every target before the clock runs out.",
    icon: "🎯",
  },
  {
    id: "stack",
    title: "Stack",
    blurb: "Drop blocks to build a tower. Miss and it narrows.",
    icon: "🧱",
  },
];
