"use strict";
// ---------- Juice, HUD side: pay flying to the counters, the sale tally, Ship Lv and boss banners ----------
// DOM overlays, not canvas: crisp at any zoom, animated by the compositor (Web Animations), and gone when done.
//   flyTo(from, target, html, cls)   a label or coin flies from a CSS point to a HUD element, which punches on landing
//   sortieTally({ sunk, cargo, bonus, gold })   the 1.2 s count-up when the hold sells (js/mooring.js, js/harbor.js)
//   lvBanner(n) · bossCard(name) · screenFlash()
Object.assign(STR.en, {
  lvUp: "Ship Lv {n}!", tallySunk: "Sunk", tallyCargo: "{n} cargo", tallyGold: "gold", tallyBest: "Most ships sunk in one sortie!",
  tallyRec: "Best sortie: {n} sunk",
});
Object.assign(STR.zh, {
  lvUp: "船艦升到 Lv {n}！", tallySunk: "擊沉", tallyCargo: "{n} 貨物", tallyGold: "金幣", tallyBest: "單次出航擊沉最多！",
  tallyRec: "紀錄：一次出航擊沉 {n} 艘",
});
// save.bestRun: the best sortie by ships sunk (gold breaks a tie: the streak is the sunk count). It replaced
// save.bestSortie, the biggest sale in gold, which can't be turned into a sunk count, so an old save starts fresh.
SAVE_DEFAULTS.push(() => ({ bestRun: { sunk: 0, gold: 0 } }));
SAVE_SANITIZERS.push(s => {
  const { bestSortie, ...rest } = s, b = isObj(s.bestRun) ? s.bestRun : {};
  const n = (v, hi) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? Math.min(x, hi) : 0; };
  return { ...rest, bestRun: { sunk: n(b.sunk, 1e6), gold: n(b.gold, 1e12) } };
});
const beatsRun = (r, b) => r.sunk > b.sunk || (r.sunk === b.sunk && r.gold > b.gold);

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
// The skull is inline SVG, not the canvas texture: a 16 px copy of that read as a plain white disc on 2-3x phones.
const SKULL_SVG = `<svg class="jsk" viewBox="0 0 16 16" aria-hidden="true"><path fill="#f6f1e3" d="M8 1.2C4.3 1.2 1.8 3.7 1.8 7c0 1.9.9 3.3 2.2 4.1v2.6h2.1v-1.3h.9v1.3h2v-1.3h.9v1.3H12v-2.6c1.3-.8 2.2-2.2 2.2-4.1 0-3.3-2.5-5.8-6.2-5.8z"/>` +
  `<circle cx="5.4" cy="7.3" r="1.7" fill="#08222d"/><circle cx="10.6" cy="7.3" r="1.7" fill="#08222d"/><path fill="#08222d" d="M8 9.1l-1.1 1.8h2.2z"/></svg>`;
let tallyUntil = 0;
const tallyShowing = () => performance.now() < tallyUntil;   // js/mooring.js keeps its stop hint back meanwhile
// sunk: ships sunk since the last sale · cargo: the hold at its plain value · bonus: the streak's share · gold: paid
function sortieTally({ sunk, cargo: c, bonus, gold }) {
  if (!(gold > 0)) return;
  const best = save.bestRun || { sunk: 0, gold: 0 }, run = { sunk: sunk || 0, gold };
  const better = run.sunk > 0 && beatsRun(run, best), record = better && best.sunk > 0;
  if (better) { save = { ...save, bestRun: run }; persist(); }
  const el = juiceEl("tally", "");
  const icons = Math.min(sunk, 12);
  el.innerHTML = (sunk > 0 ? `<div class="t-sunk"><span>${t("tallySunk")}</span>${SKULL_SVG.repeat(icons)}${sunk > icons ? `<em>+${sunk - icons}</em>` : ""}</div>` : "") +
    `<div class="t-math">${t("tallyCargo", { n: fmt(c) })}${bonus > 0 ? ` <b>× ${(1 + bonus).toFixed(1)}</b>` : ""}</div>` +
    `<div class="t-gold">+<b>0</b> <small>${t("tallyGold")}</small></div>` +
    (record ? `<div class="t-best">${t("tallyBest")}</div>` : (save.bestRun.sunk > 0 ? `<div class="t-rec">${t("tallyRec", { n: save.bestRun.sunk })}</div>` : ""));
  el.classList.remove("on", "done"); void el.offsetWidth; el.classList.add("on");
  const num = el.querySelector(".t-gold b"), t0 = performance.now(), dur = reduceMotion() ? 0 : TALLY_MS;
  tallyUntil = t0 + TALLY_SHOW_MS;
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

// ---------- streak at risk: a streak worth banking (3+) on a hull under 40% pulses the chip red ----------
const RISK_STREAK = 3, RISK_HULL = 0.4;
let riskOn = false;
onHook("frame", () => {
  const el = byId("streak");
  if (!el || typeof player === "undefined" || !player) return;
  const on = !el.hidden && !docked && player.alive && streak >= RISK_STREAK && player.hp < player.maxHp * RISK_HULL;
  if (on !== riskOn) { riskOn = on; el.classList.toggle("risk", on); }
});
