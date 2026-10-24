"use strict";
// ---------- Ship lines: the fast line and the heavy line (numbers in js/data.js SHIPS), names and the ledger's comparison ----------
// Every tier 2-5 has one ship on each line. shipCompare() sets a ship's base stats against another's, so the yard can say
// what choosing it costs and buys: "Speed +27% · Hull -20%". The yard sells by line (js/harbor.js).
Object.assign(STR.en, {
  line_fast: "Fast line: speed and turn, fewer guns", line_heavy: "Heavy line: guns, hull and hold, slower",
  lineTag_fast: "Fast", lineTag_heavy: "Heavy",
  s_gunboat: "Gunboat", s_brigantine: "Brigantine", s_cruiser: "Cruiser", s_corsair: "Corsair",
  shipGuns: " · <b>{n}</b> guns in all", shipTurn: " · turns <b>×{k}</b>",
  cmpHead: "Against a new {ship}:", cmpSpeed: "Speed", cmpTurn: "Turn", cmpHull: "Hull", cmpHold: "Hold", cmpFire: "Firepower", cmpSame: "about the same",
  pRecFast: "You outrun it by {n}%: fight from range and break off when hurt.",
  pRecSlow: "It outruns you by {n}%: there is no running from it, so bring the hull.",
});
Object.assign(STR.zh, {
  line_fast: "快速線：速度與轉向，砲較少", line_heavy: "重砲線：砲、船體與貨艙，較慢",
  lineTag_fast: "快速", lineTag_heavy: "重砲",
  s_gunboat: "砲艇", s_brigantine: "雙桅快帆船", s_cruiser: "巡航艦", s_corsair: "私掠快艦",
  shipGuns: " · 共 <b>{n}</b> 門砲", shipTurn: " · 轉向 <b>×{k}</b>",
  cmpHead: "與全新的{ship}相比：", cmpSpeed: "速度", cmpTurn: "轉向", cmpHull: "船體", cmpHold: "貨艙", cmpFire: "火力", cmpSame: "差不多",
  pRecFast: "你比它快 {n}%：拉開距離開火，受傷就脫離。",
  pRecSlow: "它比你快 {n}%：跑不掉，要靠船體硬扛。",
});

const SHIP_LINE_KEYS = ["fast", "heavy"];
const shipGuns = sh => MOUNTS.reduce((n, m) => n + sh.slots[m.key], 0);
const shipFire = sh => shipGuns(sh) * (sh.gunK || 1);   // guns x the damage each one lands: the whole battery's weight
// Base stats of `a` against `b`, as signed whole-percent changes.
function shipCompare(a, b) {
  const pct = (x, y) => Math.round((x / y - 1) * 100);
  return { cmpSpeed: pct(a.speed, b.speed), cmpTurn: pct(a.turn || 1, b.turn || 1), cmpHull: pct(a.hp, b.hp), cmpHold: pct(a.hold, b.hold), cmpFire: pct(shipFire(a), shipFire(b)) };
}
// "Speed +27% · Turn +10% · Hull -20%": the sign is spelled out, so colour is never the only cue.
function shipCmpHtml(sh, vs, vsId) {
  const cmp = shipCompare(sh, vs);
  const parts = Object.entries(cmp).map(([k, v]) => Math.abs(v) < 3 ? "" :
    `<span class="${v > 0 ? "gain" : "loss"}">${t(k)} ${v > 0 ? "+" : "−"}${Math.abs(v)}%</span>`).filter(Boolean);
  return `<div class="ds cmp"><i>${t("cmpHead", { ship: t("s_" + vsId) })}</i> ${parts.length ? parts.join(" · ") : t("cmpSame")}</div>`;
}
