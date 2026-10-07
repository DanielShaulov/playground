# Crownless — the world map

The strategic layer: a procedurally generated realm of hexes where time passes
as you travel, four claimants make war, brigands and beasts roam, and from Act
II the Hollow spreads out of the old capital. Troops, prices and the hero are
in [army.md](army.md); battles in [battle.md](battle.md).

## Contents

1. [The map](#1-the-map)
2. [Time and movement](#2-time-and-movement)
3. [Sight and fog](#3-sight-and-fog)
4. [Places](#4-places)
5. [Parties and encounters](#5-parties-and-encounters)
6. [Economy](#6-economy)
7. [Keeping a warband](#7-keeping-a-warband)
8. [Lords and the strategic AI](#8-lords-and-the-strategic-ai)
9. [Your standing](#9-your-standing)
10. [Sieges, fiefs and buildings](#10-sieges-fiefs-and-buildings)
11. [Contracts](#11-contracts)
12. [The Hollow, the Regalia, and the end](#12-the-hollow-the-regalia-and-the-end)
13. [Difficulty](#13-difficulty)
14. [Pacing targets](#14-pacing-targets)

---

## 1. The map

Pointy-top hexes, taller than wide to suit a portrait screen. A hex is drawn
26 px from centre to corner — 45 px across, big enough to tap — so a phone
shows about 8 columns and 15 rows at once.

|          | Small                          | Medium (default)          |
| -------- | ------------------------------ | ------------------------- |
| Hexes    | 30 × 44                        | 38 × 56                   |
| Factions | 4                              | 4                         |
| Towns    | 1 per faction + Crownhold      | 2 per faction + Crownhold |
| Castles  | 2 per faction                  | 3 per faction             |
| Villages | ~20                            | ~42                       |
| Lords    | 3 per faction (ruler included) | 5 per faction             |
| Campaign | 2–3 hours                      | 4–6 hours                 |

### Terrain

| Terrain   | Cost                         | Sight                              | Battlefield   | Where                                                       |
| --------- | ---------------------------- | ---------------------------------- | ------------- | ----------------------------------------------------------- |
| Plains    | 1                            |                                    | open          | everywhere; Valemark                                        |
| Farmland  | 1                            |                                    | open, houses  | around villages                                             |
| Steppe    | 0.9                          | +1                                 | open          | Ulus                                                        |
| Forest    | 1.6                          | hides parties in it beyond 2 hexes | woods         | Fenreach                                                    |
| Marsh     | 2                            |                                    | mud           | Fenreach                                                    |
| Hills     | 1.4                          | +2 standing on it                  | slope         | Kharum; iron                                                |
| Mountains | —                            |                                    | —             | ridges between regions; Kharum                              |
| Pass      | 2                            |                                    | slope         | 2–3 gaps per ridge                                          |
| River     | —                            |                                    | —             | a chain of hexes, entered only at fords (2) and bridges (1) |
| Road      | ×0.6 of the terrain under it |                                    |               | between settlements                                         |
| Sea, lake | —                            |                                    | —             | map edges, a few lakes                                      |
| Blight    | +0.2                         | −1                                 | as underneath | spreads from the Hollow (§12)                               |

### Generation

Every map comes from a seed, and the save stores only the seed for terrain
(`tech.md`), so generation must be deterministic and stable across versions.

1. **Crownhold** at the centre (±2 hexes), on a low plateau of ruins.
2. **Four capitals** on a cross around it, 35–45% of the way to the edges,
   with the cultures assigned to the four arms in a random rotation. A seed
   decides whether Kharum is north or east. Built: 11–14 rows north and
   south, 8–10 columns east and west of Crownhold, nearer 40–50%; further out
   and a region's outer castles and villages crowd into the sea.
3. **Regions** grow from the five seats by weighted flood fill; their borders
   are the frontiers.
4. **Terrain** from two octaves of value noise for height and wetness, biased
   per region: Valemark low and mild (plains, farmland), Fenreach wet (forest,
   marsh), Kharum high (hills, mountains), Ulus dry (steppe). Mountain
   **ridges** follow some region borders, with 2–3 **passes** each.
5. **Rivers**, 3–5 of them, run downhill from high ground to an edge, with a
   ford every ~6 hexes.
6. **Settlements** per region: the capital town, one more town (Medium),
   castles at frontier-facing spots, villages 2–4 hexes from their town (3
   each) and castle (1–2 each), at least 3 hexes apart.
7. **Roads**: a minimum spanning tree over settlements plus a few extra
   links, routed by A\* over terrain cost (preferring existing road), bridges
   where they cross rivers, and the old roads from every capital to Crownhold.
8. **Sites** per region: 1–2 iron mines (hills first), 1–2 horse ranches
   (plains, steppe), and 2–3 gold mines in the wilds between regions. All
   start guarded by neutrals scaled to their distance from the capitals.
9. **Lairs**, 8–12 in wild hexes far from settlements, harder the farther from
   any capital. Three **great lairs** go roughly equidistant from Crownhold in
   three different regions, hidden until Act II.
10. **Scatter**: 30–50 pickups, 4–6 shrines, 4–6 watchtowers, 2–3 mercenary
    camps, 3–4 standing stones.
11. **Validate** that every settlement can reach every other by land, that
    each faction has an iron and a horse site in its region, and that no lair
    sits within 5 hexes of the player's start. If not, try `seed + 1` and
    record the seed actually used.
12. **Start** the player at a village of their home culture, near but not at
    the capital. Built: the capital's nearest village, kept 6+ hexes from
    any lair for all four cultures, because the realm doesn't depend on which
    you pick.

## 2. Time and movement

**The world moves when you move.** One **tick** is an hour; a day is 24, a
week 7 days. Time passes only while you travel or wait, and while it does,
every party on the map advances along its own path at its own pace. Stop, and
the world stops with you. That is Mount & Blade's living map with no clock on
your thinking.

**Pace** is hexes per day on cost-1 terrain:

```
pace = 12 × class × size × wounded × limit × (1 + Logistics + mount) × culture
class:   all mounted 1.35 · at least half mounted 1.15 · otherwise 1
size:    1 − 0.003 × max(0, men + prisoners / 2 − 40), at least 0.75
wounded: 1 − 0.2 × (wounded share)
limit:   0.9 while over the party limit (§7), else 1
mount:   the hero's mount item (army.md §8): Rouncey 0.05, Courser 0.1, …
```

**Time to cross a hex** is `24 / pace × terrain cost` hours, with road ×0.6
and Pathfinding shaving the part of the cost above 1. At pace 12 a plains hex
takes 2 hours, and a Medium map takes about 6 days to cross north to south
(4½ mounted). A war campaign — march, besiege, return — is about two weeks.

**On screen**, an hour of travel is 0.12 s, so a day is about 3 s. ⏩ runs at
3×. You tap a destination, see the path and its arrival time, and tap Go.
Travel **stops on its own** when:

- you arrive, or a place along the way is worth a look (first visit);
- a hostile party comes into sight that is stronger than you or heading for
  you;
- something happens to you: an ally asks for help, a siege of your fief
  begins, the week turns with unpaid wages;
- an event begins (the Hollow rising, a Regalia revealed).

So far (M2) the only place worth a stop is a watchtower, climbed on the first
visit; towns and lairs found on the way go in the Journal as you pass.
**Stop** finishes the step into the next hex, so you always stand on one.

**Waiting** ("Rest") passes time in place until tapped again, until morning,
or until the wounded are healed. Resting in a friendly settlement heals
faster (§7).

**Contact** happens when two parties come within 0.6 hex of each other and one
of them means to fight (§5). Positions are continuous along paths, so a faster
party catches a slower one, and a slower one can't get away. Contact is
checked along each party's movement during a tick (the closest approach of
the two moves), not only where they end it: two fast parties on a road close
by over 3 hexes an hour and would otherwise pass through each other.

## 3. Sight and fog

A party sees **4 hexes**, +1/2/3 with Scouting, +2 standing on hills, −1 at
night (20:00–05:00). Parties in forest are seen only within 2 hexes. Your
settlements see 4. A visited **watchtower** reveals 10 hexes' terrain; one in
your territory also gives live sight there.

The map has three states per hex: **unexplored** (hatched parchment),
**explored** (terrain and places as last seen, owners possibly out of date)
and **in sight** (parties visible, everything current). Explored hexes are a
bitset in the save.

## 4. Places

### Settlements

| Place     | Walls | Garrison (worth)   | Weekly income  | Recruits                                                              | Also                                                                       |
| --------- | ----- | ------------------ | -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Town      | 3     | 120–260            | 100            | militia, bowmen (pool 8, +4/wk); tier 3 with Barracks (pool 6, +2/wk) | tavern, market, smith, ransom broker                                       |
| Castle    | 2     | 60–150             | 40             | squires (pool 4, +1/wk); tier 3 with Barracks                         | the noble line; holds villages                                             |
| Village   | —     | —                  | 15, +specialty | levies (pool 12, +3/wk)                                               | specialty: grain (+10 gold), iron (+1/wk) or horses (+1/wk); can be raided |
| Crownhold | 3     | Hollow from Act II | —              | —                                                                     | the endgame (§12)                                                          |

Villages belong to their town or castle and change hands with it. Recruiting
needs the owner's goodwill (relation ≥ −10 for levies, ≥ 10 for squires, or
being of their faction). A **raided** village (§8) gives nothing for 14 days.

### Sites to flag

HoMM's mines: visit with an army and they are yours until someone else visits.
Each starts guarded by neutrals (worth 20–120 by distance from capitals).

| Site        | Produces for its owner | Where                     |
| ----------- | ---------------------- | ------------------------- |
| Iron mine   | 1 iron a day           | hills, mountain edges     |
| Horse ranch | 1 horse a day          | plains, steppe            |
| Gold mine   | 20 gold a day          | the wilds between regions |

### Lairs

One-time fights that guard treasure. Clearing one gives gold, often an item,
renown (20 / 40 / 80 by size) and hero XP of 200 / 500 / 1200.

| Lair            | Guards (worth)                                       | Treasure                                   |
| --------------- | ---------------------------------------------------- | ------------------------------------------ |
| Brigand hideout | brigands 30–80; spawns raiding parties until cleared | gold 200–600                               |
| Wolf den        | 3–5 wolf packs, 30–60                                | gold 100; spawns wolf packs until cleared  |
| Troll bridge    | 1–3 trolls and their thralls, 80–150                 | gold 600–1000; rare item                   |
| Barrow          | barrow-wights, 80–160                                | rare item; a shrine ability                |
| Ruined fort     | deserters, 100–180                                   | the deserters' survivors offer to join you |
| Great lair (×3) | by composition (§12)                                 | one of the Regalia each                    |

### Everything else

| Place          | What it does                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pickup         | gold (50–150); a chest (500 gold _or_ 600 XP, your choice); a cache of 3 iron or 2 horses; abandoned arms (upgrade 5 men one tier for free) |
| Shrine         | learn its ability (Mending, Fog, Smite or Dread) for 300 gold                                                                               |
| Standing stone | +1 to an attribute, once                                                                                                                    |
| Watchtower     | reveals 10 hexes; live sight if in your territory                                                                                           |
| Mercenary camp | tier 3–4 troops of any culture at 2.5× value, no iron or horses needed; pool 6, +1/wk                                                       |
| War memorial   | +10 party morale for a week                                                                                                                 |

## 5. Parties and encounters

What moves on a Medium map:

| Party           | How many      | Worth                                              | Behaviour                                     |
| --------------- | ------------- | -------------------------------------------------- | --------------------------------------------- |
| You             | 1             | `army.md`                                          |                                               |
| Lords           | 20            | 40 + 25 × rank + 15 per fief, ≤ 220 (rulers ≤ 260) | §8                                            |
| Marshal's army  | 0–2 at a time | 300–700 (3–5 lords together)                       | campaigns, sieges                             |
| Brigands        | up to 12      | 8 + 2 per week elapsed, ≤ 60                       | hunt the weak, raid villages, flee the strong |
| Wolf packs      | up to 4       | 10–30                                              | roam near their den                           |
| Caravans        | 1 per town    | escort ~20; carry 200–400 gold                     | town to town; raided in wartime               |
| Hollow warbands | Act II, §12   | 50 + 15 per week since the rising, ≤ 300           | raid, besiege, spread blight                  |

**Meeting a party** opens the encounter sheet (`ui.md`): both armies, the
odds from eight auto-resolves (`battle.md` §12), and the options that apply.

| Option                | When                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| Fight                 | always: the battle                                                                    |
| Auto-resolve          | always: the battle, instantly                                                         |
| Leave                 | they're not hostile, or they're hostile and slower than you                           |
| Sacrifice a rearguard | they're faster and want you: leave your slowest 15% of worth behind (lost) and escape |
| Pay                   | brigands: 20% of your gold, and they leave you alone for 3 days                       |
| Talk                  | lords: news, contracts, join their campaign, demand surrender of a weaker party       |
| Surrender             | you're captured (§7)                                                                  |

**Battles grow.** When a battle starts, every party within 2 hexes that is
allied to one side and at war with the other joins it, bringing its squads
under its own AI (`battle.md` §2 caps). That is how a lone scout turns into a
pitched battle, and why a relief army matters.

**Getting away** has a cost and a rule. After a Leave, a retreat or a draw,
the two parties can't make contact for 6 hours, and the one that withdrew
moves first; met again within a day, Leave is offered only if you are faster
(`battle.md` §11).

Battles between AI parties are fought by the same function out of sight, with
no screen. (About 4 ms each; a Medium world has a few a day.)

**As built in M2** (`rules/parties.js`, `rules/encounter.js`, numbers in
`rules/data/parties.js`):

- A party sees 4 hexes, 3 at night, and only 2 into a forest you stand in.
  Brigands hunt you if they're 1.2× your worth and flee if you're 1.2× theirs;
  otherwise they roam within 8 of their hideout, favouring roads. Wolves
  roam within 6 of their den, off the roads, and hunt what comes within 3
  hexes unless you're 1.5× them or they've strayed 8 from the den. Your worth, as they see it, is your fit men's
  plus your banner's household. An outlaw nobody has fought is left alone.
- Parties move 12 hexes a day × class × size, as you do but with no hero or
  culture: brigands on foot match an unmounted warband (a band that runs
  can't be caught; one that roams can), and wolves are fast (16.2).
- Weekly, each hideout sends out a band and each den a pack, up to 12 and 4;
  and every band grows to what a band is worth that week (8 + 2 a week,
  each by its own 0.8–1.2 measure), making good its losses. A band worth 24
  has a chief (a level-3 hero and up to six guards). A purse is 20 gold and
  3 a man.
- Travel stops when a party newly in sight is coming for you or is stronger.
- **Pay**: brigands that came for you; they won't hunt you for 3 days, but
  you may still Attack them (the deal is off). **Leave** (you came for them,
  or you're faster) and a **rearguard** (your slowest fit men, worth 15%,
  lost) end the meeting with 6 hours in which neither side can make contact,
  even chasing. Talk and Surrender wait for lords and capture (M3+).
- **Auto-resolve** keeps `battle.md` §11's aftermath. Won: your dead leave,
  your wounded stay, loot is 15% of the value of their dead and taken plus
  their whole purse, the taken ride as prisoners up to half your limit (none
  from wolves), and the band is gone. Lost: see capture in §7's as-built
  note; the band leaves you be for a day. Drawn: 6 hours.
- Pickups: gold, iron and horses are taken in passing; abandoned arms when
  you pass with men who can use them (§7); a chest waits for the hero's XP
  (M3's second PR). Battles don't grow yet (there are no allies to join), and
  AI parties don't fight each other.

## 6. Economy

Three resources (README, D4): **gold** for everything, **iron** for armour and
buildings, **horses** for mounts.

### Where it comes from

| Source         | Amount                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Loot           | 15% of the value (`army.md` §3) of enemies killed or captured, plus their purse: all of a brigand's, 20% of a lord's |
| Ransom         | sell prisoners at a town's broker at `army.md` §3's ransom; lords 400 + 150 × rank                                   |
| Fiefs          | per week: village 15 (+specialty), castle 40, town 100; Market +50%                                                  |
| Sites          | iron mine 1 iron/day, ranch 1 horse/day, gold mine 20 gold/day                                                       |
| Mercenary pay  | per week: 2 × your party's worth (§9)                                                                                |
| Contracts      | 100–600 gold (§11)                                                                                                   |
| Raiding        | 6 hours at an enemy village: 100–200 gold and 1–2 of its specialty; it gives nothing for 14 days (relations: §9)     |
| Lairs, pickups | §4                                                                                                                   |
| Markets        | buy iron at 30 (5 a week per town), horses at 40 (3 a week; Ulus towns 6 at 30)                                      |

### Where it goes

| Sink              | Amount                                              |
| ----------------- | --------------------------------------------------- |
| Recruiting        | 10–70 gold a man (`army.md` §3)                     |
| Upgrades          | `army.md` §3: gold, iron and horses                 |
| Wages             | weekly, `army.md` §3; garrisons half; companions 15 |
| Buildings         | 300–1500 gold and iron (§10)                        |
| Items, companions | 300–3000; 300–800                                   |
| Shrine abilities  | 300                                                 |

### The week

Every seventh midnight, in this order:

1. **Wages** for your party, garrisons and companions. If you can't pay all
   of it, you pay what you can, party morale drops 20, and 10% of the unpaid
   men desert, lowest tiers first.
2. **Income** from fiefs, yours and every lord's.
3. **Recruit pools** refill.
4. **Spawns**: brigands at hideouts, wolves at dens; the Hollow on its own
   clock (§12).
5. **Faction decisions**: war and peace, marshal campaigns (§8).
6. **The weekly report** in the Journal: income, wages, what changed hands.

Every midnight: sites produce, the wounded heal, Training XP lands, sieges
tick, buildings progress.

## 7. Keeping a warband

**Party size** is in `army.md` §6. Over the limit (it can happen when the
limit drops, or troops join from a lair), you can't recruit or upgrade, and
pace drops 10%.

**Wounded** men (`battle.md` §11) travel with you, are paid, and don't fight.
They heal 10% of the original count a day (×1.5 resting in a friendly
settlement; Medicine multiplies).

**Prisoners** ride along up to half your party limit. They count half
against pace and not at all against party size, and being over the party
limit stops recruiting and upgrading, never taking prisoners. Sell them at a
town's broker, release them (relations with their faction +1 per 10), or
**recruit** them: after 4 days held (−1 per Diplomacy rank) a prisoner stack
can be recruited at half the troop's value plus all of its line's iron and
horses, keeping its tier, no XP. Recruited prisoners can't be delivered for a
Raise troops contract (§11).

**Party morale** (0–100, base 60) shifts every squad's starting morale in
battle by `(party morale − 60) / 4`: −15 at 0, +10 at 100.

| Party morale change  | Amount                      |
| -------------------- | --------------------------- |
| Leadership           | +5 per rank                 |
| A victory / a defeat | +10 / −15, decaying 2 a day |
| Unpaid wages         | −20 per missed week         |
| Over the party limit | −10                         |
| War memorial         | +10 for a week              |
| Blighted hex         | −1 a day while in it        |

Under 20 at the week's turn, 5% of your tier 1–2 men desert.

**Capture.** If you lose a battle and your banner squad was broken, you are
taken. Your surviving troops scatter (lost), your prisoners go free, and you
are held at the captor's nearest settlement for 3–10 days, then ransomed for
20% of your gold or escape. You restart from that settlement with your gold,
items, companions (wounded) and fiefs, and no army. Expensive, never final. A
hero with a mount item escapes the field half the time instead (a Courser
always).

**A wounded hero** — down in a battle, captured or not — can't use abilities
until healed: 3 days, 1 with Medicine Expert.

**As built in M3 so far** (`rules/warband.js`, numbers in
`rules/data/warband.js`, which mirrors §4, §6, this section and `army.md` §3):

- **Recruiting** needs no goodwill until lords exist (M4): every village,
  town and castle recruits. Each troop has its own pool at each place (a town
  keeps 8 militia _and_ 8 bowmen), full until first touched. A recruit costs
  its line's value, iron and horses; a camp's mercenary 2.5× its value and
  nothing else, one troop per camp chosen by the seed. Over the limit, or
  with no room left under it, you can't.
- **The week** runs at the seventh midnight as §6 says, minus income (no
  fiefs yet): wages (unpaid: morale −20 and a tenth of the unpaid share of
  your men desert, lowest tiers first), then morale under 20 costs 5% of the
  tier 1–2 men, then pools and markets refill, then the spawns, then a
  Journal line.
- **Morale** in battle waits on the battle rework; for now it drives
  desertion only. Victories and defeats fade 2 a day toward nothing.
- **Healing** is ×1.5 in any settlement you stand in (no hostility yet).
- **Prisoners** from each fight are a stack of their own, ready 4 days from
  that hour. A band's men join in your culture's colours, keeping their tier.
  Release has no relations to change yet.
- **Capture**: every defeat by brigands is one until the battle reports a
  broken banner. You're held 3–10 days at the village nearest the fight,
  then ransomed for 20% of your gold or (even odds) escape; while held, time
  runs, no party can meet you and nothing can be ordered. Wolves leave you
  at the nearest village with no army. No free levies either way.
- **Abandoned arms** go to the five lowest-tier fit men that have a next
  tier, on the first branch of their tree; with nobody to use them they
  stay.

## 8. Lords and the strategic AI

**Lords** are named characters with a culture, a rank (1–5), gold, fiefs, a
party, three traits (Valour, Honour, Prudence, each −2 to +2) and a relation
with every other lord and you (−100 to 100). Captured lords sit in a
settlement until ransomed (by their faction, after 10–20 days) or released.
Lords are not killed.

**AI never cheats.** Lords recruit, pay wages, upgrade and travel under the
same rules and prices as you. Difficulty changes what they start with (§13),
not what they're allowed.

### What a lord does

Once a day, or when something changes nearby, an idle lord scores every
behaviour and takes the best:

```
utility = gain × P(success) / days to do it × trait bias
```

`P(success)` comes from comparing worth with an assumed 20% fog error, not
from running the battle sim (too costly to do for every option).

| Behaviour | Gain                                                        | Leans on |
| --------- | ----------------------------------------------------------- | -------- |
| Gather    | recruit at own fiefs when below 70% of target size          | Prudence |
| Patrol    | default: wander own villages, worth a little                |          |
| Defend    | a friendly settlement besieged or village raided in reach   | Honour   |
| Hunt      | a weaker hostile party in sight: its loot and renown        | Valour   |
| Raid      | an enemy village at war, lightly defended                   | −Honour  |
| Besiege   | alone, a weak enemy castle; usually only as part of an army | Valour   |
| Follow    | the marshal's summons                                       | Honour   |
| Flee      | a stronger hostile is within 3 hexes and coming             | Prudence |
| Rest      | heal at own fief when wounded > 30%                         |          |

### What a faction does

Weekly, each faction:

- **Wars.** A faction wants war with a neighbour it out-strengths and peace
  with one it has bled against. War weariness (casualties, fiefs lost, weeks
  at war) grows, and peace gets likelier with it. Truces last 30 days. A
  faction is rarely at war with more than two others.
- **Marshal.** One lord, re-chosen every 30 days, may call a **campaign**:
  gather 3–5 lords into an army (one map party, combined strength) against a
  target scored on value, weakness and distance. An army's cohesion lasts
  about two weeks; then it disbands.
- **Coalitions.** A faction holding over 35% of the realm's towns and castles
  makes every other faction want war with it, and peace with each other.
  That is the anti-snowball, and why the realm won't unite itself before you
  arrive.
- **The Hollow** (Act II). Factions bordering the blight value peace with
  each other more, and send more to defend.
- **Fiefs** won go to the lord who took them, or the one with fewest.

The world simulator (`tech.md`) runs this with no player for 200 days across
many seeds. It is the test that the realm stays at war and in balance.

## 9. Your standing

**Renown** is your reputation, earned and occasionally lost:

| Earned by              | Renown                                                     |
| ---------------------- | ---------------------------------------------------------- |
| Winning a battle       | `worth defeated / 10 × clamp(their worth / yours, 0.5, 2)` |
| Clearing a lair        | 20 / 40 / 80                                               |
| Taking a castle / town | 40 / 80                                                    |
| A contract             | 10–30                                                      |
| Each of the Regalia    | 100                                                        |
| Above 500              | decays 1% a week                                           |

**Relations** with each lord, −100 to 100: fighting alongside them +3 to +8,
completing their contract +5 to +10, freeing them from captivity +10,
releasing them when you captured them +5, raiding their village −10 (and −3
with their faction), refusing a summons −5, beating them in battle −2.
Your standing with a faction is its ruler's relation with you.

You move through four roles:

| Role             | How                                                 | What it gives and asks                                                    |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| **Free company** | the start                                           | freedom; nobody helps you                                                 |
| **Mercenary**    | renown ≥ 50; take a 30-day contract from any ruler  | weekly pay 2 × party worth; fight their wars; relation drops if you don't |
| **Vassal**       | renown ≥ 200 and ruler relation ≥ 10; swear to them | fiefs from what you take; their lords' help; answer summons               |
| **Ruler**        | hold a fief while sworn to no one                   | your own realm and its enemies (below)                                    |

A vassal with renown ≥ 600 and the ruler's best relation among their lords
may be made **marshal**, and call campaigns of their own.

**Your own realm** begins the day you hold a fief while sworn to no one: take
a castle as a free company, or leave your liege with the fiefs they gave you
(their faction is then at war with you). You name the realm; it flies your
banner colour. You garrison its fiefs, appoint companions as governors, grant
fiefs to companions — who become lords and lead their own parties under the
strategic AI — and can persuade lords with relation ≥ 30 toward you and ≤ 0
toward their ruler to defect (Diplomacy Expert; 1000 gold). Other factions
treat your realm as a faction: they declare war on it, make peace, and fear
it if it grows.

## 10. Sieges, fiefs and buildings

**Besieging.** Choose Besiege at an enemy town or castle. You camp outside;
each day you may build siege works, assault, or lift the siege. Lifting costs
nothing; leaving the works behind does.

| Siege work  | Days | Gives                              |
| ----------- | ---- | ---------------------------------- |
| Ladders     | 1    | two ladder entries                 |
| Ram         | 2    | a gate entry, once the gate breaks |
| Siege tower | 3    | one wide entry, +10 morale         |

Engineering takes 1 / 2 / 3 days off each (minimum 1). The assault battle is
`battle.md` §8.

**Starving them out.** A castle has 12 days of food, a town 18 (+10 with a
Granary; −2 if the garrison is over 100 men). After that, the garrison loses
5% of its men and 10 morale a day, and surrenders when below 30% or at 0
morale. A garrison stronger than 80% of the besiegers sallies out.

**Relief.** The defender's faction sends its nearest lords. A relief army
that arrives fights the besiegers, with the garrison able to join (§5).

**Taking it.** The settlement and its villages change hands; the garrison's
survivors are captured; walls taken by assault drop a level until repaired
(7 days). A free company keeps what it takes, and that founds a realm. A
vassal's ruler grants it, almost always to the taker (§8). A mercenary's
conquest goes to their employer.

**Owning it.** A fief pays weekly income and holds a **garrison** of troops
you leave there (wages halved). One building at a time, gold and iron:

| Building      | Where  | Cost                    | Days   | Gives                                           |
| ------------- | ------ | ----------------------- | ------ | ----------------------------------------------- |
| Walls +1      | both   | 600 / 1200, 6 / 12 iron | 7 / 14 | more defended entries, merlons (`battle.md` §8) |
| Barracks      | both   | 500                     | 7      | tier 3 recruits of the settlement's culture     |
| Stables       | castle | 400                     | 7      | +2 horses a week                                |
| Forge         | both   | 400, 4 iron             | 7      | +2 iron a week                                  |
| Market        | town   | 800                     | 10     | +50% town income                                |
| Granary       | both   | 300                     | 5      | +10 siege days                                  |
| Training Yard | both   | 500                     | 7      | garrison +2 XP a day                            |
| Shrine        | town   | 600                     | 10     | learn the culture's ability there               |

## 11. Contracts

Towns and lords offer 1–3 contracts each, refreshed weekly. They give a reason
to go somewhere, and they are template-made.

| Contract           | Do                                                | Reward                         |
| ------------------ | ------------------------------------------------- | ------------------------------ |
| Bounty             | destroy a named brigand party (marked on the map) | 100–300 gold, relation +5      |
| Clear the lair     | a marked lair                                     | 200–500 gold, relation +5      |
| Escort             | keep a caravan alive from A to B                  | 150–400 gold                   |
| Raise troops       | deliver N men of a tier to a lord                 | their value × 1.1, relation +8 |
| Defend the village | a raiding party is coming; be there               | 200 gold, relation +10         |
| Raid               | (vassal or mercenary) raid a named enemy village  | 300 gold, war goes better      |
| Hunt the beast     | a monster party roams; kill it                    | a rare item                    |
| Ransom             | buy a captured lord free from an enemy's broker   | relation +15 with the lord     |

## 12. The Hollow, the Regalia, and the end

### The rising

On day 40 (±5; §13 shifts it), the dead walk out of Crownhold. The event stops
whatever you're doing, centres the map on the old capital, and tells you three
things: the Hollow has come, the realm will fall if it takes a third of its
strongholds, and the three Regalia of the old crown can be found.

- **Blight** spreads from Crownhold one hex further each week, and around
  every settlement the Hollow takes. Blighted villages give nothing.
- **Warbands** march from Crownhold every 4 days and from each Hollow-held
  settlement every 7, worth `50 + 15 × weeks since the rising` (≤ 300). They
  raid villages, besiege the nearest settlements, and never flee.
- **The Hollow King's host** holds Crownhold, worth `400 + 25 × weeks since
the rising` (≤ 900) behind level-3 walls. Waiting makes the end harder.
- The claimants do not stop fighting each other. They do want peace more
  (§8).

### The Regalia

Three great lairs are revealed on the map at the rising, in three different
regions, each guarded by its own host and a ring of lesser guards:

| Lair                     | Guard (worth, Normal)                         | Gives                                                          |
| ------------------------ | --------------------------------------------- | -------------------------------------------------------------- |
| Barrow of the First King | a barrow lord, 60 barrow-wights, 40 skeletons | **Sceptre**: Command +2, party +15                             |
| Wyrm's Hoard             | the Wyrm, 2 trolls, 60 thralls                | **Orb**: +1 ability slot, +2 Valor at the start of each battle |
| Hall of the Troll-King   | the Troll-King, 4 trolls, 80 thralls          | **Great Seal**: +10 with every lord; Call the Banners          |

Only you hunt them; the claimants are too busy with each other. The gate of
Crownhold is sealed until all three are brought to it.

### The last siege

With the Regalia, besiege Crownhold. The **Great Seal** lets you **Call the
Banners**: every lord not at war with you, relation ≥ 0, who can reach
Crownhold within 3 days joins the assault with their party. The more of the
realm you have at peace with you, the bigger that host. It is where diplomacy
pays off.

The assault is `battle.md` §8 with the Hollow's rules (§9 there). Kill the
Hollow King and every Hollow party on the map crumbles; the blight recedes
over the following weeks of the epilogue.

### Endings

| Ending             | When                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Crowned**        | you kill the Hollow King as a free company, a mercenary or a ruler                                                            |
| **Kingmaker**      | as a vassal, you set the crown on your liege's head                                                                           |
| **Usurper**        | as a vassal, you keep it — and the epilogue says what that costs                                                              |
| **The Long Night** | the Hollow holds a third of the towns and castles, Crownhold not counted (Medium: 7 of 20). Warnings at a sixth and a quarter |

**Score** = `(20 000 − 60 × day) × difficulty + renown + 100 × fiefs in your
realm`, at least 0. The best per difficulty is kept on the title screen, the
repo's one convention every game shares.

## 13. Difficulty

|                         | Easy  | Normal | Hard  |
| ----------------------- | ----- | ------ | ----- |
| The Hollow rises on day | 50    | 40     | 30    |
| Hollow strength         | ×0.8  | ×1     | ×1.25 |
| Lords' starting parties | ×0.85 | ×1     | ×1.2  |
| Your fortune rolls      | +5%   | —      | —     |
| Score                   | ×0.5  | ×1     | ×1.5  |

Small maps scale the rising day by 0.75.

## 14. Pacing targets

What a competent player's campaign should look like on Medium, Normal. These
are **targets for the simulators to check** (M4 on; `tech.md`), not promises
the design has already kept.

| Day | Party | Avg tier | Worth | Hero level | Renown | Typically                        |
| --- | ----- | -------- | ----- | ---------- | ------ | -------------------------------- |
| 1   | 12    | 1.0      | 6     | 1          | 0      | a free company of levies         |
| 15  | 30    | 1.7      | 25    | 4          | 60     | hunting brigands, first lair     |
| 40  | 55    | 2.4      | 70    | 8          | 200    | mercenary; the Hollow rises      |
| 80  | 85    | 3.0      | 150   | 14         | 500    | vassal with a castle, or a rebel |
| 120 | 105   | 3.3      | 220   | 18         | 800    | marshal or ruler; two Regalia    |
| 160 | 115   | 3.5      | 260   | 21         | 1000   | Calling the Banners at Crownhold |

For scale against those: brigands 8–60, lords 65–260, a marshal's army
300–700, the great lairs roughly 180–340 (to be measured, §12), the Hollow
King's host 400–900. A player
alone does not take Crownhold; a player with allies does. That is the design.

The quiet risks, which the world simulator exists to catch:

- **Snowball.** One claimant swallowing the realm by day 100 without you.
  The coalition rule (§8) is the brake.
- **Stall.** Nothing changing hands for weeks; wars that never resolve.
- **The Hollow too weak** (the claimants beat it without you — they can't
  take Crownhold, but they can contain it so well there's no tension) or
  **too strong** (The Long Night before a player can reasonably get going).
- **Money.** A competent player broke at day 60, or swimming in gold with
  nothing to buy by day 100.
