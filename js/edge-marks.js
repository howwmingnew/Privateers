"use strict";
// ---------- Edge markers: ships, harbor and outpost that are off-screen but near, with their distance ----------
// A small box on the screen edge, toward the target, with the chart's own mark for it (js/mini-marks.js) and "about N m".
// Enemy ships carry their threat shape, the bounty is a larger skull, harbor and outpost their chart marks. At most EDGE_MAX
// at once (the bounty, then the most dangerous, then the nearest); boxes on one edge are spread so they never overlap, and they
// stay below the HUD strip and clear of the boss bar and the controls hint. A box fades out as its target sails into view.
// The page layer sits on <body>, so photo mode (css/photo.css) hides it with every other overlay. The UI size slider scales it
// through --ts, like the HUD (js/options.js); the big-screen zoom of the HUD is repeated in css/campaign.css as --ez.

const EDGE_TICK = 0.05, EDGE_FADE_MS = 280, EDGE_HYST = 24;   // s between updates; fade-out time; px a target must be inside before its box goes
const EDGE_BADGE_X = 34, EDGE_BADGE_Y = 44;   // px a ship's level badge reaches past its hull: sideways, and up (so below the bottom edge)
const edgeLayer = document.createElement("div");
edgeLayer.id = "edgeMarks"; edgeLayer.setAttribute("aria-hidden", "true"); edgeLayer.hidden = true;
document.body.append(edgeLayer);
const edgeEls = new Map();   // target -> { el, ic, d, key, w, h, sk (its edgeSize key), look }
let edgeT = 0, edgeShowsBoss = false;
// made once and read live (.matches); the first two are css/campaign.css's --ez breakpoints, word for word
const EDGE_MQ_XL = matchMedia("(min-width: 2400px) and (min-height: 1300px)"), EDGE_MQ_L = matchMedia("(min-width: 1500px) and (min-height: 900px)"), EDGE_MQ_COARSE = matchMedia("(pointer: coarse)");
const edgeScale = () => uiScale() * (EDGE_MQ_XL.matches ? 1.5 : EDGE_MQ_L.matches ? 1.25 : 1);
// A box's size follows only its style (boss or not), the scale and its text, so each one is measured once: reading
// offsetWidth after a write makes the browser lay out the page there and then. Cleared when the language or a font changes.
const edgeSize = new Map();   // style + z + "|" + text -> { w, h }

function edgeIcon(ic, it) {
  const c = ic.getContext("2d"), u = 2.3;
  c.clearRect(0, 0, ic.width, ic.height);
  if (it.kind === "hazard") disGlyph(c, it.hz.kind, 22, 22, u * 1.25);   // a disaster (js/disasters-art.js)
  else if (it.boss) {
    c.fillStyle = "#1b1410"; c.beginPath(); c.arc(22, 22, 17, 0, TAU); c.fill(); c.strokeStyle = MINI_GOLD; c.lineWidth = 2.4; c.stroke(); drawSkull(c, 22, 23, 12);
  } else if (it.place === "harbor") miniHarbor(c, 22, 22, u);
  else if (it.place === "outpost") miniOutpost(c, 22, 22, u * 1.2);
  else if (it.place === "supply" || it.place === "trade") miniStation(c, it.place, 22, 22, u * 1.2);
  else miniShip(c, it.e, 22, 22, u * 1.2);
}
function edgeBox(it) {
  const el = document.createElement("div");
  el.className = "em" + (it.boss ? " boss" : it.ally ? " ally" : ""); el.dataset.kind = it.boss ? "boss" : it.ally ? "ally" : it.place || (it.hz ? "hazard" : "ship");
  el.innerHTML = `<canvas width="44" height="44"></canvas><span></span><i class="ptr"></i>`;
  edgeLayer.append(el);
  return { el, ic: el.firstElementChild, txt: el.children[1], ptr: el.lastElementChild, key: "", label: "", w: 0, h: 0, sk: "", look: it.boss ? "b" : "s" };
}
// Every target that could get a box right now, with its screen position (css px) and distance (world px).
const edgeHitBy = o => typeof hitMarks !== "undefined" && hitMarks.some(h => h.src === o);   // a shooter that just hit you (js/notices.js)
function edgeCandidates(v, kx, ky) {
  const out = [], reach = EDGE_RANGE * gearMul("view") * v.width, me = shipRating();   // one rating for every ship's threat
  const add = (o, it) => {
    const px = Math.hypot(o.x - player.x, o.y - player.y);
    if ((px > reach && !it.far) || px < 1) return;   // far: the harbor's box has no range limit (the "Arrow to Safe Harbor" setting)
    if (it.far && px > reach) it = { ...it, home: true };   // beyond the usual range it always gets a box (edgePick)
    if (it.boss) it = { ...it, risky: edgeRisky(it.e.threatL ?? it.e.L, seaLowLv(seaOfRing(ringAt(dist(o, PORT))).id), me) };   // the skull warns about the water it points into
    out.push({ ...it, o, px, sx: (o.x - v.x) * kx, sy: (o.y - v.y) * ky });
  };
  for (const e of enemies) if (e.alive && !e.fixed && (e.ally || !(typeof disFogHides === "function" && disFogHides(e)))) add(e, { kind: "ship", e, boss: !!e.boss, ally: !!e.ally, d: e.ally ? 0 : threatTier(e.threatL ?? e.L, me).d, atk: edgeHitBy(e) });   // an escort that has dropped out of sight keeps a mint box, fog or not
  if (typeof disMarks === "function") for (const h of disMarks()) add(h, { kind: "hazard", hz: h, d: 2 });   // warning or running disasters (js/disasters.js)
  if (portsOff()) return out;   // the daily sea has no harbor or stations (js/ports.js)
  add(PORT, { kind: "place", place: "harbor", d: 0, far: SETTINGS.homeArrow !== false });   // the way home is shown from anywhere on the chart, unless switched off
  if (save.campaign.outpost) add(OUTPOST, { kind: "place", place: "outpost", d: 0 });
  for (const st of STATIONS) add(st, { kind: "place", place: st.kind, d: 0 });   // supply stations and trade ports (js/ports.js)
  return out;
}
function edgeHidden() { return !player || !player.alive || paused || docked || titleOpen || (typeof photoOn === "function" && photoOn()) || (typeof chartLite === "function" && chartLite()); }
let edgeKeep = { top: 0, bottom: [] }, edgeKeepT = 0;
function readEdgeKeepouts(dt) {   // the HUD strip (as one top limit) and the boss bar / hint / sail and ability buttons (blocked spans along the bottom edge); read a few times a second
  if ((edgeKeepT -= dt) > 0) return edgeKeep;
  edgeKeepT = 0.4;
  const box = el => el && !el.hidden && el.getBoundingClientRect().width > 0 ? el.getBoundingClientRect() : null;
  // the sea banner, the sale tally and the tutorial card (when it hops to the top) land in the strip the top boxes use: while one shows, the boxes sit below it
  const over = ["seaBanner", "tally", "coach"].map(id => document.getElementById(id)).filter(el => el && !el.hidden && el.classList.contains(el.id === "coach" ? "up" : "on"))
    .map(el => el.getBoundingClientRect()).filter(r => r.width > 0).map(r => r.bottom);
  const top = Math.max(0, ...over, ...[...document.querySelectorAll("#hud .side, #hud .bars")].map(el => el.getBoundingClientRect().bottom));
  return (edgeKeep = { top, bottom: ["bossBar", "hint", "touchSail", "abilityBtn"].map(id => box(document.getElementById(id))).filter(Boolean).map(r => [r.left, r.right]) });
}
function onScreenPlates(v, kx, ky) {   // each shown enemy plate as a css-px rect (origin 0.5, js/ships.js)
  const out = [];
  for (const e of enemies) {
    const b = e.badge;
    if (!e.alive || !b || !b.visible || b.alpha < 0.5) continue;
    const w = b.displayWidth * kx, h = b.displayHeight * kx, x = (b.x - v.x) * kx, y = (b.y - v.y) * ky;
    out.push({ l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 });
  }
  return out;
}
function updateEdgeMarks(dt) {
  if (edgeHidden()) { edgeLayer.hidden = true; edgeShowsBoss = false; for (const [, m] of edgeEls) m.el.remove(); edgeEls.clear(); return; }
  edgeLayer.hidden = false;
  const v = S.cameras.main.worldView, w = VIEW.cssW, h = VIEW.cssH, kx = w / v.width, ky = h / v.height, z = edgeScale();
  // a ship's level badge rides 36 px above its hull and ~30 px to each side, so a ship is "off screen" only once its badge is too: a box never lands on a badge
  const bx = it => (it.kind === "ship" ? EDGE_BADGE_X * kx : 0), by = it => (it.kind === "ship" ? EDGE_BADGE_Y * ky : 0);
  const away = it => it.sx < -bx(it) || it.sx > w + bx(it) || it.sy < 0 || it.sy - by(it) > h;
  const inside = it => it.sx > EDGE_HYST - bx(it) && it.sx < w - EDGE_HYST + bx(it) && it.sy > EDGE_HYST && it.sy - by(it) < h - EDGE_HYST;
  const cands = edgeCandidates(v, kx, ky).filter(it => (edgeEls.has(it.o) ? !inside(it) : away(it)));   // a shown box stays until the target is well inside
  const picked = edgePick(cands, edgeMax(EDGE_MQ_COARSE.matches, w));
  edgeShowsBoss = picked.some(it => it.boss);
  const keep = readEdgeKeepouts(dt), pad = 16 * z, boxH = 30 * z,   // pad: room for a box's pointer between it and the screen edge
     inset = { l: pad, r: w - pad, t: Math.max(keep.top + pad, 56 * z), b: h - pad - (EDGE_MQ_COARSE.matches ? 24 * z : 0) };
  const cx = (inset.l + inset.r) / 2, cy = (inset.t + inset.b) / 2, spots = new Map(), unsized = [];
  for (const it of picked) {
    let m = edgeEls.get(it.o);
    if (!m) { m = edgeBox(it); edgeEls.set(it.o, m); requestAnimationFrame(() => m.el.classList.add("on")); }
    m.el.classList.remove("gone"); m.it = it;
    m.el.classList.toggle("risky", !!it.risky); m.el.classList.toggle("atk", !!it.atk);   // atk: it just hit you, its box flashes (css/ledger.css)
    if (it.kind === "ship" && !it.boss && !it.ally) { const th = String(edgeThreat(it.d)); if (m.el.dataset.th !== th) m.el.dataset.th = th; }   // the box's border and pointer take the threat colour (css/campaign.css)
    const key = (it.boss ? "b" : it.place || (it.hz ? "h" + it.hz.kind : "s")) + (it.e ? it.d + (it.e.faction || "") + (it.e.arch || "") : "");
    if (key !== m.key || it.e?.arch === "fireship") { m.key = key; edgeIcon(m.ic, it); }   // a fireship's flicker needs a fresh paint
    const text = edgeLabel(it.px, it.risky), sk = m.look + z + "|" + text;
    if (text !== m.label) { m.label = text; m.txt.textContent = text; }
    if (sk !== m.sk) { m.sk = sk; const sz = edgeSize.get(sk); if (sz) { m.w = sz.w; m.h = sz.h; } else unsized.push(m); }
  }
  // measured only after every box is written, so a tick lays the page out once at most, and only for a size not seen before
  for (const m of unsized) { m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; if (m.w > 0 && m.h > 0) edgeSize.set(m.sk, { w: m.w, h: m.h }); }   // a hidden layer reads 0 x 0: never keep that
  // the box's centre travels on the rectangle shrunk by half the box, so the whole box stays on screen
  for (const it of picked) { const m = edgeEls.get(it.o); spots.set(it.o, edgePoint({ l: inset.l + m.w / 2, r: inset.r - m.w / 2, t: inset.t + m.h / 2, b: inset.b - m.h / 2 }, it.sx - cx, it.sy - cy)); }
  // one edge at a time: keep each box's own spot, spread them on that edge, slide clear of the boss bar and the hint
  // top and bottom first: the left and right edges then keep out of the corner those rows reach into, so a box near a corner never lands on its neighbour
  const plates = onScreenPlates(v, kx, ky);   // level plates in view: a box slides along its edge to clear them (#119)
  const rows = [];   // the placed top / bottom boxes: { x, y, hw, hh }
  for (const side of ["top", "bottom", "left", "right"]) {
    const group = picked.filter(it => spots.get(it.o).side === side);
    if (!group.length) continue;
    const vert = side === "left" || side === "right", axis = vert ? "y" : "x";
    let lo = vert ? inset.t : inset.l, hi = vert ? inset.b : inset.r;
    if (vert) {   // a side box whose column a row box reaches into starts below (or ends above) that row box
      const sx = spots.get(group[0].o).x, hw = Math.max(...group.map(it => edgeEls.get(it.o).w)) / 2;
      for (const r of rows) if (Math.abs(r.x - sx) < r.hw + hw + 2 * z) { if (r.y < cy) lo = Math.max(lo, r.y + r.hh + 4 * z); else hi = Math.min(hi, r.y - r.hh - 4 * z); }
    }
    const half = group.map(it => (vert ? edgeEls.get(it.o).h : edgeEls.get(it.o).w) / 2), gap = Math.max(boxH, ...half.map(x => x * 2)) * 1.08;
    const along = spreadAlong(group.map(it => spots.get(it.o)[axis]), gap, lo + Math.max(...half), hi - Math.max(...half));
    const thick = Math.max(...group.map(it => edgeEls.get(it.o)[vert ? "w" : "h"])), blocked = (side === "bottom" ? keep.bottom : []).concat(plateSpans(plates, side, spots.get(group[0].o)[vert ? "x" : "y"], thick));
    group.forEach((it, i) => { spots.get(it.o)[axis] = dodgeAlong(along[i], half[i], blocked, lo + half[i], hi - half[i]); });
    if (!vert) for (const it of group) { const m = edgeEls.get(it.o), sp = spots.get(it.o); rows.push({ x: sp.x, y: sp.y, hw: m.w / 2, hh: m.h / 2 }); }
  }
  for (const [o, m] of edgeEls) {
    const spot = spots.get(o);
    if (!spot) {   // not wanted any more: fade, then drop
      if (!m.el.classList.contains("gone")) { m.el.classList.add("gone"); m.gone = setTimeout(() => { m.el.remove(); if (edgeEls.get(o) === m) edgeEls.delete(o); }, EDGE_FADE_MS); }
      continue;
    }
    clearTimeout(m.gone);
    const a = Math.atan2(m.it.sy - spot.y, m.it.sx - spot.x), hw = m.w / 2, hh = m.h / 2;
    const r = Math.min(hw / Math.max(Math.abs(Math.cos(a)), 1e-6), hh / Math.max(Math.abs(Math.sin(a)), 1e-6)) + 5 * z;   // from the box centre to just past its rim
    m.el.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -50%)`;
    m.ptr.style.transform = `translate(-50%, -50%) rotate(${a.toFixed(3)}rad) translateX(${r.toFixed(1)}px)`;
    m.el.dataset.edge = spot.side;
  }
}
onHook("frame", dt => { if ((edgeT -= dt) <= 0) { updateEdgeMarks(EDGE_TICK + -edgeT); edgeT = EDGE_TICK; } });
onHook("lang", () => { edgeSize.clear(); for (const [, m] of edgeEls) m.label = m.sk = ""; });
// boot waits for the fonts 1.5 s at most (js/main.js), so a box measured in a fallback font is measured again once the real one is in
document.fonts?.addEventListener?.("loadingdone", () => { edgeSize.clear(); for (const [, m] of edgeEls) m.sk = ""; });
