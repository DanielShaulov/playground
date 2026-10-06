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

These are the stats in `theory/battle.mjs`, and every number in the worth
column comes from `report.mjs` (`battle.md` §10.1). Change one, rerun it.

`dmg` is melee damage per fighting man per round; `mdmg` per missile that
hits. Speed is metres per second on the battlefield. Shields are the share of
frontal missile damage blocked when not in melee.

| Troop         | T   | Role   | hp  | atk | def | dmg | armour | shield | speed | morale | special                                                       | worth |
| ------------- | --- | ------ | --- | --- | --- | --- | ------ | ------ | ----- | ------ | ------------------------------------------------------------- | ----- |
| Levy          | 1   | inf    | 22  | 2   | 2   | 5   | 0      | —      | 4.5   | 50     |                                                               | 0.53  |
| Militia       | 2   | inf    | 26  | 3   | 3   | 6   | 1      | 0.3    | 4.5   | 60     |                                                               | 0.93  |
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

**How the tiers were built.** Each tier step is +1 atk, +1 def, about +15% hp
and damage on the role's base, which compounds to roughly ×1.5 fighting power
per man. Roles then skew it: spears trade damage for a second fighting rank and
antiCav; ranged trade melee for range; horse carry most of their hp on the
horse and most of their damage in the charge. The first hand-written table
jumped several factors at once between tiers and produced a knight worth 7
militia; the formula is what made the ladder even (`theory/` history).

**Worth is a duel number, and it misleads in two known ways** (`battle.md`
§10.7): it overrates horse, which slaughter archers and militia but lose to
any braced line, and underrates heavy infantry, whose value is standing in
front of everyone else. Prices below follow tier, not worth.

## 3. Prices, wages, XP

| Tier | Value (gold) | Upgrade from below | Weekly wage | XP to reach | Ransom |
| ---- | ------------ | ------------------ | ----------- | ----------- | ------ |
| 1    | 10           | recruit 10         | 1           | —           | 4      |
| 2    | 30           | +20                | 2           | 20          | 10     |
| 3    | 70           | +40                | 4           | 60          | 22     |
| 4    | 150          | +80                | 7           | 150         | 45     |
| 5    | 300          | +150               | 12          | 300         | 90     |

- **Mounted troops** pay wages ×1.5 (rounded up) and ransom ×1.5.
- **Recruiting** directly at tier 2 (militia, bowmen) costs 30; squires cost
  40 and a horse; tier 3 at a Barracks costs 70 plus the line's iron.
- **Iron and horses** are paid at the upgrade that needs them:

| Troop         | Iron | Horses | Note                                |
| ------------- | ---- | ------ | ----------------------------------- |
| Footman       | 1    |        | mail                                |
| Spearman      | 1    |        |                                     |
| Man-at-arms   | 2    |        | plate; 3 iron in all from levy      |
| Pikeman       | 1    |        |                                     |
| Crossbowman   | 2    |        | the bow is steel                    |
| Squire        |      | 1      |                                     |
| Horseman      | 1    |        |                                     |
| Knight        | 2    | 1      | a warhorse; 3 iron, 2 horses in all |
| Horse archer  |      |        |                                     |
| Hearthguard   | 2    |        | 5 iron in all                       |
| Banner Knight | 2    | 1      | 5 iron, 3 horses in all             |
| Keshig        | 2    | 1      |                                     |

Gold per militia of worth, for reference: levy 19, militia 32, bowman 28,
squire 25, archer 45, footman 54, horseman 33, knight 41, crossbowman 73,
man-at-arms 82, pikeman 91, hearthguard 124. Low tiers are cheap per worth on
purpose: a starting warband can only afford numbers, and numbers are what
break (rule 6). Horse look cheap in gold and pay in horses, iron and wages.
Heavy infantry look dear, and are the strongest doctrine in the armies table.

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

Four claimants, each the heir of one culture. Their homelands are placed by
the world generator around the ruined capital (`world.md`).

| Faction          | Homeland                  | Colour           | Doctrine                                   |
| ---------------- | ------------------------- | ---------------- | ------------------------------------------ |
| **Valemark**     | west: plains, farmland    | blue `#5b8def`   | heavy horse, crossbows, a steady foot line |
| **Fenreach**     | south-west: forest, marsh | green `#4caf6a`  | longbows behind pikes, light horse         |
| **Kharum Holds** | north: hills, mountains   | ochre `#d08a3c`  | shield infantry and crossbows              |
| **Ulus**         | east: steppe              | violet `#b46bd6` | horse archers and lancers                  |

What each culture's tree has (✓), lacks (—), or changes:

| Branch       | Valemark                                         | Fenreach                                                             | Kharum                                                                            | Ulus                                                                              |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Man-at-arms  | ✓                                                | ✓ −1 def, speed 4.5                                                  | ✓ +1 def                                                                          | —                                                                                 |
| Pikeman      | ✓                                                | ✓                                                                    | ✓                                                                                 | —                                                                                 |
| Longbowman   | —                                                | ✓ +10 m range                                                        | —                                                                                 | —                                                                                 |
| Crossbowman  | ✓                                                | —                                                                    | ✓ +1 armour                                                                       | —                                                                                 |
| Knight       | ✓                                                | —                                                                    | ✓                                                                                 | ✓ as Lancer: −1 armour, speed 10                                                  |
| Horse archer | —                                                | —                                                                    | —                                                                                 | ✓                                                                                 |
| Tier 5       | Banner Knight                                    | Warden                                                               | Hearthguard                                                                       | Keshig                                                                            |
| Trait        | **Lance**: horse charge +25%; infantry −4 morale | **Greenwood**: forest and marsh cost 0.6 less to cross; ranged +10 m | **Stone-born**: hills and passes cost as plains; infantry +1 def; party pace ×0.9 | **Endless Steppe**: party pace +15%; horse archers +2 volleys; infantry −6 morale |
| Ability      | Lance Charge                                     | Stakes                                                               | Shield Wall                                                                       | Feigned Flight                                                                    |
| AI temper    | aggressive, honourable                           | defensive, cunning, raids                                            | slow to war, relentless besiegers                                                 | opportunistic raiders, fast                                                       |

Abilities are in `battle.md` §6. Culture variants are **not yet measured**;
M1's port of the report must add them before the numbers are trusted.

Troop names are the culture word plus the generic name ("Vale Footman",
"Steppe Horseman"), except the four elites.

## 5. The Hollow, brigands, beasts

**The Hollow** (Act II onward; rules in `battle.md` §9). They have no morale;
they crumble without a captain near. Not yet modelled — the crumble rule needs
its own measurement.

| Unit         | Like        | hp   | atk | def | dmg | armour | Notes                                      |
| ------------ | ----------- | ---- | --- | --- | --- | ------ | ------------------------------------------ |
| Skeleton     | levy        | 20   | 2   | 2   | 5   | 1      | the bulk; Raise Dead makes more            |
| Bone archer  | bowman      | 18   | 1   | 1   | 4   | 1      | range 60, mdmg 6, acc .45, 8 volleys       |
| Wight        | man-at-arms | 40   | 6   | 7   | 9   | 5      | shield .3                                  |
| Death knight | knight      | 48   | 7   | 6   | 9   | 6      | charge 12, speed 8                         |
| Wight-lord   | captain     | 150  | 7   | 7   | 20  | 5      | squad of 1–3; binds; Raise Dead            |
| Hollow King  | boss        | 2000 | 10  | 10  | 120 | 8      | squad of 1; aura +2 atk; his death ends it |

**Brigands** use the generic stats under other names: Looter (levy), Brigand
(militia), Poacher (bowman), Raider (squire), Deserter (footman or
crossbowman). A **Brigand Chief** leads a banner squad of six militia-grade
toughs with the stats of a hero's guard.

**Beasts** are neutral guards of lairs and wanderers in the wild.

| Beast        | hp   | atk | def | dmg | speed | Notes                                                                       | worth |
| ------------ | ---- | --- | --- | --- | ----- | --------------------------------------------------------------------------- | ----- |
| Wolf         | 18   | 4   | 2   | 6   | 12    | charge 4; packs of 3–5 squads                                               | 0.83  |
| Troll        | 400  | 8   | 6   | 70  | 4     | squads of 1–4, 4 m apart; fear 4                                            | 36    |
| Wyrm         | 3000 | 10  | 9   | 150 | 5     | squad of 1; fear 8; breath every 2nd round: one squad within 50 m takes 300 | —     |
| Barrow-wight | 40   | 6   | 7   | 9   | 4     | Hollow rules, but bound to its barrow, not a captain                        | —     |

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
By §10.5 of `battle.md`, that is worth roughly +40% troops before skills —
the hero matters, but a big army still beats a great hero with a small one.

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
with the Sceptre. About 30 at the start, 65 by day 60, 110 late.

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
| Logistics     | party pace +10 / 20 / 30%                                                                             |                        |
| ◆ Pathfinding | terrain cost above 1 reduced 25 / 50 / 75%                                                            |                        |
| ◆ Scouting    | sight +1 / 2 / 3; see compositions / lords' intents / into forest                                     |                        |
| ◆ Medicine    | wounded share +15 / 30 / 45%; healing ×1.5 / 2 / 2.5                                                  |                        |
| Training      | daily XP +1 / 2 / 3 per man, for tiers ≤ 2 / 3 / 4                                                    |                        |
| Stewardship   | wages −10 / 20 / 30%; fief income +10 / 20 / 30%                                                      |                        |
| ◆ Engineering | siege works 1 / 2 / 3 days faster (min 1); own walls +1 level (Exp)                                   |                        |
| Diplomacy     | relation gains +25 / 50 / 75%; ransoms +20 / 40 / 60%; persuade lords to defect (Exp)                 |                        |

Sizing note: Leadership Expert's +12 morale is, by itself, worth about +22%
troops (`battle.md` §10.5). That is the strongest single skill, deliberately,
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
| Destrier                      | mount   | relic  | banner squad charges (charge 10)                                                  |
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

- **Party role.** Scout, Surgeon, Engineer or Quartermaster: the party uses
  their skill if it beats the hero's (◆ in §7; Quartermaster covers
  Logistics and Stewardship).
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
