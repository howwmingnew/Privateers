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
  const ix = isl.x - s.x, iy = isl.y - s.y;
  const reach = isl.r * 0.9 + (s.hw ?? 13) + 5 + (s.hl ?? 28) + RIM_PAD;   // the same hull capsule js/ships.js move() keeps off the rock
  if (ix > reach || ix < -reach || iy > reach || iy < -reach || ix * ix + iy * iy > reach * reach) return desired;   // out of reach (box first: most rocks are far)
  if (Math.cos(s.rot) * ix + Math.sin(s.rot) * iy <= 0) return desired;
  const a = Math.atan2(iy, ix), left = a - RIM_TURN, right = a + RIM_TURN;
  if (desired == null) return Math.cos(s.rot) * iy - Math.sin(s.rot) * ix > 0 ? left : right;
  return Math.abs(angDiff(desired, left)) <= Math.abs(angDiff(desired, right)) ? left : right;
}

// ---------- Rocks near a point ----------
// Every ship (avoidIslands, slideOff, move), ball and fleet slot used to test all ~85 islands every frame, though a point
// at sea is near two at most (js/world-seas.js keeps them r1 + r2 + 160 apart). The sea is cut into ISLE_CELL squares,
// each listing the islands whose box of half-side ISLE_REACH(r) touches it, in `islands` order, so the first rock a caller
// finds is the same one as before. ISLE_REACH beats every caller's hit radius (the man-o'-war, hw + hl = 75, is the
// biggest hull): avoidIslands r * 1.05 + 69.5, slideOff r * 0.9 + 104, move r * 0.9 + 80, a ball r * 0.9, a slot r * 1.05 + 50.
// Rebuilt when `islands` is reassigned (a new sea, the outpost opening, a test) or changes length. Never edit the list it returns.
const ISLE_CELL = 512, ISLE_REACH = r => r * 1.3 + 160, NO_ISLES = [];
let isleGrid = [], isleOf = null, isleLen = -1, isleN = 1;
function buildIsleGrid() {
  const n = Math.max(1, Math.ceil(Math.max(W, H) / ISLE_CELL)), cell = v => clamp(Math.floor(v / ISLE_CELL), 0, n - 1), grid = [];
  for (const isl of islands) {
    const R = ISLE_REACH(isl.r), y1 = cell(isl.y + R), x1 = cell(isl.x + R);
    for (let gy = cell(isl.y - R); gy <= y1; gy++) for (let gx = cell(isl.x - R); gx <= x1; gx++) (grid[gy * n + gx] ||= []).push(isl);
  }
  isleGrid = grid; isleOf = islands; isleLen = islands.length; isleN = n;
}
// The islands that may be within ISLE_REACH of (x, y); a point off the map counts as the nearest edge cell.
function islandsNear(x, y) {
  if (isleOf !== islands || isleLen !== islands.length) buildIsleGrid();
  const n = isleN, gx = clamp(Math.floor(x / ISLE_CELL), 0, n - 1), gy = clamp(Math.floor(y / ISLE_CELL), 0, n - 1);
  return isleGrid[gy * n + gx] || NO_ISLES;
}
// The harbor island as a rock (js/ships.js move, js/fleet.js safeSlot): one object, not a fresh one per ship per frame.
// crashSafe (js/collision.js) waves `harbor` through before any crash bookkeeping, so its identity never mattered.
const HARBOR_ROCK = { x: PORT.x, y: PORT.y, r: PORT_ISLAND_R / 0.9, harbor: true };
