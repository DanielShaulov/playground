// @ts-check
/**
 * Tiny DOM helpers every screen shares. Nothing here knows about the game.
 *
 *   el("button.hh-btn", { onclick: go, "aria-label": "Close" }, "Close")
 *   on(window, "resize", fn)          → off()
 *   await css(new URL("./stall.css", import.meta.url))
 */

/**
 * Make an element. `tag` may carry classes ("div.hh-card.wide"). `props`:
 * `class`, `text`, `style` (string or object), `dataset` (object), `on…`
 * functions become listeners, anything else is an attribute (`false`, `null`
 * and `undefined` are left off; `true` is an empty attribute). Children may
 * be nodes, strings, numbers or arrays of them; `null` and `false` are
 * skipped.
 *
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function el(tag, props, ...children) {
  const [name, ...classes] = tag.split(".");
  const node = document.createElement(name || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") {
      if (value) node.classList.add(...String(value).split(/\s+/).filter(Boolean));
    } else if (key === "text") node.textContent = String(value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : String(value));
  }
  add(node, children);
  return node;
}

/** Append children (nodes, text, nested arrays) to `node`. */
export function add(node, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Empty a node. */
export function clear(node) {
  node.replaceChildren();
  return node;
}

/**
 * Listen, and get back the function that stops listening.
 * @param {EventTarget} target
 * @param {string} type
 * @param {(e: any) => void} fn
 * @param {boolean | AddEventListenerOptions} [opts]
 * @returns {() => void}
 */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** @returns {HTMLElement | null} */
export const $ = (selector, root = document) => root.querySelector(selector);

/** @returns {Promise<void>} */
export const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** The next painted frame. @returns {Promise<void>} */
export const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));

/** @type {Map<string, Promise<void>>} */
const sheets = new Map();

/**
 * Load a screen's own stylesheet, once. Resolves when it has applied (or
 * failed: a missing stylesheet must not stop a screen), so a screen can
 * `await` it at the top of `mount` and never show unstyled.
 *
 * @param {string | URL} href  usually `new URL("./x.css", import.meta.url)`
 * @returns {Promise<void>}
 */
export function css(href) {
  const url = String(href);
  let ready = sheets.get(url);
  if (!ready) {
    ready = new Promise((ok) => {
      const link = el("link", { rel: "stylesheet", href: url });
      link.addEventListener("load", () => ok());
      link.addEventListener("error", () => ok());
      document.head.append(link);
    });
    sheets.set(url, ready);
  }
  return ready;
}

/**
 * Import a module that may not exist yet (art or sound another builder is
 * still writing). Gives the module, or `null`; never throws.
 *
 * @param {string | URL} url  absolute, e.g. `new URL("./art/goods.js", import.meta.url)`
 * @returns {Promise<any>}
 */
export function optional(url) {
  return import(String(url)).catch(() => null);
}

/** An element's centre on the page, or the point itself if given one. */
export function centreOf(target) {
  if (!target) return null;
  if (typeof target === "string") target = document.querySelector(target);
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (typeof target?.x === "number" && typeof target?.y === "number") return target;
  return null;
}
