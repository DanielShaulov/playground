// @ts-check
/**
 * Shared JSDoc types for the Ferment core. No runtime code.
 *
 * The whole game is one JSON-safe `State` made of slices. Each slice belongs to
 * one system and has its own defaults in state.js, so a later feature adds a
 * slice (plus a default) instead of bumping a save version.
 */

/**
 * @typedef {{ name: string, hours: number, price: number, cost: number, brine: string, bits: string }} Recipe
 *
 * @typedef {{ id: number, recipe: string, age: number, servings: number }} Jar
 *   age is in-game hours since it was started; flavour = age / recipe.hours.
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
 * @typedef {{
 *   meta: MetaSlice, clock: ClockSlice, shop: ShopSlice, shelf: ShelfSlice,
 *   customers: CustomersSlice, orders: OrdersSlice
 * }} State
 *
 * @typedef {{ type: string, [key: string]: any }} Action
 * @typedef {{ type: string, [key: string]: any }} GameEvent
 *
 * @typedef {(s: State, action: any, events: GameEvent[]) => string | undefined} Handler
 *   An action handler mutates the copy step() made; a returned string rejects the action.
 */

export {};
