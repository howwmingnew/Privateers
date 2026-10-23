"use strict";
// ---------- Game shell: title, pause, sub-panels, focus, auto-pause ----------
// Modes: title (sea drifts behind it) -> harbor ledger (harbor.js) <-> sea <-> pause. Settings / How to play / Credits
// stack on top of any of them. `paused` and `docked` stay the source of truth for the game loop; this file only
// adds titleOpen / pauseOpen and freezes the scene while paused.
Object.assign(STR.en, {
  m_continue: "Continue", m_new: "New game", m_howto: "How to play", m_settings: "Settings", m_credits: "Credits",
  m_newConfirm: "Start a new game? This wipes your gold, ships, upgrades and wrecks. Settings are kept.",
  m_newYes: "Start over", m_cancel: "Cancel", m_back: "Back", m_atSea: "At sea", m_paused: "Paused", m_resume: "Resume",
  m_quit: "Save & quit to title", m_quitArm: "Press again: {n} cargo in the hold will be lost", m_skipTut: "Skip tutorial",
  m_quitNote: "Progress is saved every time you dock. Cargo still in the hold is not.", m_pause: "Pause",
  m_padOn: "Controller connected", m_padOff: "Controller disconnected",
});
Object.assign(STR.zh, {
  m_continue: "繼續航程", m_new: "新遊戲", m_howto: "玩法說明", m_settings: "設定", m_credits: "製作群",
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
    gp.on("connected", () => toast(t("m_padOn")));
    gp.on("disconnected", () => { toast(t("m_padOff")); if (sailing()) pauseGame(); });
  }
  showTitle();
}
function shellTick(dt) {
  if (docked !== wasDocked) {            // the ledger opened or closed (harbor.js dock / setSail)
    wasDocked = docked;
    if (docked) onDocked(); else if (!paused) onVoyage();
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
function onDocked() {
  setSailLevel(0); cancelPointerInput();
  if (!panels.length) $m("sail").focus({ preventScroll: true });   // Enter / pad A sets sail straight away
}
function onVoyage() { setSailLevel(0); tutorialOnVoyage(); }

// ---------- title ----------
function showTitle() {
  titleOpen = true; paused = true; seaFrozen = false;
  document.body.classList.add("on-title");
  renderTitle();
  $m("title").hidden = false;
  const cam = S.cameras.main;
  cam.stopFollow();
  Object.assign(drift, { x: cam.midPoint.x, y: cam.midPoint.y, t: 0 });
  renderCoach();
  focusFirst($m("title"));
}
// The harbor seen from a slow boat: glide from wherever the camera was, then circle the harbor.
function driftCamera(dt) {
  drift.t += dt;
  const a = drift.t * 0.05, tx = PORT.x + Math.cos(a) * 280, ty = PORT.y + Math.sin(a * 0.8) * 170, k = 1 - Math.exp(-dt * 0.8);
  drift.x += (tx - drift.x) * k; drift.y += (ty - drift.y) * k;
  S.cameras.main.centerOn(drift.x, drift.y);
}
function renderTitle() {
  const prog = hasProgress(save), cont = $m("tContinue"), neu = $m("tNew");
  cont.hidden = !prog;
  cont.classList.toggle("primary", prog); neu.classList.toggle("primary", !prog);
  delete cont.dataset.smoke; delete neu.dataset.smoke;
  (prog ? cont : neu).dataset.smoke = "start";
  $m("titleMenu").hidden = false; $m("tConfirm").hidden = true;
}
function startGame(fresh) {
  if (fresh) wipeProgress();
  titleOpen = false;
  $m("title").hidden = true; document.body.classList.remove("on-title");
  S.cameras.main.startFollow(player.spr, true, 0.15, 0.15);
  dock("welcome");
}

// ---------- pause ----------
function freeze(on) {
  paused = on; seaFrozen = on;
  S.time.paused = on;                      // queued broadside shots and the sinking timer wait too
  if (on) S.tweens.pauseAll(); else S.tweens.resumeAll();
  for (const k in S.fx) { const f = S.fx[k]; if (f && typeof f.pause === "function") on ? f.pause() : f.resume(); }
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
  closeAllPanels();
  if (pauseOpen) { pauseOpen = false; $m("pause").hidden = true; document.body.classList.remove("on-pause"); freeze(false); }
  if (docked) { $m("port").hidden = true; docked = false; }
  paused = true; wasDocked = false;
  for (const b of balls) b.spr.destroy();
  balls.length = 0;
  cargo = 0; canDock = false;
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
function activeRoot() {
  if (panels.length) return panels[panels.length - 1].el;
  if (pauseOpen) return $m("pause");
  if (titleOpen) return $m("title");
  if (docked) return document.querySelector("#port .sheet");
  return null;
}
function goBack() {
  if (panels.length) return closePanel();
  if (pauseOpen) return resumeGame();
  if (titleOpen && !$m("tConfirm").hidden) return menuAction("new-no");
  if (docked) $m("sail").focus({ preventScroll: true });   // from the ledger, "back" heads for Set sail
}

function menuAction(act, b) {
  switch (act) {
    case "continue": startGame(false); break;
    case "new":
      if (!hasProgress(save)) { startGame(true); break; }
      $m("titleMenu").hidden = true; $m("tConfirm").hidden = false;
      $m("tConfirm").querySelector('[data-menu="new-no"]').focus({ preventScroll: true }); break;   // safe default
    case "new-yes": startGame(true); break;
    case "new-no": $m("tConfirm").hidden = true; $m("titleMenu").hidden = false; $m("tNew").focus({ preventScroll: true }); break;
    case "howto": case "settings": case "credits": openPanel(act, b); break;
    case "back": closePanel(); break;
    case "pause": pauseGame(); break;
    case "resume": resumeGame(); break;
    case "quit": pressQuit(); break;
    case "skip-tut": tutorialSkip(); if (pauseOpen) { renderPause(); focusFirst($m("pause")); } break;
    case "replay-tut": tutorialReplay(); toast(t("ht_replayed")); closePanel(); if (pauseOpen) resumeGame(); break;
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-menu]");
  if (b && !b.disabled) menuAction(b.dataset.menu, b);
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
  const k = e.key, isP = k === "p" || k === "P";
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
  if (k === "Escape") { e.preventDefault(); goBack(); return; }
  if (isP && pauseOpen && !panels.length) { e.preventDefault(); resumeGame(); return; }
  if (k === "Tab") { trapTab(e, root); return; }
  if (root.matches("#port .sheet")) return;          // the ledger keeps native arrow scrolling
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
    if (pressed("a") && root) { if (a && root.contains(a) && a.matches("button")) a.click(); else focusFirst(root); }
    if (pressed("b")) goBack();
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
