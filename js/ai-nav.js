"use strict";
// ---------- AI navigation around solid places (pure helpers for js/ships.js think / avoidIslands) ----------
// The Hulk Outpost is a solid island inside a truce circle (js/campaign.js). An idle ship's wander point could land on that
// hulk: the ship drove at it, the island shoved it back every frame (speed x0.9 per push) and it crawled along the rim until
// the next roll, 5-10 s later. Two fixes: a wander point is never rolled inside the truce circle, and any ship that is about to
// touch a rock turns along its rim instead of pushing into it.
const TRUCE_PAD = 40;      // px past the truce circle a re-rolled wander point is placed
const RIM_PAD = 24;        // px of clearance, beyond the hull, at which a ship starts to slide along a rock
const RIM_TURN = 1.8;      // rad from the line to the rock's centre (> a right angle, so the ship also draws off it)

// A wander point outside the circle c (centre + radius r): the point itself when it is clear, else pushed straight out of it.
function clearOfCircle(pt, c, r, pad = TRUCE_PAD) {
  if (!c) return pt;
  const dx = pt.x - c.x, dy = pt.y - c.y, d = Math.hypot(dx, dy);
  if (d >= r) return pt;
  const a = d > 0.01 ? Math.atan2(dy, dx) : 0;
  return { x: c.x + Math.cos(a) * (r + pad), y: c.y + Math.sin(a) * (r + pad) };
}
// The heading a ship takes when its course is about to run into the rock isl: a turn along the rim, on the side nearer its goal.
// Returns `desired` untouched when the rock is out of reach or the ship is not heading at it.
function slideOff(s, isl, desired) {
  const ix = isl.x - s.x, iy = isl.y - s.y, d = Math.hypot(ix, iy);
  const reach = isl.r * 0.9 + (s.hw ?? 13) + 5 + (s.hl ?? 28) + RIM_PAD;   // the same hull capsule js/ships.js move() keeps off the rock
  if (d > reach || Math.cos(s.rot) * ix + Math.sin(s.rot) * iy <= 0) return desired;
  const a = Math.atan2(iy, ix), left = a - RIM_TURN, right = a + RIM_TURN;
  if (desired == null) return Math.cos(s.rot) * iy - Math.sin(s.rot) * ix > 0 ? left : right;
  return Math.abs(angDiff(desired, left)) <= Math.abs(angDiff(desired, right)) ? left : right;
}
