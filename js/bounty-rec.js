"use strict";
// ---------- Ready level for a bounty (a line on the Wanted poster, js/campaign-ui.js) ----------
// The poster and the badge at sea speak one number: the boss's threat level (threatLevelOf, js/archetypes.js) from a
// dry-run outfit of its real class, hull multiplier and level, the same figure its badge shows. A bounty is a long
// fight in its lair, where other ships join in, so it asks BOSS_MARGIN levels above that, and one more with escorts.
// Round-2 duels put Red Ned (threat 2) at Ship Lv 4, and 5 of 5 newcomers could not reach that in 30 minutes: his poster now asks one level
// above his badge (b.margin, no escorts), a level a stock sloop gets to with about 180 gold of gun upgrades (#98). The goal reads as a goal
// ("Ready at Ship Lv 3"); only a captain under that level gets the red warning line, how far short, and what to buy first (js/lv-path.js).
// The poster's number is YOUR Ship Lv to be at; the boss's own level badge at sea (Lv {b}) is lower by design, so the poster says why (pRecWhy) and how Ship Lv rises (lvHow).
Object.assign(STR.en, { pRec: "Goal", pRecLv: "Ready at Ship Lv {n}", pRecOk: "Ready: Ship Lv {n}", pRecYou: "you: Lv {n} · next {p}%", pRecLow: "Level up before you sail", pRecHow: "Ship Lv rises with stronger guns, hull, sails or gear, or a bigger ship.", pRecCalc: "(his level badge Lv {b} + {m} to be safe)",
  pRecWhy: "The level badge over his ship reads Lv {b}. We suggest {m} more because other ships nearby can join the fight.", pRecWhyEsc: "The level badge over his ship reads Lv {b}. We suggest {m} more because his escorts and other ships nearby can join the fight.",
  lvHow: "Ship Lv is your ship's strength: it rises with stronger guns (upgrade or swap them), a better hull, sails or gear, or a bigger ship. Enemy badges use the same scale." });
Object.assign(STR.zh, { pRec: "備戰", pRecLv: "船艦 Lv {n} 即可迎戰", pRecOk: "已可迎戰：船艦 Lv {n}", pRecYou: "你目前 Lv {n} · 下一級 {p}%", pRecLow: "建議先升級再出戰", pRecHow: "船艦 Lv 會隨更強的砲、船體、船帆、裝備或更大的船提高。", pRecCalc: "（他的等級 Lv {b} ＋ {m} 級保險）",
  pRecWhy: "他的船頭上寫著 Lv {b}。多抓 {m} 級，是因為開打時附近的其他船可能會跑來幫忙。", pRecWhyEsc: "他的船頭上寫著 Lv {b}。多抓 {m} 級，是因為開打時他的護衛艦和附近的其他船都會來幫忙。",
  lvHow: "船艦 Lv 是你這艘船的戰力：換更強的砲（升級或對調）、升級船體、船帆、裝備，或換大一點的船都會提高。敵船頭上的等級用同一套標準。" });

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
const bountyMargin = b => b.margin ?? BOSS_MARGIN + (b.escorts.length ? ESCORT_MARGIN : 0);   // b.margin: a bounty that sets its own (Red Ned)
function bountyRecLv(b) { return bountyThreat(b) + bountyMargin(b); }
// Under the level it asks for: the line turns red and says so in words (and a "!" mark), so colour is not all it rests on.
const recShort = (n, me) => me < n;
function recLine(b) {
  const th = bountyThreat(b), m = bountyMargin(b), n = th + m, rate = lvProgress(), me = shipRating(), low = recShort(n, me), ready = !low, hint = speedHint(b);
  return `<div class="p-rec${low ? " low" : ""}"><dt>${t("pRec")}</dt><dd><span class="goal${ready ? " ok" : ""}">${t(ready ? "pRecOk" : "pRecLv", { n })} </span>` +
    `<span class="you">· ${t("pRecYou", { n: me, p: rate.pct })}</span> <span class="calc">${t("pRecCalc", { b: th, m })}</span>` + (low ? `<span class="warn">${t("pRecLow")}</span>${typeof lvShortHtml === "function" ? lvShortHtml(n) : `<span class="how">${t("pRecHow")}</span>`}` : "") +
    `<span class="why">${t(b.escorts.length ? "pRecWhyEsc" : "pRecWhy", { b: th, m })} ${t("lvHow")}</span>` + (hint ? `<span class="speed">${hint}</span>` : "") + `</dd></div>`;
}
