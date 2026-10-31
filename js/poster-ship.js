"use strict";
// ---------- The captain's ship on the Wanted poster (js/campaign-ui.js posterHtml) ----------
// The same hull and livery the boss sails with (applyShipArt(boss, bossArt(b), bossLivery(b)), js/campaign.js): gold
// trim, the Jolly Roger or the Crown's ensign. Painted straight into a fixed-size canvas, bow right, so it needs no layout
// reads and renders the same while the ledger is hidden. A fixed backing size (CSS scales it) keeps it sharp on a phone.
const POSTER_SHIP_W = 560, POSTER_SHIP_H = 190;
const posterShipHtml = b => `<canvas class="p-ship" width="${POSTER_SHIP_W}" height="${POSTER_SHIP_H}" role="img" aria-label="${bossClsName(b)}"></canvas>`;
function paintPosterShip(cv, b) {
  const cls = bossArt(b), a = SHIP_ART[cls], livery = bossLivery(b), L = LIVERY[livery];
  const { w, h } = texSize({ ...a, bigFlag: L.bigFlag }), k = Math.min(POSTER_SHIP_W * 0.86 / w, POSTER_SHIP_H * 0.96 / h);
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  c.save(); c.translate(cv.width / 2, cv.height / 2); c.scale(k, k);
  BLURK = k;   // shadowBlur ignores the transform (js/art.js)
  try { drawShip(c, a, L, 0, 0, false, mulberry32(artSeed(`ship:${cls}:${livery}`))); } finally { BLURK = 1; c.restore(); }
}
