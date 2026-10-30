"use strict";
// ---------- Onboarding: the first 30 seconds ----------
// A fresh captain goes from the title straight to sea (js/menu.js startGame). During the first voyage:
//   coachGlyphs(at)   coach steps 1-3 show the control itself (keycaps, a finger) beside a one-verb card (js/tutorial.js)
//   toastHeld()       toasts wait while the sea banner shows; achievement toasts and the volley tip wait for the coach
//   chartLite()       the chart shows the harbor, the first sea's islands, the player, the gold-ringed mark and wrecks (js/hud.js drawMini)
//   sinkingNear(r)    a ship going down this close: the touch "let go to fire" tip would print over it (js/input.js)
// And the title drifts over the nearest AI fight near the harbor instead of an empty quay (attractFocus, js/menu.js).
Object.assign(STR.en, { gl_drag: "drag", gl_lift: "let go", gl_hold: "hold", gl_click: "click", gl_stick: "stick", gl_holdR: "hold right" });
Object.assign(STR.zh, { gl_drag: "拖曳", gl_lift: "放開", gl_hold: "按住", gl_click: "點擊", gl_stick: "搖桿", gl_holdR: "按住右鍵" });

// ---------- coach glyphs ----------
const kc = (k, wide) => `<kbd class="kc${wide ? " wide" : ""}">${k}</kbd>`;
const glyphCap = s => `<small>${s}</small>`;
// touch: a fingertip with a drag arrow (steer) or a lifting fingertip (fire); mouse: the right button lit to steer, the left to fire
const finger = kind => `<span class="gl-finger ${kind}" aria-hidden="true"><i></i><b></b></span>`;
const mouseGl = right => `<span class="gl-mouse${right ? " r" : ""}" aria-hidden="true"><i></i></span>`;
function coachGlyphs(at) {
  const d = typeof device !== "undefined" ? device : "desk";
  const steer = at === "out" ? "W" : "A D";
  if (at !== "out" && at !== "aim" && at !== "fire") return "";
  if (d === "touch") return at === "fire" ? finger("lift") + glyphCap(t("gl_lift")) : finger("drag") + glyphCap(t("gl_drag"));
  if (d === "pad") return at === "fire" ? kc("A") + kc("RT", true) : kc("L", true) + glyphCap(t("gl_stick"));
  if (d === "mouse") return at === "fire" ? mouseGl() + glyphCap(t("gl_click")) : mouseGl(true) + glyphCap(t("gl_holdR"));
  if (at === "fire") return kc("Space", true);
  return steer.split(" ").map(k => kc(k)).join("");
}

// ---------- the text diet ----------
const seaBannerOn = () => { const b = document.getElementById("seaBanner"); return !!(b && b.classList.contains("on")); };
// The coach card is up on the sea during the first voyage: achievement toasts and the volley tip wait for it.
const coachUp = () => typeof firstVoyage === "function" && firstVoyage() && !docked && !titleOpen;
// Any banner (sea, Ship Lv, the boss card: js/notify-order.js) has the floor; toasts wait for it.
const anyBanner = () => seaBannerOn() || (typeof bannerBusy === "function" && bannerBusy());
const toastHeld = () => anyBanner();
// The notice lane (js/notices.js) holds while the banner is on; poll it back to life once both are gone.
let toastWasHeld = false;
onHook("frame", () => {
  const held = toastHeld(), freed = toastWasHeld && !held;
  if (held && !toastWasHeld && toastOn) {   // the banner arrived over a live toast: take it down and show it after
    queueToast(toastEl.textContent, true, toastMs, toastPri);
    toastEl.classList.remove("on"); toastOn = false; clearTimeout(toastTimer);
  }
  toastWasHeld = held;
  if (freed && !toastOn && toastQueue.length && !docked) { clearTimeout(toastTimer); toastTimer = setTimeout(nextToast, 250); }
});
// Achievement cards wait for the coach card, any banner, and (if earned on the first voyage) for the ledger to close.
// On a wide screen the card (bottom left) and the coach (bottom middle) do not meet, so only a narrow one makes it wait:
// "Opening Shot" belongs to the hit, not to the end of the lesson.
const ACH_COACH_W = 1200;
const achCoachHeld = () => coachUp() && window.innerWidth < ACH_COACH_W;
const achHeld = () => achCoachHeld() || anyBanner() || (typeof achLedgerHold === "function" && achLedgerHold());
onHook("frame", () => { if (typeof achQueue !== "undefined" && achQueue.length && !achShowing && !achHeld()) nextAchToast(); });

// ---------- first-voyage chart ----------
const chartLite = () => !save.tutorialDone && typeof tut !== "undefined" && tut.active;
let miniLiteCv = null;
// The sea's shading, the safe water, the first sea's islands and the harbor: no ring lines, labels, forts or far islands
// (dozens of dots at this scale). A flat tint with a harbor speck read as a blank square (#125): land says "this is a map".
const liteIsle = i => !i.outpost && Math.hypot(i.x - PORT.x, i.y - PORT.y) < ringEdge(SEAS[1].L0);
function miniLiteBase() {
  const M = mini.width, key = M + "/" + SETTINGS.markPct + "/" + islandSeed;
  if (miniLiteCv && miniLiteCv.key === key) return miniLiteCv;
  const k = M / W, u = miniUnit(M), c = (miniLiteCv = document.createElement("canvas")).getContext("2d");
  miniLiteCv.width = miniLiteCv.height = M; miniLiteCv.key = key;
  drawSeaChart(c, M);
  for (const i of islands) if (liteIsle(i)) miniIsland(c, i, k, u);
  miniHarbor(c, PORT.x * k, PORT.y * k, u);
  return miniLiteCv;
}
function miniLiteMark(c, k, u) {
  const e = tut.target;
  if (!e || !e.alive || !enemies.includes(e)) return;
  miniShip(c, e, e.x * k, e.y * k, u);
  c.strokeStyle = MINI_GOLD; c.lineWidth = 2 * u; c.beginPath(); c.arc(e.x * k, e.y * k, (9 + Math.sin(performance.now() / 250)) * u, 0, TAU); c.stroke();
}

// ---------- the touch fire tip ----------
const sinkingNear = r => enemies.some(e => !e.alive && !e.dead && dist(e, player) < r);

// ---------- title attract mode ----------
// The camera drifts over the nearest pair of hostile AI ships within ATTRACT_R of the harbor, and the sea moves under
// it. The pair's broadsides are cosmetic (js/title-attract.js): no damage, nothing sinks or persists, and setSail
// rebuilds the sea anyway.
const ATTRACT_R = 1500, ATTRACT_PAIR = 700, ATTRACT_PICK = 5;
const attract = { pair: null, pickT: 0 };
function attractPick() {
  let best = null, bd = Infinity;
  const live = enemies.filter(e => e.alive && !e.fixed && dist(e, PORT) < ATTRACT_R);
  for (const a of live) for (const b of live) {
    if (a === b || !(isHostile(a, b) || isHostile(b, a))) continue;
    const d = dist(a, b);
    if (d > ATTRACT_PAIR) continue;
    // nearest the harbor, but two warships first: a merchant runs instead of trading broadsides
    const m = Math.hypot((a.x + b.x) / 2 - PORT.x, (a.y + b.y) / 2 - PORT.y) + (a.merchant || b.merchant ? ATTRACT_R * 2 : 0);
    if (m < bd) { bd = m; best = [a, b]; }
  }
  return best;
}
// Where the title camera should look: the fight's midpoint, or null for the harbor circle.
function attractFocus(dt) {
  if ((attract.pickT -= dt) <= 0 || !attract.pair || attract.pair.some(e => !e.alive)) {
    attract.pickT = ATTRACT_PICK; attract.pair = attractPick();
  }
  const p = attract.pair;
  return p ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : null;
}
function attractTick(dt) {
  showPlayer(false);
  const k = Math.min(dt, 0.05);
  for (const e of enemies) {
    if (!e.alive || e.fixed) continue;
    if (e.target === player) e.target = null;
    think(e, k); move(e, k);
    e.spr.setPosition(e.x, e.y).setRotation(e.rot);
    vfxShip(e, k);   // wake and badge
    e.badge?.setVisible(false);   // a hero shot, not a HUD: the plates come back at sea (below, and js/tech.js thinPlates)
  }
  if (typeof attractGuns === "function") attractGuns(k);   // the pair trades cosmetic broadsides (js/title-attract.js)
}
function showPlayer(on) {
  if (player.spr.visible !== on) player.spr.setVisible(on);
  if (!on && typeof halo !== "undefined" && halo) halo.setVisible(false);   // vfxShip shows it again at sea
}
const showPlates = () => { for (const e of enemies) e.badge?.setVisible(true); };
onHook("sail", () => { showPlayer(true); showPlates(); attract.pair = null; });
onHook("dock", () => { showPlayer(true); showPlates(); attract.pair = null; });
