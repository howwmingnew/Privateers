"use strict";
// ---------- Repair at sea: the crew patches the hull once the shooting has stopped ----------
// REPAIR_DELAY seconds after the last hit (a landed ball, not a fire's burn) the hull mends REPAIR_RATE of its max per
// second. Nothing mends while the ship burns, or while an enemy gun port glows red with the player as its target
// (js/volley.js), so a fight is still won on the water. The harbor ring (js/mooring.js) mends far faster and the ledger
// restores the hull outright, so a trip home is still the quick fix. The HUD hull bar glows while the crew works.
let repairIdle = 0, repairOn = false;   // seconds since the last hit · is the hull mending this frame
// Pure step: seconds idle and hp after dt. `blocked` (fire, a warning) holds the clock at zero as well as the hull.
function repairStep(idle, hp, maxHp, dt, blocked) {
  if (blocked) return { idle: 0, hp };
  const t = idle + dt;
  if (t <= REPAIR_DELAY || hp >= maxHp) return { idle: t, hp };
  return { idle: t, hp: Math.min(maxHp, hp + maxHp * REPAIR_RATE * dt) };
}
// An enemy side is laid on the player: the red fan is up (v.warn counts down to the volley).
const underWarning = () => enemies.some(e => e.alive && e.vol && Object.values(e.vol).some(v => v.warn > 0 && v.tgt === player));
onHook("hurt", s => { if (s.isPlayer) repairIdle = 0; });
onHook("sail", () => { repairIdle = 0; });
onHook("frame", dt => {
  let on = false;
  if (player && player.alive && !paused && !docked && !titleOpen) {
    const r = repairStep(repairIdle, player.hp, player.maxHp, dt, player.burnT > 0 || underWarning());
    on = r.hp > player.hp;
    repairIdle = r.idle; player.hp = r.hp;
  }
  if (on !== repairOn) { repairOn = on; const bar = document.querySelector(".bar.hp"); if (bar) bar.classList.toggle("mend", on); }
});
