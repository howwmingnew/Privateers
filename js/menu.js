"use strict";
// ---------- Game shell: title, pause, sub-panels, focus, auto-pause ----------
// Modes: title (sea drifts behind it) -> harbor ledger (harbor.js) <-> sea <-> pause. Settings / How to play / Credits
// stack on top of any of them. `paused` and `docked` stay the source of truth for the game loop; this file only
// adds titleOpen / pauseOpen and freezes the scene while paused.
Object.assign(STR.en, {
  m_continue: "Continue", m_new: "New game", m_howto: "How to play", m_settings: "Settings", m_credits: "Credits", m_roadmap: "Roadmap",
  m_newConfirm: "Start a new game? This wipes your gold, ships, upgrades and wrecks. Settings are kept.",
  m_newYes: "Start over", m_cancel: "Cancel", m_back: "Back", m_atSea: "At sea", m_paused: "Paused", m_resume: "Resume",
  m_quit: "Save & quit to title", m_quitArm: "Press again: {n} cargo in the hold will be lost", m_skipTut: "Skip tutorial",
  m_quitNote: "Progress is saved every time you dock. Cargo still in the hold is not.", m_pause: "Pause",
  m_padOn: "Controller connected", m_padOff: "Controller disconnected",
});
Object.assign(STR.zh, {
  m_continue: "繼續航程", m_new: "新遊戲", m_howto: "玩法說明", m_settings: "設定", m_credits: "製作群", m_roadmap: "更新路線圖",
  m_newConfirm: "要開始新遊戲嗎？金幣、船隻、升級和殘骸都會清除，設定會保留。",
  m_newYes: "重新開始", m_cancel: "取消", m_back: "返回", m_atSea: "海上", m_paused: "暫停中", m_resume: "繼續",
  m_quit: "存檔並回到標題", m_quitArm: "再按一次：貨艙裡的 {n} 貨物會遺失", m_skipTut: "略過教學",
  m_quitNote: "每次靠港都會自動存檔，但還在貨艙裡的貨物不會保存。", m_pause: "暫停",
  m_padOn: "已連接控制器", m_padOff: "控制器已中斷連線",
});

let titleOpen = false, pauseOpen = false, seaFrozen = false;
const panels = [];                       // open sub-panels, topmost last: { el, opener }
const $m = id => document.getElementById(id);
let quitArmedAt = 0, quitTimer, wasDocked = false, capOn = null, padPrev = {}, padDir = null, padDirT = 0;
const drift = { x: 0, y: 0, t: 0 };

// ---------- boot + per-frame ----------
function shellBoot(sc) {
  sc.input.keyboard.addCapture("SPACE");          // Space fires; it must never scroll or press a focused button
  if (sc.input.mouse) sc.input.mouse.disableContextMenu();
  const gp = sc.input.gamepad;
  if (gp) {
    gp.on("connected", () => toast(t("m_padOn"), true));
    gp.on("disconnected", () => { toast(t("m_padOff"), true); if (sailing()) pauseGame(); });
  }
  showTitle();
}
function shellTick(dt) {
  if (titleOpen && sailing()) { closeAllPanels(); closeTitle(); }   // set sail without the title (a script or test): step aside
  if (docked !== wasDocked) {            // the ledger opened or closed (harbor.js dock / setSail)
    wasDocked = docked;                  // toTitle() resets wasDocked itself, so a close here is always a departure,
    if (docked) onDocked(); else onVoyage();   // even if a blur paused the game in the same frame
  }
  const sea = sailing();
  if (sea !== capOn) {                   // let menus and the ledger keep their native keys (arrows scroll, Space presses)
    capOn = sea;
    if (sea) S.input.keyboard.enableGlobalCapture(); else S.input.keyboard.disableGlobalCapture();
  }
  padTick(dt);
  if (titleOpen) driftCamera(dt);
  tutorialTick(dt);
}
function onDocked() { setSailLevel(0); cancelPointerInput(); }
function onVoyage() { setSailLevel(0); tutorialOnVoyage(); }

// The ledger opens under keys and clicks that were meant for the sea (fire is Space / A / a click), so it takes focus on
// the sheet itself: the first Enter, Space or pad A only moves to Set sail, and shop buttons ignore clicks for a moment.
const portEl = $m("port"), sheetEl = portEl.querySelector(".sheet");
let portOpenedAt = 0;
sheetEl.tabIndex = -1;
$m("sail").classList.add("primary");    // what pad A / focusFirst() lands on in the ledger
new MutationObserver(() => {            // a microtask after dock() shows it, so before the next input event
  if (portEl.hidden) return;
  portOpenedAt = performance.now();
  if (!panels.length) sheetEl.focus({ preventScroll: true });
}).observe(portEl, { attributes: true, attributeFilter: ["hidden"] });
portEl.addEventListener("click", e => {
  const age = performance.now() - portOpenedAt;   // a double-click on Continue lands its second click here too
  if (e.target.closest("[data-act]") && (age < 350 || (e.detail > 1 && age < 700))) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);

// ---------- title ----------
function showTitle() {
  titleOpen = true; paused = true; seaFrozen = false;
  document.body.classList.add("on-title");
  renderTitle();
  $m("title").hidden = false;
  if (typeof Snd !== "undefined") { Snd.music("title"); Snd.ambience("sea"); }   // starts on the first click (autoplay rules)
  const cam = S.cameras.main;
  cam.stopFollow();
  Object.assign(drift, { x: cam.midPoint.x, y: cam.midPoint.y, t: 0 });
  renderCoach();
  focusFirst($m("title"));
}
// The harbor seen from a slow boat: glide from wherever the camera was, then circle the harbor, or hang over the
// nearest AI fight near it (attract mode, js/onboard.js), framed in the open sea beside the title card.
function driftCamera(dt) {
  drift.t += dt;
  const f = typeof attractFocus === "function" ? (attractTick(dt), attractFocus(dt)) : null;
  const a = drift.t * 0.05, k = 1 - Math.exp(-dt * 0.8);
  // the fight sits in the widest open band of sea beside the title card (left/right on a wide screen, above/below on a
  // portrait phone), not behind the crest or the buttons
  const v = S.cameras.main.worldView, zk = VIEW.cssW / v.width, o = titleBand(dt), sway = f ? 1 / Math.max(1, 1.6 * zk) : 1;
  const tx = f ? f.x + (VIEW.cssW / 2 - o.x) / zk + Math.cos(a * 2) * 40 * sway : PORT.x + Math.cos(a) * 280;
  const ty = f ? f.y + (VIEW.cssH / 2 - o.y) / zk + Math.sin(a * 1.6) * 30 * sway : PORT.y + Math.sin(a * 0.8) * 170;
  drift.x += (tx - drift.x) * k; drift.y += (ty - drift.y) * k;
  S.cameras.main.centerOn(drift.x, drift.y);
}
// The centre (CSS px) of the widest strip of screen the title card leaves open. Read twice a second: a layout read.
const TITLE_BAND_MIN = 120;   // CSS px: a narrower strip cannot hold a pair of hulls
let titleBandAt = { x: 0, y: 0 }, titleBandT = 0;
function titleBand(dt) {
  if ((titleBandT -= dt) > 0) return titleBandAt;
  titleBandT = 0.5;
  const el = document.querySelector("#title .title-card"), r = el && el.getBoundingClientRect(), w = VIEW.cssW, h = VIEW.cssH;
  if (!r || !r.width) { titleBandAt = { x: w / 2, y: h / 2 }; return titleBandAt; }
  const bands = [{ s: r.left, x: r.left / 2, y: h / 2 }, { s: w - r.right, x: (r.right + w) / 2, y: h / 2 },
    { s: r.top, x: w / 2, y: r.top / 2 }, { s: h - r.bottom, x: w / 2, y: (r.bottom + h) / 2 }];
  const best = bands.reduce((a, b) => (b.s > a.s + 1 ? b : a));
  titleBandAt = best.s >= TITLE_BAND_MIN ? best : { x: w / 2, y: h / 2 };   // no room beside the card: the fight stays in frame
  return titleBandAt;
}
function renderTitle() {
  const prog = hasProgress(save), cont = $m("tContinue"), neu = $m("tNew");
  cont.hidden = !prog;
  cont.classList.toggle("primary", prog); neu.classList.toggle("primary", !prog);
  neu.dataset.i18n = prog ? "m_new" : "sail"; neu.textContent = t(neu.dataset.i18n);   // a fresh captain: "Set sail", straight to sea
  delete cont.dataset.smoke; delete neu.dataset.smoke;
  (prog ? cont : neu).dataset.smoke = "start";
  $m("titleMenu").hidden = false; $m("tConfirm").hidden = true;
  renderDailyButton();   // js/run.js
}
function startGame(fresh) {
  const skipped = fresh && save.tutorialDone && !hasProgress(save);   // skipped the tutorial, earned nothing: keep it skipped
  if (fresh) wipeProgress();
  if (skipped) { save = { ...save, tutorialDone: true }; persist(); }
  closeTitle();
  dock("welcome");   // the bookkeeping (sell, stats, save) is the same either way
  // A new captain goes straight to sea ("Set sail" means the sea); the ledger and Red Ned's poster first show at the
  // first sale. shellTick only runs onVoyage on a docked change, and docked never shows here, so start the voyage (the
  // easy mark, and the tutorial unless it was skipped) by hand.
  if (fresh) { setSail(); wasDocked = false; onVoyage(); }
}
function closeTitle() {
  titleOpen = false;
  $m("title").hidden = true; document.body.classList.remove("on-title");
  S.cameras.main.startFollow(player.spr, true, 0.15, 0.15);
}

// ---------- pause ----------
function freeze(on) {
  paused = on; seaFrozen = on;
  S.time.paused = on;                      // queued broadside shots and the sinking timer wait too
  if (on) S.tweens.pauseAll(); else S.tweens.resumeAll();
  // particle emitters: the scene's own and the combat-effect set in js/vfx.js (FX also holds plain numbers)
  for (const set of [S.fx, typeof FX !== "undefined" ? FX : {}]) for (const k in set) {
    const f = set[k]; if (f && typeof f.pause === "function" && typeof f.resume === "function") on ? f.pause() : f.resume();
  }
  if (typeof Snd !== "undefined") { if (on) Snd.pauseAll("pause"); else Snd.resumeAll("pause"); }
}
function pauseGame() {
  if (!sailing() || pauseOpen || !S) return;
  pauseOpen = true; freeze(true); cancelPointerInput();
  quitArmedAt = 0; clearTimeout(quitTimer);
  document.body.classList.add("on-pause");
  renderPause(); renderCoach();
  $m("pause").hidden = false;
  focusFirst($m("pause"));
}
function resumeGame() {
  if (!pauseOpen) return;
  if (photoOn()) { photoExit(); return; }   // photo mode (js/photo.js) rides on the pause: leaving it is what "resume" means there
  closeAllPanels();
  pauseOpen = false; $m("pause").hidden = true; document.body.classList.remove("on-pause");
  freeze(false);
  S.input.keyboard.resetKeys(); cancelPointerInput();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  renderCoach();
}
function renderPause() {
  const q = $m("pQuit");
  q.disabled = !player.alive;              // a sinking ship docks itself in a moment
  q.textContent = quitArmedAt ? t("m_quitArm", { n: fmt(cargo) }) : t("m_quit");
  $m("pSkipTut").hidden = !tutorialRunning();
}
// The hold is not part of the save, so quitting with cargo aboard asks twice.
function pressQuit() {
  const now = performance.now();
  if (quitArmedAt && now - quitArmedAt < 400) return;   // a double-click is not a second press
  clearTimeout(quitTimer);
  if (cargo > 0 && !quitArmedAt) {
    quitArmedAt = now;
    quitTimer = setTimeout(() => { quitArmedAt = 0; if (pauseOpen) renderPause(); }, 3000);
    renderPause(); return;
  }
  quitArmedAt = 0;
  toTitle();
}
// Leave whatever is open (pause, ledger, panels) for the title. Nothing is docked: Continue docks at the harbor.
function toTitle() {
  runLeave();   // a daily or seeded run hands the real save back first (js/run.js)
  closeAllPanels();
  if (pauseOpen) { pauseOpen = false; $m("pause").hidden = true; document.body.classList.remove("on-pause"); freeze(false); }
  if (docked) { $m("port").hidden = true; docked = false; }
  paused = true; wasDocked = false;
  for (const b of balls) b.spr.destroy();
  balls.length = 0;
  cargo = 0; canDock = false; restoreSalvage();   // js/save.js: unsold wreck cargo goes back to sea
  if (player.alive) {
    Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0, burnT: 0, hp: player.maxHp });
    player.spr.setPosition(player.x, player.y).setRotation(0).clearTint();
  }
  persist(); hud(true);
  showTitle();
}

// ---------- sub-panels ----------
function openPanel(name, opener) {
  const el = $m("p-" + name);
  if (!el || panels.some(p => p.el === el)) return;
  if (name === "settings") renderSettings();
  el.hidden = false; panels.push({ el, opener });
  const sc = el.querySelector(".scroll"); if (sc) sc.scrollTop = 0;
  focusFirst(el, name !== "settings");    // settings starts on its first control; the text panels on Back
}
function closePanel() {
  const p = panels.pop();
  if (!p) return;
  p.el.hidden = true;
  if (p.opener && p.opener.getClientRects().length && !p.opener.disabled) p.opener.focus({ preventScroll: true });
  else { const r = activeRoot(); if (r) focusFirst(r); }
}
function closeAllPanels() { while (panels.length) panels.pop().el.hidden = true; }
// Campaign modals (js/logbook.js, js/victory.js) sit over the ledger or the sea; focus and the pad stay inside them.
const campaignModal = () => document.querySelector("#victory:not([hidden]), #logbook:not([hidden]), #runEnd:not([hidden])");
function activeRoot() {
  if (panels.length) return panels[panels.length - 1].el;
  const modal = campaignModal();
  if (modal) return modal;
  if (pauseOpen) return $m("pause");
  if (titleOpen) return $m("title");
  if (docked) return document.querySelector("#port .sheet");
  return null;
}
function goBack() {
  if (panels.length) return closePanel();
  const modal = campaignModal();
  if (modal) { if (modal.id === "logbook" && typeof closeLog === "function") closeLog(); return; }   // victory: its own buttons
  if (pauseOpen) return resumeGame();
  if (titleOpen && !$m("tConfirm").hidden) return menuAction("new-no");
  if (docked) $m("sail").focus({ preventScroll: true });   // from the ledger, "back" heads for Set sail
}

function menuAction(act, b) {
  switch (act) {
    case "continue": startGame(false); break;
    case "daily": startRun("daily"); break;   // js/run.js
    case "new":
      if (!hasProgress(save)) { startGame(true); break; }
      $m("titleMenu").hidden = true; $m("tConfirm").hidden = false;
      $m("tConfirm").querySelector('[data-menu="new-no"]').focus({ preventScroll: true }); break;   // safe default
    case "new-yes": startGame(true); break;
    case "new-no": $m("tConfirm").hidden = true; $m("titleMenu").hidden = false; $m("tNew").focus({ preventScroll: true }); break;
    case "howto": case "settings": case "credits": openPanel(act, b); break;
    case "roadmap": openRoadmap(b); break;   // js/roadmap-panel.js
    case "back": closePanel(); break;
    case "pause": pauseGame(); break;
    case "photo": photoEnter("pause"); break;   // js/photo.js
    case "resume": resumeGame(); break;
    case "quit": pressQuit(); break;
    case "skip-tut": tutorialSkip(); if (pauseOpen) { renderPause(); focusFirst($m("pause")); } break;
    case "replay-tut": tutorialReplay(); toast(t(titleOpen ? "ht_replayed" : "ht_restarted")); closePanel(); if (pauseOpen) resumeGame(); break;
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-menu]");
  if (b && !b.disabled) { if (typeof Snd !== "undefined") Snd.play("uiClick"); menuAction(b.dataset.menu, b); }
  // HUD buttons must not keep focus at sea, or Space (fire) would press them again
  const hb = e.target.closest("#hud button");
  if (hb && sailing()) hb.blur();
});

// ---------- focus: trap, spatial navigation (arrows and pad), scroll fallback ----------
function focusables(root) {
  return [...root.querySelectorAll("button, input, select, a[href], [tabindex]")]
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest("[hidden]"));
}
const scrollerOf = root => (root.matches(".sheet, .scroll") ? root : root.querySelector(".scroll"));
function focusEl(el) {
  el.focus({ preventScroll: true });
  if (!el.closest("footer")) el.scrollIntoView({ block: "nearest" });
}
function focusFirst(root, preferPrimary = true) {
  const els = focusables(root);
  const pick = (preferPrimary && els.find(el => el.classList.contains("primary"))) || els[0];
  if (pick) pick.focus({ preventScroll: true });
}
// Move to the nearest visible control in a direction; with nothing visible that way, scroll the panel instead.
function moveFocus(root, dx, dy) {
  if (root === sheetEl) return ledgerMove(dx, dy);   // the ledger: every shop control, the sticky footer last (js/ledger-nav.js)
  const els = focusables(root), cur = document.activeElement, sc = scrollerOf(root);
  const box = sc ? sc.getBoundingClientRect() : null;
  const seen = el => { if (!box) return true; const r = el.getBoundingClientRect(); return r.bottom > box.top + 4 && r.top < box.bottom - 4; };
  if (!els.includes(cur)) { const f = els.find(seen) || els[0]; if (f) focusEl(f); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of els) {
    if (el === cur || !seen(el)) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const along = dx ? (x - ax) * dx : (y - ay) * dy, across = dx ? Math.abs(y - ay) : Math.abs(x - ax);
    if (along < 6) continue;
    const s = along + across * 2;
    if (s < bs) { bs = s; best = el; }
  }
  if (best) focusEl(best);
  else if (sc && dy) sc.scrollBy({ top: dy * sc.clientHeight * 0.45 });
}
function trapTab(e, root) {
  const els = focusables(root);
  if (!els.length) return;
  const i = els.indexOf(document.activeElement), n = i === -1 ? (e.shiftKey ? els.length - 1 : 0) : i + (e.shiftKey ? -1 : 1);
  if (i === -1 || n < 0 || n >= els.length) { e.preventDefault(); els[(n + els.length) % els.length].focus(); }
}
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
// Runs in the capture phase, before Phaser. Never preventDefault Space at sea: Phaser drops prevented events.
window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey || !S) return;
  const k = e.key, isP = k === "p" || k === "P", press = k === " " || k === "Enter";
  if (e.repeat && (k === "Escape" || isP)) { e.preventDefault(); return; }   // holding Esc must not flicker pause / resume
  if (sailing()) {
    if (k === "Escape" || isP) { e.preventDefault(); pauseGame(); return; }
    const a = document.activeElement;
    if ((k === " " || k === "Enter") && a && a !== document.body && a.matches("button, input, select")) {
      a.blur(); if (k === "Enter") e.preventDefault();
    }
    return;
  }
  const root = activeRoot();
  if (!root) return;
  if (press && e.repeat) { e.preventDefault(); return; }   // a held Enter must not run title > ledger > sea on its own
  if (k === "Escape") { e.preventDefault(); goBack(); return; }
  if (isP && pauseOpen && !panels.length) { e.preventDefault(); resumeGame(); return; }
  if (k === "Tab") { trapTab(e, root); return; }
  if (root === sheetEl) {                              // the bare ledger keeps native arrow scrolling
    // Space is the fire key, so on the bare sheet it does nothing; Enter (never a fire key) moves to Set sail
    if (press && document.activeElement === sheetEl) { e.preventDefault(); if (k === "Enter") $m("sail").focus({ preventScroll: true }); }
    // from a control, arrows walk the shop like the D-pad does
    const d = DIRS[k], at = document.activeElement;
    if (d && k.length > 1 && at !== sheetEl && sheetEl.contains(at)) { e.preventDefault(); ledgerMove(d[0], d[1]); }
    return;
  }
  const dir = DIRS[k], a = document.activeElement;
  if (!dir || (a && a.type === "range" && dir[0])) return;   // left / right still move a slider
  e.preventDefault(); moveFocus(root, dir[0], dir[1]);
}, true);

// ---------- gamepad ----------
function padTick(dt) {
  const s = padSnapshot() || {};
  const pressed = k => !!s[k] && !padPrev[k];
  if (pressed("start")) { if (sailing()) pauseGame(); else if (pauseOpen && !panels.length) resumeGame(); }
  else if (sailing()) padSea(s, pressed);
  else {
    padVec = { x: 0, y: 0, m: 0 };
    padNav(s, dt);
    const root = activeRoot(), a = document.activeElement;
    const quiet = docked && performance.now() - portOpenedAt < 650;   // A is also fire: ignore it as the ledger appears
    if (pressed("a") && root && !quiet) { if (a && root.contains(a) && a.matches("button")) a.click(); else focusFirst(root); }
    if (pressed("b")) goBack();
    ledgerPad(pressed);   // Y = Set sail, LB / RB = shop sections (js/ledger-nav.js)
  }
  padPrev = s;
}
// D-pad or stick moves focus: once on press, then repeating while held.
function padNav(s, dt) {
  const d = s.up || s.ly < -0.5 ? "u" : s.down || s.ly > 0.5 ? "d" : s.left || s.lx < -0.5 ? "l" : s.right || s.lx > 0.5 ? "r" : null;
  if (d !== padDir) { padDir = d; padDirT = 0.38; if (d) navDir(d); return; }
  if (d && (padDirT -= dt) <= 0) { padDirT = 0.13; navDir(d); }
}
function navDir(d) {
  const root = activeRoot(), a = document.activeElement, [dx, dy] = DIRS[d];
  if (!root) return;
  if (a && a.type === "range" && dx && root.contains(a)) {
    a.value = Number(a.value) + dx * Number(a.step || 1);
    a.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  moveFocus(root, dx, dy);
}

// ---------- auto-pause: alt-tab, the Steam overlay, a hidden tab ----------
window.addEventListener("blur", () => { if (S && sailing()) pauseGame(); });
document.addEventListener("visibilitychange", () => { if (S && document.hidden && sailing()) pauseGame(); });

// ---------- language ----------
document.addEventListener("langchange", () => {
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  $m("pauseBtn").setAttribute("aria-label", t("m_pause"));
  if (pauseOpen) renderPause();
});
