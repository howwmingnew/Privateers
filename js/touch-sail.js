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

function touchSailRender() {
  tsLbl.textContent = t("sl_lbl"); tsVal.textContent = t("sl_" + touchCap);
  tsBtns[0].setAttribute("aria-label", t("sl_less")); tsBtns[1].setAttribute("aria-label", t("sl_more"));
  tsBtns[0].disabled = touchCap <= 0; tsBtns[1].disabled = touchCap >= SAIL_THR.length - 1;
  touchSailEl.dataset.cap = String(touchCap);
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
});
touchSailRender();
