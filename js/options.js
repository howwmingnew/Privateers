"use strict";
// ---------- Settings panel (opened from the title, the pause menu and the harbor ledger) ----------
// Values live in js/settings.js (SETTINGS / saveSettings); volume belongs to Snd, which stores its own fields.
Object.assign(STR.en, {
  set_title: "Settings", set_audio: "Sound", set_sound: "All sound", set_master: "Master volume", set_music: "Music", set_sfx: "Sound effects", set_ambient: "Ambience",
  set_game: "Game", set_lang: "Language", set_shake: "Screen shake", set_on: "On", set_off: "Off", set_text: "Text size",
  set_mini: "Chart size", set_small: "Small", set_medium: "Medium", set_large: "Large",
  set_full: "Fullscreen", set_fullOn: "Leave fullscreen", set_fullOff: "Go fullscreen", set_fullFail: "This browser blocked fullscreen.",
  set_progress: "Progress", set_resetNote: "Wipes your gold, ships, upgrades and wrecks. Settings are kept.",
  set_resetBusy: "Wait until you are back in harbor", m_wiped: "Progress wiped. A fresh start awaits.",
});
Object.assign(STR.zh, {
  set_title: "設定", set_audio: "聲音", set_sound: "所有聲音", set_master: "主音量", set_music: "音樂", set_sfx: "效果音", set_ambient: "環境音",
  set_game: "遊戲", set_lang: "語言", set_shake: "畫面震動", set_on: "開", set_off: "關", set_text: "文字大小",
  set_mini: "海圖大小", set_small: "小", set_medium: "中", set_large: "大",
  set_full: "全螢幕", set_fullOn: "離開全螢幕", set_fullOff: "進入全螢幕", set_fullFail: "瀏覽器擋下了全螢幕。",
  set_progress: "進度", set_resetNote: "會清除金幣、船隻、升級和殘骸，設定會保留。",
  set_resetBusy: "等回到港口再重置", m_wiped: "進度已清除，重新出發吧。",
});

// Text size scales every HUD, ledger and menu font through one custom property (see css/style.css).
function applyTextScale() { document.documentElement.style.setProperty("--ts", String(SETTINGS.textScale)); }
applyTextScale();
// The chart's size is one custom property too (css/campaign.css); the toast below it follows on narrow screens.
function applyMiniScale() { document.documentElement.style.setProperty("--mini", String(SETTINGS.miniScale)); }
applyMiniScale();

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
  seg("lang", lang); seg("shake", SETTINGS.shake ? "on" : "off"); seg("ts", String(SETTINGS.textScale)); seg("mini", String(SETTINGS.miniScale));
  setEl("setFullRow").hidden = !document.fullscreenEnabled;
  setEl("setFull").textContent = t(document.fullscreenElement ? "set_fullOn" : "set_fullOff");
  // a sinking ship is about to dock on a timer, so a wipe now would race it
  const busy = !!player && !player.alive;
  setEl("setReset").disabled = busy;
  setEl("setReset").textContent = t(busy ? "set_resetBusy" : resetArmedAt ? "resetArm" : "reset");
}
document.addEventListener("langchange", () => { if (!setEl("p-settings").hidden) renderSettings(); });
document.addEventListener("fullscreenchange", () => { if (!setEl("p-settings").hidden) renderSettings(); });

setEl("p-settings").addEventListener("input", e => {
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
    case "ts": saveSettings({ textScale: Number(v) }); applyTextScale(); break;
    case "mini": saveSettings({ miniScale: Number(v) }); applyMiniScale(); break;
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
