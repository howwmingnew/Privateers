"use strict";
// ---------- Ready level for a bounty (a line on the Wanted poster, js/campaign-ui.js) ----------
// The poster and the badge at sea speak one number: the boss's threat level (threatLevelOf, js/archetypes.js) from a
// dry-run outfit of its real class, hull multiplier and level, the same figure its badge shows. A bounty is a long
// fight in its lair, where other ships join in, so it asks BOSS_MARGIN levels above that, and one more with escorts.
// Round-2 duels put Red Ned (threat 2) at Ship Lv 4. It reads as a goal ("Ready at Ship Lv 4"), not a warning.
Object.assign(STR.en, { pRec: "Goal", pRecLv: "Ready at Ship Lv {n}", pRecOk: "Ready: Ship Lv {n}", pRecYou: "you: Lv {n}" });
Object.assign(STR.zh, { pRec: "備戰", pRecLv: "船艦 Lv {n} 即可迎戰", pRecOk: "已可迎戰：船艦 Lv {n}", pRecYou: "你目前 Lv {n}" });

const BOSS_MARGIN = 2, ESCORT_MARGIN = 1;
function bountyThreat(b) {
  const e = { L: b.L + levelBonus(), faction: b.faction, x: 0, y: 0 };   // no sprite: applyShipArt only sizes the hull
  outfitEnemy(e, b.cls, { hpMul: b.hpMul, speedMul: b.speed || 1 });   // as campaignOutfit fits the real boss
  return e.threatL;
}
function bountyRecLv(b) { return bountyThreat(b) + BOSS_MARGIN + (b.escorts.length ? ESCORT_MARGIN : 0); }
function recLine(b) {
  const n = bountyRecLv(b), me = shipRating(), ready = me >= n;
  return `<div class="p-rec"><dt>${t("pRec")}</dt><dd><span class="goal${ready ? " ok" : ""}">${t(ready ? "pRecOk" : "pRecLv", { n })} </span>` +
    `<span class="you">· ${t("pRecYou", { n: me })}</span></dd></div>`;
}
