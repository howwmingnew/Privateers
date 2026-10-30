"use strict";
// ---------- Notice order: one banner at a time, achievements after the ledger, a quiet first kill and Shallows ----------
// Banners rank: the boss name card > the Ship Lv banner > the sea banner. One that arrives while a higher (or equal)
// one is up waits; a lower one already up is taken down and waits. A waiting sea banner goes stale once the ship has
// left that sea, docked, or SEA_STALE_MS passed, and is dropped. A Ship Lv banner that waited over LV_STALE_MS (say,
// behind a boss card) would replay out of context: it becomes a plain toast instead. Toasts and achievement cards wait
// for any banner (toastHeld / achHeld, js/onboard.js).
const BANNER_RANK = { bossCard: 3, lvBanner: 2, seaBanner: 1 };
const SEA_STALE_MS = 5000, LV_STALE_MS = 2000, BANNER_GAP_MS = 250;
let bannerWait = [], bannerLive = {}, bannerFreeAt = 0;
const bannerOn = id => { const el = document.getElementById(id); return !!(el && el.classList.contains("on")); };
const bannerUp = () => Object.keys(BANNER_RANK).some(bannerOn);
const bannerBusy = () => bannerUp() || bannerWait.length > 0;   // up, or one is waiting its turn: toasts and cards go after
function bannerDown(id) {
  if (id === "seaBanner") { hideSeaBanner(); return; }
  const el = document.getElementById(id);
  if (el) { clearTimeout(el.timer); el.classList.remove("on"); }
}
// May banner `id` show now? If not, `show` is kept and called again when the floor is free. sea: the sea's id.
function bannerGate(id, show, sea) {
  const r = BANNER_RANK[id], up = Object.keys(BANNER_RANK).filter(k => k !== id && bannerOn(k));
  const entry = { id, show, sea, at: performance.now(), waitAt: performance.now() };
  if (up.some(k => BANNER_RANK[k] >= r)) { bannerWait = [...bannerWait.filter(w => w.id !== id), entry]; return false; }
  for (const k of up) {
    bannerDown(k);
    if (bannerLive[k]) bannerWait = [...bannerWait.filter(w => w.id !== k), { ...bannerLive[k], waitAt: performance.now() }];
  }
  bannerLive = { ...bannerLive, [id]: entry };
  bannerWait = bannerWait.filter(w => w.id !== id);
  if (id === "bossCard") achYield();
  return true;
}
const seaStale = (w, now) => w.id === "seaBanner" &&
  (docked || now - w.at > SEA_STALE_MS || (typeof seaNow !== "undefined" && seaNow !== w.sea));
const lvStale = (w, now) => w.id === "lvBanner" && now - w.waitAt > LV_STALE_MS;
onHook("frame", () => {
  const now = performance.now();
  if (bannerUp()) { bannerFreeAt = now; return; }
  if (!bannerWait.length) return;
  if (bannerWait.some(w => lvStale(w, now)) && !docked) toast(t("lvUp", { n: shipRating() }));   // news, not a fanfare
  bannerWait = bannerWait.filter(w => !seaStale(w, now) && !lvStale(w, now));
  if (!bannerWait.length || now - bannerFreeAt < BANNER_GAP_MS) return;
  const next = bannerWait.reduce((a, b) => (BANNER_RANK[b.id] > BANNER_RANK[a.id] ? b : a));
  bannerWait = bannerWait.filter(w => w !== next);
  next.show();
});
onHook("sail", () => { bannerWait = bannerWait.filter(w => w.id !== "seaBanner"); });

// ---------- achievement cards ----------
// The boss card arrives over a live achievement card: take the card down and show it again after (achHeld waits).
function achYield() {
  if (typeof achShowing === "undefined" || !achShowing) return;
  const id = achToastEl.dataset.id;
  if (id && !achQueue.includes(id)) achQueue.unshift(id);
  achToastEl.classList.remove("on");
}
// Cards earned under the first voyage's coach card would pop over the ledger when the first sale opens it: they wait
// until the ledger closes and the ship is at sea again.
let achSeaHeld = false;
onHook("frame", () => { if (achQueue.length && typeof achCoachHeld === "function" && achCoachHeld()) achSeaHeld = true; });
onHook("sail", () => { achSeaHeld = false; });
const achLedgerHold = () => achSeaHeld && docked;

// ---------- the first kill reads as a payoff, not accounting ----------
// No "streak ×1.1" on the kill card (js/juice.js payLine) and no plunder-streak chip until a second ship goes down.
const streakQuiet = () => streak <= 1 && (save.sunk <= 1 || (typeof firstVoyage === "function" && firstVoyage()));
onHook("frame", () => {
  const el = document.getElementById("streak");
  if (el) { const q = streakQuiet(); if (el.classList.contains("quiet") !== q) el.classList.toggle("quiet", q); }
});

// ---------- a quiet Shallows for a new captain ----------
// On the first voyage, and after it while the captain's Ship Lv is still under NOVICE_LV (js/novice.js), a ship made in
// the Shallows (js/ships.js makeEnemy) fights at most one level above that Ship Lv: no ▲▲ ship waits by the harbor
// mouth. Re-roll its class, then drop its level. The player's own escorts (faction "ally", js/escort-ai.js; e.ally is only
// set after makeEnemy returns) keep the class and level their yard entry gave them.
// (Inside practiceZone, js/novice.js, the ships are Lv 1 targets instead, and in the outer band to NOVICE_PORT_R they are held to outerLv, 2-3, so the cap below only matters for the Shallows once the first
// bounty is claimed, and for placed ships' neighbours at the edge of the circle.)
// Until the first bounty is claimed the same cap holds anywhere within NOVICE_PORT_R of the harbor (#108: the Reef Straits and the
// Lanes' edge are a screen or two out, and a Lv 4-7 crew there ended new captains' first sortie). `placed` ships (a bounty, its
// guard, the tutorial's mark) keep their designed level: only quota spawns, fleets and hunters are held there.
function tameFirstVoyage(e, placed) {
  if (e.fixed || e.faction === "ally" || typeof seaOfRing !== "function") return;
  if (!placed && practiceZone(e.x, e.y) && !(typeof heat === "number" && heat > 0)) {   // practice waters (#113, js/novice.js): a Lv 1 target that neither runs nor fires first; no fireship
    e.L = 1; outfitEnemy(e, e.merchant ? "fluyt" : pickArch(1, e.faction));
    if (e.A.boom) outfitEnemy(e, "cutter");
    e.practice = true; e.escort = false;   // never a convoy's guard that hunts pirates
    return;
  }
  const me = shipRating(), home = !placed && noviceHome(save.campaign.bounty, save.ngPlus, Math.hypot(e.x - PORT.x, e.y - PORT.y));
  if (!home && (seaOfRing(e.ring).id !== "shallows" || (save.tutorialDone && me >= NOVICE_LV))) return;
  const outer = home && !(typeof heat === "number" && heat > 0) && outerZone(e.x, e.y);   // #115: the outer band holds ordinary Lv 2-3 ships (outerLv, js/novice.js)
  const cap = outer ? outerLv(e.ring, me) : noviceCap(me), over = () => (e.threatL ?? e.L) > cap;
  for (let i = 0; i < 4 && over(); i++) outfitEnemy(e, i < 2 ? pickArch(e.L, e.faction) : e.merchant ? "fluyt" : "cutter");
  while (over() && e.L > 1) { e.L--; outfitEnemy(e, e.arch); }
}

// ---------- phones: the achievement card sits just above the hint, whatever its height ----------
let hintH = -1, barsB = -1, hintPollT = 0;
onHook("frame", dt => {
  if ((hintPollT -= dt) > 0) return;
  hintPollT = 0.25;   // getBoundingClientRect forces a layout: every frame it cost ~2.5% of a phone fight
  const h = document.getElementById("hint"), px = h && !h.hidden ? Math.round(h.getBoundingClientRect().height) : 0;   // fixed: no offsetParent
  if (px !== hintH) { hintH = px; document.documentElement.style.setProperty("--hintH", px + "px"); }
  // where the HUD bars end, in the toast's own (zoomed) pixels: the speed and sail readouts wrap onto a second row at big UI sizes,
  // and the toast lane (css/weather.css) must start below whatever they make of the column
  const bars = document.querySelector("#hud .bars"), r = bars && bars.getBoundingClientRect();
  const k = bars && bars.offsetHeight ? r.height / bars.offsetHeight : 1, below = r && r.height ? Math.ceil(r.bottom / k) + 8 : 0;
  if (below !== barsB) { barsB = below; document.documentElement.style.setProperty("--barsB", below + "px"); }
});
