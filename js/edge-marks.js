"use strict";
// ---------- Edge markers: ships, harbor and outpost that are off-screen but near, with their distance ----------
// A small box on the screen edge, toward the target, with the chart's own mark for it (js/mini-marks.js) and "about N m".
// Enemy ships carry their threat shape, the bounty is a larger skull, harbor and outpost their chart marks. At most EDGE_MAX
// at once (the bounty, then the most dangerous, then the nearest); boxes on one edge are spread so they never overlap, and they
// stay below the HUD strip and clear of the boss bar and the controls hint. A box fades out as its target sails into view.
// The page layer sits on <body>, so photo mode (css/photo.css) hides it with every other overlay. The UI size slider scales it
// through --ts, like the HUD (js/options.js); the big-screen zoom of the HUD is repeated in css/campaign.css as --ez.

const EDGE_TICK = 0.05, EDGE_FADE_MS = 280, EDGE_HYST = 24;   // s between updates; fade-out time; px a target must be inside before its box goes
const edgeLayer = document.createElement("div");
edgeLayer.id = "edgeMarks"; edgeLayer.setAttribute("aria-hidden", "true"); edgeLayer.hidden = true;
document.body.append(edgeLayer);
const edgeEls = new Map();   // target -> { el, ic, d, key, w, h }
let edgeT = 0, edgeShowsBoss = false;
const edgeScale = () => uiScale() * (matchMedia("(min-width: 2400px) and (min-height: 1300px)").matches ? 1.5 : matchMedia("(min-width: 1500px) and (min-height: 900px)").matches ? 1.25 : 1);

function edgeIcon(ic, it) {
  const c = ic.getContext("2d"), u = 2.3;
  c.clearRect(0, 0, ic.width, ic.height);
  if (it.boss) {
    c.fillStyle = "#1b1410"; c.beginPath(); c.arc(22, 22, 17, 0, TAU); c.fill(); c.strokeStyle = MINI_GOLD; c.lineWidth = 2.4; c.stroke(); drawSkull(c, 22, 23, 12);
  } else if (it.place === "harbor") miniHarbor(c, 22, 22, u);
  else if (it.place === "outpost") miniOutpost(c, 22, 22, u * 1.2);
  else miniShip(c, it.e, 22, 22, u * 1.2);
}
function edgeBox(it) {
  const el = document.createElement("div");
  el.className = "em" + (it.boss ? " boss" : ""); el.dataset.kind = it.boss ? "boss" : it.place || "ship";
  el.innerHTML = `<canvas width="44" height="44"></canvas><span></span><i class="ptr"></i>`;
  edgeLayer.append(el);
  return { el, ic: el.firstElementChild, txt: el.children[1], ptr: el.lastElementChild, key: "", label: "", w: 0, h: 0 };
}
// Every target that could get a box right now, with its screen position (css px) and distance (world px).
function edgeCandidates(v, kx, ky) {
  const out = [], reach = EDGE_RANGE * v.width, me = shipRating();
  const add = (o, it) => {
    const px = Math.hypot(o.x - player.x, o.y - player.y);
    if (px > reach || px < 1) return;
    out.push({ ...it, o, px, sx: (o.x - v.x) * kx, sy: (o.y - v.y) * ky });
  };
  for (const e of enemies) if (e.alive && !e.fixed) add(e, { kind: "ship", e, boss: !!e.boss, d: threatTier(e.threatL ?? e.L).d });
  add(PORT, { kind: "place", place: "harbor", d: 0 });
  if (save.campaign.outpost) add(OUTPOST, { kind: "place", place: "outpost", d: 0 });
  return out;
}
function edgeHidden() { return !player || !player.alive || paused || docked || titleOpen || (typeof photoOn === "function" && photoOn()) || (typeof chartLite === "function" && chartLite()); }
let edgeKeep = { top: 0, bottom: [] }, edgeKeepT = 0;
function readEdgeKeepouts(dt) {   // the HUD strip (as one top limit) and the boss bar / hint (blocked spans along the bottom edge); read a few times a second
  if ((edgeKeepT -= dt) > 0) return edgeKeep;
  edgeKeepT = 0.4;
  const box = el => el && !el.hidden && el.getBoundingClientRect().width > 0 ? el.getBoundingClientRect() : null;
  const top = Math.max(0, ...[...document.querySelectorAll("#hud .side, #hud .bars")].map(el => el.getBoundingClientRect().bottom));
  return (edgeKeep = { top, bottom: ["bossBar", "hint"].map(id => box(document.getElementById(id))).filter(Boolean).map(r => [r.left, r.right]) });
}
function updateEdgeMarks(dt) {
  if (edgeHidden()) { edgeLayer.hidden = true; edgeShowsBoss = false; for (const [, m] of edgeEls) m.el.remove(); edgeEls.clear(); return; }
  edgeLayer.hidden = false;
  const v = S.cameras.main.worldView, w = VIEW.cssW, h = VIEW.cssH, kx = w / v.width, ky = h / v.height, z = edgeScale();
  const away = it => it.sx < 0 || it.sx > w || it.sy < 0 || it.sy > h;
  const inside = it => it.sx > EDGE_HYST && it.sx < w - EDGE_HYST && it.sy > EDGE_HYST && it.sy < h - EDGE_HYST;
  const cands = edgeCandidates(v, kx, ky).filter(it => (edgeEls.has(it.o) ? !inside(it) : away(it)));   // a shown box stays until the target is well inside
  const picked = edgePick(cands);
  edgeShowsBoss = picked.some(it => it.boss);
  const keep = readEdgeKeepouts(dt), pad = 16 * z, boxH = 30 * z,   // pad: room for a box's pointer between it and the screen edge
     inset = { l: pad, r: w - pad, t: Math.max(keep.top + pad, 56 * z), b: h - pad - (matchMedia("(pointer: coarse)").matches ? 24 * z : 0) };
  const cx = (inset.l + inset.r) / 2, cy = (inset.t + inset.b) / 2, spots = new Map();
  for (const it of picked) {
    let m = edgeEls.get(it.o);
    if (!m) { m = edgeBox(it); edgeEls.set(it.o, m); requestAnimationFrame(() => m.el.classList.add("on")); }
    m.el.classList.remove("gone"); m.it = it;
    const key = (it.boss ? "b" : it.place || "s") + (it.e ? it.d + (it.e.faction || "") + (it.e.arch || "") : "");
    if (key !== m.key || it.e?.arch === "fireship") { m.key = key; edgeIcon(m.ic, it); }   // a fireship's flicker needs a fresh paint
    const text = edgeLabel(it.px);
    if (text !== m.label) { m.label = text; m.txt.textContent = text; m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; }
    // the box's centre travels on the rectangle shrunk by half the box, so the whole box stays on screen
    spots.set(it.o, edgePoint({ l: inset.l + m.w / 2, r: inset.r - m.w / 2, t: inset.t + m.h / 2, b: inset.b - m.h / 2 }, it.sx - cx, it.sy - cy));
  }
  // one edge at a time: keep each box's own spot, spread them on that edge, slide clear of the boss bar and the hint
  for (const side of ["left", "right", "top", "bottom"]) {
    const group = picked.filter(it => spots.get(it.o).side === side);
    if (!group.length) continue;
    const vert = side === "left" || side === "right", axis = vert ? "y" : "x", lo = vert ? inset.t : inset.l, hi = vert ? inset.b : inset.r;
    const half = group.map(it => (vert ? edgeEls.get(it.o).h : edgeEls.get(it.o).w) / 2), gap = Math.max(boxH, ...half.map(x => x * 2)) * 1.08;
    const along = spreadAlong(group.map(it => spots.get(it.o)[axis]), gap, lo + Math.max(...half), hi - Math.max(...half));
    group.forEach((it, i) => { spots.get(it.o)[axis] = side === "bottom" ? dodgeAlong(along[i], half[i], keep.bottom, lo + half[i], hi - half[i]) : along[i]; });
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
onHook("lang", () => { for (const [, m] of edgeEls) m.label = ""; });
