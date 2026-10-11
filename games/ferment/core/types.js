// @ts-check
/**
 * Shared JSDoc types for the Ferment core. No runtime code.
 *
 * The whole game is one JSON-safe `State` made of slices. Each slice belongs to
 * one system and has its own defaults in state.js, so a later feature adds a
 * slice (plus a default) instead of bumping a save version.
 */

/**
 * @typedef {{
 *   name: string, hours: number, price: number, cost: number, sweet: [number, number],
 *   brine: string, bits: string, base?: string, needs?: string[], hinted?: boolean
 * }} Recipe
 *   sweet is the recipe's best stretch of the flavour strip. base/needs mark a discovered recipe.
 *
 * @typedef {{ id: number, recipe: string, age: number, servings: number, adds?: string[] }} Jar
 *   age is in-game hours since it was started; flavour = age / recipe.hours for a
 *   plain jar. adds (absent on a plain jar) are its add-ins, which bend that (jars.js).
 *
 * @typedef {{
 *   id: number, name: string, look: number, recipe: string,
 *   lo: number, hi: number, patience: number, orderId?: number,
 *   kind?: OrderKind, due?: number, arriveAt?: number, arrived?: boolean,
 *   regular?: string, qty?: number, got?: number, jars?: number[], offMenu?: boolean
 * }} Customer
 *   lo..hi is the flavour window they want. orderId marks someone collecting an order
 *   (the order's fields come along). offMenu: a walk-in asking for a recipe not on the menu.
 *
 * @typedef {"preorder" | "standing" | "bulk"} OrderKind
 *   preorder: a walk-in booked a later day. standing: a regular's next visit.
 *   bulk: a business wants `qty` whole jars on the due day.
 *
 * @typedef {{
 *   id: number, kind: OrderKind, name: string, look: number, recipe: string,
 *   lo: number, hi: number, due: number, arriveAt: number, arrived: boolean,
 *   regular?: string, qty?: number, got?: number, jars?: number[]
 * }} Order
 *   due is a day, arriveAt hours since opening that day. regular: id in content/regulars.js.
 *   qty/got: whole jars wanted and handed over (bulk only). jars: ids of jars started for it.
 *
 * @typedef {{ served: number, earned: number, tips: number, repStart: number, missed: number, preorders: number, left: number }} Today
 *
 * @typedef {{ seed: number, nextId: number, rng: Record<string, number> }} MetaSlice
 * @typedef {{ day: number, phase: "morning" | "open" | "evening", hour: number }} ClockSlice
 *   hour counts in-game hours since opening (0..OPEN_HOURS).
 * @typedef {{ coins: number, rep: number, today: Today }} ShopSlice
 * @typedef {{ slots: (Jar | null)[] }} ShelfSlice
 * @typedef {{ queue: Customer[], nextArrival: number }} CustomersSlice
 *   queue[0] is at the counter.
 * @typedef {{ recipe: string, name: string, look: number, day: number }} Asked
 * @typedef {{ list: Order[], offers: Order[], asked: Asked[] }} OrdersSlice
 *   list: orders taken. offers: bulk orders offered today, gone at closing unless accepted.
 *   asked: off-menu requests not yet discovered, newest last, one per recipe (the latest asker).
 *
 * @typedef {{ known: string[], hints: string[], tried: Record<string, string[]> }} BenchSlice
 *   known: discovered recipes on the menu. hints: discovered recipes the card hints at.
 *   tried: base recipe → ingredients mixed into it at least once.
 * @typedef {{ stock: Record<string, number> }} PantrySlice
 *   ingredient id → how many are in the pantry.
 *
 * @typedef {{
 *   meta: MetaSlice, clock: ClockSlice, shop: ShopSlice, shelf: ShelfSlice,
 *   customers: CustomersSlice, orders: OrdersSlice, bench: BenchSlice, pantry: PantrySlice,
 *   regulars: RegularsSlice
 * }} State
 *
 * @typedef {{ type: string, [key: string]: any }} Action
 * @typedef {{ type: string, [key: string]: any }} GameEvent
 *
 * @typedef {{ name: string, icon: string, tag: string, speed: number, shift: number, cost: number }} Ingredient
 *   speed multiplies ripening speed; shift moves the jar along the strip (jars.js).
 *
 * @typedef {{
 *   recipe: string, base: string, adds: string[], speed: number, shift: number, popAt: number,
 *   points: { hour: number, f: number }[],
 *   sweet: { lo: number, hi: number, from: number, to: number }, sooner: number
 * }} Curve
 *   previewCurve(): the bench time-lapse. Hours count from starting the jar; popAt is when
 *   its lid pops. sooner: hours the sweet spot's middle moved earlier than a plain base jar.
 *
 * @typedef {{
 *   recipe: string, sweet: Curve["sweet"],
 *   effects: { ingredient: string, tag: string, known: boolean }[],
 *   found: { recipe: string, state: "known" | "hinted" | "hidden", tags: string[], needs: string[] }[]
 * }} RecipeCard
 *   recipeCard(): what the card for a base recipe shows.
 *
 * @typedef {(s: State, action: any, events: GameEvent[]) => string | undefined} Handler
 *   An action handler mutates the copy step() made; a returned string rejects the action.
 *
 * @typedef {{
 *   name: string, look: number, kind: "standing" | "bulk", recipe: string, spot: number,
 *   every: number, hour: number, joins: { day?: number, rep?: number }, hello: string,
 *   qty?: number, lead?: number
 * }} Regular
 *   content/regulars.js. spot: middle of the window they want (inside the walk-in bell
 *   curve). every: days between visits (standing) or offers (bulk). hour: hours since
 *   opening they arrive. joins: from which day, and at what reputation, they start coming.
 *   qty/lead (bulk): whole jars wanted, and days from the offer to the due day.
 *
 * @typedef {{ since: number, visits: number, happy: number, missed: number }} RegularMet
 * @typedef {{ met: Record<string, RegularMet> }} RegularsSlice
 *   met: regular id → since (day they first came), visits served, happy (delighted)
 *   visits, missed visits.
 *
 * @typedef {{ day: number, hour: number }} DayHour
 *   hour counts from opening (0 = 08:00) and may run past closing into the night.
 * @typedef {{
 *   recipe: string, adds: string[], right: boolean, f: number, fits: boolean,
 *   lands: DayHour, leaves: DayHour, late: number
 * }} Plan
 *   planFor(): a jar of the order's recipe started now with `adds`. recipe: what that
 *   mix makes (right: it is the order's). f: its flavour at pickup (1 = gone over).
 *   fits: right and inside the window at pickup. lands/leaves: when it enters and
 *   leaves the window. late: hours the pickup comes after the window's middle
 *   (negative: before it; 0 is perfect).
 */

export {};
