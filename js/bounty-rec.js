"use strict";
// ---------- Ready level for a bounty (a line on the Wanted poster, js/campaign-ui.js) ----------
// The poster and the badge at sea speak one number: the boss's threat level (threatLevelOf, js/archetypes.js) from a
// dry-run outfit of its real class, hull multiplier and level, the same figure its badge shows. A bounty is a long
// fight in its lair, where other ships join in, so it asks BOSS_MARGIN levels above that, and one more with escorts.
// Round-2 duels put Red Ned (threat 2) at Ship Lv 4. It reads as a goal ("Ready at Ship Lv 4"); only a captain under that level gets the red warning line.
// The poster's number is YOUR Ship Lv to be at; the boss's own badge at sea (Lv {b}) is lower by design, so the poster says why (pRecWhy) and, when you are short, how Ship Lv rises (lvHow).
Object.assign(STR.en, { pRec: "Goal", pRecLv: "Ready at Ship Lv {n}", pRecOk: "Ready: Ship Lv {n}", pRecYou: "you: Lv {n}", pRecLow: "Level up before you sail", pRecHow: "Ship Lv rises with stronger guns, hull, sails or gear, or a bigger ship.", pRecCalc: "(boss badge at sea Lv {b} + {m} for its lair)",
  pRecWhy: "The boss's badge at sea reads Lv {b}. We ask {m} levels more because other ships join the fight in its lair.", pRecWhyEsc: "The boss's badge at sea reads Lv {b}. We ask {m} levels more because its escorts and other ships join the fight in its lair.",
  lvHow: "Ship Lv is your ship's strength: it rises with stronger guns (upgrade or swap them), a better hull, sails or gear, or a bigger ship. Enemy badges use the same scale." });
Object.assign(STR.zh, { pRec: "備戰", pRecLv: "船艦 Lv {n} 即可迎戰", pRecOk: "已可迎戰：船艦 Lv {n}", pRecYou: "你目前 Lv {n}", pRecLow: "建議先升級再出戰", pRecHow: "船艦 Lv 會隨更強的砲、船體、船帆、裝備或更大的船提高。", pRecCalc: "（海上標籤 Lv {b} ＋ 巢穴 {m} 級）",
  pRecWhy: "海上看到他的標籤是 Lv {b}。多要求 {m} 級，是因為在他的巢穴裡會有其他船加入戰鬥。", pRecWhyEsc: "海上看到他的標籤是 Lv {b}。多要求 {m} 級，是因為在他的巢穴裡，護衛艦和其他船都會加入戰鬥。",
  lvHow: "船艦 Lv 是你這艘船的戰力：換更強的砲（升級或對調）、升級船體、船帆、裝備，或換大一點的船都會提高。敵船標籤用同一套標準。" });

const BOSS_MARGIN = 2, ESCORT_MARGIN = 1;
function bountyDry(b) {
  const e = { L: b.L + levelBonus(), faction: b.faction, x: 0, y: 0 };   // no sprite: applyShipArt only sizes the hull
  return outfitEnemy(e, b.cls, { hpMul: b.hpMul, speedMul: b.speed || 1 });   // as campaignOutfit fits the real boss
}
const bountyThreat = b => bountyDry(b).threatL;
// The ship line decides how a bounty is fought, so the poster says who outruns whom (your ship's speed with its sails,
// against the boss's): the fast line can pick its range, the heavy line must take the fight where the boss chooses.
const OUTRUN = 0.12;
function speedHint(b) {
  const r = yardVal("sails") / Math.max(1, bountyDry(b).maxSpeed), n = Math.round(Math.abs(r - 1) * 100);
  return r >= 1 + OUTRUN ? t("pRecFast", { n }) : r <= 1 - OUTRUN ? t("pRecSlow", { n }) : "";
}
const bountyMargin = b => BOSS_MARGIN + (b.escorts.length ? ESCORT_MARGIN : 0);
function bountyRecLv(b) { return bountyThreat(b) + bountyMargin(b); }
// Under the level it asks for: the line turns red and says so in words (and a "!" mark), so colour is not all it rests on.
const recShort = (n, me) => me < n;
function recLine(b) {
  const th = bountyThreat(b), m = bountyMargin(b), n = th + m, me = shipRating(), low = recShort(n, me), ready = !low, hint = speedHint(b);
  return `<div class="p-rec${low ? " low" : ""}"><dt>${t("pRec")}</dt><dd><span class="goal${ready ? " ok" : ""}">${t(ready ? "pRecOk" : "pRecLv", { n })} </span>` +
    `<span class="you">· ${t("pRecYou", { n: me })}</span> <span class="calc">${t("pRecCalc", { b: th, m })}</span>` + (low ? `<span class="warn">${t("pRecLow")}</span><span class="how">${t("pRecHow")}</span>` : "") +
    `<span class="why">${t(b.escorts.length ? "pRecWhyEsc" : "pRecWhy", { b: th, m })} ${t("lvHow")}</span>` + (hint ? `<span class="speed">${hint}</span>` : "") + `</dd></div>`;
}
