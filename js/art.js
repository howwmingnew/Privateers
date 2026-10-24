"use strict";
// ---------- Ship art: procedural top-down hulls, drawn once per (class, livery) into cached canvas textures ----------
// The bow points along +x and each texture is centred on the hull's midpoint, so the sprite's centre is the hitbox centre.
//
// API
//   SHIP_ART[cls]              hull geometry. Player + enemy: sloop schooner brig frigate line; enemy only: cutter fireship fluyt
//                              manowar (Admiral Thorne's flagship: a three-decker with a stern gallery, larger than any buyable hull).
//                              { len, beam } in px, masts (0 = stern .. 1 = bow), rig "fore" | "square", guns (deck guns per
//                              side, = muzzle count the art expects), rows (gun-port rows on the wale), ports (per row).
//   LIVERY[name]               player pirate navy merchant boss bossNavy admiral: CSS colours for hull, deck, sails, trim and flags.
//                              boss = pirate captains (Jolly Roger); bossNavy / admiral fly the Crown's ensign, never the skull.
//   bossLivery(bounty)         "boss" | "bossNavy" | "admiral" for a BOUNTIES entry (js/campaign.js).
//   shipArt(cls, livery, opt)  -> texture key ("ship:<cls>:<livery>"), drawn on first use and cached.
//                              opt.furled: sails stowed (moored boats); opt.key: draw into a fixed key. Both keep the guns baked in; the sea hulls
//                              are drawn without, and js/gun-art.js lays each ship's real guns over them as layers.
//   applyShipArt(s, cls, liv)  sets s.spr's texture, s.cls / s.livery / s.art, the hit capsule s.hl / s.hw (hitShip) and
//                              muzzle geometry s.mounts[mountKey] = { out, span } (muzzle, fire). cls / liv default to
//                              enemyClassFor(s) / liveryFor(s), so after setting e.boss just call applyShipArt(e) again.
//   enemyClassFor(e)           interim class by faction and level; the archetype pass replaces it.
//   liveryFor(s)               "player" | "boss" | s.faction
//   shipZoomK()                camera zoom factor for the player's class (sloop 1 ... line 0.8). Multiply it into fit().
//   threatTier(L)              { d, glyph, color } vs the player's rating; the glyph keeps threat readable without colour.
//   shipTop(s), labelScale()   world-y just above a hull's drawn extent, and the 1/zoom counter-scale for world labels.
//   labelText(txt)             keep a counter-scaled world text crisp (resolution = device px it covers).
// On HiDPI screens art is baked at 2x (artRes()) and shown at scale 1/2: ship sprites keep that base scale in
// s.artScale, so scale effects must multiply it (s.spr.setScale(s.artScale * k)), never setScale(k).
const SHIP_ART = {
  sloop:    { len: 64,  beam: 21, masts: [0.6], rig: "fore", boom: 0.58, sprit: 0.3, guns: 1 },
  schooner: { len: 76,  beam: 23, masts: [0.68, 0.4], rig: "fore", boom: 0.3, sprit: 0.3, guns: 2 },
  brig:     { len: 88,  beam: 28, masts: [0.67, 0.37], rig: "square", sail: 0.98, spanker: true, sprit: 0.26, guns: 3, boat: true },
  frigate:  { len: 104, beam: 33, masts: [0.74, 0.5, 0.25], rig: "square", sail: 0.94, spanker: true, sprit: 0.24, guns: 7, rows: 1, ports: 9, boat: true },
  line:     { len: 120, beam: 39, masts: [0.75, 0.51, 0.27], rig: "square", sail: 0.92, spanker: true, sprit: 0.22, guns: 12, rows: 2, ports: 13, boat: true },
  cutter:   { len: 60,  beam: 18, masts: [0.5], rig: "fore", boom: 0.66, sprit: 0.44, bow: 1.25, stern: 0.5, guns: 1, jibs: 2 },
  fireship: { len: 64,  beam: 22, masts: [0.56], rig: "square", sail: 0.82, sprit: 0.22, guns: 0, barrels: true, tattered: true, smoulder: true },
  fluyt:    { len: 86,  beam: 34, masts: [0.7, 0.46, 0.2], rig: "square", sail: 0.8, lateen: true, sprit: 0.2, bow: 0.55, stern: 0.4, wide0: 0.26, wide1: 0.64, guns: 1, hatches: 3 },
  manowar:  { len: 150, beam: 46, masts: [0.76, 0.52, 0.28], rig: "square", sail: 0.92, spanker: true, sprit: 0.2, guns: 10, rows: 3, ports: 14, boat: true, gallery: true },
};
const LIVERY = {
  player:   { hull: "#6e3d1f", deck: "#cfa165", sail: "#fff7e2", trim: "#2f8ad6", flag: "#2f8ad6", flag2: "#fff7e2", pennant: "#3fa9ff", lamp: "#ffe7a8" },
  pirate:   { hull: "#29231f", deck: "#64533f", sail: "#3b3841", trim: "#b02626", flag: "#121014", flag2: "#efeae0", pennant: "#b02626", lamp: "#ffb35c",
              patch: ["#4f4b57", "#29262d", "#5b5146"] },
  navy:     { hull: "#1d3767", deck: "#bd9b6e", sail: "#fbfbf7", trim: "#e2b94b", flag: "#f7f6f1", flag2: "#c8352a", pennant: "#c8352a", pennant2: "#f7f6f1", lamp: "#ffe7a8" },
  merchant: { hull: "#7f5634", deck: "#dcb67e", sail: "#d5b585", trim: "#4f9c4b", flag: "#4f9c4b", flag2: "#f3ead4", pennant: "#4f9c4b", lamp: "#ffd98a" },
  boss:     { hull: "#1c1820", deck: "#6e4c38", sail: "#a32a2a", trim: "#eabf4e", flag: "#141016", flag2: "#eabf4e", pennant: "#eabf4e", lamp: "#ffd66b",
              gold: true, bigFlag: true },
  // navy flag officers: gilded blue hull, white sails with a red band, a big ensign (white canton, red cross)
  bossNavy: { hull: "#172a52", deck: "#9c7f55", sail: "#f6f3ea", trim: "#e2b94b", flag: "#22375a", flag2: "#f4efe2", pennant: "#c8352a", pennant2: "#f7f6f1", lamp: "#ffe7a8",
              band: "#b4412c", gold: true, bigFlag: true, ensign: true },
  admiral:  { hull: "#0d1424", deck: "#5f4a33", sail: "#ece6d6", trim: "#e8bf52", flag: "#8e1f1a", flag2: "#f4efe2", pennant: "#c8352a", pennant2: "#f7f6f1", lamp: "#ffd98a",
              band: "#9c2a22", gold: true, bigFlag: true, ensign: true, admiral: true },
};
// Baked texture resolution: 2x when the canvas renders at >= 1.5 device px per CSS px (js/view.js), else 1x, since a
// 2x texture shown at 1x zoom just shimmers (no mipmaps for these canvas textures).
const artRes = () => (typeof VIEW !== "undefined" && VIEW.dpr >= 1.5 ? 2 : 1);
const artResOf = key => (S && S.textures.exists(key) && S.textures.get(key).artRes) || 1;
// Paint into a canvas texture at `res` device px per world px. Canvas shadowBlur ignores the transform, so drawing code
// sets blur through blur() (or multiplies by BLURK) to keep soft edges the same size at any resolution.
let BLURK = 1;
const blur = (c, px, col) => { c.shadowColor = col; c.shadowBlur = px * BLURK; };
function bakeCanvas(sc, key, w, h, res, draw) {
  const tex = sc.textures.createCanvas(key, Math.ceil(w * res), Math.ceil(h * res)), c = tex.context;
  BLURK = res; c.save(); c.scale(res, res); draw(c); c.restore(); BLURK = 1;
  tex.refresh(); tex.artRes = res;
  return key;
}

// half-beam at u (0 stern .. 1 bow): a squared transom swelling to full beam, then a curved run to a pointed bow
function hullHalf(a, u) {
  const b = a.beam / 2, st = a.stern ?? 0.66, u0 = a.wide0 ?? 0.34, u1 = a.wide1 ?? 0.56;
  if (u <= u0) return b * (st + (1 - st) * Math.sin(u / u0 * Math.PI / 2));
  if (u <= u1) return b;
  const k = (u - u1) / (1 - u1);
  return b * Math.pow(Math.max(0, 1 - k * k), a.bow ?? 0.8);
}
function hullPath(c, a, cx, cy, d) {
  const n = 40, L = a.len, x0 = cx - L / 2 + d, span = L - d * 2.6;
  c.beginPath();
  for (let i = 0; i <= n; i++) c.lineTo(x0 + i / n * span, cy - Math.max(0.3, hullHalf(a, i / n) - d));
  for (let i = n; i >= 0; i--) c.lineTo(x0 + i / n * span, cy + Math.max(0.3, hullHalf(a, i / n) - d));
  c.quadraticCurveTo(x0 - 2, cy, x0, cy - Math.max(0.3, hullHalf(a, 0) - d));   // slightly rounded transom
  c.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255);
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
const WOOD = "#4a2f1a", ROPE = "rgba(28,16,8,.5)";
const SAIL_SPAN = 0.86;   // square-sail half-span per beam: yards reach past the rails, the classic top-down cross
function line(c, x0, y0, x1, y1, w, col) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.stroke(); }
function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); }
function sailSizes(n) { return n === 1 ? [1] : n === 2 ? [0.92, 1] : [0.92, 1, 0.78]; }
function boomLen(a, i) { return a.len * (a.boom || 0.3) * (i === a.masts.length - 1 ? 1 : 0.9); }
function texSize(a) {
  const sq = a.rig === "square" ? a.beam * SAIL_SPAN * (a.sail || 1) : 0;
  const fa = a.rig === "fore" ? boomLen(a, a.masts.length - 1) * 0.5 : 0;
  const fwd = a.len / 2 + a.sprit * a.len + 3;
  const aft = Math.max(a.len / 2 + (a.bigFlag ? 18 : 12), a.rig === "fore" ? a.len * (a.masts[a.masts.length - 1] - 0.5) * -1 + boomLen(a, a.masts.length - 1) + 4 : 0);
  return { w: Math.ceil(2 * Math.max(fwd, aft) + 8), h: Math.ceil(2 * (Math.max(a.beam / 2, sq + 1.5, fa) + 7)) };
}
function shipArt(cls, livery, opt = {}, sc = S) {
  const a = SHIP_ART[cls] || SHIP_ART.sloop, L = LIVERY[livery] || LIVERY.pirate;
  const key = opt.key || `ship:${cls}:${livery}${opt.furled ? ":f" : ""}`;
  if (sc.textures.exists(key)) return key;
  const { w, h } = texSize({ ...a, bigFlag: L.bigFlag || !!L.emblem });
  return bakeCanvas(sc, key, w, h, opt.res || artRes(), c => drawShip(c, a, L, w / 2, h / 2, !!opt.furled, mulberry32(artSeed(key)), !opt.furled && !opt.key));   // at sea the guns are separate layers (js/gun-art.js); moored boats keep theirs
}
// per-texture rng seed, so a redraw of the same key (the harbor gun deck, js/deck-art.js) matches the sprite exactly
function artSeed(key) { let seed = 7; for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 2654435761); return seed; }
function applyShipArt(s, cls = enemyClassFor(s), livery = liveryFor(s)) {
  s.cls = SHIP_ART[cls] ? cls : "sloop"; s.livery = LIVERY[livery] ? livery : "pirate";
  const a = s.art = SHIP_ART[s.cls];
  if (s.spr) { const key = shipArt(s.cls, s.livery); s.artScale = 1 / artResOf(key); s.spr.setTexture(key).setScale(s.artScale); }
  // hit capsule: the drawn hull plus half a ball, so a ball that visibly touches the planking counts
  s.hw = a.beam / 2 + 1.5; s.hl = Math.max(4, a.len / 2 - s.hw);
  const side = { out: a.beam / 2 + 1, span: a.len * 0.48 }, end = { out: a.len / 2 + 2, span: a.beam * 0.36 };
  s.mounts = { bow: end, left: side, right: side, stern: { out: a.len / 2, span: a.beam * 0.36 } };
  if (s.badge) labelText(s.badge);
  // bigger ship, wider view: viewZoom() multiplies shipZoomK() in, so re-run the fit when the class changes
  if (s.isPlayer && s.zoomK !== shipZoomK()) { s.zoomK = shipZoomK(); if (typeof refitView === "function") refitView(); }
  return s;
}
function enemyClassFor(e) {
  if (e.merchant || e.faction === "merchant") return "fluyt";
  const L = e.L || 1;
  if (e.boss) return L >= 7 ? "line" : "frigate";
  return L <= 2 ? (e.faction === "pirate" ? "cutter" : "sloop") : L <= 5 ? "brig" : L <= 8 ? "frigate" : "line";
}
function bossLivery(b) { return b && b.final ? "admiral" : b && b.faction === "navy" ? "bossNavy" : "boss"; }
function liveryFor(s) {
  if (s.isPlayer) return typeof playerLivery === "function" ? playerLivery() : "player";   // the captain's flag (js/flags.js)
  if (s.boss) return bossLivery((typeof findBounty === "function" && findBounty(s.boss)) || { faction: s.faction });
  return LIVERY[s.faction] ? s.faction : "pirate";
}
function shipZoomK() { return 1 - 0.05 * Math.max(0, SHIP_ORDER.indexOf(save.ship)); }
function threatTier(L) {
  const d = L - shipRating();
  return d <= -1 ? { d, glyph: "▼", color: "#86c46f" } : d === 0 ? { d, glyph: "●", color: "#e8c25a" }
    : d === 1 ? { d, glyph: "▲", color: "#e88a3a" } : { d, glyph: "▲▲", color: "#d9493a" };
}
// Minimap mark: the tier's shape (down triangle, dot, up triangle, two up triangles) filled in its colour.
function threatMark(ctx, x, y, tier, r = 5) {
  const tri = (cx, up, k) => {
    const base = y + (up ? r : -r) * 0.7 * k;
    ctx.moveTo(cx - r * k, base); ctx.lineTo(cx + r * k, base); ctx.lineTo(cx, y + (up ? -r : r) * k); ctx.closePath();
  };
  ctx.beginPath();
  if (tier.d <= -1) tri(x, false, 0.9); else if (tier.d === 0) ctx.arc(x, y, r * 0.75, 0, TAU);
  else if (tier.d === 1) tri(x, true, 1); else { tri(x - r * 0.75, true, 0.85); tri(x + r * 0.75, true, 0.85); }
  ctx.fillStyle = tier.color; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.3); ctx.strokeStyle = "rgba(4,18,24,.85)"; ctx.stroke();
}
function shipTop(s) {
  const a = s.art || SHIP_ART.sloop, sx = a.rig === "square" ? a.beam * SAIL_SPAN * (a.sail || 1) : a.beam * 0.55;
  return s.y - (Math.abs(Math.sin(s.rot)) * a.len * 0.5 + Math.abs(Math.cos(s.rot)) * sx);
}
// Counter-zoom for world text: never smaller on screen than its design size. Works in CSS pixels (js/view.js multiplies
// the camera zoom by the canvas dpr), so HiDPI screens get the same on-screen size. The text-size setting multiplies in.
function labelScale() {
  const dpr = typeof VIEW !== "undefined" ? VIEW.dpr : 1;
  return clamp(dpr / S.cameras.main.zoom, 1, 2.4) * uiScale();
}
function labelText(txt) {
  if (typeof crispText === "function" && typeof viewTextRes === "function") crispText(txt, viewTextRes(S.cameras.main.zoom * labelScale()));
  return txt.setScale(labelScale());
}
// Common combos are drawn at boot so no frame hitches when they first sail into view.
function warmShipArt(sc) {
  for (const id of SHIP_ORDER) shipArt(id, typeof playerLivery === "function" ? playerLivery() : "player", {}, sc);
  for (const [c, l] of [["cutter", "pirate"], ["sloop", "navy"], ["brig", "pirate"], ["brig", "navy"], ["frigate", "pirate"], ["frigate", "navy"],
    ["line", "pirate"], ["line", "navy"], ["fluyt", "merchant"]]) shipArt(c, l, {}, sc);
}
