"use strict";
// ---------- Touch sail buttons: slow or stop the ship without leaving the stick (js/input.js touchCap) ----------
// On a touch screen the stick alone cannot hold still: a finger on the glass is always some speed. The  -  /  +  pair
// beside the hint lowers or raises the sail step the stick may not exceed (Full > Half > Slow > Stopped). At Stopped the
// stick still turns the bow, so a captain can aim at a target without sailing past it, and lets go to fire. The cap goes
// back to Full at every departure, so a new sortie never starts with a ship that will not move.
// Shown only while a finger is the input device (device === "touch") and the ship is at sea; keys, mouse and pad are untouched.
const touchSailEl = document.createElement("div");
touchSailEl.id = "touchSail"; touchSailEl.hidden = true;
touchSailEl.innerHTML = `<button type="button" data-d="-1"><i class="tsm" aria-hidden="true"></i></button><span class="ts-txt"><small></small><b></b></span><button type="button" data-d="1"><i class="tsp" aria-hidden="true"></i></button>`;
document.body.append(touchSailEl);
const tsLbl = touchSailEl.querySelector("small"), tsVal = touchSailEl.querySelector("b"), tsBtns = touchSailEl.querySelectorAll("button");

// What the dial reads: the cap once a captain has lowered it, otherwise the step the ship is really asking for (the stick's pull
// under the cap; a lifted finger is Stopped), so letting go of the stick no longer leaves the dial on Full (#116).
function touchSailShown() {
  if (touchCap < SAIL_THR.length - 1) return touchCap;
  if (joyVec.m <= 0.2) return 0;
  const thr = Math.min(1, joyVec.m * 1.25);
  return Math.max(1, SAIL_THR.findIndex(v => v >= thr - 1e-6));
}
let tsShown = -1;
function touchSailRender() {
  tsShown = touchSailShown();
  tsLbl.textContent = t(touchCap < SAIL_THR.length - 1 ? "sl_cap" : "sl_lbl"); tsVal.textContent = t("sl_" + tsShown);
  tsBtns[0].setAttribute("aria-label", t("sl_less")); tsBtns[1].setAttribute("aria-label", t("sl_more"));
  tsBtns[0].disabled = touchCap <= 0; tsBtns[1].disabled = touchCap >= SAIL_THR.length - 1;
  touchSailEl.dataset.cap = String(touchCap < SAIL_THR.length - 1 ? touchCap : tsShown);
}
touchSailEl.addEventListener("pointerdown", e => e.stopPropagation());   // never reaches the sea's stick (#game takes its own pointers)
touchSailEl.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (typeof Snd !== "undefined") Snd.play("uiClick");
  setTouchCap(touchCap + Number(b.dataset.d));
});
document.addEventListener("touchsail", touchSailRender);
document.addEventListener("langchange", touchSailRender);
document.addEventListener("devicechange", touchSailRender);
onHook("sail", () => setTouchCap(SAIL_THR.length - 1));
onHook("frame", () => {
  const show = device === "touch" && !!player && player.alive && !paused && !docked && !titleOpen;
  if (touchSailEl.hidden === show) touchSailEl.hidden = !show;
  if (show && touchSailShown() !== tsShown) touchSailRender();   // the stick came down or went up
});
touchSailRender();
