"use strict";
// ---------- Seas: named regions of level rings, the island layout, ring-quota spawning, the sea banner ----------
// Level still comes purely from distance to the harbor: ring L covers [ringEdge(L), ringEdge(L + 1)), and Lv 10 runs
// on to the corners. The four seas group those rings so the player can read the water ahead.
Object.assign(STR.en, {
  sea_shallows: "The Shallows", sea_reef: "The Reef Straits", sea_lanes: "The Navy Lanes", sea_maelstrom: "The Maelstrom",
  seaLine_shallows: "Fishing smacks and green pirates. A good place to learn your guns.",
  seaLine_reef: "Pirate brigs hunt among the rocks.",
  seaLine_lanes: "The Crown's warships patrol these waters.",
  seaLine_maelstrom: "The chart ends here, and so do most captains.",
  seaLv: "Lv {a}–{b}",
});
Object.assign(STR.zh, {
  sea_shallows: "淺灘", sea_reef: "暗礁海峽", sea_lanes: "海軍航道", sea_maelstrom: "大漩渦",
  seaLine_shallows: "漁船和菜鳥海盜出沒，正好拿來練砲。",
  seaLine_reef: "海盜船在礁石之間獵食。",
  seaLine_lanes: "皇家戰艦在這片海域巡邏。",
  seaLine_maelstrom: "海圖到這裡為止，大多數船長也是。",
  seaLv: "Lv {a}–{b}",
});

const SEAS = [   // tint: the sea on the chart, darker the deeper and deadlier
  { id: "shallows",  L0: 1, L1: 2,  tint: "#2b8798" },
  { id: "reef",      L0: 3, L1: 5,  tint: "#21667c" },
  { id: "lanes",     L0: 6, L1: 8,  tint: "#1d4766" },
  { id: "maelstrom", L0: 9, L1: 10, tint: "#33294d" },
];
const ringEdge = L => SAFE_R + (L - 1) * ZONE_STEP;    // inner edge of level ring L
const ringMid = L => ringEdge(L) + ZONE_STEP / 2;
const ringAt = d => clamp(1 + Math.floor((d - SAFE_R) / ZONE_STEP), 1, MAX_RING);
const seaOfRing = L => SEAS.find(s => L >= s.L0 && L <= s.L1);
const polarPt = (a, r) => ({ x: PORT.x + Math.cos(a) * r, y: PORT.y + Math.sin(a) * r });
// New Game+ makes every ring fiercer and richer: +3 levels and x1.5 loot a cycle, capped at three cycles so the
// numbers stay inside what the stat curves were built for. [PLACEHOLDER] until playtested.
const NG_LEVELS = 3, NG_LOOT = 1.5, NG_CAP = 3;
const ngCycles = () => Math.min(save.ngPlus || 0, NG_CAP);
const levelBonus = () => NG_LEVELS * ngCycles();
// The war escalates: once the Ashen Saint (bounty 3) and then Commodore Hale (bounty 4) are sunk, the Navy Lanes and the
// Maelstrom (rings 6+) put out ships 1 and then 2 levels stronger, so the late game keeps something above the player.
const WAR_RING = 6, WAR_FROM = 2, WAR_MAX = 2;
if (typeof onHook === "function") onHook("bounty", () => { if (typeof buildMiniBase === "function" && S) buildMiniBase(); });
const warLevels = ring => ring >= WAR_RING ? clamp(((save.campaign && save.campaign.bounty) || 0) - WAR_FROM, 0, WAR_MAX) : 0;
const lootMul = () => NG_LOOT ** ngCycles();

// ---------- Islands ----------
// A fresh layout every new game (save.seed); the harbor mouth, the bounty lairs, the outpost and any wreck stay clear.
// Saves from before the big map keep seed 7: the original 34 islands sit exactly where they were around the harbor,
// and the new outer waters are filled in around them.
const ISLAND_COUNT = 85;   // ~1.3 per million px², the old map's density
let islandSeed = null, islandImgs = [];
function clearSpots() {
  return [...BOUNTIES.map(b => ({ ...lairOf(b), r: 330 })), { ...OUTPOST, r: 320 }, ...STATIONS.map(p => ({ x: p.x, y: p.y, r: 320 })), ...save.wrecks.map(w => ({ x: w.x, y: w.y, r: 70 })),
    ...(runActive() && runBounty() ? [{ ...lairOf(runBounty()), r: 330 }] : [])];   // the daily captain's lair (js/run.js)
}
function genIslands(seed = save.seed) {
  const r = mulberry32(seed), keep = clearSpots(), legacy = seed === LEGACY_SEED;
  const make = (x, y, R) => { const pts = []; for (let i = 0; i < 14; i++) pts.push(0.82 + r() * 0.28); return { x, y, r: R, pts, seed: r() }; };
  const open = (list, x, y, R) => Math.hypot(x - PORT.x, y - PORT.y) >= SAFE_R + R + 80 && !list.some(o => Math.hypot(o.x - x, o.y - y) < o.r + R + 160);
  const clear = (x, y, R) => !keep.some(p => Math.hypot(p.x - x, p.y - y) < p.r + R);
  const inOld = (x, y) => x > LEGACY_SHIFT && x < LEGACY_SHIFT + 5000 && y > LEGACY_SHIFT && y < LEGACY_SHIFT + 5000;
  const old = [];
  // the original generator, draw for draw, shifted onto the new harbor
  if (legacy) for (let tries = 0; old.length < 34 && tries++ < 2000;) {
    const R = 60 + r() * 130, x = LEGACY_SHIFT + 150 + r() * 4700, y = LEGACY_SHIFT + 150 + r() * 4700;
    if (open(old, x, y, R)) old.push(make(x, y, R));
  }
  const out = old.filter(o => clear(o.x, o.y, o.r));   // an old island on a lair or a wreck gives way
  for (let tries = 0; out.length < ISLAND_COUNT && tries++ < 8000;) {
    const R = 60 + r() * 130, x = 150 + r() * (W - 300), y = 150 + r() * (H - 300);
    if (!(legacy && inOld(x, y)) && open(out, x, y, R) && clear(x, y, R)) out.push(make(x, y, R));
  }
  return out;
}
// Painted by js/scenery.js, one texture per island. On this map they bake at 1x even on HiDPI screens: 85 islands at 2x
// would hold ~150 MB of canvas plus GPU memory (risky on iOS), 1x keeps the set below the old 34-island map at 2x.
const ISLAND_RES = 1;
let islandKeys = [];
function drawIslands(sc) {
  for (const img of islandImgs) img.destroy();
  for (const key of islandKeys) if (sc.textures.exists(key)) sc.textures.remove(key);
  islandImgs = []; islandKeys = [];
  islands.filter(isl => !isl.outpost).forEach((isl, idx) => {
    islandImgs.push(...bakeIsland(sc, isl, idx, ISLAND_RES));
    islandKeys.push("isl-sh" + idx, "isl" + idx);
  });
  islandSeed = save.seed;   // the islands on screen now belong to this game
}
// A new game rolls a new seed: rebuild the islands, the outpost and the chart before the next departure.
function syncWorld() {
  if (!S || islandSeed === save.seed) return;
  islands = genIslands(save.seed);
  drawIslands(S);
  syncOutpost();
}

// ---------- Population: ring quotas ----------
// ~60% of the ordinary ships sail the player's ring and its two neighbours, placed within reach of the player; the rest
// are shared out over every other ring, so each level stays populated on the chart wherever the player is.
const NEAR_SHARE = 0.6;
const NEAR_REACH = 2600;   // near-ring ships spawn within about this of the player (never inside 750, see spawnEnemy)
const NEAR_LOST = 3000;    // ...and are moved up again once they fall this far behind
const SPARE_GONE = 1500;   // an over-quota ship this far off, out of sight, makes room for a ring that is short
const isOrdinary = e => !e.boss && !e.escortOf && !e.fixed && !e.ally;   // an escort is the player's (js/escort-ai.js)   // shore batteries (js/forts.js) keep to their own rules
const playerRing = () => ringAt(dist(player, PORT));
function nearRings() { const c = clamp(playerRing(), 2, MAX_RING - 1); return [c - 1, c, c + 1]; }
function ringQuotas(near) {
  const q = new Array(MAX_RING + 1).fill(0), here = playerRing(), byCloseness = (a, b) => Math.abs(a - here) - Math.abs(b - here);
  const share = (rings, n) => [...rings].sort(byCloseness).forEach((L, i) => { q[L] = Math.floor(n / rings.length) + (i < n % rings.length ? 1 : 0); });
  const nNear = Math.round(ENEMY_COUNT * NEAR_SHARE), far = [];
  for (let L = 1; L <= MAX_RING; L++) if (!near.includes(L)) far.push(L);
  share(near, nNear); share(far, ENEMY_COUNT - nNear);
  return q;
}
function seaCensus() {
  const near = nearRings(), quota = ringQuotas(near), count = new Array(MAX_RING + 1).fill(0);
  for (const e of enemies) if (e.alive && isOrdinary(e)) count[e.ring]++;
  return { near, quota, count, total: count.reduce((a, b) => a + b, 0) };
}
// The ring most short of its quota (near rings win ties).
function spawnRing() {
  const { near, quota, count } = seaCensus();
  let best = near[1], most = -Infinity;
  for (let L = 1; L <= MAX_RING; L++) { const d = quota[L] - count[L] + (near.includes(L) ? 0.5 : 0); if (d > most) { most = d; best = L; } }
  return best;
}
// A point in ring L: anywhere for a far ring, toward the player for a near one. spawnEnemy() rejects bad points.
function spawnPoint(L) {
  const r0 = Math.max(SPAWN_R_MIN, ringEdge(L)), r1 = L >= MAX_RING ? SPAWN_R_MAX : ringEdge(L + 1);
  const r = Math.sqrt(grand(r0 * r0, r1 * r1));   // uniform over the ring's area
  if (!nearRings().includes(L) || dist(player, PORT) < SAFE_R) return polarPt(grand(0, TAU), r);
  const pa = Math.atan2(player.y - PORT.y, player.x - PORT.x), span = Math.min(Math.PI, NEAR_REACH / r);
  return polarPt(pa + grand(-span, span), r);
}
// Called from step(): clear sunk ships, retire ships the quotas no longer want, top the sea back up.
function managePopulation(dt) {
  const pop = seaCensus();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (!e.alive || !isOrdinary(e) || e.angry > 0 || e.holdSea) continue;   // holdSea: the Admiral's fleet stays until sunk or left far behind (js/heat.js)
    const d = dist(e, player);
    const drop = pop.near.includes(e.ring) ? d > NEAR_LOST
      : pop.count[e.ring] > pop.quota[e.ring] && d > SPARE_GONE && !onScreen(e.x, e.y, 200);
    if (drop) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); enemies.splice(i, 1); pop.count[e.ring]--; pop.total--; }
  }
  spawnT -= dt;
  if (spawnT <= 0) { spawnT = 1.2; if (pop.total < ENEMY_COUNT) spawnEnemy(S); }
}

// ---------- Sea banner: the sea's name when the player sails into it ----------
// A crossing counts once the ship is SEA_HYST px past the line or has stayed SEA_DWELL s beyond it (a fight on a border
// used to fire it every few seconds). The banner then shows at most once per sea per sortie, and not for a sea the
// player was in less than SEA_AGAIN_MS ago (sunk in the Reef, straight back out: no second "Reef Straits").
const SEA_HYST = 120, SEA_DWELL = 2.5, SEA_AGAIN_MS = 60000;
const seaBanner = document.createElement("div");
seaBanner.id = "seaBanner"; seaBanner.setAttribute("role", "status");
document.body.append(seaBanner);
let seaNow = null, seaPend = null, seaPendT = 0, seaShown = null, seaBannerT, seaSortie = new Set(), seaLastIn = {};
function seaHere() { const d = dist(player, PORT); return d < SAFE_R ? null : seaOfRing(ringAt(d)).id; }
const SEA_LINES = () => [SAFE_R, ...SEAS.slice(1).map(s => ringEdge(s.L0))];
const seaDepth = d => Math.min(...SEA_LINES().map(r => Math.abs(d - r)));   // px to the nearest sea border
function renderSeaBanner(id) {
  const s = SEAS.find(x => x.id === id), b = levelBonus();
  seaBanner.dataset.sea = id;
  seaBanner.innerHTML = `<small>${t("seaLv", { a: s.L0 + b + warLevels(s.L0), b: s.L1 + b + warLevels(s.L1) })}</small><b>${t("sea_" + id)}</b><span>${t("seaLine_" + id)}</span>`;
}
function showSeaBanner(id) {
  if (typeof bannerGate === "function" && !bannerGate("seaBanner", () => showSeaBanner(id), id)) return;   // one banner at a time (js/notify-order.js)
  seaShown = id; renderSeaBanner(id);
  seaBanner.classList.remove("on"); void seaBanner.offsetWidth; seaBanner.classList.add("on");   // restart the fade
  clearTimeout(seaBannerT); seaBannerT = setTimeout(hideSeaBanner, 3800);
}
function hideSeaBanner() { seaBanner.classList.remove("on"); seaShown = null; }
onHook("frame", dt => {
  if (paused || docked || !player.alive) return;
  const here = seaHere(), now = performance.now();
  if (seaNow) seaLastIn = { ...seaLastIn, [seaNow]: now };
  if (here === seaNow) { seaPend = null; return; }
  if (here !== seaPend) { seaPend = here; seaPendT = 0; }
  if ((seaPendT += dt) < SEA_DWELL && seaDepth(dist(player, PORT)) < SEA_HYST) return;   // a bow over the line and back is not a crossing
  seaNow = here; seaPend = null;
  if (!here) return;
  runHook("sea", here);
  const fresh = !seaSortie.has(here) && !(now - (seaLastIn[here] ?? -Infinity) < SEA_AGAIN_MS);
  seaSortie = new Set([...seaSortie, here]);
  if (fresh && !(typeof firstVoyage === "function" && firstVoyage())) showSeaBanner(here);   // the coach has the floor
});
onHook("sail", () => { seaNow = seaHere(); seaPend = null; seaSortie = new Set(); hideSeaBanner(); });
onHook("dock", hideSeaBanner);
onHook("lang", () => { if (seaShown) renderSeaBanner(seaShown); });

// ---------- Chart (the HUD minimap's base layer) ----------
// One smooth shade out from the harbor, each sea's tint at the middle of its band, darker the deadlier: no ring or border
// lines, so the chart says only roughly how risky a place is (the seas' level ranges sit up the north-west diagonal).
// M = chart size in canvas px; u = scale relative to the original 224-px chart.
const seaBandMid = i => (i === 0 ? SAFE_R + ringEdge(SEAS[1].L0) : ringEdge(SEAS[i].L0) + (i < SEAS.length - 1 ? ringEdge(SEAS[i + 1].L0) : farthestCorner())) / 2;
const farthestCorner = () => Math.hypot(Math.max(PORT.x, W - PORT.x), Math.max(PORT.y, H - PORT.y));
function drawSeaChart(c, M) {
  const k = M / W, cx = PORT.x * k, cy = PORT.y * k, far = farthestCorner();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, far * k);
  g.addColorStop(0, SEAS[0].tint);
  SEAS.forEach((s, i) => g.addColorStop(clamp(seaBandMid(i) / far, 0, 1), s.tint));
  g.addColorStop(1, SEAS[SEAS.length - 1].tint);
  c.fillStyle = g; c.fillRect(0, 0, M, M);
  c.fillStyle = "#3a9aab"; c.beginPath(); c.arc(cx, cy, SAFE_R * k, 0, TAU); c.fill();   // the harbor's safe water
}
function drawSeaLabels(c, M) {
  const k = M / W, u = M / 224, a = -Math.PI * 0.75, b = levelBonus();
  c.font = `700 ${Math.round(14 * u)}px ${UI_FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.lineWidth = 3.5 * u; c.strokeStyle = "rgba(4,18,24,.9)"; c.fillStyle = "#f6f1e3";
  SEAS.forEach((s, i) => {
    const r0 = ringEdge(s.L0), r1 = i < SEAS.length - 1 ? ringEdge(SEAS[i + 1].L0) : r0 + 1100;
    const p = polarPt(a, (r0 + r1) / 2), txt = `${s.L0 + b + warLevels(s.L0)}–${s.L1 + b + warLevels(s.L1)}`;   // as the banner says
    c.strokeText(txt, p.x * k, p.y * k); c.fillText(txt, p.x * k, p.y * k);
  });
}
