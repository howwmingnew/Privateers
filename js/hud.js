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
  if (force || !hud.lv) { hud.lv = shipRating(); $("lv").textContent = t("shipLv", { n: hud.lv }); }
}
const mini = document.getElementById("mini"), mctx = mini.getContext("2d");
let miniBase;
// The chart covers the whole square map (the Maelstrom fills the corners). Sizes scale from the original 224-px chart.
function buildMiniBase() {
  const M = mini.width, k = M / W, u = M / 224;
  miniBase = document.createElement("canvas"); miniBase.width = miniBase.height = M;
  const c = miniBase.getContext("2d");
  drawSeaChart(c, M);   // tinted seas and the real level rings (js/world-seas.js)
  c.fillStyle = "rgba(227,207,150,.72)"; for (const i of islands) { c.beginPath(); c.arc(i.x * k, i.y * k, Math.max(2 * u, i.r * k), 0, TAU); c.fill(); }
  drawSeaLabels(c, M);
  miniHarbor(c, PORT.x * k, PORT.y * k, u);   // marks: js/mini-marks.js
}
function drawMini() {
  const M = mini.width, k = M / W, u = M / 224;
  mctx.save();
  mctx.drawImage(miniBase, 0, 0);
  const treasure = new Set(typeof fortSites !== "undefined" ? fortSites.map(s => s.crate).filter(Boolean) : []);
  for (const c of crates) if (!c.wreck) miniChest(mctx, c.x * k, c.y * k, u, treasure.has(c));
  if (typeof fortSites !== "undefined") for (const s of fortSites) if (s.hp !== 0) miniFort(mctx, s.x * k, s.y * k, s.L, u);
  for (const c of crates) if (c.wreck) miniWreck(mctx, c.x * k, c.y * k, u);
  for (const e of enemies) if (e.alive && !e.boss && !e.fixed) miniShip(mctx, e, e.x * k, e.y * k, u);
  runHook("mini", mctx, k, u);   // the bounty's skull, the outpost (js/campaign-ui.js)
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
