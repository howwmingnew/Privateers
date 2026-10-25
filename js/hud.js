"use strict";
// ---------- HUD ----------
// toast(): js/notices.js (held while the ledger is open)
function hud(force) {
  const $ = id => document.getElementById(id);
  $("hpFill").style.width = clamp(player.hp / player.maxHp, 0, 1) * 100 + "%";
  $("hpTxt").textContent = `${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`;
  $("cargoFill").style.width = clamp(cargo / player.cap, 0, 1) * 100 + "%";
  $("cargoTxt").textContent = `${fmt(cargo)} / ${fmt(player.cap)}`;
  $("cargoBar").classList.toggle("full", cargo >= player.cap);
  $("gold").textContent = fmt(save.gold);
  if (force || !hud.lv) {
    const lv = shipRating();
    if (hud.lv && lv > hud.lv && typeof lvBanner === "function") lvBanner(lv);   // a purchase raised it (js/juice-ui.js)
    hud.lv = lv; $("lv").textContent = t("shipLv", { n: lv });
  }
}
const mini = document.getElementById("mini"), mctx = mini.getContext("2d");
let miniBase, miniKey = "", miniFitQueued = false, miniWantPx = 0;
// One chart unit u = a pixel of the original 224-px chart: marks scale with the chart, times the icon-size setting, but
// never below MINI_UNIT_MIN CSS px (M / miniWantPx turns CSS px into canvas px), so 50% on a small chart is still visible.
const miniUnit = M => Math.max(M / 224 * SETTINGS.markPct / 100, miniWantPx > 0 ? MINI_UNIT_MIN * M / miniWantPx : 0);
// Give the chart canvas a drawing size to match its width on screen (device pixels, so it stays sharp on HiDPI) and redraw it.
// Called by js/options.js whenever the screen or a size slider changes; many calls in a frame make one redraw.
function fitMini(screenPx) {
  miniWantPx = screenPx;
  if (miniFitQueued) return;
  miniFitQueued = true;
  requestAnimationFrame(() => {
    miniFitQueued = false;
    const M = miniCanvasPx(miniWantPx, window.devicePixelRatio || 1), key = M + "/" + SETTINGS.markPct;
    if (key === miniKey) return;
    miniKey = key;
    if (mini.width !== M) mini.width = mini.height = M;
    if (typeof S !== "undefined" && S && typeof player !== "undefined" && player) { buildMiniBase(); drawMini(); }   // not before the scene exists
  });
}
applyMiniSize();   // js/options.js ran first and found no fitMini yet
// The chart covers the whole square map (the Maelstrom fills the corners). Sizes scale from the original 224-px chart.
function buildMiniBase() {
  const M = mini.width, k = M / W, u = miniUnit(M);
  miniBase = document.createElement("canvas"); miniBase.width = miniBase.height = M;
  const c = miniBase.getContext("2d");
  drawSeaChart(c, M);   // the seas as one smooth shade, darker the deadlier (js/world-seas.js)
  for (const i of islands) if (!i.outpost) miniIsland(c, i, k, u);   // land silhouettes (js/mini-marks.js); the outpost has its own mark
  drawSeaLabels(c, M);
}
function drawMini() {
  const M = mini.width, k = M / W, u = miniUnit(M);
  mctx.save();
  if (typeof chartLite === "function" && chartLite()) {   // first voyage: harbor, player, the gold-ringed mark, wrecks (js/onboard.js)
    mctx.drawImage(miniLiteBase(), 0, 0);
    for (const c of crates) if (c.wreck) miniWreck(mctx, c.x * k, c.y * k, u);
    miniLiteMark(mctx, k, u); miniPlayer(mctx, player.x * k, player.y * k, player.rot, u);
    return mctx.restore();
  }
  mctx.drawImage(miniBase, 0, 0);
  const treasure = new Set(typeof fortSites !== "undefined" ? fortSites.map(s => s.crate).filter(Boolean) : []);
  const me = shipRating();   // once for every fort and ship mark: it walks every gun and the power table
  // bottom to top: chests and wrecks, forts, ordinary ships, the harbor and outpost, ships that are close and stronger, the bounty, you
  for (const c of crates) if (!c.wreck) miniChest(mctx, c.x * k, c.y * k, u, treasure.has(c));
  for (const c of crates) if (c.wreck) miniWreck(mctx, c.x * k, c.y * k, u);
  if (typeof fortSites !== "undefined") for (const s of fortSites) if (s.hp !== 0) miniFort(mctx, s.x * k, s.y * k, s.L, u, me);
  drawMiniShips(mctx, k, u, () => {
    if (portsOff()) return;   // the daily sea has no harbor or stations (js/ports.js)
    miniHarbor(mctx, PORT.x * k, PORT.y * k, u);
    if (save.campaign.outpost) miniOutpost(mctx, OUTPOST.x * k, OUTPOST.y * k, u);
    for (const st of STATIONS) miniStation(mctx, st.kind, st.x * k, st.y * k, u);   // supply stations and trade ports (js/ports.js)
  }, me);
  runHook("mini", mctx, k, u);   // the bounty's skull (js/campaign-ui.js)
  miniPlayer(mctx, player.x * k, player.y * k, player.rot, u);
  mctx.restore();
}

// ---------- Input: floating joystick (touch and pen; the mouse steers toward the cursor, js/input.js) ----------
(function joystick() {
  const area = document.getElementById("game"), joy = document.getElementById("joy"), knob = joy.firstElementChild;
  let id = null, ox = 0, oy = 0;
  const R = 50;
  area.addEventListener("pointerdown", e => {
    if (paused || id !== null || e.pointerType === "mouse") return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    area.setPointerCapture(id);
    joy.style.left = ox + "px"; joy.style.top = oy + "px"; joy.hidden = false;
    knob.style.transform = "translate(0,0)";
  });
  area.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    joyVec = { x: dx / R, y: dy / R, m: Math.min(1, d / R) };
  });
  const end = (e, shoot) => { if (e.pointerId !== id) return; id = null; joy.hidden = true; joyVec = { x: 0, y: 0, m: 0 }; if (shoot) playerFire(); };
  area.addEventListener("pointerup", e => end(e, true)); area.addEventListener("pointercancel", e => end(e, false));
})();
const isTouch = matchMedia("(pointer: coarse)").matches;

// Apply the current language to every static label, the HUD, the harbor ledger and in-world texts.
function applyLang() {
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-lang-toggle]").forEach(el => { el.textContent = t("langBtn"); el.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切換成中文"); });
  document.getElementById("hint").textContent = t(isTouch ? "hintTouch" : "hintDesk");
  if (player) { hud(true); renderPort(); enemies.forEach(e => e.badge && refreshBadge(e)); }
  if (harborLabel) harborLabel.setText(t("harborMap"));
  for (const c of crates) c.label?.setText(t("wreckLabel"));
  document.dispatchEvent(new Event("langchange"));   // the shell modules re-render their dynamic text on this
  runHook("lang");   // feature modules relabel their own texts (js/hooks.js)
}
document.querySelectorAll("[data-lang-toggle]").forEach(el => el.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh"; Snd.play("uiClick");
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  applyLang();
}));
applyLang();
