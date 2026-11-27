# Screens

What the player sees and taps, and how the screen code is put together.
Read with [rules.md](rules.md) (what things mean) and [art.md](art.md) (how
they look). The interface kit (buttons, sheets, chips: every `hh-` class) is
in `ui/base.css` and shown on `ui-kit.html`.

## Principles

- **One thumb, lower half.** Everything tapped often sits in the bottom
  third. The top bar only tells you things. Nothing important in the top
  corners. Every target is at least 44 px.
- **The meadow is always the home.** Everything else is a sheet that slides
  up over it, or a full scene (the stall, the night card) that comes and goes.
- **Show the consequence before the commitment.** Placing a hive shows what
  honey it would make there. Taking jars shows what kind and how pure.
  Planting shows when it blooms. Nobody should have to guess a rule.
- **Never a dead tap.** A tap that cannot work says why, in a short toast,
  using the core's `why` code (`ui/words.js` has the sentences).
- **Quiet and warm.** Short lines, British spelling, no exclamation marks, no
  countdown pressure, no red alarms. A hive that needs something gets a small
  painted badge, not a siren.
- **Works at 320 × 568 and 430 × 932**, and on anything between, with the
  iOS safe areas respected. The page never scrolls; sheets scroll inside.

## The flow of a day

```
title ─▶ (first time: intro ─▶ make your beekeeper ─▶ choose a talent)
      ─▶ MEADOW, morning   plan: plant, move, harvest, craft, shop
              │ "Start the day"
              ▼
         MEADOW, day       bees fly ~60 s (or fast); harvest, care, catch swarms
              │ the sun sets by itself
              ▼
         MEADOW, evening   "To the stall" (or "Skip the stall")
              ▼
         STALL             customers one by one, then the grocer
              ▼
         NIGHT CARD        today in numbers, tomorrow's forecast and blooms
              │ "Sleep"
              ▼
         MEADOW, morning   next day
```

Winter has no flying: "Start the day" becomes "To the stall".
The first morning of each new year shows the year page first.

## The meadow screen

Top to bottom:

1. **Top bar** (informational chips): season and day ("Spring · day 3"),
   today's weather with tomorrow's small beside it, coins, renown stars. A
   thin **day arc** under it shows the sun crossing during the day phase.
2. **Plot header**: the plot's name with arrows either side (and swipe on the
   meadow) to move between plots. A plot you do not own is shown washed out
   with its price and a "Buy" button.
3. **The meadow canvas**: the 6 × 6 plot, square, as large as fits. Beds,
   trees, hives, the keeper, bees, weather, light of day.
4. **Hint line**: one short line of context under the meadow: what a selected
   thing is, or the open goal ("Next: harvest your first jar").
5. **Action bar** (the thumb's home): a row of five round painted buttons,
   **Seeds · Hives · Workshop · Book · More**, and above or beside them the
   one big primary button for the phase: **Start the day** / speed toggle /
   **To the stall**. "More" opens Calendar, Map, Goals, Wardrobe, Settings.
   Buttons with news wear a small badge (a claimable goal, an unread fact).

### Tapping the meadow

| You tap           | What happens                                                    |
| ----------------- | --------------------------------------------------------------- |
| empty grass       | the **seed tray** opens; pick a seed, then tap squares to plant |
| a bed             | the **bed sheet**                                               |
| a hive            | the **hive sheet**, and its reach lights up on the meadow       |
| a swarm           | catch it (if you hold a spare hive: choose where it goes)       |
| a raided hive     | fend the wasps off at once (no sheet)                           |
| tree, water, rock | a one-line toast saying what it is and what it is good for      |

**Planting is a brush.** Choosing a seed arms it: the tray shrinks to a strip
showing the seed, its price and your coins; squares you can plant on glow;
each tap plants one; "Done" puts the brush away. Squares that cannot take it
say why when tapped.

**Placing a hive** (buying, moving, splitting, catching a swarm) is a mode:
squares it can stand on glow. Tap one and the hive's ghost stands there with
its reach lit (strong ring, pale ring) and a forecast card: "Here today:
about 1.4 jars a day. 70% clover, 30% dandelion: meadow blend." Tap another
square to compare. "Put it here" confirms; "Cancel" backs out. This preview
is the heart of the game; it must be instant and readable.

### The hive sheet

- The hive's picture, its name ("Hive 2 · Box hive"), strength as a row of
  little bees (filled up to strength, outlined up to the type's limit).
- **Stores meter**: one bar, filled in segments coloured by source (each
  flower's honey colour, syrup grey), with the hive's capacity as its length
  and, from autumn, a tick at the winter need.
- **What it would bottle as**: "Pure lavender ★★ (93%)" or "Meadow blend
  (clover 55%, lavender 45%)".
- **Take jars**: a stepper from 0 to the jars in the hive, a line that says
  what is left for the bees ("leaves 3 jars; they need 2 for winter"), and
  the "Take 4 jars" button.
- **Care row** (only what applies): Move (mornings), Upgrade (with price),
  Feed syrup, Dust with sugar, Thyme remedy, Split.
- **Notes**: queen cells, mites, hungry, raided, moved today: one line each
  with what to do about it.
- **Today**: what it is gathering, by flower.

### The bed sheet

The bed's picture and flower name, a **bloom strip** (the 28 days of the year
as a row, the flower's window filled in its colour, today marked), nectar per
day, which hives reach it, and "Pick a bunch" (when allowed) and "Dig up"
(asks first).

### Seeds and the shop

The seed tray lists every seed you can buy: packet, name, price, bloom strip,
and one line about the honey ("pale gold, floral"). Locked seeds show what
unlocks them. The **Hives** button opens the hive shop: a new hive (then
placement), a spare hive, sugar syrup, thyme remedy, each with its price and
a line on what it is for.

## Other sheets

- **Calendar**: the year as 28 columns in four season bands; one row per
  flower you know, its bloom window drawn as a painted bar; today as a
  vertical line; the Honey Show and Winter Fair marked. Tapping a row tells
  you about that flower. This is the planning tool; it should be beautiful.
- **Map**: the four plots as painted thumbnails. Owned ones take you there;
  the others show price, what grows only there, and "Buy".
- **Goals**: up to three open goals with progress and a "Claim" button, then
  the renown ladder: where you are, what the next tier brings.
- **Bee book**: facts by topic. Found ones are little cards (title, text,
  "Sources" opening the list); the rest are closed cards hinting at when they
  open ("at your first swarm"). New ones are marked until read.
- **Workshop**: a card per recipe: what it needs, what you have, what it
  sells for today, "Make one". Crafts left today at the top. Soap asks which
  bunch; balm and the basket ask which honey.
- **Wardrobe**: the character creator again, without the talent.
- **Settings**: sound, reduced motion, default speed, save backup (copy a
  code, paste a code), start again (asks twice), credits.

## Full scenes

- **Title**: the logo over a painted meadow, "Continue" / "New game", a small
  settings button. A first-time player goes straight to the intro.
- **Intro**: three painted cards, a line or two each, tap to turn. You have
  been left a meadow and one old skep in Honey Hollow.
- **Make your beekeeper**: a large live preview of the figure; below it tabs
  (Body, Skin, Hair, Hair colour, Clothes, Hat, Extras) each a scrolling row
  of big swatches; a name field; a "Surprise me" button; then a second step
  with the four talents as cards. Every tap repaints the preview at once.
- **The stall**: your beekeeper behind a striped stall, the customer in front
  with a speech bubble for their wish. Below, your shelf: a grid of what you
  have (picture, name, stars, count, today's price, trait words). Pick an
  item, set how many (up to what they want), "Offer"; or "Nothing today".
  Their answer is a line and a face; delighted sales drop a heart. After the
  last customer the grocer's crate appears: steppers per product, "Sell all",
  and "Close the stall". On Honey Show evening the show comes first: choose
  up to three honeys, watch the judging, collect ribbons.
- **Night card**: a paper card over a night meadow: what each hive brought
  in, jars taken, coins in and out, hearts won; then **Tomorrow**: weather,
  what starts or stops blooming (with the warning to empty hives first when
  that would spoil a pure honey), hives that want attention; a new bee fact
  if one opened today. "Sleep".
- **The year page**: "A year in Honey Hollow": jars made, kinds found,
  ribbons, facts, friends; then credits ("An idea from Sari") and "Carry on".

## Teaching

No separate tutorial level. The first goals are the lessons, and each shows a
**keeper's note** (a slip of paper) pointing at the thing to tap. Notes never
block: tapping elsewhere dismisses them, and the Goals sheet always says what
to do next. New systems (the workshop, swarms, mites, the show, winter) each
get one note the first time they matter. The notes are written in
`ui/words/teach.js` and shown by `ui/teach.js`, which finds each anchor by
the class or `data-` attribute of the screen it points into: renaming one of
those breaks a lesson. Settings can bring every note back.

## How the code is put together

```
index.html      the page: three stylesheets, the loading card, ui/main.js
ui/main.js      boot: waits for the lettering, paints the interface
                (ui/chrome.js) behind the loading card, builds the app, loads
                the save, shows the title; a card with "Try again" if it
                cannot. Then starts the keeper's notes and the offline warm-up
ui/app.js       the spine (below): state, dispatch, saving, settings, scenes
                and sheets. The only file that imports the core
ui/layers.js    the page's layers and what lives in them: the loading card,
                toasts, confirm cards, keeper's notes, the back button
ui/shell.css    lays the layers out; the scene root, the sheet, the cards
ui/dom.js       tiny helpers: el(), on(), css(), optional()
ui/words.js     the shared words: why-codes, formatters (coins, jars, stars,
                day labels), the spine's and the settings sheet's sentences
ui/words/       every other sentence, one module per area (meadow, the
                meadow's sheets, market, night, planning, book, workshop,
                keeper, teach). "Words we use" in README.md is the glossary
ui/teach.js     the keeper's notes (one per lesson, anchored to the thing to
                tap) and the herald (one toast for news nobody else announces)
ui/audio.js     synthesised sounds and ambiences; app.sound("coin")
ui/fx.js        coins flying, hearts, sparkles; nothing under reduced motion
ui/offline.js   asks once for every scene, sheet and stylesheet so the site's
                service worker has them for a day without signal
ui/paint/       the watercolour engine and the sprite cache (sprite.js: an
                LRU with a byte budget; drop(prefix) forgets one family)
ui/art/         everything painted: flowers, scenery, ground, hives, jars,
                goods, icons, people, creatures, sky, the interface pieces
ui/meadow/      the meadow screen: canvas scene, input, modes, bars, bees
ui/sheets/      index.js (the registry) and one module per sheet
ui/scenes/      index.js (the registry) and one module per scene: title,
                intro, creator, stall (with its art, crate and show), night,
                year, placeholder
ui/keeper-picker.js  the beekeeper maker's preview and swatches, shared by
                the creator scene and the wardrobe sheet
ui/bloom-strip.js    the painted bar that shows when a flower blooms, shared
                by the seed tray, the bed sheet and the calendar
ui/base.css     the kit (tokens, hh- components); each screen adds its own
                stylesheet beside its module and loads it with css()
art-gallery.html, ui-kit.html, audio-test.html
                pages for looking at the art, the kit and the sounds; the
                game does not link to them
```

The page is one fixed, non-scrolling `#hh-app` holding layers, bottom to top:
the scene, the sheet (with its scrim), confirm cards, keeper's notes, toasts,
fx, the loading card. Notes, toasts and fx never take a tap.

### `app` (ui/app.js)

One object every module imports (`import { app } from "../app.js"`).

- `app.state` the current game state (never mutate it).
- `app.core` the core module.
- `app.dispatch(action)` → `events`. Steps the core, saves (debounced),
  then calls every subscriber. Rejections come back as events too, and are
  toasted by default in the words of `say(why)`
  (`app.dispatch(action, { quiet: true })` to handle them yourself). A
  dispatch made from inside a subscriber is applied at once and returns its
  events, but its round of calls waits until the round in progress is done.
  A subscriber that throws is logged and stops nobody else.
- `app.on(fn)` → `off`; `app.off(fn)`. `fn(state, events, action)` after
  every dispatch.
- `app.go(scene, params)` → Promise of boolean. Switches the full scene:
  `"title" | "intro" | "creator" | "meadow" | "stall" | "night" | "year"`,
  with a short cross-fade (none under reduced motion).
- `app.sheet(name, params)` → Promise of boolean. Opens a bottom sheet over
  the current scene (one at a time; opening another replaces it);
  `app.closeSheet()`; `app.sheetTitle(text)`. The scrim, the cross, a swipe
  down on the handle, Escape and the back button all close it.
- `app.toast(text, { icon, sound })` (at most two up, one while a sheet is
  open, shown above the sheet; about 2.6 s each; a line with no room waits
  its turn),
  `app.confirm({ title, text, yes, no, danger })` → Promise of boolean,
  `app.note(id, { text, anchor, place, again })` for keeper's notes: `anchor`
  is an element, a selector, a point or a rectangle; a note shows once per id
  per save and the next tap anywhere puts it away without being swallowed.
  `app.dismissNote()` puts the note away; `app.forgetNotes()` lets every note
  show again (Settings, "Keeper's notes").
- `app.settings` (`sound`, `motion`, `speed`), kept under their own store
  key, with `app.setSetting(key, value)`. `motion` is `false` when the player
  or the phone asks for reduced motion; the root element then carries
  `data-motion="calm"` and shell.css stills every animation and transition.
- `app.sound(name, opts)`, `app.ambience(name)`, `app.fx(name, opts)`
  (`"coins" | "hearts" | "sparkle" | "pop"`; coins fly to the element marked
  `data-fx="coins"`). The spine itself plays `tap` for every button (a button
  names another with `data-sound="harvest"`, or `"none"`), `open` and `close`
  for sheets, `toast` for toasts and `nope` for refusals.
- `app.ui` scratch state the screens share that is not part of the game:
  `plot`, `mode`, `selected` (see "Shared UI state" below), plus `scene` and
  `sheet` (what is up) and `paused` (true while a sheet or a confirm card is
  open). Change it with `app.setUi(patch)`, which tells every screen.
- `app.progress(0..1)` moves the loading card's bar from an async `mount`.
- Saves: `app.newGame()`, `app.load()`, `app.reset()` (new game, then the
  title), `app.exportSave()` → a backup code, `app.readSave(text)` → the
  state in a code or `null`, `app.importSave(text)` → boolean, `app.save()`.
  A save that will not open at boot is kept under `save-broken` and a new
  game starts.
- `app.ready` resolves once the first scene is up.

A scene or sheet is a module exporting
`mount(root, params) → { update?(state, events, action), unmount?() }`
(`mount` may be async; while it runs for long the loading card shows). It
builds its DOM once into `root`, and `update` runs after each dispatch while
it is up. `update` and subscribers are also called with no events and a
made-up action when something other than the game changed: `{ type: "@ui" }`
(`app.setUi`, or a sheet opened or closed), `{ type: "@replace" }` (the whole
state was swapped) and `{ type: "@settings", key, value }`. Modules are
registered by name in `ui/scenes/index.js` and `ui/sheets/index.js`; `app.go`
and `app.sheet` look names up there, so two people adding screens touch one
line each. A name that is not registered toasts "Not built yet" and changes
nothing.

A scene's `root` is the whole page, already padded in from the notch and the
home bar. A sheet's `root` is the sheet's scrolling body: the spine builds
the paper, handle, title row and close button round it (the title is the
module's `title` export, or `app.sheetTitle`), and a footer that must stay
put goes after the body (`root.after(foot)`).

`index.html?scene=<name>` and `?sheet=<name>` jump straight to a screen;
every other query value is handed to `mount` as `params`.

### Time

The meadow screen owns the clock while the phase is `day`: it accumulates
real time and dispatches `tick { n }` in whole ticks (4 a second, 12 when
fast), and it stops while `app.ui.paused` is true or the tab is hidden, so
nothing is missed by reading. Saving happens at most once a second, and at
once on `pagehide` and when the page is hidden.

### Test hook

`window.__hollow = { app, state (get/set), dispatch, core, squareRect(plot,
x, y), meadow, ready }`. Browser flows seed a state through it rather than
playing to a position: setting `state` runs it through `loadSave` and draws
the current scene afresh. `squareRect` is `null` until the meadow fills it
in; `meadow` holds the meadow's own counters (bees out, frame rate, draws).
The flows live in `tests/honey-hollow/browser/` (`run.mjs`, one module per
flow, every selector and button name in `helpers.mjs`); they play a small
and a large phone and leave a gallery of screenshots in `shots/`.

## Shared UI state (the contract between the meadow and the sheets)

`app.ui` is how a sheet asks the meadow to do something; change it with
`app.setUi(patch)`.

- `app.ui.plot`: the plot showing (`"home" | "pond" | "orchard" | "hill"`).
- `app.ui.selected`: `null | { kind: "hive", id } | { kind: "square", plot,
x, y }`. While a hive is selected the meadow lights its reach.
- `app.ui.mode`: `null`, or
  - `{ type: "plant", flower }`: the planting brush. The meadow shows the
    brush strip, lights plantable squares, plants on each tap, and clears the
    mode on "Done".
  - `{ type: "place", what: "buy" | "move" | "split" | "catch", hive?,
swarm? }`: choosing where a hive goes. The meadow lights the squares it
    may stand on, shows the ghost, its reach and the forecast card, and on
    "Put it here" dispatches `buyHive` / `moveHive` / `split` / `catchSwarm`
    and clears the mode. A sheet that wants a hive placed sets this mode and
    closes itself; the meadow does the rest.

Sheets and their params: `hive { hive }`, `bed { plot, x, y }`,
`seeds { plot?, x?, y? }`, `hives` (the hive shop), `workshop`, `book
{ fact? }`, `goals`, `map`, `calendar { flower? }`, `more`, `wardrobe`,
`settings`. Scenes: `title`, `intro`, `creator`, `meadow`, `stall`, `night`,
`year`.
