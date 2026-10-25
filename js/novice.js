"use strict";
// ---------- Novice safety net: a gentler start sea, and a warning before the deep ones ----------
// A captain whose Ship Lv is still low, sailing in the Shallows (the first rings off the harbor), meets fewer ships and
// none of them far above that rating (tameFirstVoyage, js/notify-order.js, uses noviceCap). The deeper seas stay as hard
// as ever: they are the game's difficulty bands. Sailing into one that out-fights the captain by SEA_WARN_GAP levels or
// more raises a red warning banner instead of the quiet name card (js/world-seas.js).
Object.assign(STR.en, {
  seaWarnTag: "Danger", seaWarn: "Ships here far out-fight your Lv {n}. Turn back toward the harbor, or be ready to run.",
  seaAhead: "Warning: {sea} lies just ahead, and its ships far out-fight you. Turn back now.",
  navyAim: "That is a Navy ship (the ⚓ on its plate). Sinking Navy ships gets you Wanted. It will not attack you first for now.",
});
Object.assign(STR.zh, {
  seaWarnTag: "危險", seaWarn: "這裡的船遠比你的 Lv {n} 強。建議掉頭回港，或做好逃跑的準備。",
  seaAhead: "警告：前方就是{sea}，那裡的船遠比你強。現在掉頭還來得及。",
  navyAim: "這是海軍（標籤上有 ⚓）。攻擊海軍會被通緝；在你領第 1 張懸賞前，牠不會先攻擊你。",
});

const NOVICE_LV = 4;          // a Ship Lv under this still counts as a novice
const NOVICE_RINGS = 2;       // ...while sailing within the first this many rings (the Shallows, about 630 m off the harbor)
const NOVICE_NEAR_SHARE = 0.25;   // share of the sea's ships kept in those rings then (0.6 otherwise, NEAR_SHARE in js/world-seas.js)
const NOVICE_OVER = 1;        // a ship made in the Shallows fights at most this many levels above a novice's rating
const SEA_WARN_GAP = 3;       // a sea whose lowest level is this far above the captain's rating gets the red warning

const noviceAt = (rating, ring) => rating < NOVICE_LV && ring <= NOVICE_RINGS;
const noviceCap = rating => rating + NOVICE_OVER;
const seaWarnGap = (seaLv, rating) => seaLv - rating >= SEA_WARN_GAP;

// Peace for a newcomer (#102). Red Ned's lair: until the first bounty is claimed, no ship but Ned himself joins a fight within
// PEACE_R of it unless the captain shot at it first, so the first bounty is a duel, not a brawl. Until that first bounty is claimed the
// Navy leaves the captain alone anywhere unless shot at first (#105): a ship's colour is its strength, not its side, and a newcomer
// who cannot yet tell Navy from pirate must not be hunted for it. In the Shallows, a novice is also spared by every Navy ship rated over noviceCap. The later bounties keep their crowds: the difficulty bands are untouched.
const PEACE_R = 1100, SEA_AHEAD_R = 380;
const bountyPeace = (claimed, dLair) => claimed === 0 && dLair < PEACE_R;
let spare = { bounty: false, shallows: false, navy: false, cap: 0 }, aheadShown = false;
const NAVY_NOTE_R = 460;   // the first Navy ship this close to the captain explains itself (once, tipOnce js/hull-alert.js)
// May e leave the captain alone this frame? (read by isHostile, js/ships.js, and the hunters, js/heat.js)
function noviceSpare(e) {
  if (e.boss || e.escortOf || e.ally || e.fixed) return false;
  if (spare.bounty || (spare.navy && e.faction === "navy")) return true;
  return spare.shallows && e.faction === "navy" && (e.threatL ?? e.L) > spare.cap;
}
const noviceZone = () => spare.shallows;
// The deepest sea's edge is a short sail away and the sea would out-fight the captain: a second warning, before the line.
const seaAheadDue = (dEdge, danger, shown) => !shown && danger && dEdge > 0 && dEdge < SEA_AHEAD_R;
function noviceTick() {
  const live = player && player.alive && !docked && !titleOpen && save && !(typeof runActive === "function" && runActive());
  const r = live ? curRating() : 99;
  spare = {
    bounty: !!(live && typeof bossShip !== "undefined" && bossShip && bossShip.alive && bossShip.lair && bountyPeace(save.campaign.bounty, dist(player, bossShip.lair))),
    shallows: !!live && noviceAt(r, ringAt(dist(player, PORT))), navy: !!live && save.campaign.bounty === 0, cap: noviceCap(r),
  };
  if (live && typeof tipOnce === "function" && enemies.some(e => e.alive && !e.fixed && e.faction === "navy" && dist(e, player) < NAVY_NOTE_R) && tipOnce("navyAim")) toast(t("navyAim"), false, 6000);
  if (!live || typeof seaIsDanger !== "function") return;
  const last = SEAS[SEAS.length - 1], edge = ringEdge(last.L0) - dist(player, PORT);
  if (aheadShown && edge > SEA_AHEAD_R * 2.5) aheadShown = false;   // sailed well clear: it may warn again
  if (seaAheadDue(edge, seaIsDanger(last.id), aheadShown)) {
    aheadShown = true;
    toast(t("seaAhead", { sea: t("sea_" + last.id) }), true, 5200); sfx("bell", { pitch: 0.4 });
  }
}
onHook("frame", () => { if (!paused) noviceTick(); });
onHook("sail", () => { aheadShown = false; });

// shipRating() walks every gun and the power table: the ring quotas ask for it every frame, so it is read twice a second.
let ratingNow = 1, ratingT = 0;
function curRating() { if (ratingT <= 0) { ratingNow = shipRating(); ratingT = 0.5; } return ratingNow; }
onHook("frame", dt => { ratingT -= dt; });
onHook("sail", () => { ratingT = 0; });
