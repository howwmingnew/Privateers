"use strict";
// ---------- Escorts: up to four yard ships that sail with the flagship ----------
// A slot is paid for once (ESCORT_PRICES, opened by the bounties: slot n after bounty n); the ship in it is any ship waiting in
// the yard (js/shipyard.js), so the hull, sails and name are that ship's own. save.escorts is one entry per slot bought:
//   { id: yard ship id or "", on: sails with you, stance: "active" | "normal" | "passive", gun: a gun type you own, owed: gold still due }
// The escort's guns: every port holds `gun` at the best level of that type you own (so an escort may out-gun the flagship), and
// they fire at ESCORT_FIRE (80%) of what the same ship would. After a sortie each escort that sailed costs a repair fee by the
// hull it lost, at most ESCORT_REPAIR_MAX of the ship's base price; one that went down costs ESCORT_SUNK_FEE of it (at least
// ESCORT_SUNK_MIN). What cannot be paid stays owed, and an escort with a debt waits in port. The sea itself is js/escort-ai.js,
// the ledger page js/escort-ui.js.
Object.assign(STR.en, {
  escTitle: "Escorts", escHint: "Ships from your yard sail beside you. A slot costs gold once; the ships, guns and upgrades are the ones you already own. Sunk or damaged escorts cost a repair fee after the sortie.",
  escSlot: "Escort slot {n}", escBuy: "Buy slot · {n}", escBuyArm: "Press again to buy", escLocked: "Sink bounty {n} to unlock · {price} gold",
  escNone: "No ship assigned", escShip: "Ship", escGun: "Guns", escStance: "Stance", escOn: "Sails with you", escOff: "Stays in port",
  escStay: "Stand down", escDeploy: "Deploy", escRepair: "Repair · {n}", escGone: "Now your flagship: assign another ship",
  escNoSpare: "No spare ship in the yard. Buy another ship, then assign it here.", escChange: "Change",
  escOwed: "Owes {n} gold: pay to sail", escGunLv: "{gun} Lv {lv}", escFire: "Fires at 80% of the same ship's guns",
  st_active: "Active", st_normal: "Normal", st_passive: "Passive",
  stn_active: "Opens fire on enemy ships nearby, from its station", stn_normal: "Keeps station, fights what comes in range or attacks you", stn_passive: "Fires only when attacked, keeps clear when hurt",
  escReport: "Last sortie's escorts: {n} gold in repairs.", escReportSunk: " Lost: {names}.",
  escSunkToast: "{name} went down!", escBought: "Escort slot {n} bought.", escSailed: "{n} escort(s) sail with you.",
  escAlly: "Escort",
});
Object.assign(STR.zh, {
  escTitle: "隨從艦隊", escHint: "從船塢指派的船會跟在你身邊。船位只買一次；船、砲和升級都用你已經有的。出航後若隨從受損或沉沒，要付修理費。",
  escSlot: "隨從船位 {n}", escBuy: "購買船位 · {n}", escBuyArm: "再按一次確認購買", escLocked: "擊敗首領 {n} 後解鎖 · {price} 金",
  escNone: "尚未指派船", escShip: "船", escGun: "火砲", escStance: "攻擊傾向", escOn: "跟你出航", escOff: "留在港裡",
  escStay: "停用", escDeploy: "出戰", escRepair: "修理 · {n}", escGone: "已成為你的主艦：請改派別艘",
  escNoSpare: "船塢裡沒有多餘的船。請先買一艘船，再來這裡指派。", escChange: "更換",
  escOwed: "欠 {n} 金：付清才能出航", escGunLv: "{gun} Lv {lv}", escFire: "火力是同一艘船主艦的 80%",
  st_active: "主動", st_normal: "一般", st_passive: "被動",
  stn_active: "主動攻擊附近的敵船，但不離開隊形", stn_normal: "跟著你，打進入射程或攻擊你的敵人", stn_passive: "只在被攻擊時還擊，受傷就退到你身邊",
  escReport: "上次出航的隨從：修理費 {n} 金。", escReportSunk: "沉沒：{names}。",
  escSunkToast: "{name} 沉沒了！", escBought: "已購買隨從船位 {n}。", escSailed: "{n} 艘隨從跟你出航。",
  escAlly: "隨從",
});
SAVE_DEFAULTS.push(() => ({ escorts: [] }));

const ESCORT_STANCES = ["active", "normal", "passive"];
const escortPrice = i => ESCORT_PRICES[i] ?? Infinity;
// Slot i (0-based) opens when bounty i + 1 has been claimed.
const escortOpen = (s, i) => i >= 0 && i < ESCORT_SLOTS && s.campaign.bounty >= i + 1;
// The best level you own of a gun type: an escort mounts that level in every port (0 = none owned).
const escortGunLv = (s, type) => allGuns(s).reduce((m, g) => g.g === type ? Math.max(m, g.lv) : m, type === "six" ? 1 : 0);   // the 6-pounder is always at hand
// Gun types an escort may carry: the ones you own (the 6-pounder always).
const escortGunTypes = s => GUN_ORDER.filter(g => g === "six" || escortGunLv(s, g) > 0);
const escortGunOf = (s, e) => escortGunLv(s, e.gun) > 0 ? e.gun : "six";
// The yard ship in slot i, or null (nothing assigned, or it is the flagship now).
const escortShipOf = (s, e) => (e && e.id ? s.fleet.find(x => x.id === e.id) : null) || null;
// Yard ships a slot may take: spare ones not already in another slot (and the slot's own).
const escortCandidates = (s, i) => s.fleet.filter(x => !s.escorts.some((e, k) => k !== i && e.id === x.id));

// Repair fee after a sortie: hull lost x ESCORT_REPAIR_MAX of the base price, or the sunk fee. A free hull (the sloop) mends free.
function escortFee(price, hpFrac, sunk) {
  if (sunk) return Math.max(ESCORT_SUNK_MIN, Math.round(price * ESCORT_SUNK_FEE));
  return Math.round(price * ESCORT_REPAIR_MAX * clamp(1 - hpFrac, 0, 1));
}
// The guns an escort of yard ship `ship` carries: every port holds `type` at level `lv`. Reload is lengthened so the whole
// is ESCORT_FIRE of the flagship's (js/fleet.js fleetFirepower finishes it with looser aim): `interval` + VOLLEY_WARN is one cycle,
// so the two halves of the cut land on the same cycle the main ship's rate sets (60 / rpm).
function escortBattery(ship, type, lv) {
  const sh = SHIPS[ship], g = GUNS[type], m = gunLvMul(lv) * (sh.gunK || 1), k = Math.sqrt(ESCORT_FIRE);
  const one = { dmg: g.dmg * m, burn: g.burn ? g.burn * m : 0, chain: !!g.chain, range: g.range, speed: g.speed || BALL_SPEED,
    interval: Math.max(0.3, 60 / g.rpm - VOLLEY_WARN * k), cd: 0 };
  return Object.fromEntries(["bow", "left", "right", "stern"].map(key => [key, Array.from({ length: sh.slots[key] }, () => ({ ...one }))]));
}
// What the flagship's own guns of the same make deal per second (no uptime), the 100% an escort is measured against.
const mainGunDps = (ship, type, lv) => { const sh = SHIPS[ship], g = GUNS[type], n = Object.values(sh.slots).reduce((a, b) => a + b, 0); return n * g.dmg * gunLvMul(lv) * (sh.gunK || 1) * g.rpm / 60; };
// The class plan an escort's hull fights by (js/archetypes.js archTactic).
const ESCORT_PLAN = { sloop: "circle", schooner: "circle", gunboat: "circle", brigantine: "circle", brig: "circle", cruiser: "orbit", frigate: "orbit", corsair: "orbit", line: "line" };
const ESCORT_TURN = { sloop: 1.2, schooner: 1.15, gunboat: 1, brigantine: 1.1, brig: 1, cruiser: 1.05, frigate: 0.9, corsair: 1.05, line: 0.6 };   // x the AI's 1.7 rad/s, like the enemy classes

// ---------- Save edits (pure: each returns a new save, or null when it cannot be done) ----------
function buyEscortSlot(s) {
  const i = s.escorts.length;
  if (!escortOpen(s, i) || s.gold < escortPrice(i)) return null;
  return { ...s, gold: s.gold - escortPrice(i), escorts: [...s.escorts, { id: "", on: true, stance: "normal", gun: "six", owed: 0 }] };
}
// Change one slot. patch: { id, on, stance, gun }; anything invalid returns null.
function setEscort(s, i, patch) {
  const cur = s.escorts[i];
  if (!cur) return null;
  const next = { ...cur, ...patch };
  if (patch.id !== undefined && patch.id !== "" && (!s.fleet.some(x => x.id === patch.id) || s.escorts.some((e, k) => k !== i && e.id === patch.id))) return null;
  if (!ESCORT_STANCES.includes(next.stance) || !GUN_ORDER.includes(next.gun) || (patch.gun !== undefined && escortGunLv(s, next.gun) <= 0)) return null;
  return { ...s, escorts: s.escorts.map((e, k) => k === i ? { ...next, on: !!next.on } : e) };
}
// Pay what is owed on slot i. Returns the save, or null when there is nothing to pay or not enough gold.
function payEscort(s, i) {
  const e = s.escorts[i];
  if (!e || !(e.owed > 0) || s.gold < e.owed) return null;
  return { ...s, gold: s.gold - e.owed, escorts: s.escorts.map((x, k) => k === i ? { ...x, owed: 0 } : x) };
}
// An escort sails when it is on, has a yard ship, and owes nothing.
const escortReady = (s, i) => { const e = s.escorts[i]; return !!(e && e.on && e.owed <= 0 && escortShipOf(s, e)); };
// The sortie's bill, as a new save: `results` is [{ slot, hpFrac, sunk }]. Each fee is paid from gold as far as it goes; the rest is owed.
function billEscorts(s, results) {
  let gold = s.gold, paid = 0;
  const escorts = s.escorts.map(e => ({ ...e }));
  for (const r of results) {
    const e = escorts[r.slot], ship = e && escortShipOf(s, e);
    if (!e || !ship) continue;
    const fee = escortFee(SHIPS[ship.ship].cost, r.hpFrac, r.sunk), pay = Math.min(gold, fee);
    gold -= pay; paid += pay; e.owed += fee - pay;
  }
  return { save: { ...s, gold, escorts }, paid };
}

SAVE_SANITIZERS.push(s => {
  const seen = new Set(), escorts = [];
  for (const e of Array.isArray(s.escorts) ? s.escorts : []) {
    if (!isObj(e) || escorts.length >= ESCORT_SLOTS) continue;
    const id = typeof e.id === "string" && SHIP_ID.test(e.id) && !seen.has(e.id) ? e.id : "";
    if (id) seen.add(id);
    escorts.push({ id, on: e.on !== false, stance: ESCORT_STANCES.includes(e.stance) ? e.stance : "normal",
      gun: typeof e.gun === "string" && Object.hasOwn(GUNS, e.gun) ? e.gun : "six", owed: toInt(e.owed, 0, 1e7, 0) });
  }
  return { ...s, escorts };
});
