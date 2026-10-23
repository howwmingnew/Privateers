"use strict";
// ---------- Audio cues from game state: which sea, a bounty boss in the fight, land nearby, sail changes ----------
// Snd (js/audio.js) knows nothing about the game; this file reads it each frame and tells Snd what is going on.
(() => {
  if (typeof Snd === "undefined") return;
  const BOSS_IN = 1000, BOSS_OUT = 1500, BOSS_LINGER = 4;   // px / s: the boss theme starts inside BOSS_IN, ends BOSS_LINGER s after it is left behind
  let bossOn = false, bossAway = 0, shoreT = 0, sailWas = null;
  const seaNowId = () => { const d = dist(player, PORT); return d < SAFE_R ? "shallows" : seaOfRing(ringAt(d)).id; };
  const bossOff = () => { bossOn = false; bossAway = 0; Snd.setBoss(false); };
  onHook("dock", () => { bossOff(); Snd.setSea("shallows"); Snd.setShore(0); });   // the harbour lies in the Shallows: the next sortie starts there
  onHook("sail", () => { bossOff(); Snd.setSea(seaNowId()); });
  onHook("sea", id => Snd.setSea(id));
  onHook("bounty", () => Snd.play("victory", { delay: 0.25 }));   // a bounty claimed, and the rank it brings: the full fanfare (once; Snd rate-limits it)
  onHook("frame", dt => {
    if (typeof sailLevel !== "undefined") {   // W / S: a short luff of canvas as a sail is set or taken in
      if (sailWas !== null && sailLevel !== sailWas && !paused && !docked && player && player.alive) Snd.play("rig", { big: sailLevel > sailWas });
      sailWas = sailLevel;
    }
    if (paused || docked || !player) return;
    // the boss theme while a living bounty boss is close, and until it has been left behind for a few seconds
    const b = enemies.find(e => e.alive && e.boss), d = b ? dist(b, player) : Infinity;
    if (!bossOn) { if (player.alive && d < BOSS_IN) { bossOn = true; bossAway = 0; Snd.setBoss(true); } }
    else {
      const fighting = b && player.alive && (d < BOSS_OUT || (b.target === player && d < BOSS_OUT * 1.4));
      bossAway = fighting ? 0 : bossAway + dt;
      if (!b || !player.alive || bossAway > BOSS_LINGER) bossOff();
    }
    if ((shoreT -= dt) <= 0) {   // how close the nearest coast is, twice a second: gulls and surf near land
      shoreT = 0.5; let best = null, gap = Infinity;
      for (const isl of islands) { const g = Math.hypot(isl.x - player.x, isl.y - player.y) - isl.r; if (g < gap) { gap = g; best = isl; } }
      Snd.setShore(best ? clamp(1 - (gap - 120) / 500, 0, 1) : 0, best ? clamp((best.x - player.x) / 900, -1, 1) * 0.8 : 0);
    }
  });
})();
