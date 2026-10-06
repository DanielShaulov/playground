# Crownless — screens, interaction, look

The constraint behind everything here: **a phone in portrait, held in one
hand, operated by that thumb.** The top of the screen is for reading; the
bottom is for doing. Nothing is timed against your reflexes. Measurements
assume a 390 × 844 phone (iPhone 13) and must still work at 375 × 667.

## Contents

1. [Rules](#1-rules)
2. [Screen map](#2-screen-map)
3. [The world map screen](#3-the-world-map-screen)
4. [Sheets](#4-sheets)
5. [The battle screen](#5-the-battle-screen)
6. [Look](#6-look)
7. [Feel](#7-feel)
8. [Words](#8-words)

---

## 1. Rules

1. **Reach.** Everything tapped more than once a minute sits in the bottom
   45% of the screen. The top 44 px is the shared HUD (`shared/ui.js`):
   back link, day and time, gold, iron, horses. Read-only.
2. **Size.** Touch targets at least 44 × 44 px; primary actions 56 px tall.
   A squad or party smaller than that on screen gets a 44 px hit area around
   its marker.
3. **Tap, never gesture-only.** Tap selects, a second tap (or the button)
   confirms. Drag pans the map. Long-press (0.4 s) shows a tooltip and never
   acts. No pinch, no double-tap, no swipe that does something a button
   can't.
4. **One primary action** per moment, in the bottom-right corner (bottom-left
   in left-handed mode, which mirrors every bottom row).
5. **Sheets, not screens.** Menus are bottom sheets over the map: at most 78%
   tall, scroll natively, actions pinned along their bottom edge, **Back** a
   button in that row (not an ✕ in a top corner). Tapping the map above a
   sheet closes it.
6. **Never lose work.** Autosave after every action and every battle round.
   Closing the app mid-anything resumes exactly there.
7. **Resize-proof.** All geometry comes from a pure `layout.js` (as Checkwiz
   does), computed from the stage size every frame. The map camera lives in
   world coordinates and the battlefield scales to fit, so the iOS URL bar
   collapsing changes nothing.

## 2. Screen map

```
Title ─┬─ Continue ───────────────▶ World map ◀──────┐
       ├─ New campaign ─▶ setup ──▶ World map        │
       ├─ Skirmish ─▶ pick armies ─▶ Battle ─▶ result ┘(back to Title)
       ├─ Codex
       └─ Settings

World map ─┬─ tab: Army · Hero · Realm · Journal          (sheets)
           ├─ tap a place ─▶ Place sheet ─▶ Recruit / Tavern / Market …
           ├─ meet a party ─▶ Encounter sheet ─▶ Battle ─▶ Result sheet
           └─ events ─▶ Event sheet (the rising, a Regalia, a summons)
```

**Title.** Continue (if a save exists), New campaign, Skirmish, Codex,
Settings, and the best score per difficulty.

**New campaign.** Four choices on one scrolling sheet: map size, difficulty,
home culture (four cards with doctrine and trait), background (four cards),
banner colour; an optional seed. **Begin**.

**Skirmish** (M1's whole game, kept forever as practice): pick two armies from
presets or "random at worth N", a terrain, and fight.

**Codex.** Every troop with its stats, its worth and what it counters (from
the tables in `army.md` / `battle.md`); five cards on how battles work; the
map legend.

**Settings.** Left-handed; auto-pause events (each one toggleable); travel
speed; reduce motion; haptics.

## 3. The world map screen

```
┌──────────────────────────────────────┐
│ ‹   Day 14 · 09:00   🪙 412  ⚒ 6  🐎 3 │  HUD (shared shell), read-only
├──────────────────────────────────────┤
│                                      │
│        hex map, drag to pan          │
│                                      │
│     ⛫ Ashford       ◈ (you)          │
│        ·  ·  ·  ·  ·  ⋯ path         │
│                 ⚑ brigands 23        │
│                                      │
│ ╭ Valemark lords march on Greyford ╮ │  toast: read, not tapped
├──────────────────────────────────────┤
│ Ashford · town · 9 h      ⌖   [ Go ▶ ]│  context bar, 64 px
├──────────────────────────────────────┤
│  Map    Army    Hero    Realm   Log  │  tab bar, 56 px
└──────────────────────────────────────┘
```

- **Tap a hex**: select it. The path appears with a tick per 6 hours and the
  arrival time; the context bar says what's there and how long it takes.
  **Go** (or tapping the hex again) travels.
- **Travelling**: the context bar reads "To Ashford · 5 h left" with **Stop**.
  Travel also stops itself (`world.md` §2).
- **Tap a party**: its card — who, how strong next to you (a two-coloured bar
  and the worth numbers), what it seems to be doing (with Scouting), and
  **Follow** / **Attack** when they apply.
- **Tap yourself**: **Rest**, and **Besiege** or **Raid** when you're at an
  enemy's door.
- **⌖** recentres on you. **Tap the Map tab while on the map** for the
  overview: the whole realm fitted to the screen, territories coloured, tap
  anywhere to zoom back there.
- **Tabs** open sheets over the map: Army, Hero, Realm, Log (the Journal).

## 4. Sheets

Each wireframe is the sheet as it sits over the bottom of the map.

**Encounter**

```
┌──────────────────────────────────────┐
│ ⚑  Brigands of the Black Fen          │
│ hostile · 23 men · strength 18        │
│ you · 41 men · strength 34            │
│ ██████████████░░░░░░░  you ▸ them     │
│ Odds: Favourable (7 of 8)             │
│ You'd lose about 3 militia, 1 bowman  │
│ They're faster than you.              │
├──────────────────────────────────────┤
│ [ Pay 82 ]   [ Auto ]   [ ⚔ Fight ]   │
└──────────────────────────────────────┘
```

**Place** (a town)

```
┌──────────────────────────────────────┐
│ ⛫ Ashford · Valemark town             │
│ Lord Edric (relation +12) · walls 3   │
│ garrison strength 160                 │
├──────────────────────────────────────┤
│ Recruit        militia 6 · bowmen 4  ▸│
│ Tavern         2 companions, rumours ▸│
│ Contracts      2 offered             ▸│
│ Market         iron 30 · horses 40   ▸│
│ Smith          3 items               ▸│
│ Ransom broker  your 9 prisoners      ▸│
├──────────────────────────────────────┤
│ [ Back ]          [ Rest here ]       │
└──────────────────────────────────────┘
```

**Army**

```
┌──────────────────────────────────────┐
│ Army · 41 / 58 · wages 96 a week      │
│ morale 72 · 3 wounded · 6 prisoners   │
├─ Squad 1 · Infantry ─────────────────┤
│ 🛡 Militia      18  (+2 🩹)  ▓▓▓▓░    │
│                     [ ▲ Footman ×6 ]  │
│ 🛡 Levy          9            ▓▓▓▓▓   │
│                     [ ▲ ×9 ▾ ]        │  two branches: pick
├─ Squad 2 · Ranged ───────────────────┤
│ 🏹 Bowman       10            ▓░░░░   │
├─ Prisoners ──────────────────────────┤
│ 6 brigands         [ Sell ] [ Recruit ]│
├──────────────────────────────────────┤
│ [ Back ]   [ Squads ]   [ Garrison ]  │
└──────────────────────────────────────┘
```

A row is one troop type: icon, count, wounded, XP bar toward the next tier,
and the upgrade button that pays gold, iron and horses in one tap. **Squads**
switches to the grouping view: drag-free, tap a troop then tap a squad.

**Level up** is a modal of two big cards, the two skills on offer, and a line
saying which attribute rose. One tap picks.

**Hero**: level and XP, the four attributes, eight skill slots, the ability
slots, six equipment slots and three Regalia slots. Tap any of them for what
it does.

**Realm**: your role and renown; the factions (banner, ruler, your relation,
who is at war with whom); your fiefs; your lords if you rule; the Hollow
(strongholds held against the third that ends the realm); the Regalia.

**Log**: the Journal: events newest first, filterable (battles, politics,
money), and open contracts with **Show on map**.

## 5. The battle screen

```
┌──────────────────────────────────────┐
│ ‹   Round 3   Valor ●●●○○○        ⏸   │  HUD
├──────────────────────────────────────┤
│ ┄┄┄┄┄┄┄┄┄┄ enemy band ┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│   ⚑      ⚑        ⚑          ⚑       │
│  ▒▒▒▒  ▓▓▓▓▓▓   ▓▓▓▓▓▓      ░░       │
│        ⇣ (their intent, Tactics)      │
│                                      │
│          field 100 × 140 m           │
│          fits, never scrolls         │
│              ↑                       │
│  ⚑    ⚑▲     ⚑        ⚑              │
│  ▣▣  █████  █████   ░░░░             │
│ ┄┄┄┄┄┄┄┄┄┄ your band ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
├──────────────────────────────────────┤
│ [All] [Foot 34] [Spear 16] [Bow 29] ▸ │  squad chips
│ [Advance] [Hold] [Charge] [Back] [⋯]  │  orders for the selection
│ [Rally 3] [Loose 2] ⋯    [⏯] [ GO ▶ ] │  abilities, continuous, go
└──────────────────────────────────────┘
```

The bottom block is about 180 px. On a 390 × 844 phone that leaves the field
about 390 × 560 px: 3.9 px a metre, a 40-man squad about 58 × 23 px.

- **Select** with a chip or by tapping a squad on the field. **All** selects
  every squad of yours.
- **Order** with the middle row. **Advance** and **Charge** then take an
  optional tap on an enemy squad to target it. With a squad selected, tapping
  open ground means **Move there**.
- **⋯** holds the rest: formation, fire mode, cycle, skirmish, **Retreat**,
  **Auto finish**.
- **Go** plays three seconds; its ring fills while it does. **⏯** toggles
  continuous play, pausing on the events chosen in Settings.
- **Chips** show role, count, a morale bar, ⚠ wavering, ⚑ routing, and ammo
  pips. More than four chips scroll sideways.
- Every squad of yours draws an arrow to where it's going or what it's
  attacking. With Tactics, enemy intents show as red dashes.
- **Deployment** is the same screen with the band highlighted, formation
  presets in the order row, and **Begin** where Go will be.

## 6. Look

Everything is drawn in code on canvas, from a handful of shapes and the
palette in `shared/style.css`. No sprite sheets, no image files.

**Mockups** of the three main screens are in [mockups/](mockups/), drawn by
this section's rules: [the map](mockups/map.png), [a battle](mockups/battle.png)
and [the realm overview](mockups/overview.png). The battle is a real frame of
`theory/battle.mjs`, round 6 of a fight between about 180 men a side.
Regenerate them with `node docs/crownless/mockups/render.mjs`.

What the battle mockup showed: at 3.9 px a metre, 180 men a side read
clearly as squads, but the field still looks roomy, and the deployment bands
leave the bottom third empty once the lines have advanced. M1's phone check
should judge whether to shrink the field (say 80 × 112 m) or let the battle
camera follow the fighting.

**The map.** Muted, earthy hex fills that read on the dark UI, each with a
little seeded variation and a glyph:

| Terrain   | Fill      | Glyph                            |
| --------- | --------- | -------------------------------- |
| Plains    | `#6f8f4e` | none                             |
| Farmland  | `#8a9a52` | faint furrows                    |
| Steppe    | `#a39a5c` | sparse tufts                     |
| Forest    | `#2f5d3a` | clusters of small dark triangles |
| Marsh     | `#4d6b5a` | reed strokes                     |
| Hills     | `#7d7350` | two or three humps               |
| Mountains | `#6b6b72` | peaks with snow caps             |
| Water     | `#2b4c6f` | none; rivers as blue polylines   |
| Road      | —         | dashed `#c2a878` line            |
| Blight    | `#3c4a48` | teal speckle that creeps         |

Explored-but-unseen hexes sit under a 45% dark veil; unexplored ones are
`#1a1f2a` with a fine hatch.

**Places** are small drawn icons in the owner's colour: a walled ring with
towers (town), a keep (castle), three roofs (village), a broken crown
(Crownhold), a pick, a horseshoe, a coin (sites), a cave mouth (lair), a star
(shrine).

**Banners never rely on colour alone.** Each faction has a charge as well:
Valemark a chevron, Fenreach a tree, Kharum an anvil, Ulus a crescent, the
Hollow a broken crown, brigands crossed knives, beasts a paw, you a star on
the colour you chose. A party is a 26 px shield with its charge and its count
underneath; yours has a gold rim.

**The battlefield.** Grass with a few soft darker patches; terrain as soft
shapes (woods as clustered dark dots, a river as a band). Every soldier is a
mark 2.5–4 px across in his side's colour with a darker outline: a dot for
infantry, a dot with a short tick for spears, a smaller dot for archers, a
5 × 3 oval for horse, a big blob for a troll. Squads keep formation slots so
the marks stay in ranks as they move, and jostle a little in melee. Each
squad flies an 18 px pennant with its role glyph. Volleys are thin arcing
lines, one per four archers. The fallen leave small dark marks that fade over
ten seconds. A routing squad's men turn about, its pennant turns white, and
its colour drains.

**Type** is the system font; numbers are tabular.

## 7. Feel

- A **charge landing** puffs dust and shakes the field 2–3 px; haptic tick.
- A **rout** flashes the squad's pennant white; haptic tick.
- **Numbers float** off squads that take losses ("−6"), one per squad per
  round, so a round's story can be read at a glance.
- **Travel** animates parties smoothly between hexes; the clock in the HUD
  runs; the week's turn makes a small chime-less banner drop.
- **Reduce motion** drops shake, dust and floating numbers.
- **Odds and strength** are always shown as a word plus a number, never a
  number alone and never hidden.
- **Real feel can only be judged on a phone.** Headless checks prove the
  rules; thumb reach, tap accuracy on a moving squad and whether a round
  feels long are for a person holding one.

## 8. Words

Short, plain, a little dry. An event is at most two sentences. Buttons are
verbs. Numbers carry units. Nothing says "Are you sure?" except abandoning a
campaign and surrendering.

> The dead walk out of Crownhold. If they take a third of the realm's
> strongholds, the realm is theirs.

> Lord Edric's army is besieging Greyford. It falls in 6 days if no one comes.
