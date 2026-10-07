# Crownless — the battle layer

Battles are where the warband you built meets someone else's. They have to be
readable on a 390 px screen, playable with one thumb, decided in a couple of
minutes, and deterministic enough that auto-resolve and the odds shown before a
fight come from the same function.

**`theory/battle.mjs` is normative for §3–§5 until M1 replaces it.** It
implements them for single-type squads in Line, Wide and Deep, and §10 is its
output. Where this text and that code disagree, the code is right and the text
is a bug; M1 must reproduce the code's tables before changing anything.
Constants that only matter to the plain AI are listed in §5.

Not in the model, and so designed but unmeasured: mixed squads and the squad
caps (§2), Square, the Move / Fall back / Skirmish / fire orders (§5), the hero
and abilities (§6), terrain (§7), sieges (§8) and the Hollow's rules (§9).

## Contents

1. [How a battle plays](#1-how-a-battle-plays)
2. [The field and the squads](#2-the-field-and-the-squads)
3. [Combat](#3-combat)
4. [Morale, routs, and the end of a battle](#4-morale-routs-and-the-end-of-a-battle)
5. [Orders and the plain AI](#5-orders-and-the-plain-ai)
6. [The hero on the field: banner, Valor, abilities](#6-the-hero-on-the-field)
7. [Terrain](#7-terrain)
8. [Siege assaults](#8-siege-assaults)
9. [The Hollow and monsters](#9-the-hollow-and-monsters)
10. [What the model says](#10-what-the-model-says)
11. [After the battle](#11-after-the-battle)
12. [Auto-resolve and odds](#12-auto-resolve-and-odds)

---

## 1. How a battle plays

```
 encounter ─▶ odds sheet ─▶ deploy ─▶ round 1 ─▶ round 2 ─▶ … ─▶ result sheet
              Fight / Auto            (plan, Go, watch 3 s)
```

1. **Encounter.** On the map you meet a hostile party. A sheet shows both
   armies, the odds (§12) and the options: Fight, Auto-resolve, and where
   possible Leave, Pay or Talk.
2. **Deploy.** Both armies appear in their deployment bands: yours at the
   bottom, theirs at the top. Your squads start in a formation preset; tap a
   squad, then tap a spot in your band to move it. Presets are one tap: Line,
   Refused flank, Hammer (all horse on one wing), Defensive (ranged in front of
   a held line). Press **Begin**.
3. **Rounds.** Each round: give orders (or leave the standing ones), press
   **Go**, and watch three seconds of simulation for both sides. Then it
   pauses. The **⏯ Continuous** toggle plays rounds back to back and pauses
   only on events: a squad of yours wavers or routs, enemy horse turns on your
   archers, a squad runs out of arrows, an ability becomes affordable, a squad
   finishes its move.
4. **End.** One side has nobody left standing (§4). The result sheet shows
   casualties (killed / wounded / fled), prisoners, loot and XP, and any
   upgrades that just became available.

At any round you can **Retreat** (§11) or hand the rest to the AI with **Auto
finish**, which runs the remaining rounds instantly.

A battle is aimed at **5–12 rounds, median 8**, which is 1½–3 minutes with
planning. The model hits that (§10.8).

## 2. The field and the squads

**The field** is 100 m wide and 140 m deep: portrait. At 390 px wide that is
3.9 px per metre, and it fits a phone's play area without scrolling, so there
is no camera to drive. Deployment lines are 30 m in from each end (80 m
apart); ranged squads stand 10 m behind their line, horse on the wings. The
Tactics skill deepens your band (`army.md`).

**A squad** is up to ~60 soldiers in a rectangle. It has a position, a facing,
a frontage of `files` soldiers, and `ranks` behind; soldiers stand 1.5 m apart.
Casualties come off the back, so a squad keeps its frontage until it is one
rank deep (`files = min(files₀, n)`). Default ranks by role: infantry and
spears 4, ranged and horse 2, monsters 1 (and 4 m apart).

Your army is split into squads by role automatically (infantry, spears, ranged,
horse, horse archers), splitting a role into two squads past 40 men. You can
regroup them in the Army screen. **A squad may hold several troop types** of
one role (militia and footmen together): each type keeps its own stats, the
squad moves at its slowest member's pace, fighters are spread over types in
proportion to their numbers, and incoming damage is split the same way, each
type with its own damage pool. (The model only runs single-type squads.)

**Caps:** your army fields at most 8 squads plus your banner squad. A side has
at most 12 squads in all (allies' squads included); past that, the smallest
squads of the same role merge. Above 400 men a side, each drawn figure stands
for two.

**Formations** (an order, any time). The model's first draft let Wide
envelop like Line; it then won every fight it was in, because wrapping round a
narrower line is worth more than any morale cost. So **only Line and Deep
wrap**, and each of the others has one job (measured in §10.5):

| Formation | Ranks             | Effect                                                     | Use it                                               |
| --------- | ----------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Line      | default           | the only formation that wraps a narrower enemy             | almost always                                        |
| Wide      | half (at least 1) | never wraps; −5 morale and morale cap; flank pressure ×1.5 | outnumbered: stretch so a bigger line can't wrap you |
| Deep      | double            | +10 morale and morale cap; flank pressure ×0.5             | at a siege entry (§8), where width can't help        |
| Square    | —                 | every face counts as front, half the fighters, cannot move | spears caught by horse from every side               |

Deep loses to Line in every open-field test, and Square is not modelled; both
stay out of M1 and are measured with sieges in M5.

## 3. Combat

All rates are **per round** (3 s), applied in fixed steps of 0.1 s. Within a
step, every blow is computed from the same snapshot and applied afterwards, so
the order squads are stored in never decides who strikes first.

### 3.1 The edge curve

Every attack-versus-defence comparison goes through one curve:

```
edge(atk, def) = 1.08 ^ (atk − def)
```

8% per point either way, never zero, never capped. +5 is ×1.47, −5 is ×0.68.

### 3.2 Contact and frontage

Two enemy squads are **in contact** when the gap between their rectangles is
under 0.8 m. The rectangle's extent along any direction is its support
function, so contact, the width each side presents, and which face was hit all
come from the same two numbers per squad (half-width, half-depth) and its
facing. No grid, no per-soldier collision.

In contact, the **front** is the narrower of the two widths, whatever their
sideways offset. A wider squad in Line or Deep **wraps** its overhang round
the narrower one's ends, up to the length of its sides
(`wrap = min(widthA − widthB, 4 × extentB)`). That is how a bigger army brings
its numbers to bear, short of a square law (§10.6).

**Fighters** for a squad against one opponent:

```
front fighters = ceil(front width / spacing) × reach × fightBack[my face hit]
wrap fighters  = my wrap / spacing                     (they hit a flank)
turned fighters = their wrap on me / spacing × 0.5     (men turning to face it)
```

`reach` is 2 for spears (two ranks fight), 1 otherwise. `fightBack` is 1 /
0.5 / 0.25 for a squad engaged on its front / flank / rear. Fighters over all
contacts are capped at the men the squad has.

### 3.3 Melee damage

```
damage per round = fighters × dmg × edge(atk, def) × flank × antiCav
                   × wavering × routingTarget × fortune
```

| Factor        | Value                                                                 |
| ------------- | --------------------------------------------------------------------- |
| flank         | 1 front, **1.3 flank, 1.6 rear** — by which face of the target is hit |
| antiCav       | the spear's `antiCav` (2–2.4) against horse, else 1                   |
| wavering      | 0.8 if the attacker is wavering                                       |
| routingTarget | 1.5 if the target is running: cutting down men who have turned        |
| fortune       | one roll per squad per round, uniform ±15% (§3.7)                     |

**Damage pools, HoMM-style.** Damage accumulates on the target squad; every
`hp` of it drops one soldier and the remainder carries over. Overkill flows to
the next man, so a troll's 70-damage blows cleave through levies without a
special rule.

**Facing.** An engaged squad turns, slowly, toward the first enemy that
engaged it. A squad pinned from the front and hit in the flank stays flanked;
that is the point of a pin.

### 3.4 Charges and bracing

A horse squad, steady or wavering, that has been moving at 60%+ of its speed
for **1.5 s (about 13 m)** and makes new contact delivers a one-off **impact**:

```
impact = min(n, front files) × charge × edge(atk, def) × flank × fortune
```

and costs the target **10 morale (+6 on a flank, +12 from the rear)**.

A **braced** target — a spear squad, facing the charge, standing still —
takes 30% of the impact and answers with its own blow, `spear fighters × dmg ×
antiCav × edge`, before the melee starts. Its morale drops only 4.

Any contact or slowing down spends the run-up, so it is one charge per
approach. The **Cycle** stance (on by default for horse) pulls a squad out
after a full round in contact with its target, if that target is steady (not
wavering, not running) and not ranged: it rides 30 m back the way it came,
keeps going until the nearest enemy is 22 m off, then charges again. Pulling
out is slow (60% speed) and shows your back while you do it, so it is not
free.

### 3.5 Missiles

A ranged squad fires a volley every `reload` seconds while it has ammo (10–16
volleys), is not in melee, and is standing still (horse archers fire on the
move at ×0.7 accuracy).

```
hits       = n × acc × (1 − 0.5 × distance / range) × fortune
per hit    = mdmg × edge(0, armour × (1 − pierce)) × shield
shield     = (1 − target.shield) if the volley hits the target's front
             and the target is not in melee; else 1
```

**Shields only work from the front and only while not fighting.** Without
the second clause, men-at-arms took no losses from thirty-six longbowmen over
six rounds. Crossbows `pierce` 60% of armour.

**Shooting into a melee** hits whoever is in it: the volley is split between
the target and each of your squads engaged with it, counting at most 20 men
of each (the ones at the contact), in proportion to their numbers. Archers can
still support a line; they just pay for it.

Ranged squads target, in order: their ordered target if in range, else the
nearest standing enemy in range.

### 3.6 Movement

Speeds are m/s: infantry 4–4.5, horse 9–11, monsters 4. **Charge** orders run
at ×1.15. Wavering squads move at ×0.8. Squads turn toward where they're going
at 1.5 a second (a share of the gap per second, not degrees), and toward the
first enemy that engaged them at 0.8; they keep 2 m inside the field's sides. Engaged squads don't move unless
ordered to withdraw. Squads can't walk through each other; friends shove
apart, routers slip through. The AI's horse rides round an enemy line rather
than into it: if another enemy squad stands across the straight way to its
target, it swings out to the near wing until level with the target.

### 3.7 Fortune

Each squad rolls once per round: its damage, volley hits and charge impact
that round are scaled by a uniform ±15%. Per-step noise averages out over 30
steps and leaves the battle deterministic whatever the seed; a round-long
swing is what makes a close fight a gamble, and makes the odds (§12) honest
percentages rather than 0% or 100%.

## 4. Morale, routs, and the end of a battle

Morale, not body count, decides battles. Each squad starts at its troop's
morale (50–84, `army.md`) plus army modifiers (hero, party morale, banner).

| Morale change                                             | Amount                                           |
| --------------------------------------------------------- | ------------------------------------------------ |
| each man lost                                             | −100 / starting strength                         |
| charged                                                   | −10, +6 on a flank, +12 from the rear; braced −4 |
| flanked, per round                                        | −6 × formation × min(2, 3 × pressure)            |
| touching something with `fear`, per round                 | −fear (troll 4)                                  |
| a friendly squad within 30 m routs                        | −8                                               |
| **the day is lost**: under 40% of the army's men standing | **−12 per round, every squad**                   |
| not engaged, no losses this round                         | +3, up to its cap                                |
| engaged, dealt damage, took no losses                     | +2, up to its cap                                |
| the hero's banner within 30 m, per round                  | +2 (Leadership: more, `army.md`)                 |

`pressure` is flanking men against own men, with men at your back counted
twice: a whole squad on your flank is the full drain, a few men wrapping round
the end of your line a fraction. `formation` is 1 for Line, 1.5 Wide, 0.5
Deep.

**Morale is read at the end of each round.** Inside a round a squad keeps
fighting at full strength however low its morale falls; it wavers, routs or
rallies in the pause, where you can see it and answer. That is deliberate for
planned rounds: nothing changes state behind your back mid-animation.

| Morale   | State    | Effect                                                              |
| -------- | -------- | ------------------------------------------------------------------- |
| ≥ 40     | steady   | —                                                                   |
| 20 – 40  | wavering | ×0.8 melee damage and speed (volleys and charges unaffected)        |
| < 20     | routing  | flees to its own edge at ×1.1 speed; doesn't fight back; takes ×1.5 |
| off edge | fled     | out of the battle; survives (§11)                                   |

A routing squad **rallies** when its morale climbs back to 35 (+4 a round
while not engaged), no enemy is within 20 m, and it still has a quarter of its
men; below a quarter it is **shattered** and never rallies.

**Routs cascade in waves.** Every squad under 20 breaks at once; each one
that breaks costs every steady or wavering friend within 30 m 8 morale; any
that this pushes under 20 break in the next wave, until a wave breaks nobody.
So the order squads are stored in never decides who runs.

**The battle ends** when a side has no steady or wavering squads left. If both
break in the same round it is a **draw** (§11). A battle that reaches 40
rounds (the model has never hit this) goes to whoever has the larger share of
their men still standing.

**The day is lost** is the rule that makes battles end. Without it a lone
squad of archers or a rallied remnant holds out for ten more rounds of mop-up:
median 10, p90 18, max 27. With it: **median 8, p90 12, max 21** (§10.8).

## 5. Orders and the plain AI

Orders are **standing**: a squad keeps doing what it was told until it is done
or told otherwise. You only need to touch the squads whose situation changed.

| Order         | Squad does                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Advance**   | marches on its target (tapped enemy, or the nearest by role preference) and fights          |
| **Charge**    | as Advance at ×1.15; horse charge on contact                                                |
| **Hold**      | stands where it is, keeping its facing (it turns only toward what engages it); spears brace |
| **Move**      | goes to a tapped point, keeps its facing; stops if engaged                                  |
| **Fall back** | withdraws to a tapped point or toward its own edge, even out of a melee (back exposed)      |
| **Skirmish**  | ranged and horse archers: keep 60–80% of range from enemy melee, shooting                   |
| Fire          | ranged: at will (default) / this target / hold fire                                         |
| Cycle         | horse: on (default) / off — see §3.4                                                        |
| Formation     | Line / Wide (M1); Deep / Square (M5) — §2                                                   |

**Army orders** apply one order to every squad of yours in one tap: Advance,
Hold, Charge, Fall back. With them, a whole battle can be played from the
bottom bar without touching the field. **Targets** can be picked from the
bottom too: after Advance or Charge, the chip row shows the enemy's squads,
nearest first (`ui.md` §5), so the enemy's far wing is never a reach to the
top of the screen.

**Role preferences**, used by Advance with no target, by the AI, and by the
"next target" logic when a target breaks:

| Role          | Prefers                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| horse         | enemy archers → enemy horse → nearest                                                    |
| spear         | enemy horse → nearest; holds and braces if enemy horse is riding at a friend within 45 m |
| infantry      | nearest that isn't horse                                                                 |
| ranged        | holds if anything is in range, else advances until something is                          |
| horse archers | skirmishes against the nearest melee threat; charges when out of arrows                  |

**The plain AI** is those preferences plus one rule of doctrine: the side that
out-shoots the other holds its infantry and spears back (for up to 8 rounds,
and not once an enemy is within 25 m; its horse still ride) and makes the other
side come to it. Ranged power is `n × mdmg × acc × range / 70`
summed, and "out-shoots" means 1.2× the other's. It never feints, keeps a
reserve, or splits a big squad to flank. It is the same AI that auto-resolves
and that commands enemy armies, so it is a floor on what a player gets: beating
it at a disadvantage is the game. Difficulty comes from what the enemy brings,
not from the AI cheating.

**Abilities** (§6) are used by the AI with plain rules, spending Valor as soon
as one fires: Rally when two of its squads within 35 m of the banner are
wavering or running; Hold the Line on a squad enemy horse is riding at; Loose!
when two ranged squads have targets; Charge! when two horse squads have a
run-up and a target; a culture ability when its trigger holds. Enemy lords,
allies and auto-resolve (your side included) all use this policy.

Enemy-army AI will grow a few personalities later (`world.md`: lord traits):
a valorous lord charges early; a prudent one waits longer; Ulus commanders
skirmish.

**Constants that live only in the code** (the plain AI and deployment). They
are here so M1 can port them knowingly, not to be designed around:

| Constant                                            | Value                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ranged hold when the nearest enemy is within        | 0.95 × range                                                                                                            |
| horse archers kite at                               | 0.8 × range, sliding 8 m sideways                                                                                       |
| cycle-charge: withdraw, then ride on until clear by | 30 m; 22 m                                                                                                              |
| horse "blocked" if an enemy squad is within         | its half-width + 4 m of the straight way                                                                                |
| horse swing out to                                  | x = 5 m or 95 m, the nearer wing                                                                                        |
| deployment                                          | lines 30 m from each end; ranged 10 m behind; horse on the wings 4 m back; with no foot line, ranged stand at the front |
| spears brace for horse riding at a friend within    | 45 m                                                                                                                    |

## 6. The hero on the field

**Your banner squad** is your hero, any companions you have not given a squad
to, and up to 12 troops of **one role** you assign as guard; the squad takes
that role (horse guards make it a horse squad, and it can charge). With fewer
than 4 men besides the hero, the hero fights with a **household** of 4 of
their home culture's footmen, who are the hero's own: not party troops, and
replaced free after every battle. Stats for the hero, companions and
household are in `army.md` §6; so are lords' and brigand chiefs' banner
squads.

The hero is the **last man** of the squad to fall: damage kills guards,
companions (who are wounded, never killed) and household first. The hero is
**down** when the banner squad routs or dies: every squad of yours loses 15
morale once, the aura and all abilities are gone for the battle, and the hero
is wounded on the map (`world.md` §7). If your side then loses, you may be
captured.

Its **aura** reaches 30 m: squads inside get +2 morale a round (more with
Leadership) and the hero's morale cap bonus.

**Valor** pays for abilities, used in the planning pause and taking effect as
the round starts. Every source, in one place:

| Valor                     | Amount                                              |
| ------------------------- | --------------------------------------------------- |
| at the start              | 2; +2 with the Orb; +1 with the Saint's Knucklebone |
| each round                | +1; +1 with Tactics Expert; +1 at Cunning 9         |
| each enemy squad you rout | +1                                                  |
| maximum                   | 6, +1 per 3 points of Cunning                       |

| Ability        | Valor | Effect                                                                                                                                                 | Learned          |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rally          | 3     | squads within 35 m of the banner +25 morale, up to their cap; routing ones there rally now unless shattered; then 2 rounds before it can be used again | start            |
| Hold the Line  | 2     | one squad: +3 def and immune to flank morale drain this round; can't move                                                                              | start            |
| Loose!         | 2     | every ranged squad fires one extra volley now                                                                                                          | Archery          |
| Charge!        | 3     | every horse squad has its run-up now, and +50% impact this round                                                                                       | Horsemanship     |
| Inspire        | 4     | every squad +15% melee damage for 2 rounds                                                                                                             | Leadership       |
| Shield Wall    | 2     | one infantry squad: shields block 80% and work in melee, +3 def; can't move for 2 rounds                                                               | Kharum culture   |
| Stakes         | 3     | one ranged squad plants stakes: horse charging its front is braced against                                                                             | Fenreach culture |
| Lance Charge   | 2     | one horse squad's next impact ignores bracing                                                                                                          | Valemark culture |
| Feigned Flight | 3     | one horse squad withdraws with no free hits; its next charge is +50%                                                                                   | Ulus culture     |
| Mending        | 3     | one squad gets back 20% of the men it has lost this battle, as wounded who stand again                                                                 | shrine           |
| Fog            | 4     | no volleys from anyone this round                                                                                                                      | shrine           |
| Smite          | 4     | 150 damage to one enemy squad within 40 m of the banner; ×2 against the Hollow; half against the Hollow King and the Wyrm                              | shrine           |
| Dread          | 3     | one enemy squad −25 morale; once per squad per battle                                                                                                  | shrine           |

The hero has **3 ability slots** (+1 at levels 10 and 20, +1 from the Orb).
Measured exchange rates for sizing these are in §10.7: morale is by far the
most leveraged stat, so Rally and Dread are priced high, local and limited.
None of this is modelled yet; M1 measures each ability's worth in troops the
same way §10.7 measures a bonus.

## 7. Terrain

The battlefield is generated from the hex the battle happens on and its
neighbours, seeded by the battle seed. Terrain is a few soft shapes, not a
grid. (Not in the model yet; M1 ships flat fields and woods, the rest in M2.)

| Feature     | From hex       | Effect                                                                 |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| Woods patch | forest, edges  | ×0.6 speed; volleys into it ×0.5 hits; horse can't charge in it        |
| Slope       | hills          | attacking downhill +1 atk, uphill −1; ranged on high ground +10% range |
| River band  | river (ford)   | ×0.4 speed crossing; −2 def while in the water                         |
| Mud         | marsh          | ×0.7 speed; no charges                                                 |
| Houses      | village, town  | impassable blocks; squads path round                                   |
| Open        | plains, steppe | nothing — the steppe is open on purpose                                |

## 8. Siege assaults

A siege assault is the same battle with a wall. The **wall** is a band across
the field 35 m from the top. Defenders deploy on it and in the courtyard
behind. Attackers can only cross at **entries**, each a gap of fixed width:

| Entry       | Width | Built in (days, `world.md`) | Notes                                                                                                     |
| ----------- | ----- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ladder      | 3 m   | 1 (two ladders)             | only 2 files fight at the top                                                                             |
| Siege tower | 6 m   | 3                           | attackers arrive +10 morale                                                                               |
| Gate        | 6 m   | ram, 2                      | the ram is a squad (400 hp) that must reach and break the gate (600 hp, −50 a round); ranged can shoot it |

Contact at an entry is capped at the entry's width, and **nothing wraps at an
entry**, so the frontage rule that runs every battle is what makes a wall
strong: a handful of defenders hold a ladder against four or five times their
number (M5 measures it). This is where **Deep** earns its place (§2): width is
useless at a 3 m gap, and nerve isn't.

The attacker makes the entries by building works; the wall's level sets what
its defenders get there:

| Walls   | At an entry, defenders get | Merlons (shield against volleys, even in melee) |
| ------- | -------------------------- | ----------------------------------------------- |
| level 1 | +1 def                     | 0.3                                             |
| level 2 | +2 def                     | 0.5                                             |
| level 3 | +4 def                     | 0.6                                             |

Archers on a wall of any level get +15% range. Walls never go above level 3;
Engineering Expert raises your own walls a level up to that. The model moves
squads in straight lines; M5 adds routing through entries (and, for §7,
round houses) as a few waypoints per squad.

The defender's plain AI holds every entry with its melee squads and shoots
with everything else; once an entry falls, the courtyard is an ordinary
battle. The day-is-lost rule still applies, so most assaults end when the wall
breaks, not when the last defender dies.

## 9. The Hollow and monsters

**The Hollow** do not rout. Instead every Hollow squad is **bound** to a
captain (Wight-lord) or the Hollow King: if no captain stands within 40 m at
the end of a round, the squad **crumbles**, losing 8% of its men. Kill the
captains and the host falls apart; that is the whole counter-play, and Smite
and horse that can reach a captain are its tools. Hollow squads are immune to
morale effects (Dread, fear, charges' morale shock) but take charges' damage.

Each **Wight-lord** casts **Raise Dead** every third round: 20% of the
soldiers of either side who died within 30 m of it since its last cast stand
up as a new Skeleton squad. Long fights against the Hollow get worse.

The **Hollow King** is a squad of one (2000 hp, atk 10, def 10, dmg 120,
aura: Hollow squads within 40 m +2 atk). Killing him ends the final battle at
once: everything bound to him crumbles to dust.

**How the Hollow lose.** They never rout, so the day-is-lost rule takes
another form: once no captain is left on the field, every Hollow squad
crumbles 25% a round instead of 8%, and the Hollow side is beaten when fewer
than 40% of its men stand. A host with its captains alive has to be fought to
that 40% the hard way. **Barrow-wights** are bound to their barrow's lord
instead of a captain and never crumble while he stands; that lets the barrow
lairs exist (M3) before the rest of the Hollow (M7).

**Monsters** (`army.md`) are squads of one to six with huge hp and blows,
spaced 4 m apart. Pooled damage makes their hits cleave. `fear` drains the
morale of anything touching them. Wolves are fast and fragile and come in
packs of several squads.

## 10. What the model says

`node docs/crownless/theory/report.mjs` regenerates every table here (about
five seconds). The model is §3–§5, with Line, Wide and Deep, for single-type
squads; what it leaves out is listed at the top of this file. Read every
number as **what the plain AI gets**.

### 10.1 Worth: what a soldier is worth, in militia

For each troop, the smallest squad of it that beats 30 of each panel troop,
converted to militia. **Worth** is the geometric mean across the panel: what
the troop is worth against an army you haven't seen yet. It is the "Strength"
number the UI shows (`ui.md`) and what the strategic AI compares.

```
troop        tier role     militia spearma  archer horsema   worth
levy           1  inf        0.70    0.66    0.44    0.39    0.53
militia        2  inf        1.00    0.93    0.89    0.92    0.93
footman        3  inf        1.29    1.21    1.23    1.43    1.29
manatarms      4  inf        1.82    1.82    2.02    1.63    1.82
spearman       3  spear      1.29    1.29    1.23    1.82    1.39
pikeman        4  spear      1.63    1.60    1.30    2.16    1.65
bowman         2  ranged     1.24    1.05    1.15    0.88    1.07
archer         3  ranged     1.63    1.67    1.58    1.33    1.55
longbow        4  ranged     2.38    2.36    2.66    2.05    2.35
crossbow       4  ranged     2.07    2.11    2.53    1.60    2.05
horseman       3  cav        2.58    1.74    2.98    2.43    2.39
knight         4  cav        3.88    2.67    5.62    3.81    3.86
horsearcher    4  ha         2.07    1.74    1.69    2.97    2.06
squire         2  cav        2.07    1.14    1.87    1.38    1.57
bannerknight   5  cav        5.17    3.64    8.43    6.16    5.59
warden         5  ranged     3.10    2.86    3.61    2.86    3.09
hearthguard    5  inf        2.38    2.36    2.81    2.16    2.42
keshig         5  ha         2.82    2.36    2.41    4.45    2.90
wolf           2  cav        1.35    0.34    1.53    0.66    0.83
troll          5  monster   31.00   40.04   16.86   80.08   35.98
```

### 10.2 Counters at equal worth

40 militia-worth a side, one squad each. The row attacks the column. A number
is the % of the row's men still alive when the row wins; negative, the % of
the column's men alive when the column wins; `=` both broke.

```
             militi footma manata spearm pikema archer longbo crossb horsem knight horsea
militia           =     60      =     63     63    -69      =      =    -65      =      =
footman         -60      =      =      =     55      =      =    -60    -65     74     58
manatarms       -60    -58      =     64      =     68     59      =    -59     73     59
spearman        -63      =    -64      =      =    -77    -65    -75     76      =     62
pikeman         -70    -65    -55    -59      =    -96    -88    -90     75     96      =
archer           69      =      =     73     96      =    -65    -70    -65    -80     81
longbow          65      =      =     65     88     65      =    -70    -65    -70     71
crossbow          =     60      =     65     90     70     65      =    -76    -70     90
horseman         65     65     65    -76    -79     76     76     76      =      =     88
knight           70    -71    -68    -72    -92     80     70     80      =    -60     90
horsearcher     -51    -55    -59    -59     58    -81    -71    -85     79    -50     42
```

The intended cycle holds. **Spears beat horse**: pikemen break knights and
keep 96% of their men. **Horse beats archers**, keeping 70–80%. **Archers
beat spears**: 96% of the archers survive breaking pikemen. **Infantry is the
generalist** that beats spears and, head-on, knights (footmen beat knights
whichever side attacks, keeping 71–74%). **Horse archers beat light horse**
when they attack (79%), and lose to knights and to anything that shoots back.
Knights are flankers: they ride down militia and archers, and lose to every
trained foot line they hit from the front.

### 10.3 Armies at equal worth

Six doctrines at 150 militia-worth each, three seeds per pairing, both sides
the plain AI. Cell: wins/losses/draws for the row, then median rounds.

```
balanced    41 footman, 16 spearman, 29 archer, 13 horseman  (99 men)
shieldwall  37 manatarms, 23 footman, 26 crossbow  (86 men)
knights     23 knight, 40 militia, 21 bowman  (84 men)
horde       141 levy, 64 militia, 14 bowman  (219 men)
steppe      47 horsearcher, 22 horseman  (69 men)
yeomen      35 longbow, 27 pikeman, 24 militia  (86 men)

               balanced  shieldwall     knights       horde      steppe      yeomen
balanced      2/0/1 r10   0/3/0 r11    0/3/0 r9    3/0/0 r9   2/0/1 r19   2/1/0 r10
shieldwall    3/0/0 r10   0/0/3 r11   3/0/0 r13   3/0/0 r11   3/0/0 r12    3/0/0 r9
knights        3/0/0 r9   1/2/0 r11    1/0/2 r9    3/0/0 r6    3/0/0 r7    3/0/0 r8
horde          0/3/0 r9   0/3/0 r11    0/3/0 r6   0/0/3 r10   0/2/1 r20   0/3/0 r10
steppe        0/3/0 r17   0/3/0 r13   0/3/0 r15   3/0/0 r16   0/0/3 r16    3/0/0 r7
yeomen        0/2/1 r10    0/3/0 r9    0/3/0 r9   3/0/0 r10   3/0/0 r11    0/1/2 r9

Wins of 18: shieldwall 15, knights 14, balanced 9, steppe 6, yeomen 6, horde 0
```

### 10.4 Armies at equal gold and men

Equal worth says how strong a doctrine is; this says whether its **price** is
right. Each side gets 12 000 gold (iron counted at 30, horses at 40, the
market prices) and at most 110 men, a mid-campaign party; a doctrine that
reaches 110 men first spends less. Prices are `army.md` §3, mirrored in
`PRICE` in `report.mjs`.

```
balanced    37 footman, 16 spearman, 46 archer, 11 horseman  (110 men, worth 167, 10665 gold)
shieldwall  26 manatarms, 24 footman, 23 crossbow  (73 men, worth 125, 12000 gold)
knights     10 knight, 62 militia, 37 bowman  (109 men, worth 136, 7370 gold)
horde       83 levy, 22 militia, 6 bowman  (111 men, worth 71, 1670 gold)
steppe      27 horsearcher, 22 horseman  (49 men, worth 108, 12120 gold)
yeomen      28 longbow, 17 pikeman, 60 militia  (105 men, worth 150, 12090 gold)

               balanced  shieldwall     knights       horde      steppe      yeomen
balanced      0/0/3 r11    1/0/2 r9    3/0/0 r8    3/0/0 r6    3/0/0 r5    3/0/0 r8
shieldwall     0/1/2 r9   0/0/3 r11   3/0/0 r10    3/0/0 r8   3/0/0 r12    0/2/1 r8
knights        0/3/0 r8   0/3/0 r10    1/0/2 r9    3/0/0 r6    3/0/0 r7   0/1/2 r11
horde          0/3/0 r6    0/3/0 r8    0/3/0 r6   0/0/3 r10   0/3/0 r10    0/3/0 r8
steppe        0/3/0 r20    0/3/0 r9   0/3/0 r25   3/0/0 r12   1/0/2 r13   0/3/0 r10
yeomen         0/3/0 r8    2/0/1 r9   3/0/0 r10    3/0/0 r8   3/0/0 r10    0/0/3 r9

Wins of 18: balanced 13, yeomen 11, shieldwall 9, knights 7, steppe 4, horde 0
```

This table changed the prices. At the first draft's prices, knights cost about
as much as men-at-arms and the knights army won 6 of 6 against the shieldwall
at equal gold; longbows at 150 gold made the yeomen win 16 of 18. Mounted
troops now cost about 1.8× their tier's gold and twice its wages, longbowmen
240, and men-at-arms one iron less. The horde is last on purpose: it is the
army you have before you can afford anything else.

### 10.5 Formations

Each formation in the situation it exists for, against plain Line (§2), 9
seeds, wins/losses/draws and the enemy's average dead.

```
militia                              line             wide              deep
  equal numbers, 40 v 40             4/4/1 (kills 17)  0/6/3 (kills 15)   0/9/0 (kills 11)
  outnumbered, 40 v 56               0/9/0 (kills 10)  0/9/0 (kills 15)   0/9/0 (kills 9)
  against a charge, 40 v 12 knights  0/9/0 (kills 3)   0/9/0 (kills 2)    0/9/0 (kills 3)
footman
  equal numbers, 40 v 40             3/2/4 (kills 19)  0/6/3 (kills 17)   0/9/0 (kills 12)
  outnumbered, 40 v 56               0/9/0 (kills 12)  0/9/0 (kills 17)   0/9/0 (kills 10)
  against a charge, 40 v 12 knights  9/0/0 (kills 5)   0/9/0 (kills 5)    6/0/3 (kills 8)
spearman
  equal numbers, 40 v 40             3/3/3 (kills 19)  0/7/2 (kills 17)   0/9/0 (kills 13)
  outnumbered, 40 v 56               0/9/0 (kills 13)  0/9/0 (kills 16)   0/9/0 (kills 11)
  against a charge, 40 v 12 knights  8/0/1 (kills 7)   9/0/0 (kills 8)    9/0/0 (kills 8)
```

Wide does its one job: outnumbered, it kills about half again as many as Line
before it breaks, and at even numbers it loses. Deep has no open-field job,
which is why it waits for sieges.

### 10.6 Scale

N attackers against 30 of the same troop. To kill 12 of the 30, Lanchester's
linear law would cost the 60 twelve men and the square law about five.

```
militia   45 v 30: rounds 7  dead  9 : 12      archer   45 v 30: rounds 4  dead 8 : 13
militia   60 v 30: rounds 6  dead  7 : 12      archer   60 v 30: rounds 3  dead 5 : 12
militia   90 v 30: rounds 5  dead  5 :  9      archer   90 v 30: rounds 3  dead 5 : 19
knight    45 v 30: rounds 4  dead 11 : 13      knight   90 v 30: rounds 4  dead 11 : 13
```

### 10.7 What a bonus is worth

For each army-wide modifier, how many more troops the plain army needs to
break even with it (balanced army, 9 seeds, 5% steps).

```
melee +10%  ≈ +5% troops      ranged +10% ≈ +5% troops     def +1     ≈ +5% troops
melee +30%  ≈ +20% troops     ranged +30% ≈ +5% troops     def +3     ≈ +10% troops
morale +10  ≈ +20% troops     morale +25  ≈ +35% troops
```

### 10.8 Length and cost

```
200 random mid-sized battles: rounds p10 5, median 8, p90 12, max 21; no stalemates
8 squads / 200 men a side: 4.1 ms per battle (10 rounds) in Node on this machine
```

### 10.9 Rules the numbers forced

These are design decisions now; break one only with a new measurement.

1. **Price against gold and men together.** Neither worth nor gold alone is
   the constraint a player lives under: early it is gold, later it is party
   size. §10.4 checks both at once and is the final word on prices; the worth
   table only places a troop among its peers.
2. **Shield infantry with crossbows is the strongest doctrine per man** (15
   of 18 at equal worth) and mid-table per gold (9 of 18). It is also paid for
   on the map — slow, iron-hungry, unable to catch anything — and it is
   Kharum's identity.
3. **Morale is the most leveraged stat.** +10 morale is worth 20% more troops,
   four times what +10% melee damage is. Morale bonuses stay small: Leadership
   +4/8/12, banners at most +5, Rally local and expensive.
4. **Numbers win, then saturate.** 1.5× the men wins clearly and twice the
   men wins cheaply — between Lanchester's linear and square laws (§10.6).
   Past about 2×, the extra men stand idle unless split off to flank. The
   plain AI should learn to split a squad that overhangs nothing (M1).
5. **Massed archery is the square-law exception** (90 archers lose 5 to kill
   19 of 30). Ammo (10–16 volleys) and shields are its brakes; don't raise
   ammo casually.
6. **Cheap troops lose at equal worth** (horde 0 of 18) because they break.
   So low tiers are priced cheaper per worth: the gold-efficient,
   slot-inefficient choice, which is what a starting player can afford.
7. **The day-is-lost rule is load-bearing.** It is the difference between a
   median of 8 rounds and a long tail of mop-up.
8. **Horse archers need a player.** The AI's steppe army wins 6 of 18 at equal
   worth and 4 at equal gold; kiting is a skill. Accept it (Ulus is the skill faction), but improve the AI's
   kiting when the real sim exists, so Ulus lords aren't pushovers.
9. **Don't fix the plain AI's weaknesses with stats.** If something only
   loses because the AI misuses it, fix the AI.
10. **Only Line envelops.** Any formation that could both widen and wrap won
    every fight it was in. A formation is a tool for one situation (§10.5).

## 11. After the battle

| Who                 | What happens                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Winner's dead       | **wounded** with chance 35% (+15% per Medicine rank), else killed; XP goes to the men who fought and lived                         |
| Winner's fled       | rejoin the party                                                                                                                   |
| Loser's dead        | wounded ones are **captured** by the winner; the rest killed                                                                       |
| Loser's fled        | escape, minus **pursuit**: the winner's horse catches up to `min(50%, 0.3 × winner horse worth / fled worth)` of them as prisoners |
| Loser's hero / lord | captured if their banner squad died or ran and the side lost; a hero with a mount item escapes half the time (a Courser always)    |
| Draw                | both withdraw; no pursuit, no prisoners, no loot                                                                                   |

Loot, XP and renown are in `world.md` and `army.md`.

**Retreat** mid-battle: every squad not in melee escapes, and squads in melee
each lose a quarter of their men breaking off. If none of your squads has
been in melee yet, you also leave a **rearguard**, the slowest 15% of your
worth, exactly as on the map (`world.md` §5). Retreating is never free.

**Disengaging.** After a retreat, a draw, or a Leave on the map, the two
parties cannot make contact with each other for **6 hours**, and the one that
withdrew moves first. If you meet the same hostile party again within a day,
Leave is offered only if you are faster than it. Without these rules a slow
army could retreat from the same fight forever, one hex at a time.

## 12. Auto-resolve and odds

**Auto-resolve is the battle**, run instantly with the plain AI on both sides
(abilities by the §5 policy) and your hero's modifiers applied. There is no second, simpler formula to
drift out of agreement with it.

**Odds** are 8 auto-resolves with different seeds (about 30 ms). The sheet
shows the win share as a word and a number, and the median losses:

| Wins of 8 | Shown as     |
| --------- | ------------ |
| 8         | Overwhelming |
| 6–7       | Favourable   |
| 3–5       | Even         |
| 1–2       | Risky        |
| 0         | Hopeless     |

> Odds: **Favourable** (7 of 8) · you'd lose about 6 militia, 2 archers

Auto-resolve uses the plain AI for you too, so playing a battle by hand usually
does better than its odds. That is deliberate: it rewards playing, and the
honest number is the floor. AI-versus-AI battles out of the player's sight use
the same function (4 ms each is affordable at the world's battle rate; see
`tech.md`).
