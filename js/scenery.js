"use strict";
// ---------- Scenery: sea depth, islands, the harbour town ----------
// All of it is painted once into canvas textures at boot (artRes(): 2x on HiDPI) and shown as plain images, so the sea
// costs a few quads per frame. Soft layers (shallows, sea depth) are baked at low resolution on purpose: the GPU's
// linear filtering blurs them for free. Light comes from the top-left, as the old island rocks implied.
let harborBeams = [];
// Deeper water further from the harbour: one radial gradient on a small texture stretched over the whole map. Its hue
// follows the seas (the chart's tints): turquoise Shallows, blue-green Reef, deep navy Lanes, a bruised Maelstrom.
function bakeSeaDepth(sc) {
  const N = 192, M = Math.max(16, Math.round(N * H / W)), k = N / W;
  const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - PORT.x, y - PORT.y)));
  const at = d => clamp(d / far, 0, 1);
  bakeCanvas(sc, "sea-depth", N, M, 1, c => {
    const g = c.createRadialGradient(PORT.x * k, PORT.y * k, 0, PORT.x * k, PORT.y * k, far * k);
    [[0, "#2ea6a6"], [at(PORT_ISLAND_R + 160), "#26959c"], [at(SAFE_R), "#1f8293"], [at(SAFE_R + ZONE_STEP * 2), "#1a6a84"],
      [at(SAFE_R + ZONE_STEP * 4.5), "#145273"], [at(SAFE_R + ZONE_STEP * 5.5), "#103f68"], [at(SAFE_R + ZONE_STEP * 7.5), "#122f5c"],
      [at(SAFE_R + ZONE_STEP * 8.5), "#1d2650"], [1, "#161a3a"]].forEach(([o, col]) => g.addColorStop(o, col));
    c.fillStyle = g; c.fillRect(0, 0, N, M);
  });
  sc.add.image(0, 0, "sea-depth").setOrigin(0).setDisplaySize(W, H).setDepth(-1);
}

// Island outline: the stored radii joined by a Catmull-Rom spline plus two seeded ripples, so coasts curve instead of
// showing 14 straight facets. Returns radius (in units of isl.r) at angle a.
function islandShape(isl) {
  const p = isl.pts, n = p.length, s = isl.seed * 40;
  return a => {
    const f = ((a / TAU) * n % n + n) % n, i = Math.floor(f), t = f - i;
    const p0 = p[(i + n - 1) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const cr = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    return cr + 0.022 * Math.sin(5 * a + s) + 0.012 * Math.sin(11 * a + s * 1.7);
  };
}
function shapePath(c, shape, cx, cy, R, k) {
  c.beginPath();
  for (let i = 0; i <= 96; i++) { const a = i / 96 * TAU, r = shape(a) * R * k; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  c.closePath();
}
// res: device px per world px for the land layer (default artRes()). Returns the two images, so a new map can free them.
function bakeIsland(sc, isl, idx, res = artRes()) {
  const shape = islandShape(isl), R = isl.r, rng = mulberry32(Math.floor(isl.seed * 1e6));
  const sh = Math.ceil(R * 1.6);   // shallows: low-res layer under the land
  bakeCanvas(sc, "isl-sh" + idx, sh * 2, sh * 2, 0.5, c => {   // stacked faint rings: the edge is a gradient, not a hard line
    for (let k = 1.4; k > 1.0; k -= 0.035) { c.fillStyle = `rgba(130,215,208,${k > 1.2 ? 0.045 : 0.07})`; shapePath(c, shape, sh, sh, R, k); c.fill(); }
  });
  const shallows = sc.add.image(isl.x, isl.y, "isl-sh" + idx).setScale(2).setDepth(0.9);
  const half = Math.ceil(R * 1.24 + 6);
  bakeCanvas(sc, "isl" + idx, half * 2, half * 2, res, c => paintIsland(c, isl, shape, half, rng));
  return [shallows, sc.add.image(isl.x, isl.y, "isl" + idx).setScale(1 / res).setDepth(1)];
}
function paintIsland(c, isl, shape, C, rng) {
  const R = isl.r, P = k => shapePath(c, shape, C, C, R, k);
  // surf: a soft foam line hugging the beach and a broken one further out
  c.save(); blur(c, 5, "rgba(255,255,255,.8)"); P(1.065); c.lineWidth = 2.6; c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke(); c.restore();
  c.save(); c.setLineDash([5, 9]); P(1.13); c.lineWidth = 1.6; c.strokeStyle = "rgba(255,255,255,.28)"; c.stroke(); c.restore();
  c.fillStyle = "#c7ae78"; P(1.0); c.fill();   // wet sand
  let g = c.createRadialGradient(C - R * 0.2, C - R * 0.2, R * 0.2, C, C, R);
  g.addColorStop(0, "#efdcaa"); g.addColorStop(1, "#dcc48b"); c.fillStyle = g; P(0.955); c.fill();
  c.save(); blur(c, 5, "rgba(50,70,25,.55)"); c.fillStyle = "#5c9b55"; P(0.76); c.fill(); c.restore();
  c.save(); P(0.76); c.clip();   // grass mottling
  for (let i = 0; i < 16; i++) { const a = rng() * TAU, d = rng() * R * 0.7; dot(c, C + Math.cos(a) * d, C + Math.sin(a) * d, R * (0.06 + rng() * 0.09), rng() < 0.5 ? "rgba(122,182,104,.45)" : "rgba(64,120,60,.4)"); }
  c.restore();
  g = c.createRadialGradient(C - R * 0.15, C - R * 0.15, R * 0.05, C, C, R * 0.5);
  g.addColorStop(0, "#5b9a50"); g.addColorStop(1, "#2f6532");
  c.save(); blur(c, 6, "rgba(20,40,15,.5)"); c.fillStyle = g; P(0.47); c.fill(); c.restore();
  // rocks first, trees over them, palms on the beach
  for (let k = 0, n = 2 + Math.floor(rng() * 2); k < n; k++) {
    const a = rng() * TAU, d = shape(a) * R * (0.25 + rng() * 0.5);
    for (let j = 0, m = 2 + Math.floor(rng() * 3); j < m; j++) rock(c, C + Math.cos(a) * d + (rng() - 0.5) * 16, C + Math.sin(a) * d + (rng() - 0.5) * 16, 3.5 + rng() * 5, rng);
  }
  const shoreRock = rng() * TAU, sd = shape(shoreRock) * R * 1.01;   // one reef of boulders breaking the surf
  for (let j = 0; j < 3; j++) {
    const x = C + Math.cos(shoreRock) * sd + (rng() - 0.5) * 12, y = C + Math.sin(shoreRock) * sd + (rng() - 0.5) * 12;
    c.save(); blur(c, 3, "rgba(255,255,255,.9)"); dot(c, x, y, 6.5, "rgba(255,255,255,.35)"); c.restore(); rock(c, x, y, 3.5 + rng() * 3, rng);
  }
  for (let i = 0, n = Math.floor(R / 8); i < n; i++) {
    const a = rng() * TAU, d = shape(a) * R * Math.sqrt(rng()) * 0.62;
    tree(c, C + Math.cos(a) * d, C + Math.sin(a) * d, 4 + rng() * 4 * Math.min(1.4, R / 100), rng);
  }
  for (let i = 0, n = 3 + Math.floor(rng() * 4); i < n; i++) {
    const a = rng() * TAU, d = shape(a) * R * (0.8 + rng() * 0.1);
    palm(c, C + Math.cos(a) * d, C + Math.sin(a) * d, 6 + rng() * 3, rng);
  }
}
function rock(c, x, y, r, rng) {
  const pts = Array.from({ length: 7 }, (_, i) => { const a = i / 7 * TAU, k = r * (0.75 + rng() * 0.35); return [x + Math.cos(a) * k, y + Math.sin(a) * k]; });
  const poly = () => { c.beginPath(); pts.forEach(([px, py]) => c.lineTo(px, py)); c.closePath(); };
  c.save(); blur(c, 2.5, "rgba(0,0,0,.45)"); c.shadowOffsetX = c.shadowOffsetY = 1.5 * BLURK; poly(); c.fillStyle = "#7c786f"; c.fill(); c.restore();
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, "#bdb8ab"); g.addColorStop(0.5, "#8d897f"); g.addColorStop(1, "#5d5a53");
  poly(); c.fillStyle = g; c.fill();
}
function tree(c, x, y, r, rng) {
  c.save(); blur(c, 2.5, "rgba(10,30,10,.5)"); c.shadowOffsetX = c.shadowOffsetY = 2 * BLURK; dot(c, x, y, r, "#356f35"); c.restore();
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, rng() < 0.5 ? "#80bf6c" : "#74b464"); g.addColorStop(1, "#2f6a31");
  dot(c, x, y, r, g);
}
function palm(c, x, y, r, rng) {
  const lean = rng() * TAU, cx = x + Math.cos(lean) * r * 0.5, cy = y + Math.sin(lean) * r * 0.5;
  dot(c, x + 2, y + 2, r * 0.8, "rgba(0,0,0,.16)");
  line(c, x, y, cx, cy, 1.6, "#7a5a33");
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + rng() * 0.4, tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r, nx = -Math.sin(a) * 1.8, ny = Math.cos(a) * 1.8;
    const mx = (cx + tx) / 2, my = (cy + ty) / 2;
    c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(mx + nx, my + ny, tx, ty); c.quadraticCurveTo(mx - nx, my - ny, cx, cy);
    c.fillStyle = i % 2 ? "#3f8a3a" : "#4d9a44"; c.fill();
    line(c, cx, cy, tx, ty, 0.4, "rgba(190,230,140,.6)");
  }
  dot(c, cx, cy, 1.3, "#6b4a22");
}
