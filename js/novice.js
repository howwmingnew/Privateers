"use strict";
// ---------- Novice safety net: a gentler start sea, and a warning before the deep ones ----------
// A captain whose Ship Lv is still low, sailing in the Shallows (the first rings off the harbor), meets fewer ships and
// none of them far above that rating (tameFirstVoyage, js/notify-order.js, uses noviceCap). The deeper seas stay as hard
// as ever: they are the game's difficulty bands. Sailing into one that out-fights the captain by SEA_WARN_GAP levels or
// more raises a red warning banner instead of the quiet name card (js/world-seas.js).
Object.assign(STR.en, {
  seaWarnTag: "Danger", seaWarn: "Ships here far out-fight your Lv {n}. Turn back toward the harbor, or be ready to run.",
});
Object.assign(STR.zh, {
  seaWarnTag: "危險", seaWarn: "這裡的船遠比你的 Lv {n} 強。建議掉頭回港，或做好逃跑的準備。",
});

const NOVICE_LV = 4;          // a Ship Lv under this still counts as a novice
const NOVICE_RINGS = 2;       // ...while sailing within the first this many rings (the Shallows, about 630 m off the harbor)
const NOVICE_NEAR_SHARE = 0.25;   // share of the sea's ships kept in those rings then (0.6 otherwise, NEAR_SHARE in js/world-seas.js)
const NOVICE_OVER = 1;        // a ship made in the Shallows fights at most this many levels above a novice's rating
const SEA_WARN_GAP = 3;       // a sea whose lowest level is this far above the captain's rating gets the red warning

const noviceAt = (rating, ring) => rating < NOVICE_LV && ring <= NOVICE_RINGS;
const noviceCap = rating => rating + NOVICE_OVER;
const seaWarnGap = (seaLv, rating) => seaLv - rating >= SEA_WARN_GAP;

// shipRating() walks every gun and the power table: the ring quotas ask for it every frame, so it is read twice a second.
let ratingNow = 1, ratingT = 0;
function curRating() { if (ratingT <= 0) { ratingNow = shipRating(); ratingT = 0.5; } return ratingNow; }
onHook("frame", dt => { ratingT -= dt; });
onHook("sail", () => { ratingT = 0; });
