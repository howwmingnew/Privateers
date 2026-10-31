"use strict";
// ---------- Novice safety net: a gentler start sea, and a warning before the deep ones ----------
// A captain whose Ship Lv is still low, sailing in the Shallows (the first rings off the harbor), meets fewer ships and
// none of them far above that rating (tameFirstVoyage, js/notify-order.js, uses noviceCap). The deeper seas stay as hard
// as ever: they are the game's difficulty bands. Sailing into one that out-fights the captain by SEA_WARN_GAP levels or
// more raises a red warning banner instead of the quiet name card (js/world-seas.js).
Object.assign(STR.en, {
  seaWarnTag: "Danger", seaWarn: "Ships here far out-fight your Lv {n}. Turn back toward the harbor, or be ready to run.",
  seaAhead: "Warning: {sea} is about {s} s ahead, and its ships far out-fight you. Turn back now.",
  seaAheadNear: "Warning: {sea} is just ahead, and its ships far out-fight you. Turn back now.",
  practiceOut: "Beyond the practice waters: these ships dodge, flee and shoot back for real.",
  practiceIn: "Back in the practice waters: only small ships that never flee or fire first.",
  navyAim: "That is a Navy ship (the ⚓ on its plate). Sinking Navy ships gets you Wanted. It will not attack you first while you are under 2 stars of Wanted; shoot, ram or board it and it fights back.",
});
Object.assign(STR.zh, {
  seaWarnTag: "危險", seaWarn: "這裡的船遠比你的 Lv {n} 強。建議掉頭回港，或做好逃跑的準備。",
  seaAhead: "警告：約 {s} 秒後就進入{sea}，那裡的船遠比你強。現在掉頭還來得及。",
  seaAheadNear: "警告：前方就是{sea}，那裡的船遠比你強。現在掉頭還來得及。",
  practiceOut: "已離開練習海域：這裡的船會閃避、會逃，也會認真還擊。",
  practiceIn: "回到練習海域：只有不會逃、不會先開火的小船。",
  navyAim: "這是海軍（標籤上有 ⚓）。攻擊海軍會被通緝；通緝低於 2 星時牠不會先攻擊你；但你（或護航艦）開火、衝撞或登船，牠就會還擊。",
});

const NOVICE_LV = 4;          // a Ship Lv under this still counts as a novice
const NOVICE_RINGS = 2;       // ...while sailing within the first this many rings (the Shallows, about 630 m off the harbor)
const NOVICE_NEAR_SHARE = 0.25;   // share of the sea's ships kept in those rings then (0.6 otherwise, NEAR_SHARE in js/world-seas.js)
const NOVICE_OVER = 1;        // a ship made in the Shallows fights at most this many levels above a novice's rating
const SEA_WARN_GAP = 3;       // a sea whose lowest level is this far above the captain's rating gets the red warning

const NOVICE_PORT_R = 2400;   // until the first bounty is claimed, no ship made within this of the harbor (about two screens: the Shallows, the Reef Straits, the Lanes' edge) fights above noviceCap (#108)
// Is a ship made d px from the harbor held to noviceCap? claimed: bounties claimed, ng: New Game+ cycles (a returning captain is no novice).
const noviceHome = (claimed, ng, d) => claimed === 0 && !ng && d < NOVICE_PORT_R;
// Two bands inside that circle (#115), until the first bounty, outside New Game+ and the daily run. INNER, the practice waters (#113): the first
// 3 rings, out to PRACTICE_R = ringEdge(4) (js/world-seas.js; 1580 px; Red Ned's lair, ringMid(3), sits in it). A ship made there
// is a practice target (e.practice, set by tameFirstVoyage, js/notify-order.js): Lv 1, never runs (js/flee.js, js/ships.js), never opens fire on the
// captain (isHostile) - but once shot it fights back like any ship. Ships that sail in from outside keep their level.
// OUTER, PRACTICE_R out to NOVICE_PORT_R: ordinary ships (they flee, fight back, may fire first) at outerLv: Lv 2 on ring 4, 3 on rings 5-6, capped at
// noviceCap (Ship Lv + 1, never under 2, so the Lv 2 floor holds for every captain). Crossing the line is the graduation (a toast, noviceTick).
const practiceAt = (claimed, ng, daily, d) => !daily && noviceHome(claimed, ng, d);
const outerLv = (ring, rating) => Math.min(clamp(ring - 2, 2, 3), noviceCap(rating));
const practiceOn = () => !!save && practiceAt(save.campaign.bounty, save.ngPlus, typeof runActive === "function" && runActive(), 0);
const homeD = (x, y) => Math.hypot(x - PORT.x, y - PORT.y);
const practiceZone = (x, y) => practiceOn() && noviceHome(save.campaign.bounty, save.ngPlus, homeD(x, y)) && homeD(x, y) < PRACTICE_R;
const outerZone = (x, y) => practiceOn() && noviceHome(save.campaign.bounty, save.ngPlus, homeD(x, y)) && homeD(x, y) >= PRACTICE_R;
const practiceTarget = e => !!e.practice && practiceOn();   // never runs; the flag lapses with the first bounty: a leftover target fights as an ordinary Lv 1
// Never fires first: false once the captain has hit it (e.practiceProvoked, js/combat.js), for good - till it sinks or the sortie ends. It still never runs.
const practiceShip = e => practiceTarget(e) && !e.practiceProvoked;
const noviceAt =(rating, ring) => rating < NOVICE_LV && ring <= NOVICE_RINGS;
const noviceCap = rating => rating + NOVICE_OVER;
const seaWarnGap = (seaLv, rating) => seaLv - rating >= SEA_WARN_GAP;

// Peace for a newcomer (#102). Red Ned's lair: until the first bounty is claimed, no ship but Ned himself joins a fight within
// PEACE_R of it unless the captain shot at it first, so the first bounty is a duel, not a brawl. Until that first bounty is claimed the
// Navy leaves the captain (and the escorts) alone anywhere unless provoked (#105, #120): a ship's colour is its strength, not its side, and a newcomer
// who cannot yet tell Navy from pirate must not be hunted for it. One rule: while Wanted is under HEAT_HUNT_FROM stars (the first voyage counts as 0) the
// Navy never opens fire. It replaces the old "until the first bounty" gate. Retaliation = js/combat.js hurt() made the ship's attacker the captain/escort within 8 s (ram and shots both go through hurt), or `provoked` below. In the Shallows, a novice is also spared by every Navy ship rated over noviceCap. The later bounties keep their crowds: the difficulty bands are untouched.
const PEACE_R = 1100, SEA_AHEAD_R = 380, SEA_AHEAD_S = 10;   // the sea warning comes SEA_AHEAD_S s before the line at the ship's speed (#114), or inside SEA_AHEAD_R px whatever the speed
const bountyPeace = (claimed, dLair) => claimed === 0 && dLair < PEACE_R;
let bandWas = 0, bandT = 0;   // the band the captain was last in (the graduation cue), and its cooldown so the line's edge cannot spam
let spare = { bounty: false, shallows: false, navy: false, cap: 0 }, aheadShown = {}, navyTipShown = false;   // aheadShown: sea id -> the distance (px) it warned at
// Navy ships the captain or an escort has hurt this voyage (shot, rammed) stay hostile: provoking one ends its peace for good, not for 8 s.
let provoked = new WeakSet();
onHook("hurt", (s, dmg, src) => { if (src && (src === player || src.ally) && s.faction === "navy" && !s.isPlayer && !s.ally) provoked.add(s); });
const NAVY_NOTE_R = 460;   // the first Navy ship this close to the captain explains itself (once, tipOnce js/hull-alert.js)
// May e leave the captain alone this frame? (read by isHostile, js/ships.js, and the hunters, js/heat.js)
// Does this Navy ship hold its fire at the captain's side (the heat rule above)? Also read by isHostile for the escorts.
const navyCalm = e => !!e && spare.navy && e.faction === "navy" && !e.boss && !e.escortOf && !e.ally && !e.fixed && !provoked.has(e);
function noviceSpare(e) {
  if (e.boss || e.escortOf || e.ally || e.fixed || provoked.has(e)) return false;
  if (spare.bounty || navyCalm(e)) return true;
  return spare.shallows && e.faction === "navy" && (e.threatL ?? e.L) > spare.cap;
}
const noviceZone = () => spare.shallows;
// A sea that would out-fight the captain is a short sail away: a second warning, before the line (#114: SEA_AHEAD_S s of sailing, not a last-second 380 px).
// dEdge: px to the sea's edge; vOut: the ship's speed straight away from the harbor (px/s, <= 0 sailing home or sideways).
const seaAheadDue = (dEdge, vOut, danger, shown) => !shown && danger && dEdge > 0 && (dEdge < SEA_AHEAD_R || (vOut > 0 && dEdge / vOut <= SEA_AHEAD_S));
// The first sea outward from d (px from the harbor) the captain cannot take, as { sea, dEdge }, or null. isDanger: sea id -> bool.
function seaAheadOf(d, isDanger) {
  const s = SEAS.slice(1).find(x => ringEdge(x.L0) > d && isDanger(x.id));
  return s ? { sea: s, dEdge: ringEdge(s.L0) - d } : null;
}
function noviceTick() {
  const live = player && player.alive && !docked && !titleOpen && save && !(typeof runActive === "function" && runActive());
  const r = live ? curRating() : 99;
  spare = {
    bounty: !!(live && typeof bossShip !== "undefined" && bossShip && bossShip.alive && bossShip.lair && bountyPeace(save.campaign.bounty, dist(player, bossShip.lair))),
    shallows: !!live && noviceAt(r, ringAt(dist(player, PORT))), navy: !!live && typeof heatStars === "function" && heatStars(heatNow()) < HEAT_HUNT_FROM, cap: noviceCap(r),
  };
  if (live && spare.navy && !navyTipShown && typeof tipOnce === "function" && enemies.some(e => e.alive && !e.fixed && e.faction === "navy" && dist(e, player) < NAVY_NOTE_R)) {
    navyTipShown = true;   // a memory flag: tipOnce reads storage, and a blocked store must not toast every frame
    if (tipOnce("navyAim")) toast(t("navyAim"), false, 6000, TOAST_TIP);
  }
  const band = live && practiceOn() ? (practiceZone(player.x, player.y) ? 1 : outerZone(player.x, player.y) ? 2 : 0) : 0;   // 1 practice waters, 2 outer band, 0 neither
  if (band && bandWas && band !== bandWas && bandT <= 0) { toast(t(band === 2 ? "practiceOut" : "practiceIn"), false, 4200, TOAST_TIP); bandT = 6; }
  if (live) bandWas = band || bandWas; else bandWas = 0;   // 0 = unknown: the first frame of a sortie toasts nothing
  if (!live || typeof seaIsDanger !== "function") return;
  const d = dist(player, PORT), ahead = seaAheadOf(d, seaIsDanger);
  for (const id of Object.keys(aheadShown)) if (!ahead || ahead.sea.id !== id || ahead.dEdge > aheadShown[id] * 1.5 + SEA_AHEAD_R) delete aheadShown[id];   // sailed well clear: it may warn again
  if (!ahead) return;
  const vOut = d > 1 ? ((player.vx || 0) * (player.x - PORT.x) + (player.vy || 0) * (player.y - PORT.y)) / d : 0, id = ahead.sea.id;
  if (!seaAheadDue(ahead.dEdge, vOut, true, id in aheadShown)) return;
  aheadShown[id] = ahead.dEdge;
  const secs = vOut > 0 ? Math.round(ahead.dEdge / vOut) : 0, sea = t("sea_" + id);
  toast(secs >= 3 ? t("seaAhead", { sea, s: secs }) : t("seaAheadNear", { sea }), true, 5200, TOAST_WARN); sfx("bell", { pitch: 0.4 });
}
onHook("frame", () => { if (!paused) noviceTick(); });
onHook("frame", dt => { bandT -= dt; });
onHook("sail", () => { bandWas = 0; aheadShown = {}; provoked = new WeakSet(); });

// shipRating() walks every gun and the power table: the ring quotas ask for it every frame, so it is read twice a second.
let ratingNow = 1, ratingT = 0;
function curRating() { if (ratingT <= 0) { ratingNow = shipRating(); ratingT = 0.5; } return ratingNow; }
onHook("frame", dt => { ratingT -= dt; });
onHook("sail", () => { ratingT = 0; });
