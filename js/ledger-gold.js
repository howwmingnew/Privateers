"use strict";
// ---------- Harbor ledger: the purse stays in view while the sheet scrolls, and ticks when gold moves (#73) ----------
// The header (title + gold, index.html #port) is sticky at the top of the sheet in css/ledger.css; the same header serves Safe Harbor,
// the Hulk Outpost and the supply stations / trade ports, so one rule covers every ledger. It keeps its height (no layout jump while
// scrolling) and stays a single slim row on a phone. A purchase rolls the number to its new value and the figure flashes: red when
// gold goes out, green when it comes in.
const GOLD_ROLL_MS = 380;   // how long the purse number counts to its new value
let shownGold = null, goldRaf = 0;
const goldEl = () => document.getElementById("pGold");

// Pure: the number to print `k` (0..1) of the way from `from` to `to`, easing out.
const goldRoll = (from, to, k) => Math.round(from + (to - from) * (1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)));

function rollGold(el, from, to) {
  cancelAnimationFrame(goldRaf);
  const dur = typeof reduceMotion === "function" && reduceMotion() ? 0 : GOLD_ROLL_MS, t0 = performance.now();
  el.classList.remove("spent", "gained"); void el.offsetWidth; el.classList.add(to < from ? "spent" : "gained");
  if (typeof punch === "function") punch(el);   // js/juice-ui.js
  const tick = () => {
    const k = dur ? (performance.now() - t0) / dur : 1;
    el.textContent = fmt(goldRoll(from, to, k));
    if (k < 1) goldRaf = requestAnimationFrame(tick); else setTimeout(() => el.classList.remove("spent", "gained"), 500);
  };
  tick();
}
onHook("dock", () => { shownGold = null; });   // a fresh visit starts from the real figure, not from last visit's
onHook("renderPort", () => {
  const el = goldEl(); if (!el) return;
  const to = save.gold;
  if (shownGold !== null && shownGold !== to) rollGold(el, shownGold, to);
  shownGold = to;
});
