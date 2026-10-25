"use strict";
// ---------- Speed readout and the aground prompt ----------
// The HUD's speed is how fast the hull really moves (px/s over the last frames, shown in knots the way the ship yard
// does: px/s / 15), not what the sail asks for, so a ship pinned against a rock reads 0. A hull that keeps asking for
// way (the stick pushed, a sail step up) and barely moves is aground: after GROUND_T s a prompt under the ship says
// so and what to do. The wind dial (js/weather.js) is the wind's speed, and says "Wind".
Object.assign(STR.en, { spd_lbl: "Speed", aground: "Aground on the rocks! Steer away from the shore." });
Object.assign(STR.zh, { spd_lbl: "船速", aground: "擱淺了！請轉向，離開岸邊。" });

const GROUND_ASK = 0.2;     // the helm must ask for at least this share of top speed (a slow sail is 0.35)
const GROUND_RATIO = 0.25;  // ...and the hull move less than this share of what it asks for
const GROUND_T = 0.9;       // s of that before the ship counts as aground
const GROUND_FREE = 0.15;   // once aground it stays so until the timer has run back down to this
const SPEED_KN_PX = 15;     // px/s per knot (YARD.sails.show, js/data.js)

// One tick of the aground timer. st { t, on }; ask / moved in px/s. Returns the new state.
function groundStep(st, ask, moved, maxSpeed, dt) {
  const stuck = ask > GROUND_ASK * maxSpeed && moved < ask * GROUND_RATIO;
  const t = stuck ? st.t + dt : Math.max(0, st.t - dt * 3);
  return { t, on: st.on ? t > GROUND_FREE : t >= GROUND_T };
}

const speedEl = document.getElementById("speedInd"), speedTxt = document.getElementById("speedTxt");
const groundEl = (() => { const el = document.createElement("div"); el.id = "aground"; el.setAttribute("role", "status"); el.hidden = true; document.body.appendChild(el); return el; })();
let gnd = { t: 0, on: false }, gndLast = null, gndSpeed = 0, gndKn = "";
function groundReset() { gnd = { t: 0, on: false }; gndLast = null; gndSpeed = 0; }
onHook("sail", groundReset);
onHook("lang", () => { groundEl.textContent = t("aground"); gndKn = ""; });
onHook("frame", dt => {
  if (!player || paused || docked || !player.alive || dt <= 0) { if (gndLast) groundReset(); if (!groundEl.hidden) groundEl.hidden = true; return; }
  const last = gndLast; gndLast = { x: player.x, y: player.y };
  if (!last) return;
  const moved = Math.hypot(player.x - last.x, player.y - last.y) / dt;
  if (moved > player.maxSpeed * 3) { gnd = { t: 0, on: false }; return; }   // a respawn or a jump, not sailing
  gndSpeed += (moved - gndSpeed) * Math.min(1, dt * 6);
  gnd = groundStep(gnd, (player.wantThr || 0) * player.maxSpeed, moved, player.maxSpeed, dt);
  const kn = (gndSpeed < 0.4 ? 0 : gndSpeed / SPEED_KN_PX).toFixed(1);
  if (kn !== gndKn) { gndKn = kn; speedTxt.textContent = t("u_kn", { n: kn }); }
  speedEl.classList.toggle("stuck", gnd.on);
  if (groundEl.hidden === gnd.on) { groundEl.hidden = !gnd.on; if (gnd.on) groundEl.textContent = t("aground"); }
});
