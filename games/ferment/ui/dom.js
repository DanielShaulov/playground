// @ts-check
/** Tiny DOM helpers. `patch` only touches a node when its HTML really changed. */

export function patch(el, html) {
  if (el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
}

export function setClass(el, cls) {
  if (el.className !== cls) el.className = cls;
}

/** Replay the little pop animation on a pill. */
export function bump(el) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

export function toast(container, text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  container.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}
