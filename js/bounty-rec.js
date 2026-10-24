"use strict";
// ---------- Ready level for a bounty (a line on the Wanted poster, js/campaign-ui.js) ----------
// The poster and the badge at sea speak one number: the boss's threat level (threatLevelOf, js/archetypes.js) from a
// dry-run outfit of its real class, hull multiplier and level, the same figure its badge shows. A bounty is a long
// fight in its lair, where other ships join in, so it asks BOSS_MARGIN levels above that, and one more with escorts.
// Round-2 duels put Red Ned (threat 2) at Ship Lv 4. It reads as a goal ("Ready at Ship Lv 4"); only a captain under that level gets the red warning line.
Object.assign(STR.en, { pRec: "Goal", pRecLv: "Ready at Ship Lv {n}", pRecOk: "Ready: Ship Lv {n}", pRecYou: "you: Lv {n}", pRecLow: "Level up before you sail" });
Object.assign(STR.zh, { pRec: "備戰", pRecLv: "船艦 Lv {n} 即可迎戰", pRecOk: "已可迎戰：船艦 Lv {n}", pRecYou: "你目前 Lv {n}", pRecLow: "建議先升級再出戰" });

const BOSS_MARGIN = 2, ESCORT_MARGIN = 1;
function bountyThreat(b) {
  const e = { L: b.L + levelBonus(), faction: b.faction, x: 0, y: 0 };   // no sprite: applyShipArt only sizes the hull
  outfitEnemy(e, b.cls, { hpMul: b.hpMul, speedMul: b.speed || 1 });   // as campaignOutfit fits the real boss
  return e.threatL;
}
function bountyRecLv(b) { return bountyThreat(b) + BOSS_MARGIN + (b.escorts.length ? ESCORT_MARGIN : 0); }
// Under the level it asks for: the line turns red and says so in words (and a "!" mark), so colour is not all it rests on.
const recShort = (n, me) => me < n;
function recLine(b) {
  const n = bountyRecLv(b), me = shipRating(), low = recShort(n, me), ready = !low;
  return `<div class="p-rec${low ? " low" : ""}"><dt>${t("pRec")}</dt><dd><span class="goal${ready ? " ok" : ""}">${t(ready ? "pRecOk" : "pRecLv", { n })} </span>` +
    `<span class="you">· ${t("pRecYou", { n: me })}</span>` + (low ? `<span class="warn">${t("pRecLow")}</span>` : "") + `</dd></div>`;
}
