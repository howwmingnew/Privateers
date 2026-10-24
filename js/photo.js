"use strict";
// ---------- Photo mode: freeze the sea, hide the interface, frame a shot, save a postcard ----------
// H at sea (or "Photo mode" in the pause menu, which is the way in on a phone). It rides on the pause: the sea is frozen by
// the same freeze() (js/menu.js), so time, tweens, particles and sound all stand still, and leaving it puts everything back:
// the camera's follow, zoom, scroll and offset are saved on the way in and restored on the way out, and the labels that were
// hidden are shown again, so the game carries on exactly where it stopped. Inside: drag (or WASD / arrows) to move the
// camera, wheel, pinch or + / - to zoom 0.6x-2.2x, a button to save a postcard (js/postcard.js), H / Esc to leave.
// CSS (css/photo.css) hides every page element except the canvas and the bar below; drawOverlays (js/main.js) draws no aim
// lines or health bars; Phaser text (badges, labels, damage numbers) is hidden here.
Object.assign(STR.en, {
  p_photo: "Photo mode", p_exit: "Exit", p_zin: "Zoom in", p_zout: "Zoom out",
  p_hintDesk: "Drag or WASD to move · wheel or + / − to zoom · H or Esc to leave", p_hintTouch: "Drag to move · pinch to zoom",
});
Object.assign(STR.zh, {
  p_photo: "拍照模式", p_exit: "離開", p_zin: "放大", p_zout: "縮小",
  p_hintDesk: "拖曳或 WASD 移動 · 滾輪或 + / − 縮放 · H 或 Esc 離開", p_hintTouch: "拖曳移動 · 兩指縮放",
});
const PHOTO_ZOOM = { min: 0.6, max: 2.2, step: 1.12 };   // the factor on top of the sea's own zoom (js/view.js viewZoom)
const PHOTO_PAN = 520;                                    // keyboard camera speed, CSS px per second
const photoClamp = f => clamp(f, PHOTO_ZOOM.min, PHOTO_ZOOM.max);
const photoStep = (f, dir) => photoClamp(dir > 0 ? f * PHOTO_ZOOM.step : f / PHOTO_ZOOM.step);

// on · from: "sea" | "pause" (where it was opened) · f: zoom factor · saved: the camera before · texts: Text -> was visible
const photo = { on: false, from: "sea", f: 1, saved: null, texts: new Map(), pointers: new Map(), pinch: null, held: new Set() };
const photoOn = () => photo.on;
const PHOTO_KEYS = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d" };
const phEl = id => document.getElementById(id);

// ---------- the bar ----------
const photoBar = (() => {
  const bar = document.createElement("div");
  bar.id = "photoBar"; bar.hidden = true;
  bar.innerHTML = `<p class="ph-hint"></p><div class="ph-row">
    <button type="button" class="phbtn" data-ph="zout">−</button><output class="ph-zoom"></output><button type="button" class="phbtn" data-ph="zin">+</button>
    <button type="button" class="phbtn ph-exit" data-ph="exit"></button></div>`;
  bar.querySelector(".ph-row").insertBefore(postcardButton("phbtn ph-save"), bar.querySelector(".ph-exit"));
  bar.addEventListener("click", e => {
    const a = e.target.closest("[data-ph]"); if (!a) return;
    if (a.dataset.ph === "exit") photoExit(); else photoZoom(a.dataset.ph === "zin" ? 1 : -1);
  });
  document.body.appendChild(bar);
  return bar;
})();
function photoLabels() {
  photoBar.querySelector(".ph-hint").textContent = t(device === "touch" ? "p_hintTouch" : "p_hintDesk");
  photoBar.querySelector(".ph-exit").textContent = t("p_exit");
  photoBar.querySelector('[data-ph="zin"]').setAttribute("aria-label", t("p_zin"));
  photoBar.querySelector('[data-ph="zout"]').setAttribute("aria-label", t("p_zout"));
  photoBar.querySelector(".ph-zoom").textContent = photo.f.toFixed(1) + "×";
}
document.addEventListener("langchange", photoLabels);
document.addEventListener("devicechange", photoLabels);

// ---------- in and out ----------
const phHideText = () => { for (const [o] of photo.texts) if (o.active && o.visible) o.setVisible(false); };   // also each frame: a module may show one again
function photoEnter(from) {
  if (photo.on || !S || !player.alive) return;
  if (from === "sea") { if (!sailing()) return; pauseGame(); }
  if (!pauseOpen) return;
  closeAllPanels();
  $m("pause").hidden = true; document.body.classList.remove("on-pause");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const cam = S.cameras.main;
  photo.saved = { zoom: cam.zoom, base: viewZoom(), sx: cam.scrollX, sy: cam.scrollY, fx: cam.followOffset.x, fy: cam.followOffset.y };
  cam.stopFollow();
  photo.texts = new Map(S.children.list.filter(o => o instanceof Phaser.GameObjects.Text).map(o => [o, o.visible]));
  phHideText(); S.events.on("prerender", phHideText);
  Object.assign(photo, { on: true, from, f: 1, pinch: null });
  photo.pointers.clear(); photo.held.clear();
  document.body.classList.add("photo"); photoBar.hidden = false; photoLabels();
}
function photoExit() {
  if (!photo.on) return;
  photo.on = false; photo.pointers.clear(); photo.held.clear(); photo.pinch = null;
  const cam = S.cameras.main, sv = photo.saved;
  S.events.off("prerender", phHideText);
  for (const [o, was] of photo.texts) if (o.active) o.setVisible(was);
  photo.texts = new Map();
  cam.setZoom(Math.abs(viewZoom() - sv.base) < 1e-9 ? sv.zoom : viewZoom());   // a window resized meanwhile gets the new fit
  cam.startFollow(player.spr, true, 0.15, 0.15); cam.setFollowOffset(sv.fx, sv.fy); cam.setScroll(sv.sx, sv.sy);
  document.body.classList.remove("photo"); photoBar.hidden = true;
  if (photo.from === "pause") {   // back to the menu it came from
    $m("pause").hidden = false; document.body.classList.add("on-pause"); renderPause(); focusFirst($m("pause"));
  } else resumeGame();
}
function photoZoom(dir) {
  photo.f = photoStep(photo.f, dir);
  S.cameras.main.setZoom(viewZoom() * photo.f);
  photoLabels();
}

// ---------- moving the camera ----------
const phWorld = (cssPx, cam) => cssPx * VIEW.dpr / cam.zoom;   // CSS px on screen -> world px
onHook("frame", dt => {
  if (!photo.on) return;
  const cam = S.cameras.main, want = viewZoom() * photo.f;
  if (Math.abs(cam.zoom - want) > 1e-6) cam.setZoom(want);   // the window was resized: keep the framing the player chose
  const h = photo.held, dx = (h.has("r") ? 1 : 0) - (h.has("l") ? 1 : 0), dy = (h.has("d") ? 1 : 0) - (h.has("u") ? 1 : 0);
  if (dx || dy) { const k = phWorld(PHOTO_PAN * dt, cam); cam.scrollX += dx * k; cam.scrollY += dy * k; }
});
// Runs before the shell's own key handler (js/menu.js is loaded after this file), and keeps every key from it while photo mode is up.
window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey || !S) return;
  const k = e.key;
  if (!photo.on) {
    if ((k === "h" || k === "H") && !e.repeat && !titleOpen && !docked && (sailing() || (pauseOpen && !panels.length))) { e.preventDefault(); photoEnter(sailing() ? "sea" : "pause"); }
    return;
  }
  e.stopImmediatePropagation();
  const dir = PHOTO_KEYS[e.code], onButton = document.activeElement && document.activeElement.matches && document.activeElement.matches("button");
  if (e.repeat && (k === "h" || k === "H" || k === "Escape")) { e.preventDefault(); return; }
  if (k === "h" || k === "H" || k === "Escape") { e.preventDefault(); photoExit(); }
  else if (k === "+" || k === "=") { e.preventDefault(); photoZoom(1); }
  else if (k === "-" || k === "_") { e.preventDefault(); photoZoom(-1); }
  else if (dir) { e.preventDefault(); photo.held.add(dir); }
  else if (k === "Enter" && !onButton) { e.preventDefault(); photoBar.querySelector(".ph-save").click(); }
  else if (k === " ") e.preventDefault();   // Space is the fire key: it must not scroll or press a focused button here
}, true);
window.addEventListener("keyup", e => { const dir = PHOTO_KEYS[e.code]; if (dir) photo.held.delete(dir); }, true);
window.addEventListener("blur", () => photo.held.clear());
(function pointers() {
  const area = document.getElementById("game"), pt = e => ({ x: e.clientX, y: e.clientY });
  const gap = () => { const [a, b] = [...photo.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  area.addEventListener("pointerdown", e => {
    if (!photo.on) return;
    photo.pointers.set(e.pointerId, pt(e));
    if (area.setPointerCapture) try { area.setPointerCapture(e.pointerId); } catch (err) {}
    photo.pinch = photo.pointers.size === 2 ? { d: gap(), f: photo.f } : null;
  });
  area.addEventListener("pointermove", e => {
    if (!photo.on || !photo.pointers.has(e.pointerId)) return;
    const cam = S.cameras.main, prev = photo.pointers.get(e.pointerId);
    photo.pointers.set(e.pointerId, pt(e));
    if (photo.pointers.size === 1) { cam.scrollX -= phWorld(e.clientX - prev.x, cam); cam.scrollY -= phWorld(e.clientY - prev.y, cam); }
    else if (photo.pinch) { photo.f = photoClamp(photo.pinch.f * gap() / photo.pinch.d); cam.setZoom(viewZoom() * photo.f); photoLabels(); }
  });
  const up = e => { photo.pointers.delete(e.pointerId); photo.pinch = null; };
  area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
  area.addEventListener("wheel", e => { if (photo.on) { e.preventDefault(); photoZoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
})();
