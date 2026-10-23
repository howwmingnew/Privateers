"use strict";
// ---------- HUD ----------
let toastTimer;
function toast(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2400); }
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
function buildMiniBase() {
  miniBase = document.createElement("canvas"); miniBase.width = miniBase.height = 224;
  const c = miniBase.getContext("2d"), k = 224 / W;
  c.fillStyle = "#0f3f52"; c.fillRect(0, 0, 224, 224);
  c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1;
  for (let i = 1; i <= 9; i++) { c.beginPath(); c.arc(PORT.x * k, PORT.y * k, (SAFE_R + 80 + i * ZONE_STEP * 1.5) * k, 0, TAU); c.stroke(); }
  c.fillStyle = "#e3cf96"; for (const i of islands) { c.beginPath(); c.arc(i.x * k, i.y * k, Math.max(2, i.r * k), 0, TAU); c.fill(); }
  c.fillStyle = "#f6f1e3"; c.beginPath(); c.arc(PORT.x * k, PORT.y * k, 5, 0, TAU); c.fill();
}
function drawMini() {
  const k = 224 / W;
  mctx.save(); mctx.beginPath(); mctx.arc(112, 112, 112, 0, TAU); mctx.clip();
  mctx.drawImage(miniBase, 0, 0);
  for (const c of crates) if (!c.wreck) { mctx.fillStyle = "#f0c766"; mctx.fillRect(c.x * k - 2, c.y * k - 2, 4, 4); }
  mctx.strokeStyle = "#ff5a3c"; mctx.lineWidth = 2.5;
  for (const c of crates) if (c.wreck) { const x = c.x * k, y = c.y * k;
    mctx.beginPath(); mctx.moveTo(x - 5, y - 5); mctx.lineTo(x + 5, y + 5); mctx.moveTo(x + 5, y - 5); mctx.lineTo(x - 5, y + 5); mctx.stroke(); }
  for (const e of enemies) if (e.alive) threatMark(mctx, e.x * k, e.y * k, threatTier(e.L));   // shape per tier (js/art.js)
  const px = player.x * k, py = player.y * k;
  mctx.translate(px, py); mctx.rotate(player.rot); mctx.fillStyle = "#fff";
  mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -4.5); mctx.lineTo(-5, 4.5); mctx.closePath(); mctx.fill();
  mctx.restore();
}

// ---------- Input: floating joystick (touch + mouse) ----------
(function joystick() {
  const area = document.getElementById("game"), joy = document.getElementById("joy"), knob = joy.firstElementChild;
  let id = null, ox = 0, oy = 0;
  const R = 50;
  area.addEventListener("pointerdown", e => {
    if (paused || id !== null) return;
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
}
document.querySelectorAll("[data-lang-toggle]").forEach(el => el.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh"; Snd.play("uiClick");
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  applyLang();
}));
applyLang();
