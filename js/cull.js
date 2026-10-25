"use strict";
// ---------- Off-screen culling ----------
// Phaser 3.80 has no bounds test: every object on the display list costs a matrix, a quad and often a texture bind each
// frame, on screen or not, and most of the sea is off screen: 85 islands (two images and two textures each), the harbor,
// the stations, ~30 AI hulls with their badges, the crates. So once a frame, right after the main camera has placed
// itself (its preRender: this frame's follow, zoom, punch, and photo mode's pan and zoom, paused or not), whatever lies
// wholly outside the view gets cameraFilter = the camera's id, the flag getVisibleChildren checks next. Not setVisible:
// .visible stays the game's own (ports.js hides the harbor on the daily sea, photo mode hides the badges, tests read it).
// One pass over the game's own lists, not a willRender per object: the hulls, crates and stations are made in modules
// that need not know about any of this, and a rebuilt list (a new map's islands, the outpost) needs no re-registering.
// The player is never culled.
const CULL_PAD = 64;   // world px past the view: a camera shake (10 CSS px at most, js/view.js tameShake) and rounding
const cullLoose = new Set();   // short-lived objects with no list of their own (js/juice.js crate glints); dropped once destroyed
function cullTrack(...objs) { for (const o of objs) cullLoose.add(o); }
// Out when even the corner farthest from its origin can't reach the padded view, so rotation and origin don't matter.
function cullOne(o, v, id) {
  if (!o || !o.scene) return;   // destroyed
  const w = o.displayWidth * Math.max(o.originX, 1 - o.originX), h = o.displayHeight * Math.max(o.originY, 1 - o.originY);
  const r = Math.sqrt(w * w + h * h) + CULL_PAD;
  o.cameraFilter = o.x + r < v.x || o.x - r > v.right || o.y + r < v.y || o.y - r > v.bottom ? id : 0;
}
function cullFrame(cam) {
  const v = cam.worldView, id = cam.id, each = list => { for (const o of list) cullOne(o, v, id); };
  each(islandImgs); each(harborObjs); each(harborBeams); each(stationObjs); each(outpostObjs); cullOne(harborLabel, v, id);
  for (const e of enemies) if (e.alive && !e.isPlayer) { cullOne(e.spr, v, id); cullOne(e.badge, v, id); }   // a sinking hull is left drawn (vfxSink)
  for (const c of crates) { cullOne(c.spr, v, id); cullOne(c.label, v, id); }
  for (const o of cullLoose) if (o.scene) cullOne(o, v, id); else cullLoose.delete(o);
}
// CameraManager.render calls camera.preRender() and then asks each object willRender(camera): the view is final here.
const cullWatched = new WeakSet();
function cullWatch(cam) {
  if (cullWatched.has(cam)) return;
  cullWatched.add(cam);
  const pre = cam.preRender;
  cam.preRender = function (...a) {
    const out = pre.apply(this, a);
    try { cullFrame(this); }
    catch (e) {   // a broken cull must not cost the picture: stop culling and draw everything
      console.error("cull failed, culling off:", e);
      cam.preRender = pre;
      for (const o of this.scene.children.list) o.cameraFilter = 0;
    }
    return out;
  };
}
onHook("ready", () => cullWatch(S.cameras.main));
