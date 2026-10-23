"use strict";
// ---------- Recommended ship level for a bounty (a line on the Wanted poster, js/campaign-ui.js) ----------
// A boss is much stronger than its level: three or four times the hull, sometimes more guns, and escorts. Its strength
// here is the same "power" the ship rating uses (sqrt(hull x broadside dps), js/data.js enemyPower), from the boss's
// real hull and guns. Escorts count at half weight: they can be fought apart, and other ships often draw them off.
// The recommendation is the lowest Ship Lv whose power matches that, shown with the badge glyph against your own.
Object.assign(STR.en, { pRec: "Recommended", pRecLv: "Ship Lv {n}", pRecYou: "you: Lv {n}" });
Object.assign(STR.zh, { pRec: "建議等級", pRecLv: "船艦 Lv {n}", pRecYou: "你目前 Lv {n}" });

const ESCORT_WEIGHT = 0.5;
function bountyPower(b) {
  const st = enemyStats(b.L + levelBonus(), false);
  const ship = (spec, w) => ({ hp: st.hp * (spec.hpMul || 1) * w, dps: (spec.guns ?? st.per) * st.dmg / st.interval * w });
  const all = [ship(b, 1), ...b.escorts.map(e => ship(e, ESCORT_WEIGHT))];
  const hp = all.reduce((s, x) => s + x.hp, 0), dps = all.reduce((s, x) => s + x.dps, 0);
  return Math.sqrt(hp * dps);
}
function bountyRecLv(b) {
  const p = bountyPower(b);
  let L = 1;
  while (L < 40 && enemyPower(L) < p) L++;
  return L;
}
function recLine(b) {
  const n = bountyRecLv(b), tier = threatTier(n);
  return `<div class="p-rec"><dt>${t("pRec")}</dt><dd><span class="tier${tier.color === "#d9493a" ? " dark" : ""}" style="background:${tier.color}">${tier.glyph} ${t("pRecLv", { n })}</span>` +
    ` <span class="you">· ${t("pRecYou", { n: shipRating() })}</span></dd></div>`;
}
