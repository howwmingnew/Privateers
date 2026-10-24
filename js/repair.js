"use strict";
// ---------- Repair at sea: the crew patches the hull whenever it is below full ----------
// The hull mends REPAIR_RATE of its max per second at sea, in a fight or not, and REPAIR_RATE_STILL while the ship lies
// stopped (below REPAIR_STILL of top speed), so heaving to is a choice: mend faster, but sit still under the guns. The
// harbor ring (js/mooring.js) mends far faster and the ledger restores the hull outright, so a trip home is still the
// quick fix. The HUD hull bar glows while the crew works.
let repairOn = false;   // is the hull mending this frame
// Pure step: hp after dt.
function repairStep(hp, maxHp, dt, still) {
  if (hp >= maxHp) return hp;
  return Math.min(maxHp, hp + maxHp * (still ? REPAIR_RATE_STILL : REPAIR_RATE) * dt);
}
onHook("frame", dt => {
  let on = false;
  if (player && player.alive && !paused && !docked && !titleOpen) {
    const hp = repairStep(player.hp, player.maxHp, dt, player.speed < player.maxSpeed * REPAIR_STILL);
    on = hp > player.hp; player.hp = hp;
  }
  if (on !== repairOn) { repairOn = on; const bar = document.querySelector(".bar.hp"); if (bar) bar.classList.toggle("mend", on); }
});
