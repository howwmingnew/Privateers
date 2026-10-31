"use strict";
// ---------- Escorts: up to four yard ships that sail with the flagship ----------
// A slot is paid for once (ESCORT_PRICES, opened by the bounties: slot n after bounty n); the ship in it is any ship waiting in
// the yard (js/shipyard.js), so the hull, sails and name are that ship's own. save.escorts is one entry per slot bought:
//   { id: yard ship id or "", on: sails with you, stance: "active" | "normal" | "passive", guns: { bow, left, right, stern }, owed: gold still due }
// The escort's guns are real gun items, exactly like the flagship's mounts: each of `guns.bow/left/right/stern` is an array as long as
// the yard ship's ports (SHIPS[ship].slots), every element a gun item { g, lv, ... } or null. A gun lives in exactly one place (a port
// of the flagship, the store, or a port of an escort), so allGuns (js/data.js) counts them all. When the ship in a slot changes, or
// becomes the flagship, or leaves, the guns that no longer fit go back to the store (fitEscorts): nothing is lost. An escort with no
// gun at all stays in port. Its battery is built per port from the gun item and fires at ESCORT_FIRE (80%) of what the same ship's
// guns would. After a sortie each escort that sailed costs a repair fee by the hull it lost, at most ESCORT_REPAIR_MAX of the ship's
// base price; one that went down costs ESCORT_SUNK_FEE of it (at least ESCORT_SUNK_MIN). What cannot be paid stays owed, and an escort
// with a debt waits in port. The sea itself is js/escort-ai.js, the ledger's actions js/escort-ui.js and js/ledger-tabs.js.
Object.assign(STR.en, {
  escTitle: "Escorts", escHint: "Ships from your yard sail beside you. A slot costs gold once; the ships, guns and upgrades are the ones you already own. Sunk or damaged escorts cost a repair fee after the sortie.",
  escSlot: "Escort slot {n}", escBuy: "Buy slot · {n}", escBuyArm: "Confirm purchase?", escLocked: "Sink bounty {n} to unlock · {price} gold",
  escNone: "No ship assigned", escShip: "Ship", escStance: "Stance", escOn: "Sails with you", escOff: "Stays in port",
  escStay: "Stand down", escDeploy: "Deploy", escRepair: "Repair · {n}", escGone: "Now your flagship: assign another ship",
  escNoSpare: "No spare ship in the yard. Buy another ship, then assign it here.", escChange: "Change",
  escOwed: "Owes {n} gold: pay to sail", escOwedAll: "Escort repair fees ({n} gold) must be paid before they can sail: see each Escort tab.",
  st_active: "Active", st_normal: "Normal", st_passive: "Passive",
  stn_active: "Attacks any enemy it sees, even strong ones, then returns to formation; leaves the Navy alone unless it attacks you or an escort", stn_normal: "Stays beside you and fights what comes close or attacks you; keeps away from much stronger ships and deadlier seas, and never starts on the Navy", stn_passive: "Never starts a fight: shoots back only when hit, and hides behind you when badly hurt",
  escReport: "Last sortie's escorts: {n} gold in repairs.", escReportSunk: " Lost: {names}.",
  escSunkToast: "{name} went down! Its repair fee is due before the next sortie.", escBought: "Escort slot {n} bought.", escSailed: "{n} escort(s) sail with you.",
  escAlly: "Escort", escNoGuns: "No guns aboard: mount one to deploy it",
});
Object.assign(STR.zh, {
  escTitle: "隨從艦隊", escHint: "從船塢指派的船會跟在你身邊。船位只買一次；船、砲和升級都用你已經有的。出航後若隨從受損或沉沒，要付修理費。",
  escSlot: "隨從船位 {n}", escBuy: "購買船位 · {n}", escBuyArm: "確認購買？", escLocked: "擊敗首領 {n} 後解鎖 · {price} 金",
  escNone: "尚未指派船", escShip: "船", escStance: "攻擊傾向", escOn: "跟你出航", escOff: "留在港裡",
  escStay: "停用", escDeploy: "出戰", escRepair: "修理 · {n}", escGone: "已成為你的主艦：請改派別艘",
  escNoSpare: "船塢裡沒有多餘的船。請先買一艘船，再來這裡指派。", escChange: "更換",
  escOwed: "欠 {n} 金：付清才能出航", escOwedAll: "隨從的修理費（共 {n} 金）要付清才能出航：請到各隨從頁繳費。",
  st_active: "主動", st_normal: "一般", st_passive: "被動",
  stn_active: "看到敵船就主動攻擊，再強也打，打完回到隊形；海軍除非先攻擊你或隨從，否則不打", stn_normal: "跟在你旁邊，只打靠近或攻擊你的敵人；遇到強得多的船或更危險的海域會避開，也不主動打海軍", stn_passive: "絕不主動開火，被打才還擊；傷重時躲到你身後",
  escReport: "上次出航的隨從：修理費 {n} 金。", escReportSunk: "沉沒：{names}。",
  escSunkToast: "{name} 沉沒了！下次出航前要先付修理費。", escBought: "已購買隨從船位 {n}。", escSailed: "{n} 艘隨從跟你出航。",
  escAlly: "隨從", escNoGuns: "船上沒有砲：先裝上一門才能出戰",
});
SAVE_DEFAULTS.push(() => ({ escorts: [] }));

const ESCORT_STANCES = ["active", "normal", "passive"];
const escortPrice = i => ESCORT_PRICES[i] ?? Infinity;
// Slot i (0-based) opens when bounty i + 1 has been claimed.
const escortOpen = (s, i) => i >= 0 && i < ESCORT_SLOTS && s.campaign.bounty >= i + 1;
// The yard ship in slot i, or null (nothing assigned, or it is the flagship now).
const escortShipOf = (s, e) => (e && e.id ? s.fleet.find(x => x.id === e.id) : null) || null;
// Yard ships a slot may take: spare ones not already in another slot (and the slot's own).
const escortCandidates = (s, i) => s.fleet.filter(x => !s.escorts.some((e, k) => k !== i && e.id === x.id));

// ---------- The escort's guns ----------
// Ports as empty as the ship has them: { bow: [null], left: [null, null], ... } (no ship: no ports).
const emptyGuns = ship => Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.from({ length: Object.hasOwn(SHIPS, ship) ? SHIPS[ship].slots[key] : 0 }, () => null)]));
const escortGunCount = e => escortGuns(e).filter(Boolean).length;   // escortGuns: js/data.js
// Give every escort exactly as many ports as its ship has (none while it has no ship, or the ship is the flagship). A gun past the
// last port, or on a slot that lost its ship, goes to the store like fitMounts does for the flagship; nothing is dropped. Idempotent.
function fitEscorts(s) {
  if (!Array.isArray(s.escorts)) return s;
  const spill = [];
  const escorts = s.escorts.map(e => {
    const ship = escortShipOf(s, e), have = e.guns || {};
    const guns = Object.fromEntries(MOUNTS.map(({ key }) => {
      const old = Array.isArray(have[key]) ? have[key] : [], n = ship ? SHIPS[ship.ship].slots[key] : 0;
      spill.push(...old.slice(n).filter(Boolean));
      return [key, Array.from({ length: n }, (_, i) => old[i] || null)];
    }));
    return { ...e, guns };
  });
  return { ...s, escorts, store: (s.store || []).concat(spill) };
}

// Repair fee after a sortie: hull lost x ESCORT_REPAIR_MAX of the base price, or the sunk fee. A free hull (the sloop) mends free.
function escortFee(price, hpFrac, sunk) {
  if (sunk) return Math.max(ESCORT_SUNK_MIN, Math.round(price * ESCORT_SUNK_FEE));
  return Math.round(price * ESCORT_REPAIR_MAX * clamp(1 - hpFrac, 0, 1));
}
// The guns an escort of yard ship `ship` carries, one per gun item in `guns` (the escort's own ports; an empty port fires nothing). Each
// gun has the stats the flagship would give the same item (gear affixes included, js/gear-fx.js gxGun) with its reload lengthened so the
// whole is ESCORT_FIRE of the flagship's (js/fleet.js fleetFirepower finishes it with looser aim): `interval` + VOLLEY_WARN is one
// cycle, so the two halves of the cut land on the same cycle the main ship's rate sets (60 / rpm).
function escortBattery(ship, guns) {
  const sh = SHIPS[ship], k = Math.sqrt(ESCORT_FIRE);
  const one = gun => {
    const g = GUNS[gun.g], m = gunLvMul(gun.lv) * (sh.gunK || 1);
    const b = typeof gxGun === "function" ? gxGun(gun, g, m)
      : { dmg: g.dmg * m, burn: g.burn ? g.burn * m : 0, chain: !!g.chain, range: g.range, speed: g.speed || BALL_SPEED, interval: 60 / g.rpm, cd: 0 };
    return { ...b, gt: gun.g, interval: Math.max(0.3, b.interval - VOLLEY_WARN * k), cd: 0 };   // gt: the gun type js/gun-art.js draws
  };
  return Object.fromEntries(MOUNTS.map(({ key }) => [key, ((guns && guns[key]) || []).flatMap(gun => (gun ? [one(gun)] : []))]));
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
  return { ...s, gold: s.gold - escortPrice(i), escorts: [...s.escorts, { id: "", on: true, stance: "normal", guns: emptyGuns(""), owed: 0 }] };
}
// Change one slot. patch: { id, on, stance }; anything invalid returns null. A new id refits the guns to the new ship's ports (the rest go to the store).
function setEscort(s, i, patch) {
  const cur = s.escorts[i];
  if (!cur) return null;
  const next = { ...cur, ...patch };
  if (patch.id !== undefined && patch.id !== "" && (!s.fleet.some(x => x.id === patch.id) || s.escorts.some((e, k) => k !== i && e.id === patch.id))) return null;
  if (!ESCORT_STANCES.includes(next.stance)) return null;
  return fitEscorts({ ...s, escorts: s.escorts.map((e, k) => k === i ? { ...next, on: !!next.on } : e) });
}
// Buy a ship model straight into the yard and assign it to slot i in one step: the flagship stays as it is. The new hull is Lv 1; any guns
// the slot's old ship carried that fit its ports come along (like a switch), the rest go to the store. Null: no such slot, a model not for
// sale or not unlocked, too little gold, or a full yard.
function buyShipForEscort(s, i, type) {
  if (!s.escorts[i] || !canBuyShip(s, type) || !s.campaign.ships.includes(type)) return null;
  const seq = Math.max(s.shipSeq, ...ownedShips(s).map(e => idNum(e.id) + 1));
  const bought = { ...s, gold: s.gold - SHIPS[type].cost, shipSeq: seq + 1, fleet: [...s.fleet, { id: "s" + seq, ship: type, hull: 1, sails: 1, hold: 1 }] };
  return setEscort(bought, i, { id: "s" + seq });
}
// Pay what is owed on slot i. Returns the save, or null when there is nothing to pay or not enough gold.
function payEscort(s, i) {
  const e = s.escorts[i];
  if (!e || !(e.owed > 0) || s.gold < e.owed) return null;
  return { ...s, gold: s.gold - e.owed, escorts: s.escorts.map((x, k) => k === i ? { ...x, owed: 0 } : x) };
}
// An escort sails when it is on, has a yard ship with at least one gun, and owes nothing.
const escortReady = (s, i) => { const e = s.escorts[i]; return !!(e && e.on && e.owed <= 0 && escortShipOf(s, e) && escortGunCount(e) > 0); };
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

// Loading: the guns are cleaned like the flagship's (cleanGun, js/save.js), cut to the ship's ports, and a gun with no port goes to the store.
// A save from before escorts carried guns (it had a shared `gun` type) gets a NEW Lv 1 6-pounder in every port of its ship, the same item
// a bought one is (gunItem), so the escorts it paid for stay armed. An escort with no ship, or whose ship is the flagship now, has none.
SAVE_SANITIZERS.push(s => {
  const seen = new Set(), escorts = [];
  for (const e of Array.isArray(s.escorts) ? s.escorts : []) {
    if (!isObj(e) || escorts.length >= ESCORT_SLOTS) continue;
    const id = typeof e.id === "string" && SHIP_ID.test(e.id) && !seen.has(e.id) ? e.id : "";
    if (id) seen.add(id);
    const ship = id && (s.fleet || []).find(x => x.id === id), mine = isObj(e.guns);
    const guns = mine ? Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.isArray(e.guns[key]) ? e.guns[key].map(v => cleanGun(v)) : []]))
      : Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.from({ length: ship ? SHIPS[ship.ship].slots[key] : 0 }, () => gunItem("six"))]));
    escorts.push({ id, on: e.on !== false, stance: ESCORT_STANCES.includes(e.stance) ? e.stance : "normal", guns, owed: toInt(e.owed, 0, 1e7, 0) });
  }
  return fitEscorts({ ...s, escorts });
});
