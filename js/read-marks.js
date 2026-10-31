"use strict";
// ---------- Readability marks (#119): who hit you, which way your bow points, a rim behind enemy plates ----------
// One graphics layer drawn each frame (under the level plates, over the hulls): a turning ring on a shooter that just hit you
// (its "!" marker is js/notices.js; an off-screen one gets a flashing edge box, js/edge-marks.js), a chevron past your own bow
// so the heading reads at a glance (the hull alone looks like it points up), and a dark + light rim behind every enemy plate so
// it holds against night water and rain streaks. The effects quality (fxLevel, js/vfx.js) low: no pulsing or turning, same marks.
// Pure helpers first (tests/unit-readmarks.mjs); the aim colour is used by js/main.js drawOverlays.
const AIM_RED = 0xff4a2e;
// The aim line colour: faint while reloading, red when it would hit, yellow when it would miss. Every ship in the line is the
// same red, Navy included (#141): the ⚓ on its plate tells it apart, and not hitting it is the player's call.
const aimColor = (ready, tg) => !ready ? 0xf6f1e3 : tg ? AIM_RED : 0xffd76a;
// The three corners of the heading chevron: tip `gap` px past the bow, wings `size` back and `size * 0.8` to each side.
function bowChevron(x, y, rot, len, gap, size) {
  const c = Math.cos(rot), s = Math.sin(rot), bx = x + c * (len / 2 + gap), by = y + s * (len / 2 + gap), w = size * 0.8;
  return [[bx + c * size * 0.4, by + s * size * 0.4], [bx - c * size * 0.6 - s * w, by - s * size * 0.6 + c * w], [bx - c * size * 0.6 + s * w, by - s * size * 0.6 - c * w]];
}
// The chevron shows only in a fight (#142): the music's combat measure (threatNow, js/main.js threatLevel) or a recent hit on
// you, held BOW_HOLD s after the fight ends so it does not flicker, faded in and out rather than popping.
// BOW_HOLD matches the combat music's HOLD (js/audio.js), so the arrow and the drums leave the fight together.
const BOW_HOLD = 2.5, BOW_IN = 0.25, BOW_OUT = 0.6, BOW_OFF = { a: 0, hold: 0 };   // s: kept after the fight; fade-in and fade-out times
// One step of the chevron's fade: { a: alpha 0..1, hold: s left } after dt s with the fight on or off.
function bowFade(st, fight, dt) {
  const hold = fight ? BOW_HOLD : Math.max(0, st.hold - dt);
  return { a: hold > 0 ? Math.min(1, st.a + dt / BOW_IN) : Math.max(0, st.a - dt / BOW_OUT), hold };
}
// How strongly a plate's rim is drawn: night and rain (and storm) need more than a clear day.
const rimAlpha = (dark, rain) => Math.min(1, 0.62 + 0.3 * dark + (rain ? 0.2 : 0));
let rmG = null, bowSt = BOW_OFF;
function readMarksG() { return rmG && rmG.active ? rmG : (rmG = S.add.graphics().setDepth(8.95)); }
function drawBow(g, lk, t, lively, k) {
  const a = player.art || SHIP_ART.sloop, gap = (7 + (lively ? 2.5 * Math.sin(t * 0.006) : 0)) * lk, sz = 11 * lk;
  const p = bowChevron(player.x, player.y, player.rot, a.len, gap, sz);
  g.fillStyle(0x08222d, 0.9 * k); g.lineStyle(3 * lk, 0x08222d, 0.9 * k); g.beginPath(); g.moveTo(...p[0]); g.lineTo(...p[1]); g.lineTo(...p[2]); g.closePath(); g.fillPath(); g.strokePath();
  g.fillStyle(0xfff2b0, 0.95 * k); g.beginPath(); g.moveTo(...p[0]); g.lineTo(...p[1]); g.lineTo(...p[2]); g.closePath(); g.fillPath();
}
function drawShooter(g, e, left, lk, t, lively) {
  const r = ((e.hl ?? 28) + (e.hw ?? 13)) * 0.8 + 14 * lk, spin = lively ? t * 0.004 : 0, a = Math.min(1, left / 0.6);
  g.lineStyle(3 * lk, 0xff7a3a, 0.9 * a);
  for (let q = 0; q < 3; q++) strokeArc(g, e.x, e.y, r, spin + q * TAU / 3, spin + q * TAU / 3 + 1.2);
}
function drawRim(g, b, lk, k) {
  const w = b.displayWidth + 5 * lk, h = b.displayHeight + 5 * lk, x = b.x - w / 2, y = b.y - h / 2, al = b.alpha * k;
  g.lineStyle(1.5 * lk, 0xf6f1e3, 0.55 * al); g.strokeRect(x - lk, y - lk, w + 2 * lk, h + 2 * lk);   // the light outer line: reads on dark water
  g.fillStyle(0x08141b, al); g.fillRect(x, y, w, h);   // the dark backplate: reads on foam and rain
}
onHook("frame", dt => {
  if (!S || !player || titleOpen || docked || (typeof photoOn === "function" && photoOn())) { bowSt = BOW_OFF; if (rmG && rmG.active) rmG.clear(); return; }
  const hm = typeof hitMarks !== "undefined" ? hitMarks : [], g = readMarksG(), lk = labelScale(), t = S.time.now, lively = typeof fxLevel === "function" && fxLevel() >= 1, v = S.cameras.main.worldView;
  g.clear();
  const dark = typeof wxDark === "function" ? wxDark() : 0, rain = typeof wx !== "undefined" && wx.on && typeof wxFx === "function" && wxFx() && wx.w.kind !== "clear", k = rimAlpha(dark, rain);
  for (const e of enemies) {
    const b = e.badge;
    if (!e.alive || !b || !b.visible || b.alpha < 0.05 || b.x < v.x - 80 || b.x > v.right + 80 || b.y < v.y - 80 || b.y > v.bottom + 80) continue;
    drawRim(g, b, lk, k);
  }
  for (const h of hm) if (h.src.alive && onScreen(h.src.x, h.src.y, 40)) drawShooter(g, h.src, h.t, lk, t, lively);
  if (!paused) bowSt = bowFade(bowSt, player.alive && (threatNow > 0 || hm.length > 0), dt);
  if (player.alive && bowSt.a > 0.01) drawBow(g, lk, t, lively, bowSt.a);
});
