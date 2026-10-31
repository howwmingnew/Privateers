"use strict";
// ---------- Shot-away masts (#43): a ball can break a mast; the hull sails on what stands ----------
// Every ship keeps a bit mask, s.mastLost (bit i = the i-th mast of its hull art, SHIP_ART[cls].masts, bow first, is gone). Any ball that hits has MAST.chance
// to break one still standing, chain shot MAST.chain. The mask sets the ship's speed (MAST.floor with none left, in equal steps up to full) and a little of its
// turn (MAST.turnLoss), and the hull is drawn with a stump and no canvas where each lost mast was (js/art-draw.js; one texture per (hull, livery, mask), baked
// the first time a mast goes and cached, so nothing is redrawn per frame). A dock ring or a supply station steps the masts back one by one (MAST.fixT s each);
// resting at sea mends the hull only (js/repair.js), not the rig. Nothing is saved: every sortie starts from a dock, where the masts are whole.
// Chain shot's own slow (CHAIN_T s) is the torn rigging the same ball brings down: it is not added to the mast loss. The ship takes the worse of the two
// (rigSpeed / rigTurn), so a chain hit on a ship with its masts standing slows it as before, and one with masts gone is held to the mast loss once the
// chain's few seconds run out.
Object.assign(STR.en, {
  fMastDown: "Mast down!", fMastFix: "Mast stepped", mastLbl: "Masts", mastAria: "{n} of {m} masts standing",
  toastMast: "A mast is shot away: she sails slower. Any harbor or supply station refits the masts.",
});
Object.assign(STR.zh, {
  fMastDown: "桅杆斷了！", fMastFix: "桅杆修好了", mastLbl: "桅杆", mastAria: "{m} 根桅杆剩 {n} 根",
  toastMast: "桅杆被打斷了：船會變慢。回港或靠補給站就能修好。",
});

// ---------- Pure rules ----------
const mastFull = n => (1 << n) - 1;                              // the mask of a hull with every mast down
const mastLeft = (lost, n) => { let k = 0; for (let i = 0; i < n; i++) if (!((lost >> i) & 1)) k++; return k; };
const mastChance = chain => (chain ? MAST.chain : MAST.chance);
// Top speed x for a hull with `lost` of its `n` masts gone; a boss never drops below MAST.bossFloor (it cannot be shot into a target).
function mastSpeedK(lost, n, boss) {
  if (!(n > 0)) return 1;
  const k = MAST.floor + (1 - MAST.floor) * mastLeft(lost, n) / n;
  return boss ? Math.max(k, MAST.bossFloor) : k;
}
const mastTurnK = (lost, n) => (n > 0 ? 1 - MAST.turnLoss * (1 - mastLeft(lost, n) / n) : 1);
// One ball: r1 against the odds, r2 (0..1) picks which of the standing masts goes. Returns the new mask, or `lost` when nothing broke.
function mastRoll(lost, n, chance, r1, r2) {
  const left = mastLeft(lost, n);
  if (!(n > 0) || !left || !(r1 < chance)) return lost;
  let pick = Math.min(left - 1, Math.floor(r2 * left));
  for (let i = 0; i < n; i++) if (!((lost >> i) & 1) && pick-- === 0) return lost | (1 << i);
  return lost;
}
// The mast that was standing in `was` and is not in `now` (the lowest such), or -1.
const mastGone = (was, now, n) => { for (let i = 0; i < n; i++) if (!((was >> i) & 1) && ((now >> i) & 1)) return i; return -1; };
// Repair: the masts after one step (the lowest broken one is stepped again).
const mastMended = (lost, n) => { for (let i = 0; i < n; i++) if ((lost >> i) & 1) return lost & ~(1 << i); return lost; };

// ---------- On a ship ----------
const mastN = s => (s && s.art && s.art.masts ? s.art.masts.length : 0);   // a fort (no art) has none
const mastMask = s => (s.mastLost | 0) & mastFull(mastN(s));
// Speed and turn x the rig allows: the worse of the torn rigging chain shot left (temporary) and the masts that are gone (until a dock).
function rigSpeed(s) { const m = mastSpeedK(mastMask(s), mastN(s), !!s.boss); return s.chainT > 0 ? Math.min(CHAIN_SPEED, m) : m; }
function rigTurn(s) { const m = mastTurnK(mastMask(s), mastN(s)); return s.chainT > 0 ? Math.min(CHAIN_TURN, m) : m; }
// An AI ship that the masts have left too slow to run down its target does not chase: it turns a broadside on it and fires (merchants, fireships
// and bosses keep to their own plans: a merchant already runs, a fireship has no guns, a boss is held to MAST.bossFloor).
const mastCrippled = e => !e.boss && !e.merchant && !e.fixed && !e.struck && mastSpeedK(mastMask(e), mastN(e), false) < MAST.cripple && !!e.guns && e.guns.left.length > 0;
function mastTactic(e, tg, toT) {
  if (!tg || !mastCrippled(e)) return null;
  const side = Math.abs(angDiff(toT + Math.PI / 2, e.rot)) < Math.abs(angDiff(toT - Math.PI / 2, e.rot)) ? 1 : -1;
  return { desired: toT + side * Math.PI / 2, thr: 0.25 };
}

// Where a mast stands in the world, for the effects.
function mastPos(s, i) { const a = s.art, d = (a.masts[i] - 0.5) * a.len; return { x: s.x + Math.cos(s.rot) * d, y: s.y + Math.sin(s.rot) * d }; }
// Put the hull's texture right for its mask. Only a change of mask (or of hull) swaps it; the first time a mask is seen it is baked and cached.
function mastRedraw(s) {
  if (!s.spr || !s.artCls) return;
  const key = shipArt(s.artCls, s.livery, { lost: mastMask(s) });
  if (s.spr.texture && s.spr.texture.key === key) return;
  s.artScale = 1 / artResOf(key); s.spr.setTexture(key).setScale(s.artScale);
}
let ragSet = false, rags = 0;
const RAG_MAX = 24;
// Canvas scraps that flutter down where a mast went: tinted with the ship's own sail colour, they fade over a couple of seconds.
function mastRags(x, y, sail, n) {
  if (!ragSet) { ragSet = true; bakeCanvas(S, "fx-rag", 9, 6, 1, c => { c.fillStyle = "#fff"; c.beginPath(); c.moveTo(0, 1); c.lineTo(8, 0); c.lineTo(9, 5); c.lineTo(2, 6); c.closePath(); c.fill(); }); }
  for (let i = 0; i < n && rags < RAG_MAX; i++) {
    const r = S.add.image(x, y, "fx-rag").setDepth(7).setRotation(rand(0, TAU)).setScale(rand(0.8, 1.5)).setTint(sail), a = rand(0, TAU), d = rand(14, 42); rags++;
    S.tweens.add({ targets: r, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: r.angle + rand(-200, 200), scaleY: r.scaleY * 0.4, duration: 2200, ease: "Sine.easeOut" });
    S.tweens.add({ targets: r, alpha: 0, duration: 2200, delay: 400, ease: "Quad.easeIn", onComplete: () => { r.destroy(); rags--; } });
  }
}
// The moment a mast breaks: the mask changes, the hull is redrawn, and splinters, canvas and a crack mark the spot.
function mastBreak(s, mask) {
  const n = mastN(s), i = mastGone(mastMask(s), mask, n);
  if (i < 0) return;
  s.mastLost = mask; mastRedraw(s);
  const p = mastPos(s, i);
  if (onScreen(p.x, p.y, 80)) {
    const lo = typeof PERF_LOW !== "undefined" && PERF_LOW;
    if (typeof FX !== "undefined" && FX.splinter) FX.splinter.explode(lo ? 8 : 16, p.x, p.y);
    S.fx.smoke.explode(lo ? 2 : 4, p.x, p.y);
    if (typeof plank === "function") for (let k = 0; k < 2; k++) plank(p.x, p.y);
    mastRags(p.x, p.y, (LIVERY[s.livery] ? parseInt(LIVERY[s.livery].sail.slice(1), 16) : 0xfff7e2), lo ? 3 : 6);
    floatText(s.x, s.y - 70, t("fMastDown"), "#ffd9a8", 15);
  }
  Snd.play("mastBreak", { x: p.x, y: p.y, big: s.isPlayer });
  if (s.isPlayer) {
    camShake(120, 0.003);
    if (!mastToldOnce) { mastToldOnce = true; toast(t("toastMast"), false, 3600); }
  }
}
let mastToldOnce = false;   // the explaining toast shows the first time a mast of yours goes this session
onHook("sail", () => { if (player) { player.mastLost = 0; mastRedraw(player); } });   // a sortie always starts with the masts up

// Called from onHit (js/arsenal.js) for every ball that lands on a hull.
function mastHit(s, ball) {
  if (s.fixed || !s.alive) return;
  const n = mastN(s), was = mastMask(s), now = mastRoll(was, n, mastChance(!!ball.chain), Math.random(), Math.random());
  if (now !== was) mastBreak(s, now);
}

// ---------- Refit ----------
// A dock ring that mends the hull, or a supply station, steps the masts back one per MAST.fixT seconds (called from js/mooring.js each frame inside the ring).
let mastFixT = 0;
function mastsMend(s, dt) {
  const n = mastN(s), was = mastMask(s);
  if (!was) { mastFixT = 0; return; }
  if ((mastFixT += dt) < MAST.fixT) return;
  mastFixT = 0;
  s.mastLost = mastMended(was, n); mastRedraw(s);
  const i = mastGone(s.mastLost, was, n);   // the mast that is up again
  if (i >= 0) { const p = mastPos(s, i); floatText(p.x, p.y - 30, t("fMastFix"), "#9fe0a0", 14); Snd.play("mastFix", { x: p.x, y: p.y }); }
}
// A dock opens (a harbor, the outpost, or the ledger after a sinking or a supply station): the masts are whole. A trade port refits nothing.
onHook("dock", kind => { if (typeof player !== "undefined" && player && kind !== "trade") { player.mastLost = 0; mastRedraw(player); } mastFixT = 0; });

// ---------- HUD: the captain's masts ----------
// One small icon per mast of the hull, grey once it is gone; rebuilt only when the mask, the hull or the language changes.
// They sit in the hull bar, between its label and its figure: no extra row for the HUD to wrap at a big UI size or on a phone.
const mastEl = (() => {
  const bar = typeof document !== "undefined" && document.querySelector(".bar.hp > span");
  if (!bar) return null;
  const el = document.createElement("em"); el.className = "mast-ind"; el.id = "mastInd"; el.setAttribute("role", "img"); el.hidden = true; bar.insertBefore(el, bar.children[1] || null);
  return el;
})();
const mastIcon = up => `<svg viewBox="0 0 10 14" width="10" height="14" class="${up ? "up" : "down"}" aria-hidden="true">` +
  (up ? `<path d="M5 1v12" /><path d="M5 2.2C8.6 3 8.6 7.4 5 8.2z" class="cl" />` : `<path d="M5 9.2v3.8" /><path d="M3.6 9.2l1.4-1.2 1.4 1.2" class="cl" />`) + `</svg>`;
let mastHudKey = "";
function mastHudDraw() {
  if (!mastEl) return;
  const n = player && player.alive && !docked && !titleOpen ? mastN(player) : 0, lost = n ? mastMask(player) : 0, key = lang + ":" + n + ":" + lost;
  if (key === mastHudKey) return;
  mastHudKey = key;
  mastEl.hidden = !n;
  if (!n) return;
  mastEl.innerHTML = Array.from({ length: n }, (_, i) => mastIcon(!((lost >> i) & 1))).join("");
  mastEl.classList.toggle("hurt", lost !== 0);
  const txt = t("mastAria", { n: mastLeft(lost, n), m: n });
  mastEl.setAttribute("aria-label", txt); mastEl.title = t("mastLbl") + ": " + txt;
}
onHook("frame", () => mastHudDraw());
onHook("lang", () => { mastHudKey = ""; mastHudDraw(); });
