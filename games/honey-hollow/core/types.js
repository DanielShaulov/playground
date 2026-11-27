// @ts-check
/**
 * Shared JSDoc types for the Honey Hollow core. No runtime code.
 *
 * The whole game is one JSON-safe `State` made of slices. Each slice belongs
 * to one system and has its own defaults in state.js; loadSave() fills any
 * slice or field a save is missing, so a later feature adds a field with a
 * default instead of bumping a version.
 */

/**
 * @typedef {"morning" | "day" | "evening"} Phase
 * @typedef {"sunny" | "cloudy" | "windy" | "rain" | "snow" | "frost"} Weather
 * @typedef {"seed" | "leaf" | "bud" | "bloom" | "faded" | "dormant"} Stage
 *
 * @typedef {{ t: "bed", flower: string, planted: number, picked: number, wild?: boolean }} Bed
 *   planted: the day it went in (0 for the beds a new game starts with). It
 *   gives nectar from the next morning. picked: the day a bunch was last cut, or 0.
 * @typedef {{ t: "hive", id: number }} HiveRef
 * @typedef {Bed | HiveRef | null} Square
 *
 * @typedef {{ got: number, lost: number, by: Record<string, number>, raided: number }} HiveToday
 *   got: units stored today. lost: units that came home to a full hive. by: got, by source.
 *   raided: units wasps carried off today. All of it starts again each morning.
 * @typedef {{
 *   id: number, plot: string, x: number, y: number, type: string, strength: number, grow: number,
 *   stores: Record<string, number>, mites: number, sick: number, swarmCells: boolean,
 *   moved: number, from: { plot: string, x: number, y: number } | null, dusted: number,
 *   hungry: boolean, raid: { until: number } | null, harvested: number, swarmYear: number,
 *   today: HiveToday
 * }} Hive
 *   stores: units by source: a flower id, "wild" (hedgerow) or "syrup".
 *   grow: growth days banked toward the next strength. sick: sleeps spent at harmful mites.
 *   moved: the day it was last moved (it flies at half strength that day), else 0;
 *   from: where it stood that morning, so moving it back undoes the move.
 *   dusted: the day it was last dusted. raid: wasps at the door until that tick.
 *   harvested: the day honey was last taken (0 never); a colony with queen cells stays that night.
 *   swarmYear: the year it last raised queen cells, was split or was caught as a swarm (0 never);
 *   it raises none again that year.
 * @typedef {{ id: number, plot: string, x: number, y: number, strength: number, day: number, from: number }} Swarm
 *   day: the day it hangs there; it is gone at that day's sleep.
 *
 * @typedef {{ x: number, y: number, flower: string, units: number }} PlanBed
 * @typedef {{ total: number, wild: number, by: Record<string, number>, beds: PlanBed[] }} HivePlan
 *   What one hive brings home on a full day: by source, and from which squares.
 *
 * @typedef {{ type: "kind" | "trait" | "finest" | "gift" | "any", value?: string, qty: number }} Wish
 * @typedef {{
 *   id: number, who: string | null, look: number, wish: Wish,
 *   bought: null | { product: string | null, n: number, coins: number, mood: "delighted" | "fine" | "passed" }
 * }} Customer
 *   who: a regular's id, or null for a passing villager. look: a seed for drawing them.
 *
 * @typedef {{ v: number, seed: number, nextId: number, rng: Record<string, number> }} MetaSlice
 * @typedef {{ day: number, phase: Phase, tick: number }} ClockSlice
 * @typedef {{ today: Weather, tomorrow: Weather }} WeatherSlice
 * @typedef {{
 *   made: boolean, name: string, body: string, skin: string, hair: string, hairColor: string,
 *   overalls: string, shirt: string, hat: string, beard: string, glasses: string, talent: string
 * }} KeeperSlice
 * @typedef {{ owned: string[] }} WardrobeSlice
 * @typedef {{ coins: number, today: { earned: number, spent: number } }} PurseSlice
 * @typedef {{ plots: Record<string, { owned: boolean, squares: Square[] }> }} LandSlice
 *   squares are indexed y * 6 + x. Terrain is not saved; it comes from content/plots.js.
 * @typedef {{ list: Hive[], spare: number, swarms: Swarm[] }} HivesSlice
 * @typedef {{ day: number, hives: Record<string, HivePlan>, wasps: null | { hive: number, at: number } }} PlanSlice
 *   The flight plan fixed at startDay. wasps: today's raid, if one is coming, and its tick.
 * @typedef {{
 *   honey: Record<string, number>, wax: number, waxBits: number, bunches: Record<string, number>,
 *   goods: Record<string, number>, seeds: Record<string, number>, remedy: number, syrup: number
 * }} StockSlice
 *   honey keys are "<flower>:<stars>" and "blend:0". waxBits: jars taken since the last wax.
 * @typedef {{
 *   day: number, mood: Record<string, number>, glut: Record<string, number>, queue: Customer[],
 *   at: number, open: boolean, show: null | { entered: boolean, entries: any[] }, fair: boolean
 * }} MarketSlice
 *   mood: today's price wobble by product key ("honey:<id>", "good:<id>"). glut: units
 *   recently sold, by the same key. queue[at] is the customer at the stall.
 * @typedef {{ hearts: Record<string, number>, gifts: Record<string, number> }} RegularsSlice
 * @typedef {{ made: { day: number, n: number } }} WorkshopSlice
 * @typedef {{
 *   renown: number, tier: number, claimed: string[], ready: string[], stats: Record<string, any>,
 *   unlocked: { flowers: string[], recipes: string[] },
 *   ribbons: { year: number, honey: string, medal: string }[],
 *   year: { jars: number, pure: number, kinds: string[], earned: number, hungryWinter: number },
 *   today: { jars: number, stall: number, grocer: number, hearts: number },
 *   almanac: Record<string, any>[], yearsSeen: number
 * }} ProgressSlice
 * @typedef {{ facts: string[], unread: string[], fired: string[] }} BookSlice
 *
 * @typedef {{
 *   meta: MetaSlice, clock: ClockSlice, weather: WeatherSlice, keeper: KeeperSlice,
 *   wardrobe: WardrobeSlice, purse: PurseSlice, land: LandSlice, hives: HivesSlice,
 *   plan: PlanSlice, stock: StockSlice, market: MarketSlice, regulars: RegularsSlice,
 *   workshop: WorkshopSlice, progress: ProgressSlice, book: BookSlice
 * }} State
 *
 * @typedef {{ type: string, [key: string]: any }} Action
 * @typedef {{ type: string, [key: string]: any }} GameEvent
 * @typedef {(state: State, action: Action, events: GameEvent[]) => string | void} Handler
 *   Mutates the copy step() made. Returns a `why` code to refuse the action.
 *
 * @typedef {{
 *   id: string, kind: "honey" | "good", name: string, price: number, key: string, stockKey: string,
 *   honey: string | null, flower: string | null, stars: number, pure: boolean, traits: string[],
 *   good: string | null, family: string | null
 * }} ProductInfo
 */

export {};
