# Honey Hollow

A cosy beekeeping game for a portrait phone, from an idea by Sari. You make
your own beekeeper, plant a meadow, stand hives in it and sell the honey. The
game lives in `games/honey-hollow/`.

This folder is the design notes for the Claudes who build it. No person reads
the code, so these notes and the tests are how one Claude hands work to the
next.

- [rules.md](rules.md): how the game plays, in words, with the numbers.
- [architecture.md](architecture.md): how the code is shaped, the core API,
  the state, the paint engine.
- [art.md](art.md): the look, and how to paint a new piece so it matches.
- This file: what the game must be, and the conventions every change follows.

## What the game must be

Hadash asked for a finished, polished game and left every decision to us. The
person it is for is Sari, and she said three things, which outrank any other
taste call:

1. **The look.** "A different style of illustration, more whimsical and
   pretty, more watercolor style." Soft washes, pastel colour, hand-drawn
   edges, paper. Never flat vector, never technical.
2. **The character.** "Make an option for a man or woman", and the hair must
   look good: full, soft, several styles. Thin hair was her first complaint.
3. **Bees and wax.** "Fun facts about bees and an option for candle making,
   soaps etc." The facts must be true and sourced.

And three things we promised in the design:

- Time only moves while you play. No waiting, no timers.
- You cannot lose the farm.
- It is its own game, not a second Brine Nook: the puzzle is _where things
  stand and when they bloom_, not when to sell a jar.

## Conventions

- **Phone first.** Portrait, one thumb. Touch targets at least 44 px.
  Everything you tap often sits in the lower half. Test at 320 × 568 (iPhone
  SE) and 430 × 932 (iPhone 15 Pro Max).
- **No build step, no runtime dependencies.** Plain ES modules. Fonts are
  vendored files with their licence beside them.
- **The core is pure.** Rules go in `core/`, numbers in `content/`, and the UI
  only dispatches actions. If the UI needs to know something, add a read-only
  helper to the core; do not re-derive a rule in a screen.
- **Saves are kept.** Go through `createStore("honey-hollow")`, never raw
  `localStorage`. `loadSave()` must accept every save an earlier build wrote.
- **Words.** Plain, warm, short. British spelling ("colour"). No exclamation
  marks in ordinary lines. Never talk down. Rule text shown to the player
  lives in `content/words.js` or beside its data row, not inline in a screen.
- **A check you have never seen fail proves nothing.** Break the rule a new
  test guards and watch it go red before trusting it.
- **Look at what you made.** Every screen and every painted piece is checked
  in a screenshot at both phone sizes before it is called done.

## Testing

`npm test` runs everything the PR gate runs.

| Command                             | What it does                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `npm run test:honey-hollow`         | every `tests/honey-hollow/core/**/*.mjs` under `node --test` |
| `npm run test:honey-hollow:sim`     | bots play whole years; prints the balance report             |
| `npm run test:honey-hollow:browser` | phone flows on a small and a large phone                     |
| `npm run typecheck`                 | `tsc` over files that start with `// @ts-check`              |

Chromium is at `/opt/pw-browsers/chromium` in agent sessions; never run
`playwright install`. Browser egress is blocked there, so nothing may load
from the network at run time.

## Words we use

One word for one thing, in every file the player reads. Player text uses
curly quotes (’ “ ”), digits for numbers, and no dashes or semicolons.

| Word                      | What it means, and what we do not call it                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| hive                      | The home. Four kinds: straw skep, box hive, double box, tall stack. "Kinds of hive", never "types".      |
| colony                    | The bees that live in a hive. A colony has strength. A hive holds jars.                                  |
| spare hive                | An empty hive kept for a swarm or a split.                                                               |
| upgrade                   | Move a colony into the next kind of hive. Not "a bigger hive".                                           |
| door                      | Where bees go in and out, as the bee book says. Not "entrance".                                          |
| nectar                    | What a bed offers each day in bloom. 10 nectar fill a jar.                                               |
| stores                    | Everything a hive holds, said in jars. "In the hive", not "in the comb".                                 |
| comb                      | The wax cells themselves. Only for colour (one keeper's note, the bee book), never for an amount.        |
| jar, take                 | Honey is counted in jars and you take jars. Not "harvest", "bottle" or "jar" as a verb.                  |
| pure honey                | 80% or more from a single flower. Named for the flower: "clover honey".                                  |
| meadow blend              | Any other jar. Always both words.                                                                        |
| stars                     | ★, ★★, ★★★ as glyphs. Not "three-star".                                                                  |
| lost                      | Nectar that does not fit in a full hive. Not "wasted".                                                   |
| beeswax                   | The whole word, except in "wax wraps" and the bee book's narrow "Wax" tab.                               |
| bunch, pick               | A bunch of lavender, water mint or wild thyme is picked. Not "cut".                                      |
| sugar syrup               | Counted in portions. "Syrup" alone only where room is short.                                             |
| thyme remedy              | 1 thyme remedy, 2 thyme remedies. You give it to a hive.                                                 |
| dust with sugar           | The free daily care for mites.                                                                           |
| queen cells, swarm, split | A colony that has outgrown its hive builds queen cells, then swarms. A split or an upgrade stops it.     |
| seed, seed tray           | 1 seed plants 1 bed. The sheet is the seed tray, its button "Seeds". Not "packet" or "seed shop".        |
| hive shop                 | Where hives, spare hives, sugar syrup and thyme remedy are sold. Never "the shop" alone.                 |
| bed, square, plot         | A bed holds one flower on one square. A plot is 6 × 6 squares.                                           |
| reach                     | The squares a hive gathers from: "within 2 squares", "in reach".                                         |
| plot names                | Home Meadow, Pond Bank, Old Orchard, Heather Hill. In a sentence: "the Pond Bank", but "Heather Hill".   |
| the Hollow                | Short for Honey Hollow.                                                                                  |
| day wording               | "Spring · day 3" as a label, "Spring 3" on a narrow chip, "winter day 4" in a sentence.                  |
| weather                   | Sunny, cloudy, windy, rain, snow, frost: good, fair, slow or hardly any flying, or "the bees stay in".   |
| the stall                 | Where you sell in the evening. "Market" only in a tier's name and in the regulars' talk.                 |
| your shelf                | What you have to sell: jars and things made.                                                             |
| customer, regular         | Anyone at the stall is a customer. The eight villagers are regulars. "A visitor" is only a nameplate.    |
| wish, delighted           | A customer has a wish. Offer exactly that and they are delighted.                                        |
| heart, gift               | A delighted regular fills a heart. Hearts bring a gift. Not "present", except in a customer's own words. |
| the grocer                | Buys anything left, for less. The sheet is "the grocer's crate".                                         |
| the workshop, make        | You make things there: "Make 3 more today". Not "craft" or "the bench".                                  |
| the show bench            | Where jars stand at the Honey Show.                                                                      |
| ribbon                    | Bronze, silver or gold, from the Honey Show.                                                             |
| renown                    | What delighted customers, goals and ribbons earn. Tier names go in quotes: “Known at the market”.        |
| goal, claim               | A goal is met, then its reward is claimed. Not "collect".                                                |
| keeper's notes            | The short notes that teach. Not "slips" or "tips".                                                       |
| bee book, page, chapter   | The book of bee facts. A fact is a page, a topic is a chapter.                                           |
| the day's diary           | The card that ends a day.                                                                                |
| almanac                   | The page that ends a year.                                                                               |
| beekeeper                 | The player's character. "Keeper" only in "keeper's notes".                                               |
| wardrobe, talent          | Where the beekeeper changes clothes, and the one gift chosen at the start.                               |
| have                      | "You have 3." Not "hold" or "keep", which are for hives ("holds 10 jars").                               |
| coins                     | The only money: "1 coin", "12 coins".                                                                    |
