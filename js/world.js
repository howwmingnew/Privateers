"use strict";
// ---------- Textures (drawn in code, no external assets) ----------
function shipTex(sc, key, hull, deck, sail, trim) {
  const g = sc.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000, 0.22); g.fillEllipse(41, 21, 70, 24);
  g.fillStyle(hull, 1); g.beginPath(); g.moveTo(4, 10); g.lineTo(52, 6); g.lineTo(76, 18); g.lineTo(52, 30); g.lineTo(4, 26); g.closePath(); g.fillPath();
  g.fillStyle(deck, 1); g.beginPath(); g.moveTo(9, 12); g.lineTo(51, 9); g.lineTo(68, 18); g.lineTo(51, 27); g.lineTo(9, 24); g.closePath(); g.fillPath();
  g.fillStyle(trim, 1); g.fillRect(4, 10, 7, 16);
  g.lineStyle(1, hull, 0.55); g.lineBetween(12, 15, 60, 15); g.lineBetween(12, 21, 60, 21);
  g.fillStyle(sail, 1); g.fillRoundedRect(22, 2, 8, 32, 3); g.fillRoundedRect(40, 4, 8, 28, 3); g.fillRoundedRect(57, 10, 5, 16, 2);
  g.fillStyle(0x000000, 0.12); g.fillRect(22, 17, 8, 2); g.fillRect(40, 17, 8, 2);
  g.fillStyle(0x3b2414, 1); g.fillCircle(26, 18, 2.5); g.fillCircle(44, 18, 2.5); g.fillCircle(59, 18, 2);
  g.fillStyle(trim, 1); g.fillTriangle(4, 18, -2 + 6, 13, 0 + 6, 18);
  g.generateTexture(key, 80, 36); g.destroy();
}
function makeTextures(sc) {
  shipTex(sc, "ship-player", 0x6b3b1f, 0xc89a5b, 0xf6efdc, 0x2d6e8e);
  shipTex(sc, "ship-pirate", 0x2b2522, 0x6d5a45, 0x2f2d33, 0x8b1e1e);
  shipTex(sc, "ship-navy", 0x3d4f6b, 0xb7956a, 0xe9e4d8, 0xc9a23b);
  shipTex(sc, "ship-merchant", 0x7a5230, 0xd9b27c, 0xd8c7a0, 0x5b9a56);
  let g = sc.make.graphics({ add: false });
  g.fillStyle(0x1a1a1a, 1); g.fillCircle(4, 4, 3.5); g.fillStyle(0xffffff, 0.4); g.fillCircle(3, 3, 1.2); g.generateTexture("ball", 8, 8); g.destroy();
  g = sc.make.graphics({ add: false });
  for (let i = 8; i > 0; i--) { g.fillStyle(0xffffff, 0.12); g.fillCircle(8, 8, i); } g.generateTexture("puff", 16, 16); g.destroy();
  g = sc.make.graphics({ add: false }); g.fillStyle(0xffffff, 1); g.fillCircle(3, 3, 3); g.generateTexture("dot", 6, 6); g.destroy();
  g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.25); g.fillRect(2, 4, 20, 18);
  g.fillStyle(0x8a5a2b, 1); g.fillRect(0, 0, 20, 18); g.lineStyle(2, 0x4a2e14, 1); g.strokeRect(1, 1, 18, 16); g.lineBetween(1, 9, 19, 9);
  g.fillStyle(0xf0c766, 1); g.fillCircle(10, 5, 3); g.generateTexture("crate", 24, 24); g.destroy();
  // Player wreck: broken hull with a chest and a red marker flag
  g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.25); g.fillEllipse(20, 22, 38, 14);
  g.fillStyle(0x4a2e14, 1); g.fillTriangle(2, 18, 24, 12, 22, 24); g.fillTriangle(20, 13, 38, 20, 22, 25);
  g.fillStyle(0x8a5a2b, 1); g.fillRect(12, 12, 16, 11); g.lineStyle(2, 0x3b2414, 1); g.strokeRect(12, 12, 16, 11);
  g.fillStyle(0xf0c766, 1); g.fillCircle(20, 15, 3);
  g.fillStyle(0x3b2414, 1); g.fillRect(29, 2, 2, 14); g.fillStyle(0xd9493a, 1); g.fillTriangle(31, 2, 39, 5, 31, 8);
  g.generateTexture("wreck", 40, 30); g.destroy();
  // Wave tile: scattered light strokes
  g = sc.make.graphics({ add: false });
  const r = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, y = r() * 256, w = 10 + r() * 22;
    g.lineStyle(2, 0xbfe6ef, 0.35 + r() * 0.25);
    g.beginPath(); g.arc(x, y, w, Math.PI * 1.15, Math.PI * 1.85); g.strokePath();
  }
  g.generateTexture("wave", 256, 256); g.destroy();
}

// ---------- World drawing ----------
function blobPath(g, isl, scale) {
  const n = isl.pts.length; g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * TAU, k = isl.pts[i % n] * isl.r * scale;
    const x = isl.x + Math.cos(a) * k, y = isl.y + Math.sin(a) * k;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}
// Static scenery is baked into small textures once; a giant live Graphics object would be re-tessellated every frame.
function drawWorld(sc) {
  drawIslands(sc);   // js/world-seas.js (rebuilt there when a new game rolls a new map)
  // Harbor
  const C = DOCK_R + 10, g = sc.make.graphics({ add: false });
  g.lineStyle(3, 0xf6f1e3, 0.35);
  for (let i = 0; i < 36; i += 2) { const a0 = i / 36 * TAU, a1 = (i + 1) / 36 * TAU; g.beginPath(); g.arc(C, C, DOCK_R, a0, a1); g.strokePath(); }
  g.fillStyle(0x5fb3bf, 0.5); g.fillCircle(C, C, PORT_ISLAND_R + 28);
  g.fillStyle(0xe3cf96, 1); g.fillCircle(C, C, PORT_ISLAND_R);
  g.fillStyle(0x8f8a7e, 1); g.fillCircle(C, C, PORT_ISLAND_R - 22);
  for (const [a, len] of [[0, 70], [Math.PI / 2, 60], [Math.PI, 70], [-Math.PI / 2, 60]]) {
    const x = C + Math.cos(a) * (PORT_ISLAND_R - 6), y = C + Math.sin(a) * (PORT_ISLAND_R - 6);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
    g.fillStyle(0x7a4f2a, 1);
    g.fillPoints([{ x: x + nx, y: y + ny }, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }, { x: x - nx, y: y - ny }], true);
  }
  const roofs = [0xa8432e, 0x8b3524, 0xb8603a, 0x6e2c1e, 0xa8432e, 0x8b3524];
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4, d = 38; g.fillStyle(roofs[i], 1); g.fillRect(C + Math.cos(a) * d - 11, C + Math.sin(a) * d - 9, 22, 18); }
  g.fillStyle(0xd9cfb8, 1); g.fillCircle(C, C, 12);
  g.generateTexture("harbor", C * 2, C * 2); g.destroy();
  sc.add.image(PORT.x, PORT.y, "harbor").setDepth(1);
  harborLabel = sc.add.text(PORT.x, PORT.y + PORT_ISLAND_R + 44, t("harborMap"), { fontFamily: UI_FONT, fontSize: "18px", fontStyle: "700", color: "#f6f1e3" })
    .setOrigin(0.5).setAlpha(0.7).setDepth(1);
}
