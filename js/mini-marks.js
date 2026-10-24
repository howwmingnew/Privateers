"use strict";
// ---------- Chart marks (the HUD chart, js/hud.js) ----------
// No frames, rings or dashed lines: every mark is one filled shape on a thin dark edge, so it reads on any sea tint, and each
// kind of thing has its own silhouette, so colour is never the only cue.
//   ships    the threat shape (▼ ● ▲ ▲▲, threatMark in js/art.js: can you beat it?) filled by who they are: pirates in their
//            threat colour, the Navy solid blue with a bar across, merchants gold with a dot, fireships flickering orange
//            with an upright tick. The small detail inside the shape tells them apart without colour. Your escorts (js/escorts.js) are
//            a mint disc with a cream rim and an arrowhead: never a threat shape, because they are not something to beat.
//   places   the harbor's anchor disc, the outpost's teal cross, a fort's stone keep, an island's land silhouette
//   plunder  a small chest outline (a fort's treasure is a bigger one), a red X for a wreck
// Where marks pile up, the more important one is on top: the player, then the bounty and ships that are close and stronger
// than you, then harbor and outpost, then other ships, then chests and wrecks; ordinary ships in one spot merge into one mark.
// Sizes are in chart units: u is one pixel of the original 224-px chart.
const MINI_INK = "rgba(4,18,24,.9)", MINI_CREAM = "#f6f1e3", MINI_GOLD = "#f0c766", MINI_TEAL = "#43d1b0", MINI_ALLY = "#4cf0a8";
const MARK_FILL = { trade: MINI_GOLD, navy: "#5aa0f0" };   // pirates keep their threat colour, fireships flicker orange

// A ship under way leaves a short wake behind it, so the chart shows where it is heading.
function miniWake(c, x, y, rot, u) {
  c.strokeStyle = "rgba(246,241,227,.55)"; c.lineWidth = 1.2 * u;
  c.beginPath(); c.moveTo(x - Math.cos(rot) * 5 * u, y - Math.sin(rot) * 5 * u); c.lineTo(x - Math.cos(rot) * 10 * u, y - Math.sin(rot) * 10 * u); c.stroke();
}
const shipKind = e => e.ally ? "ally" : e.merchant || e.faction === "merchant" ? "trade" : e.faction === "navy" ? "navy" : e.arch === "fireship" ? "fire" : "pirate";
// Where the threat shape's solid parts are (one, or two for ▲▲) and their half-size, so a detail sits inside each.
function threatCenters(tier, x, y, r) {
  if (tier.d >= 2) return [[x - r * 0.75, y, r * 0.85], [x + r * 0.75, y, r * 0.85]];
  return [[x, y, r * (tier.d <= -1 ? 0.9 : tier.d === 0 ? 0.75 : 1)]];
}
// An escort: a mint disc, a cream rim, and an arrowhead pointing the way it sails.
function miniAlly(c, x, y, rot, u, speed = 0) {
  if (speed > 5) miniWake(c, x, y, rot, u);
  c.beginPath(); c.arc(x, y, 4.3 * u, 0, TAU); c.fillStyle = MINI_ALLY; c.fill();
  c.lineWidth = 1.6 * u; c.strokeStyle = MINI_CREAM; c.stroke();
  c.save(); c.translate(x, y); c.rotate(rot || 0); c.fillStyle = MINI_INK;
  c.beginPath(); c.moveTo(2.6 * u, 0); c.lineTo(-1.6 * u, -1.9 * u); c.lineTo(-0.6 * u, 0); c.lineTo(-1.6 * u, 1.9 * u); c.closePath(); c.fill(); c.restore();
}
function miniShip(c, e, x, y, u) {
  if (e.ally) return miniAlly(c, x, y, e.rot, u, e.speed);
  const tier = threatTier(e.threatL ?? e.L), kind = shipKind(e), r = 4 * u;
  if (e.speed > 5) miniWake(c, x, y, e.rot, u);
  const fill = kind === "fire" ? `rgba(255,140,40,${0.68 + 0.32 * Math.sin(performance.now() / 90 + x)})` : MARK_FILL[kind] || tier.color;
  threatMark(c, x, y, { ...tier, color: fill }, r);
  for (const [cx, cy, s] of threatCenters(tier, x, y, r)) {   // the detail inside the shape
    if (kind === "navy") { c.fillStyle = MINI_CREAM; c.fillRect(cx - s * 0.7, cy - 0.6 * u, s * 1.4, 1.2 * u); }
    else if (kind === "trade") { c.fillStyle = MINI_INK; c.beginPath(); c.arc(cx, cy, 1.15 * u, 0, TAU); c.fill(); }
    else if (kind === "fire") { c.fillStyle = MINI_INK; c.fillRect(cx - 0.6 * u, cy - s * 0.55, 1.2 * u, s * 1.1); }
  }
}
// Ships in one cell of the chart (cell px wide) merge into the one that matters most (the scariest); n counts them all.
function clusterMarks(items, cell) {
  const best = new Map();
  for (const it of items) {
    const key = Math.floor(it.x / cell) + "," + Math.floor(it.y / cell), cur = best.get(key);
    if (!cur) best.set(key, { ...it, n: 1 });
    else best.set(key, { ...(it.rank > cur.rank ? it : cur), n: cur.n + 1 });
  }
  return [...best.values()];
}
const isNearThreat = (e, tier) => tier.d >= 1 && dist(e, player) < MINI_NEAR_R;   // stronger than you and close: never buried
// Every ship, in priority order: ordinary ones first (merged where they pile up), then the near threats on top.
// `between` runs after the ordinary ships, so places (harbor, outpost) land above them and below the threats.
function drawMiniShips(c, k, u, between) {
  const ships = enemies.filter(e => e.alive && !e.boss && !e.fixed && !e.ally).map(e => ({ e, tier: threatTier(e.threatL ?? e.L) }));
  const rows = ships.filter(s => !isNearThreat(s.e, s.tier)).map(s => ({ ...s, x: s.e.x * k, y: s.e.y * k, rank: s.tier.d }));
  for (const m of clusterMarks(rows, MINI_MERGE * u)) {
    miniShip(c, m.e, m.x, m.y, u);
    if (m.n > 1) {   // a small count beside the mark
      c.font = `700 ${Math.round(6 * u)}px ${UI_FONT}`; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.lineJoin = "round";
      c.lineWidth = 2 * u; c.strokeStyle = MINI_INK; c.fillStyle = MINI_CREAM;
      c.strokeText(m.n, m.x + 4.5 * u, m.y - 3.5 * u); c.fillText(m.n, m.x + 4.5 * u, m.y - 3.5 * u);
    }
  }
  between();
  for (const s of ships.filter(s => isNearThreat(s.e, s.tier)).sort((a, b) => dist(b.e, player) - dist(a.e, player))) miniShip(c, s.e, s.e.x * k, s.e.y * k, u);
}
// A shore battery: a crenellated stone keep with its threat shape on the wall. Shown from the start, so the
// player can see which islands are armed before sailing into range.
function miniFort(c, x, y, L, u) {
  const w = 6.5 * u, h = 5 * u, m = 2.6 * u, top = y - h + m;
  c.beginPath(); c.moveTo(x - w, y + h); c.lineTo(x - w, y - h);
  for (const [a, b] of [[-w + m, -w + 2 * m - 0.4 * u], [w - 2 * m + 0.4 * u, w - m]]) {   // two gaps between three merlons
    c.lineTo(x + a, y - h); c.lineTo(x + a, top); c.lineTo(x + b, top); c.lineTo(x + b, y - h);
  }
  c.lineTo(x + w, y - h); c.lineTo(x + w, y + h); c.closePath();
  c.fillStyle = "#8f8a7e"; c.fill(); c.lineWidth = 1.5 * u; c.strokeStyle = MINI_INK; c.stroke();
  threatMark(c, x, y + 1.2 * u, threatTier(L), 2.8 * u);
}
// Plunder: a small chest outline, a domed lid over a box with its lock (a fort's treasure is a bigger one), so it never
// reads as a ship. The player's own lost cargo is a red X in a pulsing ring (miniWreck).
function miniChest(c, x, y, u, big) {
  const s = (big ? 1.4 : 1) * u, w = 3.6 * s, h = 2.6 * s, lid = y - 0.1 * h;
  c.lineJoin = "round";
  c.beginPath(); c.moveTo(x - w, y + h); c.lineTo(x - w, lid); c.quadraticCurveTo(x, y - 3.4 * h, x + w, lid); c.lineTo(x + w, y + h); c.closePath();
  c.fillStyle = "rgba(4,18,24,.6)"; c.fill();
  c.strokeStyle = MINI_GOLD; c.lineWidth = 1.3 * u; c.stroke();
  c.beginPath(); c.moveTo(x - w, lid); c.lineTo(x + w, lid); c.stroke();   // where the lid meets the box
  c.fillStyle = MINI_GOLD; c.beginPath(); c.arc(x, lid, 0.8 * s, 0, TAU); c.fill();   // the lock
}
function miniWreck(c, x, y, u) {
  const r = 4.5 * u, p = 1 + 0.2 * Math.sin(performance.now() / 300);
  c.strokeStyle = "rgba(255,90,60,.7)"; c.lineWidth = 1.3 * u; c.beginPath(); c.arc(x, y, 8.5 * u * p, 0, TAU); c.stroke();
  const cross = () => { c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); };
  c.lineCap = "round";
  c.strokeStyle = MINI_INK; c.lineWidth = 4.5 * u; cross();
  c.strokeStyle = "#ff5a3c"; c.lineWidth = 2.5 * u; cross();
  c.lineCap = "butt";
}
// The home harbor: a cream anchor on a dark disc (drawn each frame, above ordinary ships).
function miniHarbor(c, x, y, u) {
  c.fillStyle = MINI_INK; c.beginPath(); c.arc(x, y, 8 * u, 0, TAU); c.fill();
  c.strokeStyle = MINI_GOLD; c.lineWidth = 1.2 * u; c.stroke();
  c.strokeStyle = MINI_CREAM; c.lineWidth = 1.5 * u; c.lineCap = "round";
  c.beginPath(); c.arc(x, y - 4.2 * u, 1.3 * u, 0, TAU); c.stroke();   // the ring
  c.beginPath(); c.moveTo(x, y - 2.9 * u); c.lineTo(x, y + 4.6 * u);   // the shank
  c.moveTo(x - 2.8 * u, y - 1.4 * u); c.lineTo(x + 2.8 * u, y - 1.4 * u); c.stroke();   // the stock
  c.beginPath(); c.arc(x, y + 0.6 * u, 4 * u, Math.PI * 0.15, Math.PI * 0.85); c.stroke();   // the arms
  c.lineCap = "butt";
}
// The outpost: a teal cross, no frame (a harbor-like place, so it is not a ship's triangle).
function miniOutpost(c, x, y, u) {
  const a = 6 * u, b = 2 * u;   // arm half-length and half-thickness
  c.beginPath();
  [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]].forEach(([dx, dy]) => c.lineTo(x + dx, y + dy));
  c.closePath(); c.fillStyle = MINI_TEAL; c.fill();
  c.lineJoin = "round"; c.lineWidth = 1.3 * u; c.strokeStyle = MINI_INK; c.stroke();
}
// A supply station: a leaf-green disc with two cream bands (a provisions cask); a trade port: a gold diamond with a dark coin.
// Neither is the harbor's anchor disc, the outpost's cross, a ship's triangle nor an island's grey chip.
const MINI_LEAF = "#6fcf7a";
function miniSupply(c, x, y, u) {
  c.beginPath(); c.arc(x, y, 6.6 * u, 0, TAU); c.fillStyle = MINI_LEAF; c.fill();
  c.lineWidth = 1.3 * u; c.strokeStyle = MINI_INK; c.stroke();
  c.strokeStyle = MINI_CREAM; c.lineWidth = 1.5 * u; c.lineCap = "round";
  c.beginPath(); c.moveTo(x - 4.2 * u, y - 2.2 * u); c.lineTo(x + 4.2 * u, y - 2.2 * u); c.moveTo(x - 4.2 * u, y + 2.2 * u); c.lineTo(x + 4.2 * u, y + 2.2 * u); c.stroke();
  c.lineCap = "butt";
}
function miniTrade(c, x, y, u) {
  const a = 8 * u;
  c.beginPath(); c.moveTo(x, y - a); c.lineTo(x + a, y); c.lineTo(x, y + a); c.lineTo(x - a, y); c.closePath();
  c.fillStyle = MINI_GOLD; c.fill(); c.lineJoin = "round"; c.lineWidth = 1.3 * u; c.strokeStyle = MINI_INK; c.stroke();
  c.beginPath(); c.arc(x, y, 2.4 * u, 0, TAU); c.fillStyle = MINI_INK; c.fill();
}
const miniStation = (c, kind, x, y, u) => (kind === "trade" ? miniTrade : miniSupply)(c, x, y, u);
// Land: the world island's own outline (js/scenery.js islandShape) as a flat sand-grey silhouette; a speck of land becomes a
// 4-5 sided chip (never a triangle, which is a ship's shape). smallIslandPoly is deterministic in the island's seed, so a chart rebuild draws the same chip.
const ISLAND_FILL = "rgba(184,178,156,.92)";
function smallIslandPoly(seed, cx, cy, R) {
  const h = i => { const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return s - Math.floor(s); };
  const n = 4 + Math.floor(h(0) * 2), a0 = h(1) * TAU;
  return Array.from({ length: n }, (_, i) => { const a = a0 + i / n * TAU, r = R * (0.85 + 0.3 * h(i + 2)); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
}
function miniIsland(c, isl, k, u) {
  const R = isl.r * k, x = isl.x * k, y = isl.y * k;
  c.fillStyle = ISLAND_FILL;
  if (R < 3 * u) {
    const poly = smallIslandPoly(isl.seed, x, y, Math.max(R, 2.2 * u));
    c.beginPath(); poly.forEach(([px, py]) => c.lineTo(px, py)); c.closePath(); c.fill();
  } else { shapePath(c, islandShape(isl), x, y, isl.r, k); c.fill(); }
}
// The player: a white hull (sharp bow, square stern) with a heading line ahead, on a soft halo so it is found at a glance.
function miniPlayer(c, x, y, rot, u) {
  c.save();
  c.fillStyle = "rgba(255,255,255,.16)"; c.beginPath(); c.arc(x, y, 11 * u, 0, TAU); c.fill();
  c.translate(x, y); c.rotate(rot); c.scale(u, u);
  c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(10, 0); c.lineTo(17, 0); c.stroke();
  c.beginPath(); c.moveTo(9, 0); c.quadraticCurveTo(3, -4.8, -6, -4); c.lineTo(-6, 4); c.quadraticCurveTo(3, 4.8, 9, 0); c.closePath();
  c.fillStyle = "#fff"; c.fill(); c.lineWidth = 1.6; c.strokeStyle = MINI_INK; c.stroke();
  if (typeof flagMiniMark === "function") flagMiniMark(c);   // the captain's pennant (js/flags.js)
  else { c.fillStyle = "#c08f2e"; c.beginPath(); c.arc(0.5, 0, 1.6, 0, TAU); c.fill(); }   // the mast
  c.restore();
}
