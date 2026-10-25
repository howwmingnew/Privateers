"use strict";
// ---------- Gun art: what each gun looks like from the side (cards) and from above (on the hulls), and how it moves when it fires ----------
// Five guns (GUNS, js/data.js), five silhouettes: six = a plain iron barrel on a truck carriage; long12 = long and slim with a brass
// muzzle ring; carronade = short and fat on a slide, no wheels; chain = rust-brown with a dumbbell of chain shot at the mouth;
// incendiary = copper with a glowing mouth. The shapes differ in length and width as well as colour.
//
// Layers: a hull sprite (js/art.js, drawn bare of guns) with the ship's guns laid over it as one extra sprite, a MERGED texture of every
// gun it carries (and, while a side fires, one sprite per mount so that side can kick back on its own). A texture is keyed by hull class
// + the gun types in port order, so every ship with the same loadout shares it (30 guns cost 1-4 sprites, not 30), and a swap bakes a
// new one on first use. The layer follows the hull sprite's position, rotation, scale, alpha and tint every frame, so the storm roll
// (js/weather-sea.js), a sinking and a hit flash carry over. More layers (a broken mast, #43) join the same way: one more sprite
// following s.spr.
//
// API
//   gunSideUrl(id)                 data URL of the side view, drawn once (harbor cards, store, armory)
//   gunSideImg(id, cls)            the <img> markup for it
//   gunLayout(an, key, n)          pure: [{ x, y, ang, pitch }] hull-local tip of each of n guns on a mount (bow +x, larboard -y), and the way it points
//   gunSig(ports)                  pure: "s-lck" style text for a mount's ports (type per port, "-" for an empty one)
//   drawGunsOn(c, an, cx, cy, key, ports)   paint one mount's guns into a 2D context at hull centre (cx, cy)
//   gunFired(s, key, i, n)         js/combat.js and js/volley.js call it per shot: the mount recoils and a flash blooms at the muzzle
const GUN_CODE = { six: "s", long12: "l", carronade: "c", chain: "k", fire: "f" };
const GUN_LOOK = {   // top view at 1x: len = barrel length, w = barrel width at the breech
  six: { len: 6.2, w: 2.6 }, long12: { len: 9, w: 2.1 }, carronade: { len: 4.4, w: 4 }, chain: { len: 6.4, w: 2.6 }, fire: { len: 6.4, w: 2.8 },
};
// A legendary gun (#38, js/gear-core.js) is its type id plus "!": the same barrel with gold inlay and a glowing mouth (legendTop, legendSide).
const gunBase = p => p.replace("!", "");
const gunSig = ports => ports.map(p => (p ? (GUN_CODE[gunBase(p)] || "s") + (p.endsWith("!") ? "!" : "") : "-")).join("");
const GA_ART_NAME = new Map();   // SHIP_ART entry -> its name: asked for every ship on screen each frame, and SHIP_ART never changes
const artNameOf = a => {
  let n = GA_ART_NAME.get(a);
  if (n === undefined) { n = Object.keys(SHIP_ART).find(k => SHIP_ART[k] === a) || "sloop"; GA_ART_NAME.set(a, n); }
  return n;
};

// ---------- layout: where each gun's muzzle sits, matching s.mounts (js/art.js) and muzzle() (js/combat.js) ----------
const gunLayoutCache = new Map();
function gunLayout(an, key, n) {
  const ck = `${an}:${key}:${n}`;
  if (gunLayoutCache.has(ck)) return gunLayoutCache.get(ck);
  const a = SHIP_ART[an] || SHIP_ART.sloop, out = [];
  const side = key === "left" || key === "right", span = side ? a.len * 0.48 : a.beam * 0.36, pitch = n > 1 ? span / (n - 1) : span;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : -span / 2 + span * i / (n - 1);
    if (side) {
      const sg = key === "left" ? -1 : 1, w = hullHalf(a, 0.5 + off / a.len);
      out.push({ x: off, y: sg * (w + 1.3), ang: sg * Math.PI / 2, pitch });
    } else if (key === "bow") {   // as far forward as the hull is still wide enough to carry it
      let u = 1; while (u > 0.5 && hullHalf(a, u) < Math.abs(off) + 1.6) u -= 0.01;
      out.push({ x: a.len * (u - 0.5) + 0.8, y: off, ang: 0, pitch });
    } else out.push({ x: -a.len / 2 - 1.2, y: off, ang: Math.PI, pitch });
  }
  gunLayoutCache.set(ck, out);
  return out;
}

// ---------- top view: muzzle at the origin, pointing +x, breech at -len ----------
function gunBarrel(c, len, wB, wM, col, hi) {
  c.beginPath(); c.moveTo(-len, -wB / 2); c.lineTo(0, -wM / 2); c.lineTo(0, wM / 2); c.lineTo(-len, wB / 2); c.closePath();
  c.fillStyle = col; c.fill(); c.fillStyle = hi; c.fillRect(-len, -0.35, len, 0.7);
}
function drawGunTop(c, id) {
  const { len, w } = GUN_LOOK[id] || GUN_LOOK.six;
  c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(-len - 0.4, -w / 2 + 0.7, len + 0.8, w);   // shadow on the deck
  if (id === "carronade") {   // a slide, not wheels: two rails running back from the mouth
    c.fillStyle = "#5a3b1f"; c.fillRect(-len - 1.8, -w / 2 - 0.7, len + 2.2, w + 1.4);
    c.fillStyle = "#2a1b0e"; c.fillRect(-len - 1.8, -0.35, len + 2.2, 0.7);
  } else {
    c.fillStyle = "#74502c"; c.fillRect(-len * 0.95, -w / 2 - 0.9, len * 0.62, w + 1.8);   // carriage cheeks
    c.fillStyle = "#241609"; for (const sg of [-1, 1]) { c.fillRect(-len * 0.82, sg * (w / 2 + 0.9) - 0.4, 1.3, 0.8); c.fillRect(-len * 0.45, sg * (w / 2 + 0.9) - 0.4, 1.3, 0.8); }   // truck wheels
  }
  if (id === "long12") {
    gunBarrel(c, len, w, w * 0.72, "#33363f", "#a9b2c0");
    c.fillStyle = "#d2ac4c"; c.fillRect(-1.3, -w * 0.5, 1.3, w); c.fillRect(-len * 0.55, -w * 0.5, 0.8, w);   // brass muzzle ring and a band
  } else if (id === "carronade") {
    c.beginPath(); c.moveTo(-len, -w / 2); c.lineTo(-1.4, -w / 2); c.lineTo(0, -w * 0.62); c.lineTo(0, w * 0.62); c.lineTo(-1.4, w / 2); c.lineTo(-len, w / 2); c.closePath();   // a flared mouth
    c.fillStyle = "#1d2430"; c.fill(); c.fillStyle = "#566a86"; c.fillRect(-len, -0.4, len, 0.8);
    c.fillStyle = "#c4963c"; c.beginPath(); c.arc(-len * 0.45, 0, 0.95, 0, TAU); c.fill();   // the brass lug
  } else if (id === "chain") {
    gunBarrel(c, len, w, w * 0.8, "#6a4535", "#b98a6a");
    c.strokeStyle = "#d6dbe2"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(1.2, -1.5); c.lineTo(1.2, 1.5); c.stroke();   // the dumbbell of chain shot
    c.fillStyle = "#e6eaf0"; c.beginPath(); c.arc(1.2, -1.5, 0.95, 0, TAU); c.arc(1.2, 1.5, 0.95, 0, TAU); c.fill();
  } else if (id === "fire") {
    gunBarrel(c, len, w, w * 0.8, "#b3592a", "#f0a05a");
    c.fillStyle = "#7a2410"; c.fillRect(-len * 0.5, -w * 0.5, 0.8, w);
    const g = c.createRadialGradient(0.4, 0, 0, 0.4, 0, 2.6); g.addColorStop(0, "rgba(255,236,150,1)"); g.addColorStop(0.5, "rgba(255,138,42,.85)"); g.addColorStop(1, "rgba(255,90,20,0)");
    c.fillStyle = g; c.fillRect(-2.4, -2.8, 5.4, 5.6);   // a glowing mouth
  } else {
    gunBarrel(c, len, w, w * 0.78, "#2b2c31", "#6a6d78");
    c.fillStyle = "#17171a"; c.fillRect(-1.1, -w * 0.46, 1.1, w * 0.92);
  }
  c.fillStyle = "#17171a"; c.beginPath(); c.arc(-len - 0.3, 0, 0.7, 0, TAU); c.fill();   // cascabel
}
function legendTop(c, id) {   // gold bands and a glowing mouth over the top view
  const { len, w } = GUN_LOOK[id] || GUN_LOOK.six;
  c.fillStyle = "#ffd36a"; c.fillRect(-len * 0.72, -w * 0.5 - 0.3, 0.9, w + 0.6); c.fillRect(-len * 0.34, -w * 0.5 - 0.3, 0.9, w + 0.6);
  const g = c.createRadialGradient(0.6, 0, 0, 0.6, 0, 3); g.addColorStop(0, "rgba(255,230,150,.95)"); g.addColorStop(1, "rgba(255,120,30,0)");
  c.fillStyle = g; c.fillRect(-2.4, -3, 6, 6);
}
// One mount's guns, merged: `ports` = a gun id or null per port, in port order. Hull centre at (cx, cy).
function drawGunsOn(c, an, cx, cy, key, ports) {
  const lay = gunLayout(an, key, ports.length);
  ports.forEach((tag, i) => {
    if (!tag) return;
    const id = gunBase(tag), p = lay[i], L = GUN_LOOK[id] || GUN_LOOK.six, sc = ports.length > 1 ? clamp(p.pitch / (L.w * 1.3), 0.6, 1) : 1;   // crowded decks squeeze the guns, not the gaps
    c.save(); c.translate(cx + p.x, cy + p.y); c.rotate(p.ang); c.scale(sc, sc); drawGunTop(c, id); if (tag.endsWith("!")) legendTop(c, id); c.restore();
  });
}

// ---------- side view: muzzle to the right, 76 x 36 px ----------
function drawGunSide(c, id) {
  const wheel = x => { c.fillStyle = "#74502c"; c.beginPath(); c.arc(x, 28, 5, 0, TAU); c.fill(); c.lineWidth = 1; c.strokeStyle = "#14100c"; c.stroke(); c.fillStyle = "#2a1b0e"; c.beginPath(); c.arc(x, 28, 1.6, 0, TAU); c.fill(); };
  const tube = (x0, x1, yc, h0, h1, col, hi) => {
    c.beginPath(); c.moveTo(x0, yc - h0 / 2); c.lineTo(x1, yc - h1 / 2); c.lineTo(x1, yc + h1 / 2); c.lineTo(x0, yc + h0 / 2); c.closePath();
    c.fillStyle = col; c.fill(); c.lineWidth = 1; c.strokeStyle = "#14100c"; c.stroke(); c.fillStyle = hi; c.fillRect(x0 + 2, yc - h0 / 2 + 1.4, x1 - x0 - 3, 1.5);
  };
  c.lineJoin = "round";
  if (id === "carronade") {
    c.fillStyle = "#5a3b1f"; c.fillRect(6, 27, 52, 6); c.strokeStyle = "#14100c"; c.lineWidth = 1; c.strokeRect(6.5, 27.5, 51, 5);   // the slide
    c.fillStyle = "#74502c"; c.fillRect(14, 22, 30, 6); c.strokeRect(14.5, 22.5, 29, 5);
    tube(14, 56, 15, 15, 13, "#1d2430", "#566a86");
    c.fillStyle = "#1d2430"; c.fillRect(54, 6, 5, 18); c.strokeRect(54.5, 6.5, 4, 17);   // the flared mouth
    c.fillStyle = "#c4963c"; c.beginPath(); c.arc(30, 8, 2.2, 0, TAU); c.fill();
    return;
  }
  c.fillStyle = "#74502c"; c.beginPath(); c.moveTo(8, 20); c.lineTo(46, 20); c.lineTo(46, 26); c.lineTo(36, 26); c.lineTo(36, 30); c.lineTo(8, 30); c.closePath(); c.fill(); c.lineWidth = 1; c.strokeStyle = "#14100c"; c.stroke();   // the carriage
  wheel(14); wheel(38);
  if (id === "long12") {
    tube(4, 68, 15, 10, 6.5, "#33363f", "#a9b2c0");
    c.fillStyle = "#d2ac4c"; c.fillRect(64, 10.6, 5, 8.8); c.fillRect(28, 11.5, 2.5, 7);
  } else if (id === "chain") {
    tube(5, 58, 15, 12, 8, "#6a4535", "#b98a6a");
    c.strokeStyle = "#d6dbe2"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(64, 5); c.lineTo(64, 25); c.stroke();
    c.fillStyle = "#e6eaf0"; c.strokeStyle = "#14100c"; c.lineWidth = 1; for (const y of [5, 25]) { c.beginPath(); c.arc(64, y, 4, 0, TAU); c.fill(); c.stroke(); }
  } else if (id === "fire") {
    tube(5, 58, 15, 12, 8.5, "#b3592a", "#f0a05a");
    c.fillStyle = "#7a2410"; c.fillRect(26, 9, 2.5, 12);
    c.fillStyle = "#ff8a2a"; c.beginPath(); c.moveTo(58, 9); c.quadraticCurveTo(66, 2, 74, 14); c.quadraticCurveTo(66, 24, 58, 21); c.closePath(); c.fill();
    c.fillStyle = "#ffe08a"; c.beginPath(); c.moveTo(58, 12); c.quadraticCurveTo(64, 8, 69, 15); c.quadraticCurveTo(64, 20, 58, 18); c.closePath(); c.fill();
  } else {
    tube(5, 60, 15, 11, 7.5, "#2b2c31", "#6a6d78");
    c.fillStyle = "#17171a"; c.fillRect(57, 11, 4, 8);
  }
  c.fillStyle = "#17171a"; c.beginPath(); c.arc(4, 15, 2.2, 0, TAU); c.fill();   // cascabel
}
function legendSide(c) {   // gold inlay bands across the barrel, a glint at the mouth, a gilt cascabel
  c.fillStyle = "#ffd36a"; c.strokeStyle = "#14100c"; c.lineWidth = 0.8;
  for (const x of [16, 30, 44]) { c.fillRect(x, 9, 2.6, 12); c.strokeRect(x + 0.4, 9.4, 1.8, 11.2); }
  c.beginPath(); c.arc(4, 15, 2.2, 0, TAU); c.fill(); c.stroke();
  const g = c.createRadialGradient(70, 15, 0, 70, 15, 9); g.addColorStop(0, "rgba(255,236,160,.95)"); g.addColorStop(1, "rgba(255,130,40,0)");
  c.fillStyle = g; c.fillRect(60, 5, 16, 20);
}
const gunSideCache = {};
function gunSideUrl(id) {
  if (gunSideCache[id]) return gunSideCache[id];
  const cv = document.createElement("canvas"), res = 2; cv.width = 76 * res; cv.height = 36 * res;
  const c = cv.getContext("2d"), base = gunBase(id); c.scale(res, res); drawGunSide(c, GUN_LOOK[base] ? base : "six"); if (id.endsWith("!")) legendSide(c);
  return (gunSideCache[id] = cv.toDataURL("image/png"));
}
const gunSideImg = (id, cls = "") => `<img class="gsv ${cls}" alt="" aria-hidden="true" width="76" height="36" src="${gunSideUrl(id)}">`;

// ---------- on the sea: guns laid over the hull sprite ----------
// At rest a ship carries ONE extra sprite: all its guns merged (st.all). The moment a mount fires, that sprite gives way to one
// sprite per mount (st.img, made the first time they are needed), so the firing side can kick back on its own; they swap back once
// the recoil has settled.
const gaShips = new Set(), gaTex = new Map(), gaFlash = [], gaPool = [];   // ships with layers; texture key -> last use; live and spare flashes
const GA_MOUNTS = ["bow", "left", "right", "stern"];
const gaAng = { bow: 0, left: -Math.PI / 2, right: Math.PI / 2, stern: Math.PI };
// what each port of a mount holds: the player's from the save (so a swap shows at once), an AI ship's from its guns (js/archetypes.js)
function gaPorts(s, key) {
  if (s.isPlayer) return (save[key] || []).map(g => (g ? g.g + (g.lg ? "!" : "") : null));
  return ((s.guns && s.guns[key]) || []).map(g => g.gt || "six");
}
const gaSize = an => { const a = SHIP_ART[an] || SHIP_ART.sloop; return { w: Math.ceil(a.len + 16), h: Math.ceil(a.beam + 16) }; };
// the baked texture for `mounts` ({ key: ports }), made on first use; the same loadout on any ship shares it
function gaTexture(sc, an, res, tag, mounts) {
  const tk = `gunlayer:${an}:${res}:${tag}:${GA_MOUNTS.map(k => (mounts[k] ? gunSig(mounts[k]) : "")).join("|")}`;
  gaTex.delete(tk); gaTex.set(tk, 1);   // most recently used last
  if (sc.textures.exists(tk)) return tk;
  const { w, h } = gaSize(an);
  return bakeCanvas(sc, tk, w, h, res, c => { for (const k in mounts) drawGunsOn(c, an, w / 2, h / 2, k, mounts[k]); });
}
function gaEvict(sc) {   // a captain who keeps rearranging a 30-gun deck bakes many textures: drop the oldest ones no sprite shows
  if (gaTex.size <= GUN_TEX_CAP) return;
  const used = new Set();
  for (const s of gaShips) { used.add(s.gl.all.texture.key); for (const k in s.gl.img) used.add(s.gl.img[k].texture.key); }
  for (const tk of [...gaTex.keys()]) {
    if (gaTex.size <= GUN_TEX_CAP) break;
    if (!used.has(tk)) { gaTex.delete(tk); if (sc.textures.exists(tk)) sc.textures.remove(tk); }
  }
}
function gaDrop(s) {
  if (s.gl) { s.gl.all.destroy(); for (const k in s.gl.img) s.gl.img[k].destroy(); }
  s.gl = null; gaShips.delete(s);
}
function gaBuild(s, an, res, sig) {
  if (s.gl) gaDrop(s);
  const mounts = {};
  for (const key of GA_MOUNTS) { const ports = gaPorts(s, key); if (ports.some(Boolean)) mounts[key] = ports; }
  const depth = s.spr.depth + 0.05;
  const st = s.gl = { sig, src: s.guns, an, res, mounts, img: {}, kick: {}, shown: true, depth,
    all: S.add.image(0, 0, gaTexture(S, an, res, "all", mounts)).setDepth(depth) };
  gaShips.add(s); gaEvict(S);
  return st;
}
function gaMountImg(st, key) {
  return st.img[key] || (st.img[key] = S.add.image(0, 0, gaTexture(S, st.an, st.res, key, { [key]: st.mounts[key] })).setDepth(st.depth).setVisible(false));
}
function gaPose(im, sp, dx, dy, tintKey, tintCol) {   // the hull sprite's pose, tint and fade, plus a recoil offset
  im.setVisible(true); im.x = sp.x + dx; im.y = sp.y + dy; im.rotation = sp.rotation; im.scaleX = sp.scaleX; im.scaleY = sp.scaleY; im.alpha = sp.alpha;
  if (im.gaTint !== tintKey) { im.gaTint = tintKey; if (tintCol < 0) im.clearTint(); else if (sp.tintFill) im.setTintFill(tintCol); else im.setTint(tintCol); }
}
function gaSync(s, dt) {
  const sp = s.spr;
  if (!sp || !sp.active || s.fixed || !s.art || !s.guns) { if (s.gl) gaDrop(s); return; }
  let st = s.gl;
  if (!sp.visible || sp.alpha < 0.02 || !onScreen(sp.x, sp.y, 110)) {
    if (st && st.shown) { st.all.setVisible(false); for (const k in st.img) st.img[k].setVisible(false); st.shown = false; }
    return;
  }
  const an = artNameOf(s.art), res = Math.max(1, Math.round(1 / (s.artScale || 1)));
  // the player's loadout changes in the harbor without a new guns object, so it is compared by its text; an AI ship's guns object is replaced when it is outfitted
  const sig = an + res + (s.isPlayer ? GA_MOUNTS.map(k => gunSig(gaPorts(s, k))).join("|") : "");
  if (!st || st.sig !== sig || (!s.isPlayer && st.src !== s.guns)) st = gaBuild(s, an, res, sig);
  st.shown = true;
  const tintCol = sp.isTinted ? sp.tintTopLeft : -1, tintKey = tintCol + (sp.tintFill ? "f" : "");
  let kicking = false;
  for (const key in st.kick) { const v = st.kick[key] = Math.max(0, st.kick[key] - dt * GUN_RECOIL_DECAY); if (v > 0) kicking = true; }
  if (!kicking) {
    gaPose(st.all, sp, 0, 0, tintKey, tintCol);
    for (const k in st.img) st.img[k].setVisible(false);
  } else {
    st.all.setVisible(false);
    for (const key in st.mounts) {
      const d = -(st.kick[key] || 0) * GUN_RECOIL_PX, ang = sp.rotation + gaAng[key];
      gaPose(gaMountImg(st, key), sp, Math.cos(ang) * d, Math.sin(ang) * d, tintKey, tintCol);
    }
  }
}

// ---------- firing: recoil and a flash at the muzzle ----------
function gunTipWorld(s, key, i, n) {
  const p = gunLayout(artNameOf(s.art), key, n)[i];
  if (!p) return null;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  return { x: s.x + c * p.x - sn * p.y, y: s.y + sn * p.x + c * p.y, a: s.rot + p.ang };
}
function gunFired(s, key, i, n) {
  if (!s.gl || s.fixed || !s.art || !onScreen(s.x, s.y, 110)) return;
  s.gl.kick[key] = 1;
  const p = gunTipWorld(s, key, i, n);
  if (!p) return;
  let f = gaPool.pop();
  if (!f) { if (gaFlash.length >= GUN_FLASH_MAX) return; f = { img: S.add.image(0, 0, "gun-flash").setDepth(7.5).setBlendMode(Phaser.BlendModes.ADD), age: 0, k: 1 }; }
  f.age = 0; f.k = rand(0.8, 1.15) * (s.isPlayer ? 1.1 : 1);
  f.img.setPosition(p.x + Math.cos(p.a) * 2.5, p.y + Math.sin(p.a) * 2.5).setRotation(p.a).setVisible(true);
  gaFlash.push(f);
}
onHook("ready", () => bakeCanvas(S, "gun-flash", 40, 24, 1, c => {   // a hot teardrop along +x: white core, orange body
  const g = c.createRadialGradient(6, 12, 0, 6, 12, 18); g.addColorStop(0, "rgba(255,255,235,1)"); g.addColorStop(0.3, "rgba(255,206,110,.9)"); g.addColorStop(1, "rgba(255,120,30,0)");
  c.save(); c.translate(0, 12); c.scale(1, 0.55); c.translate(0, -12); c.fillStyle = g; c.fillRect(0, 0, 40, 24); c.restore();
}));
onHook("frame", dt => {
  if (!S || !player || !player.spr) return;
  gaSync(player, dt); for (const e of enemies) gaSync(e, dt);
  for (const s of [...gaShips]) if (!s.spr || !s.spr.active) gaDrop(s);   // sunk and gone, or the sea was cleared
  for (let i = gaFlash.length - 1; i >= 0; i--) {
    const f = gaFlash[i]; f.age += dt;
    if (f.age >= GUN_FLASH_S) { f.img.setVisible(false); gaPool.push(f); gaFlash.splice(i, 1); continue; }
    const u = f.age / GUN_FLASH_S; f.img.setScale(f.k * (0.7 + 0.7 * u)).setAlpha(1 - u * u);
  }
});
