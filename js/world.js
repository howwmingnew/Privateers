"use strict";
// ---------- Textures (drawn in code, no external assets) ----------
function makeTextures(sc) {
  // Ships come from the class x livery generator (js/art.js). The old keys stay valid (1x) for any code still using them.
  for (const [key, cls, liv] of [["ship-player", "sloop", "player"], ["ship-pirate", "cutter", "pirate"], ["ship-navy", "sloop", "navy"], ["ship-merchant", "fluyt", "merchant"]])
    shipArt(cls, liv, { key, res: 1 }, sc);
  warmShipArt(sc);
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
// Static scenery is baked into small textures once; a giant live Graphics object would be re-tessellated every frame.
// The painted versions (sea depth, islands with palms and surf, the harbour town) live in js/scenery.js.
function drawWorld(sc) {
  bakeSeaDepth(sc);
  drawIslands(sc);   // js/world-seas.js: paints each island (js/scenery.js) and rebuilds them when a new game rolls a new map
  bakeHarbor(sc);
  // in the open water between the south and west piers (straight south it lay across the south pier and its ship)
  const la = Math.PI * 0.75, lr = PORT_ISLAND_R + 62;
  harborLabel = sc.add.text(PORT.x + Math.cos(la) * lr, PORT.y + Math.sin(la) * lr, t("harborMap"), { fontFamily: UI_FONT, fontSize: "18px", fontStyle: "700", color: "#f6f1e3" })
    .setOrigin(0.5).setAlpha(0.7).setDepth(1);
}
