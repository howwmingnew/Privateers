"use strict";
// ---------- The ledger's escort actions: buy a slot, post or free a ship, stance, deploy or stand down, pay the bill ----------
// The escort tabs and the choices of an empty slot are drawn by js/ledger-tabs.js and js/ledger-panel.js; their buttons carry data-act "esc*" and
// are handled by harbor.js's click handler through escortAct(), which edits `save` (the pure edits are in js/escorts.js) and returns the sound to
// play, or null. A gun's moves between ships are js/gunbay.js (gfrom).
Object.assign(STR.en, { escOrder: "Buy slot {n} first", escDown: "No ship aboard: assign one to deploy it" });
Object.assign(STR.zh, { escOrder: "先購買船位 {n}", escDown: "沒有指派船：先指派一艘才能出戰" });
const ESC_ACTS = ["escGift", "escBuy", "escOn", "escStance", "escPay", "escAssign", "escBuyShip", "escEvict"];

// A big spend (a slot, a ship) takes two taps: the first arms the button as "Confirm purchase?". It stays armed, with no timer to run out under a slow
// reader (#107): the second tap buys, and a tap anywhere else, Esc, or leaving the panel puts it down again (harbor.js click handler, cancelArm).
const armAttrs = () => ` data-armed="1"`;
let armKey = null, armAt = 0;
const armedTap = key => armKey === key;
// Put every armed button down (the escort buys and harbor.js's ship buy share the one rule); true when one was armed.
function disarm() { const was = armKey !== null || (typeof shipArmed !== "undefined" && shipArmed !== null); armKey = null; if (typeof shipArmed !== "undefined") shipArmed = null; return was; }
// Esc (js/menu.js goBack): an armed button is put down before anything else closes.
function cancelArm() { if (!disarm()) return false; renderPort(); return true; }
// A confirm that was armed in one visit must not wait, still armed, in the next: docking and sailing both put it down (no re-render needed).
onHook("dock", disarm);
onHook("sail", disarm);
function twoTap(key) {   // true on the confirming second tap
  if (armKey === key && performance.now() - armAt < 400) return false;   // a double-click is not a second tap
  if (armKey !== key) {
    disarm(); armKey = key; armAt = performance.now();
    renderPort(); Snd.play("uiClick");   // the page re-renders with the button relabelled (focus follows, js/ledger-nav.js)
    return false;
  }
  armKey = null;
  return true;
}

function escortAct(act, d) {
  if (act === "escGift") { tab = 1; resetLedgerPick(); giftCard = ""; return "uiClick"; }   // the next-step card's button: the Escort 1 tab (js/escort-gift.js, js/ledger-tabs.js)
  const i = Number(d.id), e = save.escorts[i];
  if (act === "escBuy") {
    if (i !== save.escorts.length || !escortOpen(save, i) || save.gold < escortPrice(i) || !twoTap("escBuy" + i)) return null;
    const next = buyEscortSlot(save);
    if (!next) return null;
    save = next; portMsg = ["escBought", { n: i + 1 }];
    return "buy";
  }
  if (!e) return null;
  let next = null;
  if (act === "escStance") next = setEscort(save, i, { stance: d.k });
  else if (act === "escOn") next = setEscort(save, i, { on: d.v === undefined ? !e.on : d.v === "1" });
  else if (act === "escPay") next = payEscort(save, i);
  else if (act === "escAssign" || act === "escBuyShip" || act === "escEvict") {   // the ship in the slot changes: what was picked on the old one is gone
    const was = save.store.length;
    if (act === "escAssign") next = setEscort(save, i, { id: d.ship });
    else if (act === "escEvict") next = setEscort(save, i, { id: "" });
    else if (!escortLockedBuy(i, d.type) && twoTap(`eship${i}:${d.type}`)) next = buyShipForEscort(save, i, d.type);
    if (!next) return null;
    const spill = next.store.length - was, ship = act === "escEvict" ? escortShipOf(save, e) : null, now = escortShipOf(next, next.escorts[i]);
    if (act === "escEvict") portMsg = [spill > 0 ? "escEvictedGuns" : "escEvicted", { n: i + 1, m: spill }];
    else if (act === "escBuyShip") portMsg = ["escBoughtShip", { ship: t("s_" + d.type), n: i + 1 }];
    else portMsg = [spill > 0 ? "escAssignedSpill" : "escAssigned", { ship: now ? shipNameOf(now) : "", n: i + 1, m: spill }];
    save = next; resetLedgerPick();
    return "buy";
  }
  if (!next) return null;
  save = next;
  return act === "escPay" ? "buy" : "uiClick";
}
const escortLockedBuy = (i, type) => !!shipLock(type) || !save.escorts[i];   // js/campaign.js: a hull a Letter of Marque has not opened
