# Architecture

The shape the Milestone 0 core split moves the demo to. The thread that lands
a change to this shape updates this file in the same PR.

## The idea

All game rules sit in a pure, seeded core that owns one plain JSON state
object. The screens never change the state themselves: a tap becomes an
action, the core applies it, and the screens redraw from the new state and the
events it returned.

```
tap ──▶ action ──▶ core.step(state, action) ──▶ { state, events } ──▶ ui redraws
                                │
                     createStore("ferment") saves state as JSON
```

Because nothing outside the core changes the game, the Node tests cover every
rule, and a seed plus a list of actions replays any game exactly. That is how
a bug gets reproduced without a person.

## The pieces

- **`step(state, action)`** is the one entry point. Player inputs and the
  passing of time are both actions.
- **A fixed-step clock.** The open shop advances in fixed slices of in-game
  time. The screen accumulates real time and dispatches whole slices, so a
  fast and a slow phone play the same game.
- **Named random streams.** Customers, the market and jars each draw from
  their own seeded stream, so adding a draw to one system does not reshuffle
  the others and break unrelated tests.
- **State slices.** Each system owns one part of the save (`shelf`, `bench`,
  `orders`, `market`, `progress`) with its own defaults. Loading fills in any
  missing slice, so parallel PRs never fight over a save version number.
  Until release a save that can't be read simply starts a fresh game.
- **Content as data.** Recipes, ingredients, regulars and upgrades are rows in
  `content/`. Adding a recipe is adding a row, not touching logic.
- **DOM and inline SVG, not canvas.** The game is jars, panels and buttons:
  SVG jars stay crisp on any phone, and tests tap real elements.

## Tests that lean on this shape

| Layer                 | Catches                                                                               | Lives in                 |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| Rule tests            | A single rule is wrong (pay, ripening, due dates)                                     | `tests/ferment/core/`    |
| Replay goldens        | Anything that changed how a recorded game plays out                                   | `tests/ferment/core/`    |
| Invariant fuzzing     | Impossible states: negative coins, a jar in two slots, a save that doesn't round-trip | `tests/ferment/core/`    |
| Purity check          | `Math.random`, `Date` or DOM inside the core                                          | `tests/ferment/core/`    |
| Balance sim           | The game got too easy or too hard (Milestone 3)                                       | `tests/ferment/sim/`     |
| Phone flows + gallery | The real screen breaks or overflows on a small or large phone                         | `tests/ferment/browser/` |
| Type check            | A wrong field name across modules                                                     | `npm run typecheck`      |
