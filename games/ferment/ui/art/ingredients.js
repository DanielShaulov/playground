// @ts-check
/**
 * Ingredient icons: one small drawn SVG per pantry ingredient, in the shop's
 * own flat, warm style (soft outline a shade darker than the fill, one
 * highlight), so the bench, market and recipe cards stop mixing emoji in.
 *
 * `ingredientSvg(id)` sizes itself to the text around it (1.25em), so it can
 * stand in wherever the emoji was. An id with no drawing gets a plain burlap
 * sack, so a new ingredient row never breaks a screen; one entry in ICONS
 * gives it real art. Every icon shares the 32×32 viewBox.
 */

/** @type {Record<string, string>} */
const ICONS = {
  // A glass salt cellar with a pewter cap, crystals heaped beside it.
  salt: `
    <path d="M9 12 Q9 9 12 9 H20 Q23 9 23 12 V26 Q23 29 20 29 H12 Q9 29 9 26 Z" fill="#f5f2ea" stroke="#b7ad9c" stroke-width="1.3"/>
    <path d="M10.4 18 H21.6 V26 Q21.6 27.6 20 27.6 H12 Q10.4 27.6 10.4 26 Z" fill="#fff"/>
    <g fill="#ddd6c8"><circle cx="13" cy="21" r=".8"/><circle cx="16.5" cy="23.5" r=".8"/><circle cx="19" cy="20.5" r=".8"/><circle cx="14.5" cy="25.6" r=".8"/></g>
    <path d="M10 9.5 Q10 4 16 4 Q22 4 22 9.5 Z" fill="#9aa1a3" stroke="#757c7e" stroke-width="1.2"/>
    <g fill="#5e6466"><circle cx="14" cy="7" r=".9"/><circle cx="18" cy="7" r=".9"/><circle cx="16" cy="5.6" r=".8"/></g>
    <rect x="11.3" y="12" width="2" height="12" rx="1" fill="#fff" opacity=".8"/>
    <g fill="#fff" stroke="#b7ad9c" stroke-width=".6"><path d="M24.5 27.5 l1.6 -1.6 l1.6 1.6 l-1.6 1.6 Z"/><path d="M26.5 24.2 l1.2 -1.2 l1.2 1.2 l-1.2 1.2 Z"/></g>`,
  // A red chilli, curled at the tip, with a green cap and stalk.
  chili: `
    <path d="M10.5 9.5 Q6 12 6.5 18 Q7.5 25 14 28 Q20 30.5 26 27.5 Q21 27 17.5 23.5 Q13.5 19 14 12.5 Z" fill="#c8372a" stroke="#97261c" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9 14 Q9 20 13.5 24" stroke="#fff" stroke-width="1.6" fill="none" opacity=".4" stroke-linecap="round"/>
    <path d="M8.6 10.6 Q11 7.4 14.6 10 Q13.2 13.6 10.2 13.4 Q8.2 12.6 8.6 10.6 Z" fill="#6f8f3a" stroke="#506b26" stroke-width="1"/>
    <path d="M12 9.2 Q13 5.6 16.6 4.2" stroke="#506b26" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  // A stoneware honey pot with an amber drip running down from the lid.
  honey: `
    <path d="M7.5 14 Q6 23 9.5 27 Q11 29 16 29 Q21 29 22.5 27 Q26 23 24.5 14 Z" fill="#e3a43a" stroke="#a8711a" stroke-width="1.2"/>
    <path d="M7.4 18.5 Q16 21 24.6 18.5" stroke="#a8711a" stroke-width="1.2" fill="none"/>
    <rect x="7" y="10" width="18" height="5" rx="2" fill="#c78a2a" stroke="#a8711a" stroke-width="1.2"/>
    <path d="M14 10 V6.5 Q14 5 16 5 Q18 5 18 6.5 V10" fill="#9a6a43" stroke="#7d5435" stroke-width="1.1"/>
    <path d="M19.5 15 V19.5 Q19.5 21.4 20.6 21.4 Q21.7 21.4 21.7 19.5 V15 Z" fill="#f2b84b" stroke="#a8711a" stroke-width=".9"/>
    <path d="M10 17 Q9.5 22 11 25.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/>`,
  // A ripe pear with a brown stalk and one leaf.
  pear: `
    <path d="M16 8 Q12.5 8 12 12.5 Q11.6 15 9.5 17.5 Q6.5 21.5 8.5 25.5 Q11 29.5 16 29.5 Q21 29.5 23.5 25.5 Q25.5 21.5 22.5 17.5 Q20.4 15 20 12.5 Q19.5 8 16 8 Z" fill="#d8d06a" stroke="#9b9536" stroke-width="1.2"/>
    <path d="M11 21 Q10.5 25 13.5 27" stroke="#fff" stroke-width="1.8" fill="none" opacity=".4" stroke-linecap="round"/>
    <circle cx="20" cy="22" r="2.6" fill="#c9893f" opacity=".3"/>
    <path d="M16 8.5 Q16 5.5 17.5 3.5" stroke="#7d5435" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M17.2 5.6 Q21 2.6 24.5 4.6 Q21.6 8.4 17.2 5.6 Z" fill="#7aa04a" stroke="#56772f" stroke-width="1"/>`,
  // A garlic bulb: papery cloves with faint purple streaks and a dry top.
  garlic: `
    <path d="M16 7 Q14 11 10.5 13 Q5.5 16 6.5 22 Q8 28.5 16 28.5 Q24 28.5 25.5 22 Q26.5 16 21.5 13 Q18 11 16 7 Z" fill="#f7f1e2" stroke="#c4b393" stroke-width="1.2"/>
    <path d="M16 9 Q12.5 15 13 28.3 M16 9 Q19.5 15 19 28.3 M11.5 14 Q8.5 20 10 27 M20.5 14 Q23.5 20 22 27" stroke="#d6c8aa" stroke-width="1" fill="none"/>
    <path d="M13 18 Q12.6 22 13.4 26 M19 18 Q19.4 22 18.6 26" stroke="#b58bb3" stroke-width=".9" fill="none" opacity=".55"/>
    <path d="M14.8 7.5 Q15.4 4 16 3 Q16.6 4 17.2 7.5" fill="#e3d6b8" stroke="#c4b393" stroke-width=".9"/>
    <path d="M12 28.6 l-1 1.4 M16 28.8 v1.6 M20 28.6 l1 1.4" stroke="#b9a37f" stroke-width=".9" stroke-linecap="round"/>`,
  // A russet oak leaf, lobed, with its veins.
  oak: `
    <path d="M16 3.5 Q18.5 5 18 7.5 Q21.5 6.5 21.5 9.5 Q20 11 21 12 Q25 11 24.5 14.5 Q22.5 16 23.5 17.5 Q27 18 25.5 21.5 Q22.5 22 21 23.5 Q21.5 26.5 18.5 26.5 Q17 25.5 16.8 27 L16.8 30 H15.2 L15.2 27 Q15 25.5 13.5 26.5 Q10.5 26.5 11 23.5 Q9.5 22 6.5 21.5 Q5 18 8.5 17.5 Q9.5 16 7.5 14.5 Q7 11 11 12 Q12 11 10.5 9.5 Q10.5 6.5 14 7.5 Q13.5 5 16 3.5 Z" fill="#c07a3a" stroke="#8f5426" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M16 6 V28 M16 12 L12.5 10 M16 12 L19.5 10 M16 16.5 L10.5 14.5 M16 16.5 L21.5 14.5 M16 21 L9.5 19.5 M16 21 L22.5 19.5" stroke="#8f5426" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M12.5 21.5 Q12.5 24 14 25" stroke="#f0c48c" stroke-width="1.2" fill="none" opacity=".5" stroke-linecap="round"/>`,
  // A little stoneware jug of pale whey.
  whey: `
    <path d="M10 10 L9 13 Q7 18 8 24 Q8.6 29 16 29 Q23.4 29 24 24 Q25 18 23 13 L22 10 Z" fill="#dfd8c8" stroke="#a89c86" stroke-width="1.2"/>
    <path d="M8.3 17 Q16 19.5 23.7 17 Q24.5 21 24 24 Q23.4 28.4 16 28.4 Q8.6 28.4 8 24 Q7.6 20.5 8.3 17 Z" fill="#f4efdd"/>
    <path d="M23 13 Q28 13 27.5 17.5 Q27 21 23.6 21" stroke="#a89c86" stroke-width="1.6" fill="none"/>
    <path d="M9.4 6.6 H22.6 L22 10.4 H10 Z" fill="#c9bfa9" stroke="#a89c86" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M8.6 6.8 Q7.6 5.4 9.6 5.4 H12.5" stroke="#a89c86" stroke-width="1.1" fill="none"/>
    <path d="M11 13 Q9.6 18 10.4 24" stroke="#fff" stroke-width="1.7" fill="none" opacity=".55" stroke-linecap="round"/>`,
};

// A burlap sack tied at the neck, for an ingredient with no drawing yet.
const SACK = `
    <path d="M12 11 Q6 15 6.5 22 Q7 29 16 29 Q25 29 25.5 22 Q26 15 20 11 Z" fill="#c9ad7f" stroke="#957a4f" stroke-width="1.2"/>
    <path d="M11.5 11.5 Q16 13 20.5 11.5 L21.5 8 Q16 9.5 10.5 8 Z" fill="#b89a69" stroke="#957a4f" stroke-width="1.1"/>
    <path d="M10.8 10.6 H21.2" stroke="#7d5435" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10 18 Q16 20 22 18 M9 23 Q16 25 23 23" stroke="#a88f62" stroke-width=".9" fill="none" stroke-dasharray="1.6 1.4"/>`;

/** Ingredient ids that have a drawing of their own (the gallery checks them all). */
export const DRAWN = Object.keys(ICONS);

/** One ingredient's icon as inline SVG, sized to the text it sits in. */
export function ingredientSvg(/** @type {string} */ id, cls = "ing") {
  return `<svg class="${cls}" data-ingredient="${id}" viewBox="0 0 32 32" aria-hidden="true">${ICONS[id] ?? SACK}</svg>`;
}
