"use strict";
// ---------- First-voyage ambush: two weak pirates burst out from behind the nearest island ----------
// Once per captain, ever (save.ambushDone). The clock starts at the first sinking and counts only sea time. After
// AMBUSH_DELAY s the pirates come, but only when the floor is clear: nothing else is fighting the player, the first
// voyage's opening is over (js/tutorial.js tutorialCalm), no banner is up or waiting (js/notify-order.js), the hull is
// above AMBUSH_MIN_HP and the ship is outside the safe waters. Until then they wait. The pirates are Lv 1-2 cutters
// (never above the captain's Ship Lv), 20% short on hull, and hold their first volley a few seconds.
Object.assign(STR.en, { ambushToast: "Pirates! They burst out from behind the island." });
Object.assign(STR.zh, { ambushToast: "海盜！他們從島後衝了出來。" });
const AMBUSH_DELAY = 45, AMBUSH_MIN_HP = 0.6, AMBUSH_HULL = 0.8, AMBUSH_HOLD = 3.5;   // s · share of max hull · share of hull · s before the first volley
SAVE_DEFAULTS.push(() => ({ ambushDone: false }));
// A save from before the ambush that has already sunk a ship is past its first voyage.
SAVE_SANITIZERS.push(s => ({ ...s, ambushDone: typeof s.ambushDone === "boolean" ? s.ambushDone : s.sunk > 0 }));

// Is it time? `w`: { done, sunk, t (s of sea time since the first sinking), calm (the tutorial's opening), banner (one up or
// waiting), engaged (a hostile already on the player), hp (share of hull), safe (the player is in the safe waters) }.
const ambushReady = w => !w.done && w.sunk >= 1 && w.t >= AMBUSH_DELAY && !w.calm && !w.banner && !w.engaged && w.hp >= AMBUSH_MIN_HP && !w.safe;
// Where the pirates start: on the island's far side from the player, just clear of the shore, so the island hides them
// until they round it. `side` -1 / +1 offsets the two ships along the shore.
function ambushSpot(isl, from, side) {
  const a = Math.atan2(isl.y - from.y, isl.x - from.x), d = isl.r * 1.3 + 50;
  return { x: isl.x + Math.cos(a) * d - Math.sin(a) * side * 70, y: isl.y + Math.sin(a) * d + Math.cos(a) * side * 70 };
}
// The nearest island 350-1100 px away whose far side is open water outside the safe waters; null if none.
function ambushIsland() {
  const clear = p => p.x > 200 && p.x < W - 200 && p.y > 200 && p.y < H - 200 && Math.hypot(p.x - PORT.x, p.y - PORT.y) > SAFE_R + 150 &&
    !islands.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r * 1.3 + 30);
  return islands.map(i => ({ i, d: dist(i, player) })).filter(o => o.d > 350 && o.d < 1100).sort((a, b) => a.d - b.d)
    .map(o => o.i).find(i => [-1, 1].every(s => clear(ambushSpot(i, player, s)))) || null;
}
function ambushSpawn(isl) {
  const L = Math.max(1, Math.min(shipRating(), 2));
  save.ambushDone = true; persist();
  [-1, 1].forEach(side => {
    const p = ambushSpot(isl, player, side), e = makeEnemy(S, p.x, p.y, L, "pirate", "cutter");
    e.maxHp = e.hp = Math.ceil(e.maxHp * AMBUSH_HULL);
    for (const k in e.vol) e.vol[k].cd = AMBUSH_HOLD;
    Object.assign(e, { target: player, attacker: player, angry: 12, chaseFrom: { x: p.x, y: p.y }, rot: Math.atan2(player.y - p.y, player.x - p.x) });
  });
  toast(t("ambushToast"));   // waits behind any banner (js/notices.js)
}

let ambushT = 0;
onHook("frame", dt => {
  if (!player || save.ambushDone || save.sunk < 1 || paused || docked || !player.alive || titleOpen) return;
  ambushT += dt;
  if (ambushT < AMBUSH_DELAY) return;
  const w = { done: save.ambushDone, sunk: save.sunk, t: ambushT, hp: player.hp / player.maxHp, safe: inSafe(player),
    calm: typeof tutorialCalm === "function" && tutorialCalm(), banner: typeof bannerBusy === "function" && bannerBusy(),
    engaged: enemies.some(e => e.alive && e.target === player) };
  if (!ambushReady(w)) return;
  const isl = ambushIsland();
  if (isl) { ambushSpawn(isl); ambushT = 0; }   // no fitting island here: try again next frame
});
