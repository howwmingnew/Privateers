"use strict";
// ---------- Juice, HUD side: pay flying to the counters, the sale tally, Ship Lv and boss banners ----------
// DOM overlays, not canvas: crisp at any zoom, animated by the compositor (Web Animations), and gone when done.
//   flyTo(from, target, html, cls)   a label or coin flies from a CSS point to a HUD element, which punches on landing
//   sortieTally({ sunk, cargo, bonus, gold })   the 1.2 s count-up when the hold sells (js/mooring.js, js/harbor.js)
//   lvBanner(n) · bossCard(name) · screenFlash()
Object.assign(STR.en, {
  lvUp: "Ship Lv {n}!", tallySunk: "Sunk", tallyCargo: "{n} cargo", tallyGold: "gold", tallyBest: "Best sale yet!",
});
Object.assign(STR.zh, {
  lvUp: "船艦升到 Lv {n}！", tallySunk: "擊沉", tallyCargo: "{n} 貨物", tallyGold: "金幣", tallyBest: "單次最高收入！",
});
// save.bestSortie: the biggest single sale of the hold, for the tally's record line
SAVE_DEFAULTS.push(() => ({ bestSortie: 0 }));
SAVE_SANITIZERS.push(s => { const n = Number(s.bestSortie); return { ...s, bestSortie: Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 1e12) : 0 }; });

const TALLY_MS = 1200, TALLY_SHOW_MS = 3200;
const reduceMotion = () => !SETTINGS.shake;   // the shake setting doubles as "reduced motion" (it defaults off for it)
const byId = id => document.getElementById(id);
function juiceEl(id, cls) {
  let el = byId(id);
  if (!el) { el = document.createElement("div"); el.id = id; if (cls) el.className = cls; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
  return el;
}
// World point -> CSS pixels on the page (the canvas is device-px backed and shown at CSS size, js/view.js).
function worldToCss(x, y) {
  const cam = S.cameras.main, r = S.game.canvas.getBoundingClientRect(), k = r.width / S.game.canvas.width;
  return { x: r.left + (x - cam.worldView.x) * cam.zoom * k, y: r.top + (y - cam.worldView.y) * cam.zoom * k };
}
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
const streakTarget = () => (byId("streak") && !byId("streak").hidden ? "streak" : "cargoBar");
function punch(el) {
  if (!el || !el.animate) return;
  el.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 240, easing: "cubic-bezier(.2,.8,.3,1)" });
}
function flyTo(from, targetId, html, cls, { ms = 620, delay = 0, onLand } = {}) {
  const target = byId(targetId);
  const land = () => { punch(target); if (onLand) onLand(); };
  if (!target || !document.body.animate) { land(); return; }
  const el = document.createElement("div");
  el.className = "jfly " + cls; el.innerHTML = html; el.setAttribute("aria-hidden", "true");
  el.style.left = from.x + "px"; el.style.top = from.y + "px";
  document.body.appendChild(el);
  const to = centerOf(target), dx = to.x - from.x, dy = to.y - from.y, lift = Math.min(60, Math.abs(dx) * 0.2);
  const a = el.animate([
    { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.25 - lift}px)) scale(.95)`, opacity: 1, offset: 0.35 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.85 }],
    { duration: ms, delay, easing: "cubic-bezier(.45,0,.7,1)", fill: "both" });
  a.onfinish = () => { el.remove(); land(); };
}
// Plunder scooped up: a few coins fly from the crate to the cargo bar, which punches; the purse rings as they land.
onHook("pickup", (c, take) => {
  if (!take || !S) return;
  const from = worldToCss(c.x, c.y), n = clamp(5 + Math.floor(Math.log2(Math.max(1, take) / 25)), 5, 8);
  for (let i = 0; i < n; i++) {
    const f = { x: from.x + rand(-10, 10), y: from.y + rand(-8, 8) };
    flyTo(f, "cargoBar", "", "jcoin", { ms: 480 + i * 22, delay: i * 35, onLand: i === n - 1 ? () => sfx("coin", { amount: take }) : null });
  }
});

// ---------- full-screen moments ----------
function screenFlash() {
  if (reduceMotion()) return;
  const el = juiceEl("jFlash");
  el.animate && el.animate([{ opacity: 0.25 }, { opacity: 0 }], { duration: 130, easing: "ease-out" });
}
function banner(id, html, ms) {
  const el = juiceEl(id, "jbanner");
  el.innerHTML = html; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove("on"), ms);
}
function bossCard(name) {
  banner("bossCard", `<small>${t("bountyClaimed")}</small><b>${name}</b>`, 2600);
}
// Ship Lv rise after a purchase (js/hud.js calls this when shipRating() goes up)
function lvBanner(n) {
  banner("lvBanner", t("lvUp", { n }), 1900);
  sfx("lvUp", { delay: 0.15 });
  punch(byId("lv"));
}

// ---------- the sale tally ----------
let skullUrl = null;
function skullImg() {
  if (!skullUrl && S && S.textures.exists("skull")) try { skullUrl = S.textures.getBase64("skull"); } catch (e) { skullUrl = ""; }
  return skullUrl ? `<img src="${skullUrl}" alt="">` : "<i class='jskull'></i>";
}
// sunk: ships sunk since the last sale · cargo: the hold at its plain value · bonus: the streak's share · gold: paid
function sortieTally({ sunk, cargo: c, bonus, gold }) {
  if (!(gold > 0)) return;
  const best = save.bestSortie || 0, record = best > 0 && gold > best;
  if (gold > best) { save = { ...save, bestSortie: gold }; persist(); }
  const el = juiceEl("tally", "");
  const icons = Math.min(sunk, 12);
  el.innerHTML = (sunk > 0 ? `<div class="t-sunk"><span>${t("tallySunk")}</span>${Array.from({ length: icons }, () => skullImg()).join("")}${sunk > icons ? `<em>+${sunk - icons}</em>` : ""}</div>` : "") +
    `<div class="t-math">${t("tallyCargo", { n: fmt(c) })}${bonus > 0 ? ` <b>× ${(1 + bonus).toFixed(1)}</b>` : ""}</div>` +
    `<div class="t-gold">+<b>0</b> <small>${t("tallyGold")}</small></div>` + (record ? `<div class="t-best">${t("tallyBest")}</div>` : "");
  el.classList.remove("on", "done"); void el.offsetWidth; el.classList.add("on");
  const num = el.querySelector(".t-gold b"), t0 = performance.now(), dur = reduceMotion() ? 0 : TALLY_MS;
  sfx("coinRoll");
  const tick = () => {
    const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
    num.textContent = fmt(Math.round(gold * (1 - Math.pow(1 - k, 3))));
    if (k < 1) { requestAnimationFrame(tick); return; }
    el.classList.add("done"); punch(byId("gold")); punch(byId("pGold"));
    if (record) sfx("bell");
  };
  requestAnimationFrame(tick);
  clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove("on"), TALLY_SHOW_MS);
}
