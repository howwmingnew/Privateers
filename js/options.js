"use strict";
// ---------- Settings panel (opened from the title, the pause menu and the harbor ledger) ----------
// Values live in js/settings.js (SETTINGS / saveSettings); volume belongs to Snd, which stores its own fields.
Object.assign(STR.en, {
  set_title: "Settings", set_audio: "Sound", set_sound: "All sound", set_master: "Master volume", set_music: "Music", set_sfx: "Sound effects", set_ambient: "Ambience",
  set_game: "Game", set_lang: "Language", set_shake: "Screen shake", set_auto: "Hold Space to auto-fire (red aim lines only)", set_on: "On", set_off: "Off", set_ui: "UI size", set_marks: "Chart icon size", set_scaleReset: "Reset sizes", set_scaleNote: "Drag a slider and the panel fades, so you can see the change behind it.",
  set_mini: "Chart size",
  set_wxfx: "Weather effects", set_wxfxNote: "Rain, lightning, sky tint and weather sounds. The wind and storm still push ships when this is off, so every sea plays the same.",
  set_full: "Fullscreen", set_fullOn: "Leave fullscreen", set_fullOff: "Go fullscreen", set_fullFail: "This browser blocked fullscreen.",
  set_progress: "Progress", set_resetNote: "Wipes your gold, ships, upgrades and wrecks. Settings are kept.",
  set_resetBusy: "Wait until you are back in harbor", m_wiped: "Progress wiped. A fresh start awaits.",
});
Object.assign(STR.zh, {
  set_title: "設定", set_audio: "聲音", set_sound: "所有聲音", set_master: "主音量", set_music: "音樂", set_sfx: "效果音", set_ambient: "環境音",
  set_game: "遊戲", set_lang: "語言", set_shake: "畫面震動", set_auto: "按住空白鍵自動開火（只射紅色瞄準線）", set_on: "開", set_off: "關", set_ui: "介面大小", set_marks: "海圖圖示大小", set_scaleReset: "恢復預設", set_scaleNote: "拖動滑桿時面板會淡出，讓你看到背後的變化。",
  set_mini: "海圖大小",
  set_wxfx: "天氣特效", set_wxfxNote: "雨、閃電、天色與天氣音效。關閉後風和暴風雨仍會影響船隻，所以每個人的海都一樣。",
  set_full: "全螢幕", set_fullOn: "離開全螢幕", set_fullOff: "進入全螢幕", set_fullFail: "瀏覽器擋下了全螢幕。",
  set_progress: "進度", set_resetNote: "會清除金幣、船隻、升級和殘骸，設定會保留。",
  set_resetBusy: "等回到港口再重置", m_wiped: "進度已清除，重新出發吧。",
});

// UI size scales every HUD, ledger and menu font through one custom property (css/style.css); world labels read uiScale().
function applyUiScale() { document.documentElement.style.setProperty("--ts", String(uiScale())); }
applyUiScale();
// The chart's width is a custom property (css/campaign.css), worked out from the screen, so a resize redoes it; the toast
// and the achievement card below the chart follow it. Big screens zoom the whole HUD box (css/style.css, 1.25 or 1.5), so
// the property is the target on screen divided by that zoom. fitMini (js/hud.js, loaded later and calling this once)
// redraws the canvas at the target size. The icon slider only changes how the marks are drawn, so it takes the same path.
function applyMiniSize() {
  const w = miniSizePx(innerWidth, innerHeight, SETTINGS.miniPct, uiScale()), hud = document.getElementById("hud");
  const zoom = (hud && parseFloat(getComputedStyle(hud).zoom)) || 1;
  document.documentElement.style.setProperty("--mini-w", w / zoom + "px");
  if (typeof fitMini === "function") fitMini(w);
}
applyMiniSize();
addEventListener("resize", applyMiniSize);
const SCALE_APPLY = { uiPct: applyUiScale, miniPct: applyMiniSize, markPct: applyMiniSize };

const setEl = id => document.getElementById(id);
let resetArmedAt = 0, resetTimer;
function renderSettings() {
  const audio = typeof Snd !== "undefined" && typeof Snd.getVolume === "function";
  setEl("setAudio").hidden = !audio;
  if (audio) document.querySelectorAll("[data-vol]").forEach(inp => {
    const v = Number(Snd.getVolume(inp.dataset.vol));
    inp.value = Math.round((Number.isFinite(v) ? v : 1) * 100);
    inp.nextElementSibling.textContent = inp.value + "%";
  });
  const seg = (name, val) => document.querySelectorAll(`[data-set="${name}"]`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === val)));
  if (audio && typeof Snd.isMuted === "function") seg("sound", Snd.isMuted() ? "off" : "on");
  seg("lang", lang); seg("shake", SETTINGS.shake ? "on" : "off"); seg("auto", SETTINGS.autoFire ? "on" : "off"); seg("weatherfx", SETTINGS.weatherFx !== false ? "on" : "off");
  const rp = typeof replaySupported === "function" && replaySupported();   // no MediaRecorder / captureStream: no row (js/replay.js)
  setEl("setReplayRow").hidden = setEl("setReplayNote").hidden = !rp;
  if (rp) seg("replay", replayWanted() ? "on" : "off");
  document.querySelectorAll("[data-scale]").forEach(inp => { inp.value = SETTINGS[inp.dataset.scale]; inp.nextElementSibling.textContent = inp.value + "%"; });
  if (!scaleDrag) setPreview(false);
  setEl("setFullRow").hidden = !document.fullscreenEnabled;
  setEl("setFull").textContent = t(document.fullscreenElement ? "set_fullOn" : "set_fullOff");
  // a sinking ship is about to dock on a timer, so a wipe now would race it
  const busy = !!player && !player.alive;
  setEl("setReset").disabled = busy;
  setEl("setReset").textContent = t(busy ? "set_resetBusy" : resetArmedAt ? "resetArm" : "reset");
}
document.addEventListener("langchange", () => { if (!setEl("p-settings").hidden) renderSettings(); });
document.addEventListener("fullscreenchange", () => { if (!setEl("p-settings").hidden) renderSettings(); });

// Live preview: while a size slider is held (or just nudged with the keys) the panel turns invisible so the game shows
// through, and a small badge keeps the slider's name and value on screen.
// On the title the HUD is hidden, so the body class brings it back for the duration (css/menu.css).
let scaleDrag = false, previewTimer;
const scaleBadge = (() => { const el = document.createElement("div"); el.id = "scaleBadge"; el.hidden = true; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); return el; })();
function setPreview(on, inp) {
  clearTimeout(previewTimer);
  setEl("p-settings").classList.toggle("previewing", on);
  document.body.classList.toggle("scale-preview", on);
  if (inp) scaleBadge.textContent = `${inp.previousElementSibling.textContent} ${inp.value}%`;
  scaleBadge.hidden = !on;
}
setEl("p-settings").addEventListener("pointerdown", e => { const sc = e.target.closest("[data-scale]"); if (sc) { scaleDrag = true; setPreview(true, sc); } });
for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, () => {
  if (!scaleDrag) return;
  scaleDrag = false; clearTimeout(previewTimer); previewTimer = setTimeout(() => setPreview(false), 250);
});
function scaleInput(inp) {
  const key = inp.dataset.scale, v = scalePct(Number(inp.value));
  if (v === null || !(key in SCALE_APPLY)) return;
  saveSettings({ [key]: v }); SCALE_APPLY[key]();
  inp.nextElementSibling.textContent = v + "%";
  setPreview(true, inp);
  if (!scaleDrag) previewTimer = setTimeout(() => setPreview(false), 800);   // keys and the gamepad send no release
}
setEl("p-settings").addEventListener("input", e => {
  const sc = e.target.closest("[data-scale]");
  if (sc) return scaleInput(sc);
  const inp = e.target.closest("[data-vol]");
  if (!inp || typeof Snd === "undefined") return;
  Snd.setVolume(inp.dataset.vol, inp.value / 100);
  inp.nextElementSibling.textContent = inp.value + "%";
});
setEl("p-settings").addEventListener("click", e => {
  const b = e.target.closest("[data-set]");
  if (!b || b.disabled) return;
  const v = b.dataset.v;
  if (typeof Snd !== "undefined") Snd.play("uiClick");
  switch (b.dataset.set) {
    case "sound": if (typeof Snd !== "undefined") Snd.setMuted(v === "off"); break;   // M toggles the same flag at sea
    case "lang":
      if (lang !== v) { lang = v; try { localStorage.setItem(LANG_KEY, lang); } catch (err) {} applyLang(); }
      break;
    case "shake": saveSettings({ shake: v === "on" }); break;
    case "replay": saveSettings({ replay: v === "on" }); break;   // the frame hook starts or stops recording (js/replay.js)
    case "auto": saveSettings({ autoFire: v === "on" }); break;
    case "weatherfx": saveSettings({ weatherFx: v === "on" }); break;   // js/weather.js
    case "scale-reset": saveSettings({ uiPct: SCALE_DEFAULT, miniPct: SCALE_DEFAULT, markPct: SCALE_DEFAULT }); applyUiScale(); applyMiniSize(); break;
    case "full": toggleFullscreen(); break;
    case "reset": pressReset(); return;
  }
  renderSettings();
});

function toggleFullscreen() {
  try {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => toast(t("set_fullFail")));
  } catch (e) { toast(t("set_fullFail")); }
}

// Two presses within 3 s wipe the save; a double-click does not count as the second press.
function pressReset() {
  const now = performance.now();
  if (resetArmedAt && now - resetArmedAt < 400) return;
  clearTimeout(resetTimer);
  if (!resetArmedAt) {
    resetArmedAt = now;
    resetTimer = setTimeout(() => { resetArmedAt = 0; renderSettings(); }, 3000);
    renderSettings();
    return;
  }
  resetArmedAt = 0;
  wipeProgress();
  toTitle();
  toast(t("m_wiped"));
}

// A new game: everything in the save goes back to default. Settings live under their own key and are untouched.
function wipeProgress() {
  save = defaultSave(); persist();
  for (let i = crates.length - 1; i >= 0; i--) if (crates[i].wreck) { crates[i].spr.destroy(); crates[i].label?.destroy(); crates.splice(i, 1); }
  cargo = 0; lastLost = 0;
  applyPlayerStats(true); hud(true);
  tutorialReset();
}
