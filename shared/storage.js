/**
 * Per-game persistent state, namespaced by game id so two games can both
 * store a "best" without colliding.
 *
 * localStorage can throw (private mode, storage full, disabled cookies), and a
 * high score is never worth crashing a game over — every call degrades to a
 * no-op / default.
 */

// A PR preview is served from .../pr/<n>/ on the same origin as main (see
// scripts/build-pages.sh), so it gets its own namespace: a half-finished
// branch can't corrupt the real save, and two previews can't clobber each other.
const preview = globalThis.location?.pathname.match(/\/pr\/(\d+)\//);
const ns = preview ? `playground:pr-${preview[1]}` : "playground";

const prefix = (gameId, key) => `${ns}:${gameId}:${key}`;

export function createStore(gameId) {
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(prefix(gameId, key));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(prefix(gameId, key), JSON.stringify(value));
      } catch {
        /* storage unavailable — keep playing */
      }
    },

    /** Store `value` only if it beats what's there. Returns true if it did. */
    setBest(key, value) {
      const current = this.get(key, -Infinity);
      if (value > current) {
        this.set(key, value);
        return true;
      }
      return false;
    },

    clear(key) {
      try {
        localStorage.removeItem(prefix(gameId, key));
      } catch {
        /* ignore */
      }
    },
  };
}
