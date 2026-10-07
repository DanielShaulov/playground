# Crownless — troops, cultures, the hero

What you fight with and who you are. Battle mechanics these numbers feed are in
[battle.md](battle.md); where troops are recruited and what the economy around
them looks like is in [world.md](world.md).

## Contents

1. [The troop tree](#1-the-troop-tree)
2. [Troop stats](#2-troop-stats)
3. [Prices, wages, XP](#3-prices-wages-xp)
4. [Cultures and factions](#4-cultures-and-factions)
5. [The Hollow, brigands, beasts](#5-the-hollow-brigands-beasts)
6. [The hero](#6-the-hero)
7. [Skills](#7-skills)
8. [Equipment](#8-equipment)
9. [Companions](#9-companions)

---

## 1. The troop tree

One tree shape for everyone. Cultures differ in which branches they have, a few
±1 stat tweaks, one elite at tier 5, and a passive trait (§4). Fewer, clearer
troops beat Mount & Blade's forty-odd per culture on a phone.

```
Levy (1) ─┬─▶ Militia (2) ─┬─▶ Footman (3) ──▶ Man-at-arms (4) ──▶ Hearthguard (5) · Kharum
 villages │                └─▶ Spearman (3) ─▶ Pikeman (4)
          └─▶ Bowman (2) ───▶ Archer (3) ──┬─▶ Longbowman (4) ──▶ Warden (5) · Fenreach
                                           └─▶ Crossbowman (4)

Squire (2) ──▶ Horseman (3) ─┬─▶ Knight (4) ───────▶ Banner Knight (5) · Valemark
 castles                     └─▶ Horse archer (4) ─▶ Keshig (5) · Ulus
```

Where they come from: **levies** from villages, **militia and bowmen** from
towns, **squires** from castles (and Ulus towns), tier-3 recruits from a town
or castle with a **Barracks**. Everything above that is earned by upgrading
with XP. Mercenary camps sell tier 3–4 troops of any culture at a premium
(`world.md`).

Holding a settlement of another culture lets you recruit its tree there: take
an Ulus town and you can raise horse archers. That is the HoMM "capture a town
of another faction" pleasure, and the main reason to want a particular castle.

## 2. Troop stats

These are the stats in `games/crownless/rules/data/troops.js`, and every
number in the worth column comes from `tests/crownless/battle-sim.mjs`
(`battle.md` §10.1). Change one, rerun `npm run test:crownless:sim -- worth`,
and paste the line it prints into `WORTH` in `troops.js`.

`dmg` is melee damage per fighting man per round; `mdmg` per missile that
hits. Speed is metres per second on the battlefield. Shields are the share of
frontal missile damage blocked when not in melee. Every ranged troop reloads
in 3 s unless its line says otherwise.

| Troop         | T   | Role   | hp  | atk | def | dmg | armour | shield | speed | morale | special                                                       | worth |
| ------------- | --- | ------ | --- | --- | --- | --- | ------ | ------ | ----- | ------ | ------------------------------------------------------------- | ----- |
| Levy          | 1   | inf    | 22  | 2   | 2   | 5   | 0      | —      | 4.5   | 50     |                                                               | 0.56  |
| Militia       | 2   | inf    | 26  | 3   | 3   | 6   | 1      | 0.3    | 4.5   | 60     |                                                               | 0.89  |
| Bowman        | 2   | ranged | 22  | 1   | 1   | 4   | 0      | —      | 4.5   | 52     | range 60, mdmg 7, acc .5, 10 volleys                          | 1.07  |
| Squire        | 2   | horse  | 30  | 4   | 2   | 6   | 1      | 0.2    | 10    | 58     | charge 6                                                      | 1.57  |
| Footman       | 3   | inf    | 30  | 5   | 4   | 7.5 | 2      | 0.4    | 4.5   | 66     |                                                               | 1.29  |
| Spearman      | 3   | spear  | 30  | 3   | 5   | 4.5 | 2      | 0.3    | 4.3   | 66     | reach 2, antiCav 2, braces                                    | 1.39  |
| Archer        | 3   | ranged | 25  | 2   | 2   | 5   | 1      | —      | 4.5   | 58     | range 70, mdmg 8, acc .55, 12 volleys                         | 1.55  |
| Horseman      | 3   | horse  | 36  | 5   | 3   | 7   | 2      | 0.3    | 10    | 66     | charge 8                                                      | 2.39  |
| Man-at-arms   | 4   | inf    | 35  | 6   | 7   | 9   | 4      | 0.45   | 4.2   | 72     |                                                               | 1.82  |
| Pikeman       | 4   | spear  | 34  | 4   | 6   | 5   | 3      | —      | 4.0   | 72     | reach 2, antiCav 2.4, braces                                  | 1.65  |
| Longbowman    | 4   | ranged | 28  | 3   | 3   | 6   | 1      | —      | 4.5   | 64     | range 90, mdmg 9.5, acc .6, 14 volleys                        | 2.35  |
| Crossbowman   | 4   | ranged | 30  | 2   | 4   | 5   | 3      | —      | 4.0   | 64     | range 75, mdmg 13, acc .65, reload 4.5 s, 12 bolts, pierce .6 | 2.05  |
| Knight        | 4   | horse  | 44  | 6   | 5   | 8   | 5      | 0.5    | 9     | 76     | charge 12                                                     | 3.86  |
| Horse archer  | 4   | h.arch | 34  | 3   | 3   | 5   | 2      | —      | 11    | 64     | range 60, mdmg 7.5, acc .5, 14 volleys, shoots moving         | 2.06  |
| Hearthguard   | 5   | inf    | 40  | 7   | 8   | 10  | 5      | 0.5    | 4.0   | 80     | Kharum                                                        | 2.42  |
| Warden        | 5   | ranged | 30  | 4   | 4   | 6.5 | 2      | —      | 4.5   | 70     | range 100, mdmg 11, acc .65, 16 volleys · Fenreach            | 3.09  |
| Banner Knight | 5   | horse  | 50  | 7   | 6   | 9   | 6      | 0.5    | 9     | 84     | charge 16 · Valemark                                          | 5.59  |
| Keshig        | 5   | h.arch | 40  | 5   | 5   | 7   | 4      | —      | 11    | 74     | range 65, mdmg 9, acc .55, 16 volleys · Ulus                  | 2.90  |

**How the tiers were built.** Each tier step is roughly +1 atk, +1 def and
+15% hp and damage on the role's base (more where the role leans: footmen
+2 atk, men-at-arms +3 def), which compounds to about ×1.5 fighting power per
man. Roles then skew it: spears trade damage for a second fighting rank and
antiCav; ranged trade melee for range; horse carry most of their hp on the
horse and most of their damage in the charge. The first hand-written table
jumped several factors at once between tiers and produced a knight worth 7
militia; tuning against the model to a formula is what made the ladder even.

**Worth is a duel number** and only places a troop among its peers: it
underrates heavy infantry, whose value is standing in front of everyone else.
Prices are checked against gold and men together (`battle.md` §10.4, rule 1 of
§10.9).

## 3. Prices, wages, XP

Foot are priced by tier. Mounted troops cost about 1.8× their tier in gold and
pay double wages: the first draft priced them like foot, and at equal gold the
knights army beat everything (`battle.md` §10.4). `PRICE` in
`tests/crownless/battle-sim.mjs` mirrors this table; change both together.

| Troop         | Upgrade from      | Gold | Iron | Horses | Value | Weekly wage |
| ------------- | ----------------- | ---- | ---- | ------ | ----- | ----------- |
| Levy          | recruit (village) | 10   |      |        | 10    | 1           |
| Militia       | levy              | 20   |      |        | 30    | 2           |
| Bowman        | levy              | 20   |      |        | 30    | 2           |
| Footman       | militia           | 40   | 1    |        | 70    | 4           |
| Spearman      | militia           | 40   | 1    |        | 70    | 4           |
| Archer        | bowman            | 40   |      |        | 70    | 4           |
| Man-at-arms   | footman           | 80   | 1    |        | 150   | 7           |
| Pikeman       | spearman          | 80   | 1    |        | 150   | 7           |
| Crossbowman   | archer            | 80   | 1    |        | 150   | 7           |
| Longbowman    | archer            | 170  |      |        | 240   | 7           |
| Hearthguard   | man-at-arms       | 150  | 2    |        | 300   | 12          |
| Warden        | longbowman        | 150  |      |        | 390   | 12          |
| Squire        | recruit (castle)  | 55   |      | 1      | 55    | 4           |
| Horseman      | squire            | 70   | 1    |        | 125   | 8           |
| Knight        | horseman          | 145  | 2    | 1      | 270   | 14          |
| Horse archer  | horseman          | 95   |      |        | 220   | 14          |
| Banner Knight | knight            | 270  | 2    | 1      | 540   | 24          |
| Keshig        | horse archer      | 250  | 2    | 1      | 470   | 24          |

**Value** is everything paid in gold from a recruit up; iron and horses add up
the same way (a knight is 3 iron and 2 horses from a squire, a banner knight 5
and 3). Longbowmen are the one foot exception: at tier price the longbow army
won 16 of 18 at equal gold, so a lifetime at the butts costs 170.

| Tier | XP to reach | Ransom |
| ---- | ----------- | ------ |
| 2    | 20          | 10     |
| 3    | 60          | 22     |
| 4    | 150         | 45     |
| 5    | 300         | 90     |

Tier 1 ransoms for 4; mounted troops ransom ×1.5.

- **Recruiting** militia and bowmen at a town costs 30; a squire at a castle
  55 and a horse. A tier-3 recruit at a Barracks costs the line's value and
  all of its iron and horses (a Barracks horseman needs both).
- **Recruited prisoners** (`world.md` §7) cost half their value, plus all of
  their line's iron and horses. Neither path gets round the horse supply.

Gold per militia of worth, iron at 30 and horses at 40: levy 19, bowman 28,
militia 32, archer 45, squire 61, spearman 72, footman 78, horseman 82,
crossbowman 88, longbowman 102, knight 114, man-at-arms 115, pikeman 127,
horse archer 141. Low tiers are cheap per worth on purpose: a starting
warband can only afford numbers, and numbers are what break (`battle.md`
§10.9, rule 6). Later the party-size cap binds instead of gold, and the dear
troops are the ones that fit.

**XP.** Each troop type in your party has one XP pool, as in Mount & Blade.
When the pool covers the next tier's threshold, that many men can upgrade, for
gold (and iron, horses) at any time, anywhere. XP comes from:

- **Winning a battle:** every surviving man of yours gets
  `12 × enemy worth defeated / your worth fielded`, clamped to 2–40. A fair
  fight gives about 10; a slaughter of looters gives 2. Losing gives 30% of it.
- **Training** (skill): daily XP for low tiers (§7).
- **Garrisons with a Training Yard**: 2 a day.

That is about 2 fair fights from levy to militia, 6 more to tier 3, 15 more to
tier 4, 30 more to tier 5. Expect a veteran tier-4 core by mid-campaign and a
handful of tier 5s by the end, not an army of them.

## 4. Cultures and factions

Four claimants, each the heir of one culture. Their homelands sit around the
ruined capital; which one is north and which east changes with the seed
(`world.md` §1).

| Faction          | Homeland         | Colour           | Doctrine                                   |
| ---------------- | ---------------- | ---------------- | ------------------------------------------ |
| **Valemark**     | plains, farmland | blue `#5b8def`   | heavy horse, crossbows, a steady foot line |
| **Fenreach**     | forest, marsh    | green `#4caf6a`  | longbows behind pikes, light horse         |
| **Kharum Holds** | hills, mountains | ochre `#d08a3c`  | shield infantry and crossbows              |
| **Ulus**         | steppe           | violet `#b46bd6` | horse archers and lancers                  |

What each culture's tree has (✓), lacks (—), or changes:

| Branch       | Valemark                                         | Fenreach                                                             | Kharum                                                                            | Ulus                                                                              |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Man-at-arms  | ✓                                                | ✓ −1 def, speed 4.5                                                  | ✓ +1 def                                                                          | —                                                                                 |
| Pikeman      | ✓                                                | ✓                                                                    | ✓                                                                                 | —                                                                                 |
| Longbowman   | —                                                | ✓ (the trait gives +10 m range)                                      | —                                                                                 | —                                                                                 |
| Crossbowman  | ✓                                                | —                                                                    | ✓ +1 armour                                                                       | —                                                                                 |
| Knight       | ✓                                                | —                                                                    | ✓                                                                                 | ✓ as Lancer: −1 armour, speed 10                                                  |
| Horse archer | —                                                | —                                                                    | —                                                                                 | ✓                                                                                 |
| Tier 5       | Banner Knight                                    | Warden                                                               | Hearthguard                                                                       | Keshig                                                                            |
| Trait        | **Lance**: horse charge +25%; infantry −4 morale | **Greenwood**: forest and marsh cost 0.6 less to cross; ranged +10 m | **Stone-born**: hills and passes cost as plains; infantry +1 def; party pace ×0.9 | **Endless Steppe**: party pace +15%; horse archers +2 volleys; infantry −6 morale |
| Ability      | Lance Charge                                     | Stakes                                                               | Shield Wall                                                                       | Feigned Flight                                                                    |
| AI temper    | aggressive, honourable                           | defensive, cunning, raids                                            | slow to war, relentless besiegers                                                 | opportunistic raiders, fast                                                       |

Abilities are in `battle.md` §6. A trait applies to its culture's own troops,
elites included, and "infantry" means the infantry role: footmen, not spears.
Kharum's men-at-arms take both their +1 def and Stone-born's, for def 9.
Where a culture lacks a troop it fields the nearest of the same role
(`cultureTroop` in `troops.js`): men-at-arms → footmen, pikemen → spearmen,
longbows ↔ crossbows → archers, knights and horse archers → horsemen.
M1 measured every variant (`battle.md` §10.13 has the table and each
culture's doctrines): worth in militia, with the generic troop for reference
and — for a troop the culture doesn't field.

| Troop       | generic | Valemark | Fenreach | Kharum | Ulus |
| ----------- | ------- | -------- | -------- | ------ | ---- |
| Levy        | 0.56    | 0.47     | 0.56     | 0.60   | 0.42 |
| Militia     | 0.89    | 0.84     | 0.89     | 0.92   | 0.84 |
| Footman     | 1.29    | 1.23     | 1.29     | 1.32   | 1.20 |
| Man-at-arms | 1.82    | 1.70     | 1.83     | 1.91   | —    |
| Bowman      | 1.07    | 1.07     | 1.14     | 1.07   | 1.07 |
| Archer      | 1.55    | 1.55     | 1.68     | 1.55   | 1.55 |
| Longbowman  | 2.35    | —        | 2.45     | —      | —    |
| Horseman    | 2.39    | 2.48     | 2.39     | 2.39   | 2.39 |
| Knight      | 3.86    | 4.16     | —        | 3.86   | 3.86 |
| Elite       |         | 5.97     | 3.12     | 2.45   | 2.99 |

Spearmen, pikemen, crossbowmen and squires are the same everywhere they are
fielded; Valemark's Lance lifts squires to 1.60.

Troop names are the culture word plus the generic name ("Vale Footman",
"Steppe Horseman"), except the four elites.

## 5. The Hollow, brigands, beasts

**The Hollow** (Act II onward; rules in `battle.md` §9). They have no morale:
they never waver or rout, and crumble without a captain near. None of this is
modelled yet, so no Hollow unit has a measured worth; M7 measures them, and
until then the Hollow's strength in `world.md` is a budget in militia-worth
spent at these placeholder rates.

| Unit         | Like        | hp   | atk | def | dmg | armour | shield | speed | Notes                                            | worth (placeholder) |
| ------------ | ----------- | ---- | --- | --- | --- | ------ | ------ | ----- | ------------------------------------------------ | ------------------- |
| Skeleton     | levy        | 20   | 2   | 2   | 5   | 1      | —      | 4     | the bulk; Raise Dead makes more                  | 0.6                 |
| Bone archer  | bowman      | 18   | 1   | 1   | 4   | 1      | —      | 4     | range 60, mdmg 6, acc .45, reload 3 s, 8 volleys | 0.8                 |
| Wight        | man-at-arms | 40   | 6   | 7   | 9   | 5      | 0.3    | 4     |                                                  | 2.0                 |
| Death knight | knight      | 48   | 7   | 6   | 9   | 6      | 0.3    | 8     | charge 12                                        | 3.5                 |
| Wight-lord   | captain     | 150  | 7   | 7   | 20  | 5      | 0.3    | 4     | squad of 1–3; binds; Raise Dead                  | 15                  |
| Hollow King  | boss        | 2000 | 10  | 10  | 120 | 8      | 0.5    | 4     | squad of 1; aura +2 atk; his death ends it       | —                   |

**Brigands** use the generic stats under other names: Looter (levy), Brigand
(militia), Poacher (bowman), Raider (squire), Deserter (footman or
crossbowman). A brigand party carries a purse of 20 gold plus 3 a man.

**Beasts** are neutral guards of lairs and wanderers in the wild. They follow
the normal morale rules; the barrow's dead follow the Hollow's.

| Beast        | hp   | atk | def | dmg | armour | morale | speed | Notes                                                                       | worth |
| ------------ | ---- | --- | --- | --- | ------ | ------ | ----- | --------------------------------------------------------------------------- | ----- |
| Wolf         | 18   | 4   | 2   | 6   | 0      | 55     | 12    | charge 4; packs of 3–5 squads                                               | 0.87  |
| Troll        | 400  | 8   | 6   | 70  | 4      | 90     | 4     | squads of 1–4, 4 m apart, 1 rank; fear 4                                    | 36    |
| Troll-King   | 900  | 9   | 7   | 100 | 5      | 95     | 4     | squad of 1; fear 6; his trolls +10 morale while he stands                   | —     |
| Wyrm         | 3000 | 10  | 9   | 150 | 8      | 100    | 5     | squad of 1; fear 8; breath every 2nd round: one squad within 50 m takes 300 | —     |
| Thrall       | 26   | 3   | 3   | 6   | 1      | 60     | 4.5   | beast-cult militia that serve trolls and the wyrm; immune to fear           | 0.93  |
| Barrow-wight | 40   | 6   | 7   | 9   | 5      | —      | 4     | Hollow rules, bound to the barrow's lord instead of a captain               | —     |
| Barrow lord  | 150  | 7   | 7   | 20  | 5      | —      | 4     | a Wight-lord who never leaves his barrow                                    | —     |

Monsters and the Hollow without a measured worth are placed in lairs by
**composition**, not worth (`world.md` §4, §12); M3 and M7 measure them.

## 6. The hero

You are a captain, not a swordsman: you exist on the battlefield as your
banner squad (`battle.md` §6), and everywhere else as the multiplier on your
army.

**A new campaign** asks for a home culture and a background.

- **Home culture** sets where you start, what your first recruits are, your
  starting culture ability, and +10 relation with that culture's claimant.
- **Background:**

| Background    | Starts with                                                       | Level-up leans to |
| ------------- | ----------------------------------------------------------------- | ----------------- |
| Sellsword     | +200 gold; Tactics (Basic)                                        | Might, Guard      |
| Exiled Knight | 4 squires and 2 spare horses; Leadership (Basic)                  | Command, Might    |
| Outlaw        | +100 gold; Scouting (Basic); brigands won't attack you unprovoked | Cunning, Might    |
| Physician     | Medicine (Basic); Cunning +1                                      | Cunning, Command  |

Everyone starts at level 1 with **12 levies**, 300 gold, no iron, no horses,
the abilities Rally and Hold the Line, and their culture's ability.

**Attributes.** Four, starting at 1 each. Each level-up adds one, chosen at
random weighted by background (HoMM's way: it keeps level-ups quick and makes
two heroes of the same build differ).

| Attribute | Effect                                                   |
| --------- | -------------------------------------------------------- |
| Might     | every 2 points: +1 atk for all your troops               |
| Guard     | every 2 points: +1 def for all your troops               |
| Command   | each point: +1 morale for all your troops                |
| Cunning   | every 3 points: +1 Valor maximum; at 9, +1 Valor a round |

A level-25 hero has about +4 atk, +3 def and +6 morale over a level-1 one.
By §10.7 of `battle.md`, that is worth roughly +40% troops before skills —
the hero matters, but a big army still beats a great hero with a small one.
Skills change that: the Skirmish template below, with Leadership and Offense
at Expert by level 17, is worth +48% troops at level 1 and more than doubles
an army at level 20 (`battle.md` §10.10). Whether skills come that fast is
M3's question.

**Levels.** Each level-up also offers **two skills** — new ones, or a rank up
of one you have — and you take one (HoMM). Eight skill slots, three ranks
each. Ability slots: 3, +1 at levels 10 and 20.

| Level | 2   | 3   | 5    | 8    | 10   | 15     | 20     | 25     | 30 (max) |
| ----- | --- | --- | ---- | ---- | ---- | ------ | ------ | ------ | -------- |
| XP    | 150 | 520 | 1820 | 4980 | 7830 | 17 340 | 30 050 | 45 760 | 64 330   |

`XP(L) = 150 × (L − 1)^1.8`. Hero XP from a battle won is `5 ×` the worth of
enemy troops killed, wounded or captured, plus `2 ×` the worth of those who
fled; ×1.5 when the odds were Risky or Hopeless. Quests and lairs give fixed
amounts (`world.md`). Pacing target: **level 10 around day 50, level 20 around
day 150.**

**Party size.** `20 + 2 × level + 8 × Leadership rank + renown / 40`, +15
with the Sceptre. 22 at the start (30 with Leadership Basic), about 65 by day
60, 110 late.

**In battle** the hero is one soldier of the banner squad (`battle.md` §6),
and always the last of it to fall:

| Who       | hp                                     | atk         | def         | dmg | armour | shield | morale | Notes                                                                    |
| --------- | -------------------------------------- | ----------- | ----------- | --- | ------ | ------ | ------ | ------------------------------------------------------------------------ |
| Hero      | 60 + 4 × level                         | 6 + level/5 | 6 + level/5 | 10  | 5      | 0.5    | 90     | rounded down; moves at the squad's pace                                  |
| Companion | as their culture's man-at-arms, +10 hp |             |             |     |        |        |        | wounded, never killed                                                    |
| Household | as the home culture's footman          |             |             |     |        |        |        | 4 of them when the squad would have fewer; the hero's own, replaced free |

The squad's role is its guards' role, infantry when it has none. Items that
name the banner squad (Plate of the Vale, the Destrier) apply to every man in
it.

**Other banner squads.** A **lord** of rank r fights as a hero of level 4r,
with attributes of r each and a household of 6 + 2r of their culture's best
tier-4 troops (horse for Valemark and Ulus, foot for Fenreach and Kharum). A
**brigand chief** is a level-3 hero with six militia.

**A hero for Skirmish** (and anywhere a hero is needed without a campaign) at
level N has every attribute at 1 + ⌊N / 4⌋; Leadership, Tactics and Offense
at rank min(3, ⌈N / 8⌉); and the abilities Rally, Hold the Line, their
culture's, and Inspire from Leadership Advanced.

## 7. Skills

Fourteen skills, three ranks. Battle skills are the hero's own. **Party
skills** (marked ◆) use the best rank among the hero and the companion
assigned to that party role (§9), Mount & Blade's way of making companions
matter outside battle.

| Skill         | Basic / Advanced / Expert                                                                             | Also unlocks           |
| ------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| Leadership    | morale +4 / +8 / +12; party size +8 / 16 / 24; aura +1 / +2 / +3 a round                              | Inspire (Adv)          |
| Tactics       | deploy band +10 / 20 / 30 m; see enemy horse targets / all enemy targets / deploy after seeing theirs | +1 Valor a round (Exp) |
| Offense       | melee damage +10 / 20 / 30%                                                                           |                        |
| Archery       | ranged damage +10 / 20 / 30%; range +0 / 5 / 10 m                                                     | Loose! (Adv)           |
| Armorer       | damage taken −5 / 10 / 15%                                                                            |                        |
| Horsemanship  | horse speed +5 / 10 / 15%; charge +15 / 30 / 45%                                                      | Charge! (Adv)          |
| ◆ Logistics   | party pace +10 / 20 / 30%                                                                             |                        |
| ◆ Pathfinding | terrain cost above 1 reduced 25 / 50 / 75%                                                            |                        |
| ◆ Scouting    | sight +1 / 2 / 3; see compositions / lords' intents / into forest                                     |                        |
| ◆ Medicine    | wounded share +15 / 30 / 45%; healing ×1.5 / 2 / 2.5                                                  |                        |
| Training      | daily XP +1 / 2 / 3 per man, for tiers ≤ 2 / 3 / 4                                                    |                        |
| ◆ Stewardship | wages −10 / 20 / 30%; fief income +10 / 20 / 30%                                                      |                        |
| ◆ Engineering | siege works 1 / 2 / 3 days faster (min 1); own walls +1 level (Exp)                                   |                        |
| Diplomacy     | relation gains +25 / 50 / 75%; ransoms +20 / 40 / 60%; persuade lords to defect (Exp)                 |                        |

Sizing note: Leadership Expert's +12 morale is, by itself, worth about +22%
troops (`battle.md` §10.7). That is the strongest single skill, deliberately,
and the reason no item gives more than +5 morale.

**Abilities** are listed in `battle.md` §6. Rally, Hold the Line and your
culture's ability are known from the start; three come from skills; four are
learned at shrines on the map. Swap which are slotted at any settlement.

## 8. Equipment

Six slots: weapon, armour, banner, mount, two trinkets. Three more slots hold
only the Regalia. Items come from lairs, quests, pickups and town smiths
(common 300–800 gold, rare 1500–3000; relics are never sold).

| Item                          | Slot    | Rarity | Effect                                                                            |
| ----------------------------- | ------- | ------ | --------------------------------------------------------------------------------- |
| Sergeant's Mace               | weapon  | common | Might +1                                                                          |
| Warhammer of the Holds        | weapon  | rare   | Might +2; infantry +5% melee damage                                               |
| Fen Warden's Bow              | weapon  | rare   | ranged damage +10%                                                                |
| Lance of Saint Aubric         | weapon  | relic  | horse charge +25%                                                                 |
| Blade of the Last King        | weapon  | relic  | Might +3; Smite costs 2 Valor                                                     |
| Gambeson                      | armour  | common | Guard +1                                                                          |
| Mail Hauberk                  | armour  | rare   | Guard +2                                                                          |
| Wardens' Cloak                | armour  | rare   | Scouting +1 rank; your party is hidden in forest                                  |
| Plate of the Vale             | armour  | relic  | Guard +3; banner squad +2 def                                                     |
| Company Banner                | banner  | common | morale +2                                                                         |
| Black Banner                  | banner  | rare   | enemy squads start −4 morale                                                      |
| Lion Standard                 | banner  | rare   | morale +4; aura reaches 40 m                                                      |
| Oriflamme                     | banner  | relic  | morale +5; Rally costs 2 Valor                                                    |
| Rouncey                       | mount   | common | party pace +5%                                                                    |
| Courser                       | mount   | rare   | pace +10%; you always escape capture                                              |
| Steppe Mare                   | mount   | rare   | pace +10% on plains and steppe; horse archers +1 volley                           |
| Destrier                      | mount   | relic  | banner squad +6 charge if it is horse, +2 atk if it is foot                       |
| Spyglass                      | trinket | common | sight +1                                                                          |
| Lucky Coin                    | trinket | common | loot +10%                                                                         |
| Surgeon's Kit                 | trinket | common | Medicine +1 rank (to Expert at most)                                              |
| Map of the Old Roads          | trinket | rare   | Pathfinding +1 rank                                                               |
| Moneylender's Purse           | trinket | rare   | wages −10%                                                                        |
| Saint's Knucklebone           | trinket | rare   | start battles with +1 Valor                                                       |
| Horn of Muster                | trinket | rare   | all squads +5 morale for the first 2 rounds                                       |
| Hollow-bane Charm             | trinket | rare   | Smite ×1.5; no Raise Dead within your banner's aura                               |
| **Sceptre of the First King** | regalia | —      | Command +2; party size +15                                                        |
| **Orb of Dominion**           | regalia | —      | +1 ability slot; start battles with +2 Valor                                      |
| **Great Seal**                | regalia | —      | +10 relation with every lord once; **Call the Banners** at Crownhold (`world.md`) |

## 9. Companions

Twelve named companions per campaign, generated with a culture, a name, one
party skill at Advanced and a captain trait. Two or three at a time wait in
random towns' taverns and drift between towns weekly. Hire for 300–800 gold;
wage 15 a week. You can keep **2 + Leadership rank** of them.

A companion does one of two jobs:

- **Party role.** The party uses a companion's skill when it beats the
  hero's (◆ in §7): the **Scout** covers Scouting and Pathfinding, the
  **Surgeon** Medicine, the **Engineer** Engineering, the **Quartermaster**
  Logistics and Stewardship.
- **Captain.** Assigned to a squad, they fight in it and give it their trait:

| Trait        | Captained squad gets                                      |
| ------------ | --------------------------------------------------------- |
| Old Sergeant | morale cap +8                                             |
| Hunter       | ranged: +10% hits                                         |
| Horse-master | horse: +15% impact; cycles in half the time               |
| Shieldbearer | infantry: +1 def; shields keep half their effect in melee |
| Pikewall     | spear: braces while moving at walking pace                |
| Butcher      | +10% melee damage, −4 morale cap                          |
| Outrider     | +20% speed                                                |
| Banneret     | counts as inside the hero's aura wherever it is           |

A companion is never killed: if their squad breaks, they are wounded for a
week. From M6, a companion can be given a fief and becomes a lord of your
realm, leading their own party with the strategic AI (`world.md`).
