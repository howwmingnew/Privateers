"use strict";
// ---------- Sea guards: a safe first voyage, and level plates that keep off the HUD ----------
// First voyage: tameFirstVoyage (js/notify-order.js) only re-rolls ships made in the Shallows. A strong ship from an outer
// ring could still chase its prey (the captain, or a pirate) in toward the harbor mouth and sink a new captain in the first
// minute. So until the first voyage is done, a ship rated SAFE_OVER or more above the captain's Ship Lv that is in the
// Shallows, or near the captain while the captain is in them, breaks off and sails back out to its own ring. It just
// turns away (no "gave up" float, no jump), and one the captain has shot at may fight on.
const SAFE_OVER = 2, SAFE_NEAR = 700, SAFE_BACK_S = 6, SAFE_TICK = 0.25;
let safeT = 0;
const inShallows = s => seaOfRing(ringAt(dist(s, PORT))).id === "shallows";
function turnBack(e, now) {
  e.target = null; e.backOffT = now + SAFE_BACK_S;   // js/ships.js think: no new target meanwhile
  const { r0, r1 } = ringBand(Math.max(e.ring || 1, seaOfRing(1).L1 + 1));
  const r = Math.min(SPAWN_R_MAX, Math.max(rand(r0, r1), dist(player, PORT) + SAFE_NEAR));   // out of its ring's reach of the captain
  const a = Math.atan2(e.y - PORT.y, e.x - PORT.x) + rand(-0.25, 0.25);
  e.wander = { x: clamp(PORT.x + Math.cos(a) * r, 200, W - 200), y: clamp(PORT.y + Math.sin(a) * r, 200, H - 200) };
  e.thinkT = SAFE_BACK_S;
}
function guardFirstVoyage(dt) {
  if ((safeT -= dt) > 0) return;
  safeT = SAFE_TICK;
  if (titleOpen || docked || !player.alive || typeof firstVoyage !== "function" || !firstVoyage()) return;
  const now = S.time.now / 1000, cap = shipRating() + SAFE_OVER, meIn = inShallows(player);
  for (const e of enemies) {
    if (!e.alive || e.fixed || e.boss || e === tut.target || (e.threatL ?? e.L) < cap) continue;
    if (e.attacker === player && e.angry > 0) { e.backOffT = 0; continue; }   // shot at: it may answer
    if ((e.backOffT || 0) > now) continue;
    if (inShallows(e) || (meIn && dist(e, player) < SAFE_NEAR)) turnBack(e, now);
  }
}
onHook("frame", dt => { if (!paused) guardFirstVoyage(dt); });

// ---------- level plates under the HUD ----------
// The top corners hold the hull / cargo bars and the purse, chart and Ship Lv label. A plate whose screen box touches
// one fades out while it is there. The HUD boxes are read a few times a second (a layout read every frame costs).
const PLATE_HUD_PAD = 6, PLATE_HUD_POLL = 0.5;
let hudBoxes = [], hudBoxT = 0;
function readHudBoxes() {
  hudBoxes = [...document.querySelectorAll("#hud .side, #hud .bars")]
    .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
    .map(r => ({ l: r.left - PLATE_HUD_PAD, t: r.top - PLATE_HUD_PAD, r: r.right + PLATE_HUD_PAD, b: r.bottom + PLATE_HUD_PAD }));
}
function plateUnderHud(b, v, k) {
  const w = b.displayWidth * k, h = b.displayHeight * k, x = (b.x - v.x) * k - w * b.originX, y = (b.y - v.y) * k - h * b.originY;
  return hudBoxes.some(r => x < r.r && x + w > r.l && y < r.b && y + h > r.t);
}
onHook("frame", dt => {
  if ((hudBoxT -= dt) <= 0) { hudBoxT = PLATE_HUD_POLL; readHudBoxes(); }
  const live = !titleOpen && !docked, v = S.cameras.main.worldView, k = VIEW.cssW / v.width;
  for (const e of enemies) {
    const b = e.badge;
    if (!b) continue;
    const want = live && b.visible && plateUnderHud(b, v, k) ? 0 : 1;
    if (b.alpha !== want) b.setAlpha(Math.abs(want - b.alpha) < 0.05 ? want : b.alpha + (want - b.alpha) * Math.min(1, dt * 12));
  }
});
