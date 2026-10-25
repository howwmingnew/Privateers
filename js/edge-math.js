"use strict";
// ---------- Edge markers: the arithmetic (pure; the markers themselves are js/edge-marks.js) ----------
// A target beyond the screen edge but within EDGE_RANGE screen widths gets a small box on the screen edge, on the line from
// the middle of the screen toward it, showing its icon and "about N m". These functions work on plain numbers.

Object.assign(STR.en, { edgeDist: "~{n} m", edgeRisky: "risky" });
Object.assign(STR.zh, { edgeDist: "約 {n} 公尺", edgeRisky: "危險" });

// World px -> metres, rounded to the nearest EDGE_ROUND_M (never shown as 0).
function edgeMeters(px) { return Math.max(EDGE_ROUND_M, Math.round(px * EDGE_M_PER_PX / EDGE_ROUND_M) * EDGE_ROUND_M); }
const edgeLabel = (px, risky = false) => t("edgeDist", { n: edgeMeters(px) }) + (risky ? " · " + t("edgeRisky") : "");
// A bounty's box warns when the way there is above the captain: the boss itself 2+ levels over the rating, or the sea it
// lies in (its weakest ship) 1+ over. The route runs through that water, and nothing else tells a new captain so.
const EDGE_RISK_BOSS = 2, EDGE_RISK_SEA = 1;
const edgeRisky = (bossLv, seaLv, rating) => bossLv - rating >= EDGE_RISK_BOSS || seaLv - rating >= EDGE_RISK_SEA;
// Where the ray from the middle of rect {l,t,r,b} toward (dx, dy) leaves it, and through which side.
function edgePoint(rect, dx, dy) {
  const cx = (rect.l + rect.r) / 2, cy = (rect.t + rect.b) / 2, hx = (rect.r - rect.l) / 2, hy = (rect.b - rect.t) / 2;
  const kx = hx / Math.max(Math.abs(dx), 1e-6), ky = hy / Math.max(Math.abs(dy), 1e-6), k = Math.min(kx, ky);
  const side = kx < ky ? (dx < 0 ? "left" : "right") : (dy < 0 ? "top" : "bottom");
  return { x: cx + dx * k, y: cy + dy * k, side };
}
// Positions along one edge, kept in order and at least `gap` apart inside [lo, hi]: a sweep pushes later ones on, then the
// last one back from `hi`. When they cannot all fit they are spread evenly (they may then overlap a little).
function spreadAlong(pos, gap, lo, hi) {
  const order = pos.map((p, i) => i).sort((a, b) => pos[a] - pos[b]), out = pos.slice(), n = order.length;
  if (n * gap > hi - lo + gap) { order.forEach((i, j) => { out[i] = n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (n - 1); }); return out; }
  order.forEach((i, j) => { out[i] = Math.max(clamp(pos[i], lo, hi), j ? out[order[j - 1]] + gap : lo); });
  for (let j = n - 1; j >= 0; j--) { const i = order[j]; out[i] = Math.min(out[i], j === n - 1 ? hi : out[order[j + 1]] - gap); }
  return out;
}
// Slide a box's centre `pos` (half-length `half` along the edge) clear of the blocked spans [[a, b], ...], to the nearest free spot in [lo, hi].
function dodgeAlong(pos, half, spans, lo, hi) {
  let p = clamp(pos, lo, hi);
  for (let pass = 0; pass < spans.length + 1; pass++) {
    const hit = spans.find(([a, b]) => p + half > a && p - half < b);
    if (!hit) return p;
    const down = hit[0] - half, up = hit[1] + half;
    p = down >= lo && (up > hi || p - down <= up - p) ? down : up <= hi ? up : clamp(down, lo, hi);
  }
  return p;
}
const EDGE_REF_W = 1300;   // a typical world view width in px, to scale distance against the range
// Which targets get a box: the bounty first, then dangerous ships, then places and the rest, nearer before farther; at most EDGE_MAX.
function edgeRank(it) {   // it: { boss, kind: "ship" | "place", d: threat step vs you, px: world distance }
  const base = it.boss ? 1000 : it.ally ? 45 : it.kind === "place" ? 60 : it.d >= 1 ? 100 + it.d * 20 : 50;   // an escort out of sight ranks below the sea's own ships
  // up to 40 points off for distance; the cap is for the way home only (the harbor's box may be far past the range and must still rank), every other box keeps ranking by distance
  const k = it.px / (EDGE_RANGE * EDGE_REF_W);
  return base - (it.home ? Math.min(1, k) : k) * 40;
}
// How many boxes the screen can carry: a touch screen or a narrow window gets the few that matter (EDGE_MAX_SMALL).
const edgeMax = (coarse, width) => (coarse || width < EDGE_SMALL_W ? EDGE_MAX_SMALL : EDGE_MAX);
// The way home (home: the harbor past the usual range, js/edge-marks.js) always has a box; ships and the rest share what is left.
const edgePick = (items, max = EDGE_MAX) => {
  const home = items.filter(it => it.home).slice(0, max);
  return [...home, ...items.filter(it => !it.home).sort((a, b) => edgeRank(b) - edgeRank(a)).slice(0, max - home.length)];
};
// A ship box is tinted by how hard that ship fights next to you (the chart's own threat colours, threatTier in js/art.js):
// 2 = two or more levels above you, 1 = one above, 0 = level, -1 = weaker. Anything that is not a ship has no step.
const edgeThreat = d => (d >= 2 ? 2 : d === 1 ? 1 : d === 0 ? 0 : -1);
