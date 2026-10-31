"use strict";
// ---------- Keep the bottom notices off each other on a small screen (#107) ----------
// The boss's hull bar, the first-voyage coach card, the achievement card and the share / postcard / replay chips all float over the bottom of the
// sea, and the touch sail pad (js/touch-sail.js) owns the bottom-right corner. Each has its own fixed spot (css/campaign.css, menu.css, photo.css,
// share.css), which is fine on a desktop but put them on top of each other on a phone: the boss bar over the − / + buttons, the card over the bar.
// A few times a second each visible one is measured at its own spot and, when it would sit on the pad or on one already placed (in the order below,
// the first has the last word), pushed up just clear of it. A wide screen rarely needs it (the notices are centred, the controls in the corner), but
// a large phone in landscape or a big UI size can (#160). On a big screen the overlays are CSS-zoomed (css/style.css): the lift is converted to the
// element's own px, as laneTick does.
// The controls (STACK_FIXED) never move for a notice: the captain's ability button picks its own spot among the fixed HUD first (the "hudPlace" hook,
// js/abilities.js, at every width), and the notices then stack clear of it as they do of the sail pad (#160). The hint line and the way-home chip
// (js/safety-hints.js) stay put too: a big UI size put the boss bar over the hint and the achievement card over the chip (#164).
const STACK_GAP = 8;
const STACK_ORDER = ["bossBar", "coach", "achToast", "postcardChip", "shareChip", "replayChip"];
const STACK_FIXED = ["touchSail", "abilityBtn", "hint", "homeChip"];   // the controls (they take input), the hint line and the way home: the notices give way to them
const STACK_KEEP = ["bossBar", "coach"];   // these always show; the chips after them hide when pushing them up would leave the screen
let stackT = 0, stackMoved = [];
// Pure: the lift that keeps a box whose top edge is at `top` inside the screen (a margin of STACK_GAP).
const stackFit = (lift, top) => Math.max(0, Math.min(lift, top - STACK_GAP));
const stackHit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
// Pure: how far up (px) a box must go to clear every box in `placed`; the boxes are { left, right, top, bottom } in screen px.
function stackLift(box, placed) {
  let b = { ...box }, lift = 0;
  for (let n = 0; n <= placed.length; n++) {
    const hit = placed.find(p => stackHit(b, p));
    if (!hit) break;
    const d = b.bottom - hit.top + STACK_GAP;
    lift += d; b = { ...b, top: b.top - d, bottom: b.bottom - d };
  }
  return lift;
}
const stackShown = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).opacity !== "0" && !(el.id === "coach" && (el.classList.contains("up") || el.classList.contains("in-sheet")));
function stackTick() {
  for (const el of stackMoved) { el.style.removeProperty("bottom"); el.style.removeProperty("visibility"); }   // back to the stylesheet's own spot, then measured there
  stackMoved = [];
  runHook("hudPlace");   // the controls first, measured with every notice back at its own spot
  if (docked || titleOpen) return;
  const els = STACK_ORDER.map(id => document.getElementById(id)).filter(stackShown);
  if (!els.length) return;
  const placed = STACK_FIXED.map(id => document.getElementById(id)).filter(stackShown).map(el => el.getBoundingClientRect());
  for (const el of els) {
    const r = el.getBoundingClientRect(), box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, want = stackLift(box, placed);
    const lift = stackFit(want, box.top);   // never pushed off the top of the screen
    const k = el.offsetHeight ? r.height / el.offsetHeight : 1;   // CSS zoom: style.bottom is in the element's own px
    if (lift > 0) { el.style.bottom = (parseFloat(getComputedStyle(el).bottom) + lift / (k || 1)) + "px"; stackMoved.push(el); }
    if (lift < want && !STACK_KEEP.includes(el.id)) { el.style.visibility = "hidden"; if (!stackMoved.includes(el)) stackMoved.push(el); continue; }   // no room: the minor chips give way
    placed.push({ ...box, top: box.top - lift, bottom: box.bottom - lift });
  }
}
onHook("frame", dt => { if ((stackT -= dt) > 0) return; stackT = 0.15; stackTick(); laneTick(); });

// ---------- The top lane keeps clear of the ship and the tutorial card (#118) ----------
// The toast, the sea banner and the Ship Lv / boss cards (.jbanner) sit in the upper half; a tall one (a two-line explanation, a big boss name) could reach down
// onto the captain's own ship in the middle of the screen, or onto the tutorial card when it hops to the top (#coach.up). Every 0.15 s each one showing is
// measured at its stylesheet spot: when it meets the ship or the card it is lifted clear (never above LANE_TOP px), and when there is no room to lift it
// shrinks (.lane-compact, css/notify.css: smaller type, the sub-line gone). The ship's box is the hull plus its level badge, in world px * the view scale.
const LANE_IDS = ["toast", "seaBanner", "lvBanner", "bossCard"], LANE_TOP = 6, LANE_SHIP = { w: 46, up: 54, down: 40 }, LANE_HOLD_MS = 8000;
let laneMoved = [], laneHoldMs = 0;   // laneHoldMs: how long a tip has been held back for want of room (it shows anyway after LANE_HOLD_MS)
// Pure: the top (px) a box wants to sit at to clear `obst`, or null when no lift fits above `minTop`. box: { left, right, top, bottom }.
function laneTop(box, obst, minTop = LANE_TOP) {
  const lift = stackLift(box, obst);
  return lift <= 0 ? box.top : box.top - lift >= minTop ? box.top - lift : null;
}
// Pure: the top (px) just below every box in `obst` that `box` meets, or null when that would run past `maxBottom` (a short screen).
function laneDrop(box, obst, maxBottom) {
  let b = { ...box };
  for (let n = 0; n <= obst.length; n++) {
    const hit = obst.find(o => stackHit(b, o));
    if (!hit) break;
    const h = b.bottom - b.top; b = { ...b, top: hit.bottom + STACK_GAP, bottom: hit.bottom + STACK_GAP + h };
  }
  return b.bottom <= maxBottom ? b.top : null;
}
const shipBox = k => {   // k: screen px per world px
  const p = typeof worldToCss === "function" && player ? worldToCss(player.x, player.y) : null;
  return p ? { left: p.x - LANE_SHIP.w * k, right: p.x + LANE_SHIP.w * k, top: p.y - LANE_SHIP.up * k, bottom: p.y + LANE_SHIP.down * k } : null;
};
function laneTick() {
  for (const el of laneMoved) { el.style.removeProperty("top"); el.style.removeProperty("visibility"); el.classList.remove("lane-compact"); }   // back to the stylesheet's own spot, then measured there
  laneMoved = [];
  if (docked || titleOpen || !player || typeof S === "undefined" || !S || !S.cameras || typeof VIEW === "undefined") return;
  const els = LANE_IDS.map(id => document.getElementById(id)).filter(el => el && el.classList.contains("on") && el.getClientRects().length);
  if (!els.length) { laneHoldMs = 0; return; }
  const v = S.cameras.main.worldView, coach = document.getElementById("coach");
  const obst = [shipBox(VIEW.cssW / v.width), coach && !coach.hidden && coach.classList.contains("up") && coach.getClientRects().length ? coach.getBoundingClientRect() : null].filter(Boolean);
  const bars = document.querySelector("#hud .bars"), hudB = bars ? bars.getBoundingClientRect().bottom : LANE_TOP;   // a banner is lifted no higher than the HUD's bars
  for (const el of els) {
    const floor = el.id === "toast" ? el.getBoundingClientRect().top : Math.max(LANE_TOP, hudB);   // the toast keeps its own lane: it shrinks instead of climbing
    const fit = () => { const r = el.getBoundingClientRect(); return { r, top: laneTop({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }, obst, floor) }; };
    let m = fit();
    if (m.top === null) { el.classList.add("lane-compact"); m = fit(); }   // no room to lift: shrink, and try again
    if (m.top === null) {   // still no room above: drop below the obstacles when the screen has room there, else it stays (a banner is brief)
      const b = { left: m.r.left, right: m.r.right, top: m.r.top, bottom: m.r.bottom }, d = laneDrop(b, obst, window.innerHeight - LANE_TOP);
      m = { r: m.r, top: d };
      if (d === null) {
        if (el.id === "toast" && typeof toastPri === "number" && toastPri < 0 && (laneHoldMs += 150) < LANE_HOLD_MS) { el.style.visibility = "hidden"; clearTimeout(toastTimer); toastTimer = setTimeout(endToast, toastMs || TOAST_MS); }   // a tip waits (unseen, its time not running) until the card or the ship has moved on
        laneMoved.push(el); continue;
      }
    }
    if (el.id === "toast") laneHoldMs = 0;
    const k = el.offsetHeight ? m.r.height / el.offsetHeight : 1;   // CSS zoom on the big-screen overlays: style.top is in the element's own px
    if (m.top !== m.r.top) el.style.top = (parseFloat(getComputedStyle(el).top) + (m.top - m.r.top) / (k || 1)) + "px";
    if (m.top !== m.r.top || el.classList.contains("lane-compact")) laneMoved.push(el);
  }
}
