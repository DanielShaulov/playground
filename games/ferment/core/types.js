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
 *   due?: number, arriveAt?: number, arrived?: boolean
 * }} Customer
 *   lo..hi is the flavour window they want. orderId marks someone collecting a pre-order.
 *
 * @typedef {{
 *   id: number, name: string, look: number, recipe: string,
 *   lo: number, hi: number, due: number, arriveAt: number, arrived: boolean
 * }} Order
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
 * @typedef {{ list: Order[] }} OrdersSlice
 *
 * @typedef {{ known: string[], hints: string[], tried: Record<string, string[]> }} BenchSlice
 *   known: discovered recipes on the menu. hints: discovered recipes the card hints at.
 *   tried: base recipe → ingredients mixed into it at least once.
 * @typedef {{ stock: Record<string, number> }} PantrySlice
 *   ingredient id → how many are in the pantry.
 *
 * @typedef {{
 *   meta: MetaSlice, clock: ClockSlice, shop: ShopSlice, shelf: ShelfSlice,
 *   customers: CustomersSlice, orders: OrdersSlice, bench: BenchSlice, pantry: PantrySlice
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
 */

export {};
