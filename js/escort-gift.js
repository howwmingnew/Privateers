"use strict";
// ---------- The first escort is a gift (#101): bounty 1 opens slot 1 free and posts a Sloop with a 6-pounder in every port ----------
// Slot 200 + a ship 400 + guns left new captains one bounty chest short of ever sailing with an escort. So the first Letter of Marque
// pays out the whole starter fleet: slot 1 free, a fresh Lv 1 Sloop (the yard cannot sell it, cost 0, so the entry is made here) in it, a new
// Lv 1 6-pounder (gunItem) in each of its ports, deployed on the Normal stance. save.escortGift records what happened so it is never given twice:
// "given" the ship came, "full" the yard had no room (the slot opens free but empty), "had" the captain already owned an escort slot. A save
// from before the gift that already holds bounty 1 and no escort gets it once when the game is ready. Also here: the ledger's "next step"
// card, the total-cost line of a slot, and the escort's estimated damage per second beside the flagship's.
Object.assign(STR.en, {
  pBonus: "Bonus", pGift: "Free escort slot 1 + an armed Sloop",
  giftDone: "Your first escort is in slot 1 (a <em>Sloop</em> with a 6-pounder in every port). Tap the Escort 1 tab above to give it better guns.",
  giftFull: "The yard is full, so no ship came with the bounty. <em>Escort slot 1</em> is open for free: tap the Escort 1 tab above and assign one of your idle ships.",
  giftToast: "Your first escort is in slot 1!", giftToastFull: "Escort slot 1 is open (yard full: no ship sent).", giftGo: "Open Escort 1",
  escCost: "Slot {n} gold, plus a ship if you have no spare (the {ship} from {s} gold) and guns ({g} gold each, or reuse the store's): {t} gold and up.",
  escDps: "Estimated fire: about {d} damage/s, {p}% of the flagship's ({m}/s). Best case, every shot lands.",
});
Object.assign(STR.zh, {
  pBonus: "贈禮", pGift: "免費隨從船位 1＋配好砲的單桅帆船",
  giftDone: "你的第一艘隨從已在船位 1 就位（<em>單桅帆船</em>，每個砲口各配一門 6 磅砲）。點上方「隨從 1」頁籤，可以幫它換砲。",
  giftFull: "船塢已滿，所以這次沒有送船。<em>隨從船位 1</em> 已免費開通：點上方「隨從 1」頁籤，從閒置的船裡指派一艘。",
  giftToast: "你的第一艘隨從已在船位 1 就位！", giftToastFull: "隨從船位 1 已開通（船塢已滿，沒有送船）。", giftGo: "看隨從 1",
  escCost: "船位 {n} 金；沒有閒置的船還要買一艘（{ship} {s} 金起）和砲（每門 {g} 金，庫存裡的砲也能用）：總共 {t} 金起。",
  escDps: "預估輸出：每秒約 {d} 傷害，約主艦火力的 {p}%（主艦約 {m}／秒）。這是每發都命中的最佳情況。",
});
SAVE_DEFAULTS.push(() => ({ escortGift: "" }));
const GIFT_STATES = ["given", "full", "had"], GIFT_SHIP = "sloop";

// Pure: { save, outcome }. outcome is "" when nothing is owed (no bounty yet, or already settled), else the escortGift state just recorded.
function giftEscort(s) {
  if (s.escortGift || s.campaign.bounty < 1) return { save: s, outcome: "" };
  const free = { id: "", on: true, stance: "normal", guns: emptyGuns(""), owed: 0 };
  if (s.escorts.length > 0) return { save: { ...s, escortGift: "had" }, outcome: "had" };
  if (s.fleet.length + 1 >= FLEET_MAX) return { save: { ...s, escortGift: "full", escorts: [free] }, outcome: "full" };
  const seq = Math.max(s.shipSeq, ...ownedShips(s).map(e => idNum(e.id) + 1)), id = "s" + seq, slots = SHIPS[GIFT_SHIP].slots;
  const guns = Object.fromEntries(MOUNTS.map(({ key }) => [key, Array.from({ length: slots[key] }, () => gunItem("six"))]));
  return { save: { ...s, escortGift: "given", shipSeq: seq + 1, fleet: [...s.fleet, { id, ship: GIFT_SHIP, hull: 1, sails: 1, hold: 1 }],
    escorts: [{ ...free, id, guns }] }, outcome: "given" };
}

SAVE_SANITIZERS.push(s => ({ ...s, escortGift: GIFT_STATES.includes(s.escortGift) ? s.escortGift : "" }));

// ---------- The cost of getting a slot going, and an escort's output ----------
// The cheapest ship the yard sells you now (a Letter of Marque may still lock the others), for the "total" line of a slot.
function cheapestShip() {
  const open = Object.keys(SHIPS).filter(id => forSale(id) && !(typeof shipLock === "function" && shipLock(id)));
  return open.sort((a, b) => SHIPS[a].cost - SHIPS[b].cost)[0] || null;
}
function escortStartCost(i) {
  const ship = cheapestShip();
  return ship ? { n: fmt(escortPrice(i)), ship: t("s_" + ship), s: fmt(SHIPS[ship].cost), g: fmt(GUNS.six.cost), t: fmt(escortPrice(i) + SHIPS[ship].cost) } : null;
}
// Damage per second of a battery (escortBattery, js/escorts.js) at the same reload cycle the flagship's guns use, every shot landing.
const batteryDps = bat => { const k = Math.sqrt(ESCORT_FIRE); return Object.values(bat).flat().reduce((a, g) => a + g.dmg / (g.interval + VOLLEY_WARN * k), 0); };
const flagshipDps = (s = save) => batteryDps(escortBattery(s.ship, s));
const escortDps = (ship, guns) => ESCORT_FIRE * batteryDps(escortBattery(ship, guns));

// ---------- In the game ----------
let giftCard = "";   // the ledger's next-step card: a STR key, shown until the next sail
function announceGift(outcome) {
  if (outcome !== "given" && outcome !== "full") return;
  giftCard = outcome === "given" ? "giftDone" : "giftFull";
  toast(t(outcome === "given" ? "giftToast" : "giftToastFull"));
}
// Called by claimBounty (js/campaign.js) once the bounty is counted: hands over the gift on the first one.
function claimEscortGift() {
  const r = giftEscort(save);
  if (!r.outcome) return;
  save = r.save; persist();
  announceGift(r.outcome);
}
onHook("sail", () => { giftCard = ""; });
onHook("ready", () => {   // a save that claimed bounty 1 before the gift existed
  const r = giftEscort(save);
  if (!r.outcome) return;
  save = r.save; persist();
  announceGift(r.outcome);
});
