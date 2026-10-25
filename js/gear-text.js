"use strict";
// ---------- Gear: the words (parts, rarities, affixes, legendary effects) and the names the ledger and the toasts use ----------
// (gearTitle and gearHint are the ledger page's heading and hint: js/hud.js applies data-i18n once as it loads, so they live here, before it.)
// ga_<key> is an affix line ({n} is a percent), gl_<effect> a legendary effect, gln_<part> a legendary's own name. Numbers in the legendary lines
// come from GEAR_LEGX (js/config.js), so the text never drifts from the rule.
Object.assign(STR.en, {
  gearTitle: "Gear", gearHint: "Seven parts. Sink ships to find them: pick a spare, then tap its part to wear it. Guns are set on the gun deck above. The gear follows you from ship to ship, as far as the hull's tier allows.",
  gp_prow: "Prow", gp_body: "Hull plating", gp_sail: "Sails", gp_gun: "Guns", gp_supply: "Supply hold", gp_instr: "Instruments", gp_flag: "Flag",
  gr_0: "Common", gr_1: "Magic", gr_2: "Rare", gr_3: "Epic", gr_4: "Legendary", gIl: "Item Lv {n}",
  ga_ram: "Collision damage dealt +{n}%", ga_keep: "Keeps {n}% more speed after a collision", ga_brace: "Collision damage taken −{n}%", ga_jolt: "Rammed ships lose {n}% more speed",
  ga_hp: "Hull +{n}%", ga_fire: "Fire damage taken −{n}%", ga_armor: "Cannon damage taken −{n}%",
  ga_spd: "Top speed +{n}%", ga_turn: "Turn rate +{n}%", ga_tail: "Tail wind bonus +{n}%", ga_head: "Head wind slowdown −{n}%",
  ga_gdmg: "Damage +{n}%", ga_grange: "Range +{n}%", ga_greload: "Fire rate +{n}%", ga_gtype: "Gun effect +{n}% (burn, chain slow, ball speed)",
  ga_repair: "Repair at sea +{n}%", ga_cargo: "Hold +{n}%", ga_powder: "Magazine blast chance +{n}%",
  ga_view: "Sight and plunder-reading range +{n}%", ga_aim: "Up to +{n}% damage at full range", ga_storm: "Storm yaw −{n}%", ga_reach: "Every gun's range +{n}%",
  ga_escDef: "Escorts take {n}% less damage", ga_loot: "Plunder +{n}%", ga_heat: "Navy heat gained −{n}%", ga_luck: "Gear drop chance +{n}%",
  gl_scatter: "Ram at {closing}+ px/s: the other ship's rigging tears for {t} s and its line breaks",
  gl_lastStand: "Once a sortie, below {below}% hull: {t} s of −{cut}% damage",
  gl_swift: "After a hard turn: +{k}% speed for {t} s",
  gl_drag: "Hits slow the target {k}% for {t} s",
  gl_dock: "At a supply station, repairs {k}x as fast",
  gl_mark: "Every {cd} s the nearest enemy within {r} px is marked: +{k}% damage taken for {t} s",
  gl_rally: "When you first hit a ship, escorts deal +{k}% damage for {t} s",
  gln_prow: "Leviathan's Beak", gln_body: "Bulwark of Saints", gln_sail: "Albatross Canvas", gln_gun: "Hellmouth", gln_supply: "Bottomless Hold", gln_instr: "Seer's Astrolabe", gln_flag: "Admiral's Colours",
  gGot: "Found: {name} ({r}, Item Lv {n})", gScrapFull: "Bag full: {name} broken down, +{m} fittings", gGotShort: "{name}",
});
Object.assign(STR.zh, {
  gearTitle: "裝備", gearHint: "七個部位。擊沉敵船有機會掉裝備：先點一件備用品，再點它的部位來穿上。火砲請在上方的火砲配置裡設定。裝備會跟著你換船，只要船級夠高就能穿。",
  gp_prow: "船首", gp_body: "船身", gp_sail: "船帆", gp_gun: "火砲", gp_supply: "補給艙", gp_instr: "航海儀器", gp_flag: "旗幟",
  gr_0: "普通", gr_1: "魔法", gr_2: "稀有", gr_3: "史詩", gr_4: "傳說", gIl: "物品等級 {n}",
  ga_ram: "撞擊傷害 +{n}%", ga_keep: "撞擊後多保留 {n}% 速度", ga_brace: "承受的撞擊傷害 −{n}%", ga_jolt: "被撞的船多損失 {n}% 航速",
  ga_hp: "船體耐久 +{n}%", ga_fire: "起火傷害 −{n}%", ga_armor: "承受的砲彈傷害 −{n}%",
  ga_spd: "最高航速 +{n}%", ga_turn: "轉向速度 +{n}%", ga_tail: "順風加速效果 +{n}%", ga_head: "逆風減速 −{n}%",
  ga_gdmg: "傷害 +{n}%", ga_grange: "射程 +{n}%", ga_greload: "射速 +{n}%", ga_gtype: "砲種效果 +{n}%（燃燒、鏈彈減速、彈速）",
  ga_repair: "海上修船速度 +{n}%", ga_cargo: "貨艙 +{n}%", ga_powder: "火藥庫引爆機率 +{n}%",
  ga_view: "視野與看見戰利品的距離 +{n}%", ga_aim: "遠距命中：射程盡頭最多 +{n}% 傷害", ga_storm: "暴風雨偏航 −{n}%", ga_reach: "所有火砲射程 +{n}%",
  ga_escDef: "隨從受到的傷害 −{n}%", ga_loot: "戰利品 +{n}%", ga_heat: "海軍熱度增長 −{n}%", ga_luck: "裝備掉落機率 +{n}%",
  gl_scatter: "以 {closing}+ px/s 撞擊：對方索具斷裂 {t} 秒，隊形被打亂",
  gl_lastStand: "每次出航一次：船體低於 {below}% 時，{t} 秒內傷害 −{cut}%",
  gl_swift: "急轉彎後：航速 +{k}%，持續 {t} 秒",
  gl_drag: "命中使目標航速 −{k}%，持續 {t} 秒",
  gl_dock: "靠補給站時，修船速度 {k} 倍",
  gl_mark: "每 {cd} 秒標記 {r} px 內最近的敵船：{t} 秒內它受到的傷害 +{k}%",
  gl_rally: "你第一次打中某艘船時，隨從的傷害 +{k}%，持續 {t} 秒",
  gln_prow: "利維坦之喙", gln_body: "聖徒壁壘", gln_sail: "信天翁帆", gln_gun: "地獄之口", gln_supply: "無底艙", gln_instr: "先知星盤", gln_flag: "提督戰旗",
  gGot: "獲得：{name}（{r}，物品等級 {n}）", gScrapFull: "背包已滿：{name} 已拆解，+{m} 零件", gGotShort: "{name}",
});
const GEAR_COLORS = ["#cfc8b4", "#6fb1ff", "#f0c766", "#c58aff", "#ff9a4a"];   // text over the dark sea; the ledger's parchment borders are in css/gear.css

// "12" or "1.5": a fraction as a percent, with a decimal only while it is small.
const gearPct = v => { const p = v * 100, s = p < 10 ? p.toFixed(1) : String(Math.round(p)); return s.replace(/\.0$/, ""); };
const gearAffixText = ([k, v]) => t("ga_" + k, { n: gearPct(v) });
// The legendary line of a part: the numbers from GEAR_LEGX, in percent where they are shares.
function gearLegendText(part) {
  const id = GEAR_LEG[part], x = GEAR_LEGX[id], n = {};
  for (const k in x) n[k] = ["k", "cut", "below"].includes(k) && x[k] < 1 ? Math.round(x[k] * 100) : x[k];
  return t("gl_" + id, n);
}
const gearTypeName = it => (it.g ? t("gf_" + it.g) : t("gp_" + it.p));
// The name on a card: a legendary has one of its own, over the kind it is.
const gearTitle = it => (gearR(it) === 4 ? `${t("gln_" + gearPart(it))} · ${gearTypeName(it)}` : gearTypeName(it));
