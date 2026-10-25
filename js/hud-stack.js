"use strict";
// ---------- Keep the bottom notices off each other on a small screen (#107) ----------
// The boss's hull bar, the first-voyage coach card, the achievement card and the share / postcard / replay chips all float over the bottom of the
// sea, and the touch sail pad (js/touch-sail.js) owns the bottom-right corner. Each has its own fixed spot (css/campaign.css, menu.css, photo.css,
// share.css), which is fine on a desktop but put them on top of each other on a phone: the boss bar over the − / + buttons, the card over the bar.
// A few times a second, on screens up to NARROW_PX wide (no CSS zoom there, so the numbers are plain pixels), each visible one is measured at its own
// spot and, when it would sit on the pad or on one already placed (in the order below, the first has the last word), pushed up just clear of it.
const STACK_NARROW_PX = 900, STACK_GAP = 8;
const STACK_ORDER = ["bossBar", "coach", "achToast", "postcardChip", "shareChip", "replayChip"];
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
  if (window.innerWidth > STACK_NARROW_PX || docked || titleOpen) return;
  const els = STACK_ORDER.map(id => document.getElementById(id)).filter(stackShown);
  if (!els.length) return;
  const pad = document.getElementById("touchSail"), placed = [];
  if (pad && pad.getClientRects().length) placed.push(pad.getBoundingClientRect());
  for (const el of els) {
    const r = el.getBoundingClientRect(), box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, want = stackLift(box, placed);
    const lift = stackFit(want, box.top);   // never pushed off the top of the screen
    if (lift > 0) { el.style.bottom = (parseFloat(getComputedStyle(el).bottom) + lift) + "px"; stackMoved.push(el); }
    if (lift < want && !STACK_KEEP.includes(el.id)) { el.style.visibility = "hidden"; if (!stackMoved.includes(el)) stackMoved.push(el); continue; }   // no room: the minor chips give way
    placed.push({ ...box, top: box.top - lift, bottom: box.bottom - lift });
  }
}
onHook("frame", dt => { if ((stackT -= dt) > 0) return; stackT = 0.15; stackTick(); });
