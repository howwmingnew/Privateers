"use strict";
// ---------- Hit glow: a broad red flash on the screen edge, toward a shooter you cannot see ----------
// The small "!" that marks the shooter (js/notices.js hit markers) is easy to miss in a fight, and a broadside from beyond
// the screen was damage with no visible source. This adds a wide glow at the edge on the bearing to the shooter, for a shot
// from off screen or one that took a tenth of the hull. The bearing picks one of GLOW_SECTORS marks around the screen; it
// flashes and fades (css/safety.css). A hit from a rock, fire or a disaster has no shooter and shows nothing here.
const GLOW_SECTORS = 16, GLOW_BIG = 0.1;   // GLOW_BIG: a hit of this share of the hull flashes even from a shooter in view
const glowLayer = document.createElement("div");
glowLayer.id = "hitGlow"; glowLayer.setAttribute("aria-hidden", "true");
const glowMarks = Array.from({ length: GLOW_SECTORS }, (_, i) => {
  const el = document.createElement("i");
  const turn = i / GLOW_SECTORS * TAU;
  el.style.setProperty("--a", (turn * 180 / Math.PI).toFixed(2) + "deg");
  el.style.setProperty("--cx", Math.cos(turn).toFixed(4)); el.style.setProperty("--cy", Math.sin(turn).toFixed(4));   // the bearing's unit vector, worked out here: CSS cos()/sin() is not in older browsers
  glowLayer.append(el);
  return el;
});
document.body.append(glowLayer);

// Which mark a bearing (radians from the player to the shooter) falls on.
const glowSector = a => ((Math.round(a / TAU * GLOW_SECTORS) % GLOW_SECTORS) + GLOW_SECTORS) % GLOW_SECTORS;
function glowFlash(a) {
  const el = glowMarks[glowSector(a)];
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");   // restart the fade
}
onHook("hurt", (s, dmg, src) => {
  if (!s.isPlayer || !src || src === s || !(dmg > 0) || typeof src.x !== "number") return;
  if (onScreen(src.x, src.y, -48) && dmg < s.maxHp * GLOW_BIG) return;   // seen, and not a heavy blow: its "!" marker is enough
  glowFlash(Math.atan2(src.y - s.y, src.x - s.x));
});
