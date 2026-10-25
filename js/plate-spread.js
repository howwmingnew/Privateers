"use strict";
// ---------- Plate spread (#102): level plates of ships close together do not sit on each other ----------
// Each frame vfxShip (js/vfx.js) puts an enemy's level plate just over its hull, so two ships side by side stack their
// plates into one smudge. After that, plates that overlap on screen are nudged up, one above the other, until they
// clear. Only the plate moves: the hull, its health bar and the targeting all stay where they were.
const PLATE_GAP = 2;
// Pure: boxes [{ x, y, w, h }] (centres, world units) -> the y each should be drawn at. The lowest plate stays put; each one
// above it that overlaps a settled plate is lifted until it clears.
function spreadPlates(boxes) {
  const order = boxes.map((b, i) => i).sort((a, b) => boxes[b].y - boxes[a].y), done = [], out = boxes.map(b => b.y);
  for (const i of order) {
    let y = boxes[i].y;
    for (let pass = 0; pass < 6; pass++) {   // a lift can run into the next plate up: a few passes settle a cluster
      const hit = done.find(d => Math.abs(d.x - boxes[i].x) < (d.w + boxes[i].w) / 2 && Math.abs(d.y - y) < (d.h + boxes[i].h) / 2 + PLATE_GAP * 0.5);
      if (!hit) break;
      y = hit.y - (hit.h + boxes[i].h) / 2 - PLATE_GAP;
    }
    out[i] = y;
    done.push({ x: boxes[i].x, y, w: boxes[i].w, h: boxes[i].h });
  }
  return out;
}
onHook("frame", () => {
  if (titleOpen || docked || !S) return;
  const v = S.cameras.main.worldView, shown = [];
  for (const e of enemies) {
    const b = e.badge;
    if (!e.alive || !b || !b.visible || b.x < v.x - 80 || b.x > v.right + 80 || b.y < v.y - 80 || b.y > v.bottom + 80) continue;
    shown.push({ b, x: b.x, y: b.y, w: b.displayWidth, h: b.displayHeight });
  }
  if (shown.length < 2) return;
  const ys = spreadPlates(shown);
  shown.forEach((p, i) => { if (ys[i] !== p.y) p.b.setY(ys[i]); });
});
