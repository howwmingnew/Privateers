"use strict";
// ---------- Ship art: the canvas drawing behind shipArt() (js/art.js) ----------
// Light is ambient (no baked direction) because the sprite rotates: hulls are lit along the centreline and shaded at
// both sides, sails darken under the yard and brighten where they belly out, and soft shadows lift sails off the deck.
function hexA(hex, al) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${al})`; }
function drawShip(c, a, L, cx, cy, furled, rng) {
  const di = a.rows >= 3 ? 5.2 : a.rows === 2 ? 3.8 : a.rows ? 2.9 : 2.3;   // deck inset: heavier bulwarks on the warships
  drawSprit(c, a, cx, cy);
  drawHull(c, a, L, cx, cy);
  drawDeck(c, a, L, cx, cy, di, rng);
  if (a.gallery) drawGallery(c, a, L, cx, cy);
  drawRigging(c, a, cx, cy);
  if (furled) drawFurled(c, a, L, cx, cy); else drawSails(c, a, L, cx, cy, rng);
  for (const u of a.masts) {
    const x = cx - a.len / 2 + u * a.len, r = 1.2 + a.len / 95;
    dot(c, x, cy, r + 0.5, L.gold ? L.trim : "rgba(20,12,6,.6)"); dot(c, x, cy, r, WOOD); dot(c, x - 0.4, cy - 0.4, r * 0.4, "rgba(255,230,190,.45)");
  }
  drawFlags(c, a, L, cx, cy);
  const x0 = cx - a.len / 2 + 2.2;
  for (const k of L.gold ? [-0.55, 0.55] : [0]) {   // stern lantern(s)
    const y = cy + k * hullHalf(a, 0), g = c.createRadialGradient(x0, y, 0, x0, y, 5.5);
    g.addColorStop(0, "rgba(255,250,222,1)"); g.addColorStop(0.35, hexA(L.lamp, 0.65)); g.addColorStop(1, hexA(L.lamp, 0));
    c.fillStyle = g; c.fillRect(x0 - 6, y - 6, 12, 12); dot(c, x0, y, 1.1, "#fffbe8");
  }
}
// A flagship's stern gallery: a gilded rail and a row of lit windows across the transom.
function drawGallery(c, a, L, cx, cy) {
  const x = cx - a.len / 2 + 1.7, h = hullHalf(a, 0) - 2.6;
  line(c, x + 2.6, cy - h, x + 2.6, cy + h, 1, L.trim);
  c.save(); blur(c, 3, "rgba(255,214,120,.9)");
  for (let i = 0; i < 6; i++) { c.fillStyle = "#ffe2a0"; c.fillRect(x - 0.7, cy - h + (i + 0.5) * (2 * h / 6) - 1.2, 1.8, 2.4); }
  c.restore();
}
function drawSprit(c, a, cx, cy) {
  const x1 = cx + a.len / 2 - 5, x2 = cx + a.len / 2 + a.sprit * a.len;
  c.beginPath(); c.moveTo(x1, cy - 1.5); c.lineTo(x2, cy - 0.6); c.lineTo(x2, cy + 0.6); c.lineTo(x1, cy + 1.5); c.closePath();
  c.fillStyle = WOOD; c.fill();
}
function drawHull(c, a, L, cx, cy) {
  const b = a.beam / 2, x0 = cx - a.len / 2, rows = a.rows || 0;
  c.save(); blur(c, 6, "rgba(0,14,24,.6)");   // contact shadow on the water
  hullPath(c, a, cx, cy, -0.4); c.fillStyle = shade(L.hull, -0.45); c.fill(); c.restore();
  const g = c.createLinearGradient(0, cy - b, 0, cy + b);
  g.addColorStop(0, shade(L.hull, -0.22)); g.addColorStop(0.5, shade(L.hull, 0.22)); g.addColorStop(1, shade(L.hull, -0.32));
  hullPath(c, a, cx, cy, 0); c.fillStyle = g; c.fill();
  // wale stripe(s) in the trim colour; warships show a chequer of gun ports, two-deckers two rows of them
  for (let r = 0; r < Math.max(1, rows); r++) {
    const inset = 1.1 + r * 1.45;
    hullPath(c, a, cx, cy, inset); c.lineWidth = rows ? 1.35 : 1.1; c.strokeStyle = L.trim; c.stroke();
    if (!rows) continue;
    const n = a.ports - r;
    for (let i = 0; i < n; i++) {
      const u = 0.17 + 0.62 * i / (n - 1) + r * 0.025, x = x0 + u * a.len, w = hullHalf(a, u) - inset;
      c.fillStyle = "#130c07"; c.fillRect(x - 1.1, cy - w - 0.75, 2.2, 1.5); c.fillRect(x - 1.1, cy + w - 0.75, 2.2, 1.5);
    }
  }
}
function drawDeck(c, a, L, cx, cy, di, rng) {
  const len = a.len, b = a.beam / 2, x0 = cx - len / 2, X = u => x0 + u * len, Wd = u => hullHalf(a, u) - di;
  c.save(); hullPath(c, a, cx, cy, di); c.clip();
  const g = c.createLinearGradient(0, cy - b, 0, cy + b);
  g.addColorStop(0, shade(L.deck, -0.34)); g.addColorStop(0.5, shade(L.deck, 0.1)); g.addColorStop(1, shade(L.deck, -0.42));
  c.fillStyle = g; c.fillRect(x0 - 3, cy - b - 2, len + 6, a.beam + 4);
  for (let y = -b + 1.6, j = 0; y < b; y += 2.4, j++) {   // planks along the hull, butt joints staggered
    line(c, x0, cy + y, x0 + len, cy + y, 0.5, "rgba(45,25,10,.22)");
    for (let x = x0 + (j * 5) % 13; x < x0 + len; x += 13) line(c, x, cy + y - 2.4, x, cy + y, 0.4, "rgba(45,25,10,.13)");
  }
  // quarterdeck (and forecastle on bigger hulls): raised, lighter, with a rail across
  const q = a.rows ? 0.22 : 0.17;
  c.fillStyle = "rgba(255,236,200,.12)"; c.fillRect(x0 - 3, cy - b, q * len + 3, a.beam);
  line(c, X(q), cy - Wd(q), X(q), cy + Wd(q), 1.1, shade(L.hull, 0.15));
  if (len >= 84) { c.fillStyle = "rgba(255,236,200,.1)"; c.fillRect(X(0.86), cy - b, len, a.beam); line(c, X(0.86), cy - Wd(0.86), X(0.86), cy + Wd(0.86), 1, shade(L.hull, 0.15)); }
  line(c, X(q * 0.55), cy - a.beam * 0.13, X(q * 0.55), cy + a.beam * 0.13, 1.1, WOOD); dot(c, X(q * 0.28), cy, 0.9, "#c9b07a");   // wheel, binnacle
  deckGear(c, a, L, cx, cy, rng);
  // one deck gun per side muzzle (same spacing as s.mounts.left in applyShipArt)
  const n = a.guns, span = len * 0.48;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : -span / 2 + span * i / (n - 1), w = Wd(0.5 + off / len);
    for (const sg of [-1, 1]) { c.fillStyle = shade(L.deck, -0.5); c.fillRect(cx + off - 1.7, cy + sg * (w - 2.3) - 1.3, 3.4, 2.6); }
  }
  c.restore();
  hullPath(c, a, cx, cy, di - 0.4); c.lineWidth = 0.9; c.strokeStyle = L.gold ? L.trim : shade(L.hull, 0.38); c.stroke();   // rail
  for (let i = 0; i < n; i++) {   // barrels poke out past the planking, so gun count reads on the hull side
    const off = n === 1 ? 0 : -span / 2 + span * i / (n - 1), u = 0.5 + off / len, w = hullHalf(a, u);
    for (const sg of [-1, 1]) line(c, cx + off, cy + sg * (w - di - 1.5), cx + off, cy + sg * (w + 1), 1.5, "#1b1816");
  }
}
function deckGear(c, a, L, cx, cy, rng) {
  const len = a.len, x0 = cx - len / 2, X = u => x0 + u * len, m = a.masts, dark = "rgba(28,16,6,.78)";
  const hatch = (u, w, h) => {
    c.fillStyle = dark; c.fillRect(X(u) - w / 2, cy - h / 2, w, h);
    for (let k = 1; k < 3; k++) line(c, X(u) - w / 2 + w * k / 3, cy - h / 2, X(u) - w / 2 + w * k / 3, cy + h / 2, 0.5, "rgba(210,170,110,.35)");
  };
  if (a.hatches) {   // fluyt: big cargo hatches with crates and casks stacked beside them
    [0.33, 0.58, 0.84].forEach((u, i) => {
      hatch(u, len * 0.08, a.beam * 0.36);
      for (const sg of [-1, 1]) {
        const bx = X(u) + (i % 2 ? 3 : -3), by = cy + sg * a.beam * 0.27;
        c.fillStyle = "#a9814f"; c.fillRect(bx - 2.2, by - 2.2, 4.4, 4.4); c.strokeStyle = "#5a3a1c"; c.lineWidth = 0.6; c.strokeRect(bx - 2.2, by - 2.2, 4.4, 4.4);
        line(c, bx - 2.2, by - 2.2, bx + 2.2, by + 2.2, 0.5, "#5a3a1c");
      }
    });
  } else if (a.rig === "square" && m.length > 1) hatch((m[m.length - 1] + m[m.length - 2]) / 2, len * 0.06, a.beam * 0.3);
  else if (!a.barrels) hatch((m[0] + 0.18) / 2 + 0.06, len * 0.07, a.beam * 0.28);
  if (a.boat) {   // ship's boat stowed in the waist
    const u = m.length === 3 ? (m[0] + m[1]) / 2 : (m[0] + 0.86) / 2, bx = X(u), bw = len * 0.13, bh = a.beam * 0.26;
    c.beginPath(); c.ellipse(bx, cy, bw / 2, bh / 2, 0, 0, TAU); c.fillStyle = "#e2d3ab"; c.fill(); c.lineWidth = 0.9; c.strokeStyle = "#5a3a20"; c.stroke();
    line(c, bx - bw * 0.15, cy - bh * 0.42, bx - bw * 0.15, cy + bh * 0.42, 0.6, "#8a6a40"); line(c, bx + bw * 0.15, cy - bh * 0.42, bx + bw * 0.15, cy + bh * 0.42, 0.6, "#8a6a40");
  }
  if (a.rig === "square" && !a.barrels) {   // capstan
    const x = X((m[m.length - 1] + (a.rows ? 0.22 : 0.17)) / 2 + 0.02), r = a.beam * 0.08;
    dot(c, x, cy, r, shade(L.deck, -0.25)); for (let k = 0; k < 4; k++) line(c, x, cy, x + Math.cos(k * 1.57) * r * 1.6, cy + Math.sin(k * 1.57) * r * 1.6, 0.6, WOOD);
  }
  if (a.barrels) {   // fireship: scorched deck crammed with powder casks, embers glowing
    for (let i = 0; i < 3; i++) {
      const x = X(0.25 + rng() * 0.55), y = cy + (rng() - 0.5) * a.beam * 0.5, g = c.createRadialGradient(x, y, 0, x, y, 7);
      g.addColorStop(0, "rgba(10,6,4,.6)"); g.addColorStop(1, "rgba(10,6,4,0)"); c.fillStyle = g; c.fillRect(x - 7, y - 7, 14, 14);
    }
    const casks = [[0.3, -0.5], [0.3, 0.5], [0.42, 0], [0.66, -0.5], [0.66, 0.5], [0.78, 0], [0.2, 0]];
    for (const [u, k] of casks) {
      const x = X(u), y = cy + k * a.beam * 0.42;
      dot(c, x, y, 2.6, "#2a1a0e"); dot(c, x, y, 2.1, "#5d3c22"); c.beginPath(); c.arc(x, y, 1.4, 0, TAU); c.lineWidth = 0.5; c.strokeStyle = "#1a120c"; c.stroke();
    }
    c.save(); blur(c, 3, "#ff7a1a");
    for (let i = 0; i < 6; i++) dot(c, X(0.2 + rng() * 0.6), cy + (rng() - 0.5) * a.beam * 0.6, 0.7 + rng() * 0.5, rng() < 0.5 ? "#ffb347" : "#ff6a1a");
    c.restore();
  }
}
function drawRigging(c, a, cx, cy) {
  const len = a.len, x0 = cx - len / 2, tip = cx + len / 2 + a.sprit * len;
  c.beginPath(); c.moveTo(tip, cy); for (const u of a.masts) c.lineTo(x0 + u * len, cy);   // stays down the centreline
  c.lineWidth = 0.6; c.strokeStyle = ROPE; c.stroke();
  for (const u of a.masts) {   // shrouds to the rails, splayed aft
    const x = x0 + u * len;
    for (const sg of [-1, 1]) for (const k of [2.5, 5.5]) line(c, x, cy, x - k, cy + sg * (hullHalf(a, u - k / len) - 0.6), 0.55, ROPE);
  }
}
function drawSails(c, a, L, cx, cy, rng) {
  const len = a.len, x0 = cx - len / 2, n = a.masts.length, sz = sailSizes(n), tip = cx + len / 2 + a.sprit * len, fore = x0 + a.masts[0] * len;
  // head sails stay slim: they are thin triangles seen edge-on, and a fat one reads as a tusk off the bow
  for (let j = (a.jibs || 1) - 1; j >= 0; j--) curvedSail(c, L, fore + 2, cy, tip - a.sprit * len * (0.12 + j * 0.42), cy, 0.09 + j * 0.02, rng, false, -0.04);
  if (a.rig === "fore") {
    for (let i = n - 1; i >= 0; i--) {   // boom sails swung out to leeward so they stand clear of the deck
      const mx = x0 + a.masts[i] * len, bl = boomLen(a, i), an = 0.3;
      curvedSail(c, L, mx, cy, mx - Math.cos(an) * bl, cy + Math.sin(an) * bl, 0.32, rng, true, 0);
    }
    return;
  }
  const last = x0 + a.masts[n - 1] * len;
  if (a.spanker) { const bl = (last - x0) * 1.04; curvedSail(c, L, last, cy, last - Math.cos(0.24) * bl, cy + Math.sin(0.24) * bl, 0.2, rng, true, 0); }
  if (a.lateen) curvedSail(c, L, last + len * 0.1, cy, last - len * 0.17, cy + len * 0.07, 0.16, rng, true, 0);
  for (let i = n - 1; i >= 0; i--) {
    if (a.lateen && i === n - 1) continue;   // the fluyt's mizzen carries only the lateen
    const x = x0 + a.masts[i] * len, Sx = a.beam * SAIL_SPAN * (a.sail || 1) * sz[i];
    squareSail(c, a, L, x, cy, Sx, Sx * 0.55, rng, false);
    if (!a.tattered) squareSail(c, a, L, x - 0.8, cy, Sx * 0.72, Sx * 0.4, rng, true);   // topsail, higher so it overlaps
  }
}
// A square sail from above: the yard is straight, the cloth bellies forward toward the bow as a crescent.
function squareSail(c, a, L, x, cy, Sx, D, rng, top) {
  const torn = a.tattered && !top;
  const path = () => {
    c.beginPath(); c.moveTo(x, cy - Sx);
    if (torn) for (let i = 1; i <= 12; i++) { const y = -Sx + 2 * Sx * i / 12; c.lineTo(x + D * (1 - Math.abs(y / Sx) ** 2.5) - (rng() < 0.4 ? rng() * D * 0.55 : 0), cy + y); }
    else c.bezierCurveTo(x + D * 1.33, cy - Sx * 0.62, x + D * 1.33, cy + Sx * 0.62, x, cy + Sx);   // full, almost square belly
    c.quadraticCurveTo(x + D * 0.35, cy, x, cy - Sx); c.closePath();
  };
  const g = c.createLinearGradient(x, 0, x + D, 0);
  g.addColorStop(0, shade(L.sail, -0.24)); g.addColorStop(0.55, shade(L.sail, 0)); g.addColorStop(1, shade(L.sail, top ? 0.14 : 0.07));
  c.save(); blur(c, top ? 2.5 : 4, "rgba(0,0,0,.38)"); path(); c.fillStyle = g; c.fill(); c.restore();
  c.save(); path(); c.clip();
  for (let k = -2; k <= 2; k++) line(c, x, cy + k * Sx / 3, x + D * 2, cy + k * Sx / 3, 0.5, "rgba(0,0,0,.08)");   // cloths
  for (const f of [0.4, 0.75]) { c.beginPath(); c.moveTo(x, cy - Sx); c.bezierCurveTo(x + D * 1.33 * f, cy - Sx * 0.62, x + D * 1.33 * f, cy + Sx * 0.62, x, cy + Sx); c.lineWidth = 0.5; c.strokeStyle = "rgba(0,0,0,.1)"; c.stroke(); }
  if (L.patch && !top) patches(c, L, rng, () => [x + D * (0.25 + rng() * 0.5), cy + (rng() - 0.5) * Sx * 1.3]);
  if (L.band && !top) {   // a red band across the course, following the belly of the cloth
    c.beginPath(); c.moveTo(x, cy - Sx); c.bezierCurveTo(x + D * 0.82, cy - Sx * 0.62, x + D * 0.82, cy + Sx * 0.62, x, cy + Sx);
    c.lineWidth = D * 0.24; c.strokeStyle = hexA(L.band, 0.88); c.stroke();
  }
  if (torn) for (let i = 0; i < 3; i++) dot(c, x + D * (0.2 + rng() * 0.5), cy + (rng() - 0.5) * Sx * 1.4, 0.7 + rng() * 0.8, "rgba(20,10,5,.85)");
  c.restore();
  line(c, x, cy - Sx - 1.2, x, cy + Sx + 1.2, top ? 1.1 : 1.5, WOOD);   // the yard
}
// A fore-and-aft sail (boom sail or jib) from above: a slim crescent between its spar line and a curve bellied to leeward.
function curvedSail(c, L, ax, ay, bx, by, k, rng, spar, lift) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }   // belly to starboard (+y), the leeward side
  const h = d * k, mx = (ax + bx) / 2, my = (ay + by) / 2;
  const path = () => { c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(mx + nx * h * 2, my + ny * h * 2, bx, by); c.quadraticCurveTo(mx + nx * h * 0.5, my + ny * h * 0.5, ax, ay); c.closePath(); };
  const g = c.createLinearGradient(mx, my, mx + nx * h, my + ny * h);
  g.addColorStop(0, shade(L.sail, -0.2 + lift)); g.addColorStop(1, shade(L.sail, 0.08 + lift));
  c.save(); blur(c, 3, "rgba(0,0,0,.35)"); path(); c.fillStyle = g; c.fill(); c.restore();
  c.save(); path(); c.clip();
  for (const t of [0.3, 0.55, 0.8]) {
    const px = ax + dx * t, py = ay + dy * t, o0 = h * t * (1 - t), o1 = 4 * h * t * (1 - t);
    line(c, px + nx * o0, py + ny * o0, px + nx * o1, py + ny * o1, 0.5, "rgba(0,0,0,.1)");
  }
  if (L.patch && spar) patches(c, L, rng, () => { const t = 0.3 + rng() * 0.4, o = 2.4 * h * t * (1 - t); return [ax + dx * t + nx * o, ay + dy * t + ny * o]; });
  c.restore();
  if (spar) { line(c, ax, ay, bx, by, 1.3, WOOD); line(c, ax, ay, ax + dx * 0.82 + nx * h * 0.7, ay + dy * 0.82 + ny * h * 0.7, 0.8, "rgba(74,47,26,.7)"); }
}
function patches(c, L, rng, at) {
  for (let i = 0; i < 2; i++) {
    const [px, py] = at(), w = 2.5 + rng() * 2.5, h = 2.5 + rng() * 3;
    c.fillStyle = L.patch[Math.floor(rng() * L.patch.length)]; c.fillRect(px - w / 2, py - h / 2, w, h);
    c.setLineDash([0.8, 0.8]); c.lineWidth = 0.4; c.strokeStyle = "rgba(255,255,255,.2)"; c.strokeRect(px - w / 2, py - h / 2, w, h); c.setLineDash([]);
  }
}
function drawFurled(c, a, L, cx, cy) {
  const len = a.len, x0 = cx - len / 2;
  a.masts.forEach((u, i) => {
    const x = x0 + u * len;
    if (a.rig === "square") { const Sx = a.beam * SAIL_SPAN * 0.9 * (a.sail || 1) * sailSizes(a.masts.length)[i]; line(c, x, cy - Sx, x, cy + Sx, 2.8, shade(L.sail, -0.12)); line(c, x, cy - Sx - 1, x, cy + Sx + 1, 1, WOOD); }
    else { const bl = boomLen(a, i); line(c, x, cy, x - bl, cy, 2.8, shade(L.sail, -0.12)); line(c, x, cy, x - bl, cy, 1, WOOD); }
  });
}
function wavyFlag(c, x, y, w, h, wob) {   // a flag streaming aft (-x) from (x, y)
  c.beginPath(); c.moveTo(x, y - h / 2);
  for (let i = 1; i <= 5; i++) c.lineTo(x - w * i / 5, y - h / 2 + Math.sin(i * 1.3) * wob);
  for (let i = 5; i >= 0; i--) c.lineTo(x - w * i / 5, y + h / 2 + Math.sin(i * 1.3) * wob);
  c.closePath();
}
function drawFlags(c, a, L, cx, cy) {
  const len = a.len, x0 = cx - len / 2, big = L.bigFlag ? 1.6 : 1, fw = 9 * big, fh = 6 * big, fx = x0 - 1;
  line(c, x0 + 1.5, cy, fx, cy, 0.8, WOOD);   // ensign staff over the transom
  c.save(); blur(c, 2, "rgba(0,0,0,.4)"); wavyFlag(c, fx, cy, fw, fh, 0.7); c.fillStyle = L.flag; c.fill(); c.restore();
  c.save(); wavyFlag(c, fx, cy, fw, fh, 0.7); c.clip();
  const mx = fx - fw * 0.5;
  if (L.ensign) {   // the Crown's ensign: the field with a white canton and a red cross at the hoist
    const cw = fw * 0.46, ch = fh * 0.52, y0 = cy - fh / 2 - 1;
    c.fillStyle = L.flag2; c.fillRect(fx - cw, y0, cw + 1, ch + 1);
    line(c, fx - cw / 2, y0, fx - cw / 2, y0 + ch + 1, fh * 0.13, "#c8352a"); line(c, fx - cw, y0 + ch / 2 + 0.5, fx, y0 + ch / 2 + 0.5, fh * 0.13, "#c8352a");
  } else if (L.patch || L.bigFlag) {   // skull and crossbones
    line(c, mx - fh * 0.32, cy - fh * 0.05, mx + fh * 0.32, cy + fh * 0.38, fh * 0.1, L.flag2); line(c, mx - fh * 0.32, cy + fh * 0.38, mx + fh * 0.32, cy - fh * 0.05, fh * 0.1, L.flag2);
    dot(c, mx, cy - fh * 0.08, fh * 0.2, L.flag2);
  } else if (L.flag2 === "#c8352a") { line(c, fx - fw, cy, fx, cy, fh * 0.24, L.flag2); line(c, fx - fw * 0.42, cy - fh, fx - fw * 0.42, cy + fh, fh * 0.24, L.flag2); }   // navy: red cross
  else if (L.pennant === "#3fa9ff") line(c, fx, cy + fh / 2, fx - fw, cy - fh / 2, fh * 0.26, L.flag2);   // player: cream diagonal
  else line(c, fx - fw, cy, fx, cy, fh * 0.3, L.flag2);   // merchant: house stripe
  c.restore();
  if (L.bigFlag) { wavyFlag(c, fx, cy, fw, fh, 0.7); c.lineWidth = 0.8; c.strokeStyle = L.trim; c.stroke(); }
  // a long pennant streams aft from the main masthead
  const mi = a.masts.length === 1 ? 0 : 1, px = x0 + a.masts[mi] * len, pl = len * 0.26 * big, pw = 1.4 * big;
  c.beginPath(); c.moveTo(px, cy - pw);
  for (let i = 1; i <= 6; i++) c.lineTo(px - pl * i / 6, cy - pw * (1 - i / 6.5) + Math.sin(i * 1.2) * 0.8 + i * 0.15);
  for (let i = 6; i >= 0; i--) c.lineTo(px - pl * i / 6, cy + pw * (1 - i / 6.5) + Math.sin(i * 1.2) * 0.8 + i * 0.15);
  c.closePath(); c.save(); blur(c, 2, "rgba(0,0,0,.45)"); c.fillStyle = L.pennant; c.fill(); c.restore();
  if (L.pennant2) { c.save(); c.clip(); c.fillStyle = L.pennant2; c.fillRect(px - pl, cy - pw * 2, pl, pw * 1.9); c.restore(); }   // navy pennant: white over red
  if (L.admiral) {   // the admiral's flag at the foremast head: a square St George's cross, unlike any other ship's
    const ax = x0 + a.masts[0] * len, s = 7;
    c.save(); blur(c, 2, "rgba(0,0,0,.45)"); wavyFlag(c, ax, cy, s * 1.3, s, 0.6); c.fillStyle = "#f4efe2"; c.fill(); c.restore();
    c.save(); wavyFlag(c, ax, cy, s * 1.3, s, 0.6); c.clip();
    line(c, ax - s * 1.3, cy, ax, cy, s * 0.26, "#c8352a"); line(c, ax - s * 0.65, cy - s, ax - s * 0.65, cy + s, s * 0.26, "#c8352a");
    c.restore();
    wavyFlag(c, ax, cy, s * 1.3, s, 0.6); c.lineWidth = 0.7; c.strokeStyle = L.trim; c.stroke();
  }
}
