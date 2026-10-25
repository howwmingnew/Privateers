"use strict";
// ---------- The ledger's escort actions: buy a slot, post or free a ship, stance, deploy or stand down, pay the bill ----------
// The escort tabs and the choices of an empty slot are drawn by js/ledger-tabs.js and js/ledger-panel.js; their buttons carry data-act "esc*" and
// are handled by harbor.js's click handler through escortAct(), which edits `save` (the pure edits are in js/escorts.js) and returns the sound to
// play, or null. A gun's moves between ships are js/gunbay.js (gfrom).
Object.assign(STR.en, { escOrder: "Buy slot {n} first", escDown: "No ship aboard: assign one to deploy it" });
Object.assign(STR.zh, { escOrder: "先購買船位 {n}", escDown: "沒有指派船：先指派一艘才能出戰" });
const ESC_ACTS = ["escBuy", "escOn", "escStance", "escPay", "escAssign", "escBuyShip", "escEvict"];

// A second tap within a few seconds confirms a big spend (a slot, a ship): the first tap arms the key and shows the button as "Press again".
// The armed button shows how long is left: a bar that drains over ARM_MS (css/ledger.css [data-armed]), already part-way when the page re-renders.
const ARM_MS = 6000;
const armAttrs = at => ` data-armed="1" style="animation-duration:${ARM_MS}ms;animation-delay:-${Math.min(ARM_MS, Math.max(0, performance.now() - at)).toFixed(0)}ms"`;
let armKey = null, armAt = 0, armTimer;
const armedTap = key => armKey === key;
function twoTap(key) {   // true on the confirming second tap
  if (armKey === key && performance.now() - armAt < 400) return false;   // a double-click is not a second tap
  clearTimeout(armTimer);
  if (armKey !== key) {
    armKey = key; armAt = performance.now();
    armTimer = setTimeout(() => { armKey = null; if (!portEl.hidden) renderPort(); }, ARM_MS);
    renderPort(); Snd.play("uiClick");   // the page re-renders with the button relabelled (focus follows, js/ledger-nav.js)
    return false;
  }
  armKey = null;
  return true;
}

function escortAct(act, d) {
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
