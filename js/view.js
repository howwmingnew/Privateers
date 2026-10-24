"use strict";
// ---------- HiDPI view ----------
// Phaser 3.80 has no `resolution` option, and Scale.RESIZE sizes the canvas in CSS pixels, so HiDPI screens (Retina,
// Windows at 125-200%) showed an upscaled, blurry picture. Instead the backing store is sized in device pixels
// (Scale.NONE; the scale manager's zoom 1/dpr keeps the canvas CSS-sized on the page) and the camera zoom is multiplied
// by dpr, so the world keeps its on-screen size. Phaser maps pointers through the canvas' real CSS box, so pointer.x/y
// are backing-store pixels and pointer.worldX/worldY stay exact.
const VIEW_MAX_DPR = 2;   // past 2x the extra fill cost buys nothing visible
// What the canvas is fitted to right now: dpr it renders at, its size in CSS pixels, resolution of in-world text.
let VIEW = { dpr: 1, cssW: 1, cssH: 1, textRes: 1 };

function viewMeasure() {
  const el = document.getElementById("game");
  return { dpr: clamp(window.devicePixelRatio || 1, 0.5, VIEW_MAX_DPR),
    cssW: Math.max(1, (el && el.clientWidth) || window.innerWidth), cssH: Math.max(1, (el && el.clientHeight) || window.innerHeight) };
}
// Rounded up, so the canvas never falls a fraction of a pixel short of the window (and maps 1:1 onto device pixels).
const viewBacking = m => ({ w: Math.ceil(m.cssW * m.dpr), h: Math.ceil(m.cssH * m.dpr) });
// The `scale` block of the Phaser game config.
function viewScaleConfig() {
  VIEW = { ...VIEW, ...viewMeasure() };
  const b = viewBacking(VIEW);
  return { mode: Phaser.Scale.NONE, width: b.w, height: b.h, zoom: 1 / VIEW.dpr };
}
// World zoom: shorter side / 720 in CSS pixels, so every desktop size frames the same patch of sea as 1280x720 does
// (the old 1.1 cap left a 1080p fight a speck in a field of islands). Phones get a 0.72 floor: at 0.55 the sloop read
// ~44 CSS px tall in clips; 0.72 makes it ~58 and still shows ~540 x 1170 world px (past a Long 12's 400 px reach on
// the long axis). Only screens whose short side is under ~520 CSS px reach the floor. Then the render dpr,
// the player's ship class (bigger ships see further, js/art.js shipZoomK) and the player's own wheel zoom.
const VIEW_PHONE_ZOOM = 0.72;
const ZOOM_USER = { min: 0.75, max: 1.25, step: 0.05 };
const viewZoom = () => clamp(Math.min(VIEW.cssW, VIEW.cssH) / 720, VIEW_PHONE_ZOOM, 2.4) * VIEW.dpr
  * (typeof shipZoomK === "function" ? shipZoomK() : 1) * SETTINGS.zoom;
function nudgeZoom(dir) {
  const z = clamp(Math.round((SETTINGS.zoom + dir * ZOOM_USER.step) * 100) / 100, ZOOM_USER.min, ZOOM_USER.max);
  if (z !== SETTINGS.zoom) { saveSettings({ zoom: z }); refitView(); }
}
// Mouse wheel zooms the sea (not the ledger or menus, which sit above the canvas and scroll normally).
document.getElementById("game")?.addEventListener("wheel", e => { if (!paused) nudgeZoom(e.deltaY > 0 ? -1 : 1); }, { passive: true });
let viewRefit = null;   // the live scene's fit(), for when something other than a resize changes the zoom rule
function refitView() { if (viewRefit) viewRefit(); }
// Text is rasterised once into its own canvas, so draw it at the device pixels it will cover (in 0.25 steps).
const viewTextRes = zoom => clamp(Math.ceil(zoom * 4) / 4, 1, 3);
function crispText(txt, res) {
  if (txt.style.resolution === res) return;
  txt.frame.source.resolution = res;   // the Canvas renderer reads this copy, which Phaser only sets when the Text is made
  txt.setResolution(res);
}

// Call from a scene's create(): keeps its camera zoom, text sharpness and canvas size in step with the window.
function fitView(sc) {
  const cam = sc.cameras.main, isText = o => o instanceof Phaser.GameObjects.Text;
  const fit = () => {
    cam.setZoom(viewZoom());
    const res = viewTextRes(cam.zoom);
    if (res === VIEW.textRes) return;
    VIEW = { ...VIEW, textRes: res };
    for (const o of sc.children.list) if (isText(o)) crispText(o, res);
  };
  const onAdd = o => { if (isText(o)) crispText(o, VIEW.textRes); };   // badges, damage numbers, labels made later
  sc.scale.on("resize", fit); viewRefit = fit;
  sc.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdd);
  sc.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { sc.scale.off("resize", fit); sc.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdd); });
  tameShake(cam);
  watchView(sc.game);
  fit();
  for (const o of sc.children.list) if (isText(o)) crispText(o, VIEW.textRes);   // texts made before this call
}

// Every shake is sized in CSS pixels, the same on any screen: `intensity` is read as a share of a 1280-px-wide view
// (0.006 -> ~8 px), capped at SHAKE_MAX_CSS. Phaser moves the picture by intensity x camera size x zoom^2 device px;
// the old dpr^2 correction left out the world zoom, so a 0.55-zoom phone shook 1.1 px where a 1080p desktop shook 16.
const SHAKE_REF_CSS = 1280, SHAKE_MAX_CSS = 10;
function tameShake(cam) {
  const fx = cam.shakeEffect, start = fx.start;
  fx.start = function (duration, intensity = 0.05, ...rest) {
    const i = typeof intensity === "number" ? intensity : Math.max(intensity.x, intensity.y);
    const px = Math.min(SHAKE_MAX_CSS, i * SHAKE_REF_CSS) * VIEW.dpr, z2 = cam.zoom * cam.zoom;
    return start.call(this, duration, { x: px / (cam.width * z2), y: px / (cam.height * z2) }, ...rest);
  };
}

// Re-fit the backing store when the window or the canvas box changes size, or the pixel ratio changes
// (browser zoom, or dragging the window to another monitor).
const viewWatched = new WeakSet();
function watchView(game) {
  if (viewWatched.has(game)) return;
  viewWatched.add(game);
  const sm = game.scale;
  const apply = () => {
    const m = viewMeasure(), b = viewBacking(m);
    if (m.dpr === VIEW.dpr && m.cssW === VIEW.cssW && m.cssH === VIEW.cssH && b.w === sm.width && b.h === sm.height) return;
    VIEW = { ...VIEW, ...m };
    sm.resize(b.w, b.h);     // new backing store; emits "resize", which re-fits the camera
    sm.setZoom(1 / m.dpr);   // restyle the canvas to CSS size even when the zoom is 1 (resize() skips that case)
  };
  window.addEventListener("resize", apply);
  if (window.ResizeObserver) new ResizeObserver(apply).observe(document.getElementById("game"));
  // devicePixelRatio has no dependable change event (a resolution media query doesn't always fire), so compare it each
  // frame: one property read
  let seenDpr = window.devicePixelRatio;
  game.events.on("prestep", () => { if (window.devicePixelRatio !== seenDpr) { seenDpr = window.devicePixelRatio; apply(); } });
  apply();
}
