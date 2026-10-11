// @ts-check
/** Small pure helpers shared by core modules. */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Hand out the next unique id (jars, customers and orders share one counter). */
export const nextId = (/** @type {import("./types.js").State} */ s) => s.meta.nextId++;
