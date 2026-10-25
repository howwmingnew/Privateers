"use strict";
// ---------- Harbor ----------
// prior: what a quick resupply on this pass through the ring already sold (js/mooring.js), for the ledger's message.
function dock(kind, prior = { sold: 0, bonus: 0, cargo: 0, sunk: 0 }) {
  const svc = serviceOf(kind);   // js/ports.js: a supply station neither buys nor sells, a trade port does not mend
  runHook("dock", kind, svc.sell ? cargo : 0);   // kind "outpost" docks at the Hulk Outpost (js/campaign.js)
  paused = true; docked = true; deckSel = null; gunNote = null; if (typeof resetLedgerPick === "function") resetLedgerPick();   // js/ledger-tabs.js: tab, hull panel, candidate card
  const tally = { sunk: streak, cargo: Math.round(cargo) };
  const sale = svc.sell ? sellHold(kind) : { sold: 0, bonus: 0 };   // the hold sells at the sortie's plunder-streak price (js/plunder.js)
  const sold = sale.sold + prior.sold, bonus = Math.max(sale.bonus, prior.bonus);
  if (svc.sell) { save.gold += sale.sold; cargo = 0; save.salvage = []; }   // salvage aboard is sold now
  const hull = player.hp;
  applyPlayerStats(true);
  if (isStationKind(kind)) player.hp = Math.min(player.maxHp, hull);   // a station's ledger does not mend the hull for free
  player.speed = 0; player.burnT = 0;
  persist();
  // keep the message as a key so it re-renders when the language changes
  if (kind === "welcome") portMsg = [save.sunk === 0 ? "welcome" : "welcomeBack"];
  else if (kind === "sunk") portMsg = lastLost > 0 ? ["sunkWreckHalf", { n: fmt(lastLost) }] : [lastLostExtra ? "sunkLoss" : "sunkMsg"];
  else if (kind === "supply") portMsg = ["supplyMsg"];
  else if (kind === "trade") portMsg = sold > 0 ? (bonus > 0 ? ["tradeSoldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["tradeSold", { n: fmt(sold) }]) : ["tradeEmpty"];
  else portMsg = sold > 0 ? (bonus > 0 ? ["soldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["sold", { n: fmt(sold) }]) : ["empty"];
  renderPort();
  document.getElementById("port").hidden = false;
  paintGunDeck();   // the ship needs the shown layout; the deck's ResizeObserver only fires on the next rendered frame
  document.querySelector("#port .sheet").scrollTop = 0;   // the result message is at the top; never open scrolled past it
  Snd.music("harbor"); Snd.ambience("harbor");
  if (kind === "return" || isStationKind(kind)) Snd.play("bell");
  // count-up (js/juice-ui.js): the visit's whole sale, the quick one on the way in included, so it says what the ledger line and the purse do
  if (sale.sold > 0 && (kind === "return" || kind === "outpost" || kind === "trade")) sortieTally({ sunk: tally.sunk + (prior.sunk || 0), cargo: tally.cargo + (prior.cargo || 0), bonus, gold: sold });
  document.getElementById("joy").hidden = true; joyVec = { x: 0, y: 0, m: 0 };
}
function setSail() {
  document.getElementById("port").hidden = true;
  docked = false; paused = false; canDock = false;
  resetEnemies(S);
  Snd.play("sail"); Snd.music("sea"); Snd.ambience("sea");
  runHook("sail");   // the bounty's ship takes up its lair, a new sortie starts (js/campaign.js, js/logbook.js)
}
// Every departure starts from a fresh sea: no ship left waiting outside the harbor, no shot still in flight.
function resetEnemies(sc) {
  for (const e of enemies) { sc.tweens.killTweensOf(e.spr); e.spr.destroy(); e.badge?.destroy(); }
  enemies.length = 0;
  for (const b of balls) ballFree(b);   // back to the pool (js/ball-pool.js)
  balls.length = 0;
  // fill up to the sea's ship count (a convoy is several ships from one spawn)
  for (let i = 0; i < ENEMY_COUNT * 2 && enemies.filter(e => e.alive && !e.boss && !e.escortOf).length < ENEMY_COUNT; i++) spawnEnemy(sc);
  seaReset(sc);   // shore batteries and their treasure (js/forts.js)
}

let portMsg = ["welcome"];
// Buying a ship costs its full price, so the button needs a second tap within a few seconds.
let shipArmed = null, shipArmedAt = 0, shipArmTimer;
// A model you cannot pay for yet says how much is missing (like the upgrade buttons, js/gunbay.js upgradeLabel).
const buyLabel = id => save.gold < SHIPS[id].cost ? t("buyShort", { n: fmt(SHIPS[id].cost), d: fmt(SHIPS[id].cost - save.gold) })
  : t(ownedShips().some(e => e.ship === id) ? "buyAnother" : "buy", { n: fmt(SHIPS[id].cost), cost: fmt(SHIPS[id].cost) });
function renderPort() {
  const $ = id => document.getElementById(id);
  $("pMsg").innerHTML = t(...portMsg);
  $("pGold").textContent = fmt(save.gold);
  const rate = lvProgress();   // Ship Lv and the share of the way to the next (js/lv-path.js)
  $("pStats").innerHTML = `<span><b>${t("s_" + save.ship)}</b></span><span>${t("statLvP", { n: rate.lv, p: rate.pct })}</span><span><b>${YARD.hull.show(yardVal("hull"))}</b></span>` +
    `<span><b>${YARD.sails.show(yardVal("sails"))}</b></span><span>${t("statHold", { n: fmt(yardVal("hold")) })}</span><span>${t("statSunk", { n: save.sunk })}</span>`;
  renderGunBay();   // drops a pick whose place is gone (js/gunbay.js), before the fleet is drawn
  renderFleet();   // the ship tabs, the picked ship's gun deck and the context panel (js/ledger-tabs.js)
  runHook("renderPort");   // wanted poster, outpost layout (js/campaign.js)
}

document.getElementById("port").addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]");
  if (!b && typeof cancelGunPick === "function" && !ev.target.closest("#ctx, .gcard, button, a, input, select, label")) { cancelLedgerPick() || cancelGunPick(); if (typeof cancelGearPick === "function") cancelGearPick(); return; }   // a blank spot puts the picked hull, gun or part down (js/ledger-tabs.js, js/gunbay.js, js/gear-ui.js)
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  let snd = act === "ship" || act === "switch" ? "buy" : act === "yard" ? "upgrade" : "uiClick";
  if (GUN_ACTS.includes(act)) {   // picking, swapping, buying and upgrading guns (js/gunbay.js)
    snd = gunAct(act, b.dataset);
    if (!snd) return;
  } else if (GEAR_ACTS.includes(act)) {   // worn parts, spares, compare, re-roll, lock, break down (js/gear-ui.js)
    snd = gearAct(act, b.dataset);
    if (snd) gunNote = null;   // the gun Undo's snapshot predates this edit: undoing it would bring back a gun scrapped, re-rolled or locked since
    if (!snd) { if (gearNote && gearNote.tip) { renderPort(); Snd.play("denied"); } return; }
  } else if (ESC_ACTS.includes(act)) {   // escort slots, ships, stance and the bill (js/escort-ui.js)
    snd = escortAct(act, b.dataset);
    if (!snd) return;
  } else if (TAB_ACTS.includes(act)) {   // the ship tabs, a picked port or hull, closing the panel (js/ledger-tabs.js)
    snd = tabAct(act, b.dataset);
    if (!snd) return;
  } else if (act === "yard") {   // one level of the picked ship's hull, sails or hold: the flagship's own, or a yard ship's (js/shipyard.js)
    const next = upgradeShipPart(save, b.dataset.id || save.shipId, b.dataset.k);
    if (!next) return;
    save = next;
  } else if (act === "ship") {
    const id = b.dataset.id;
    if (shipLock(id)) return;
    if (shipArmed === id && performance.now() - shipArmedAt < 400) return;   // a double-click is not a second tap
    clearTimeout(shipArmTimer);
    if (shipArmed !== id) {
      shipArmed = id; shipArmedAt = performance.now();
      shipArmTimer = setTimeout(() => {
        shipArmed = null;   // relabel in place rather than re-render, so keyboard focus stays put
        const el = document.querySelector(`[data-act="ship"][data-id="${id}"]`);
        if (el) el.textContent = buyLabel(id);
      }, 3000);
      renderPort(); document.querySelector(`[data-act="ship"][data-id="${id}"]`)?.focus();
      Snd.play("uiClick");
      return;
    }
    shipArmed = null;
    const bought = buyShip(save, id);
    if (!bought) return;
    save = bought; resetLedgerPick();
    portMsg = ["boughtShip", { ship: t("s_" + id) }];
  } else if (act === "switch") {   // a ship from the yard, free; guns that don't fit go back to the store
    const before = save.store.length, next = switchShip(save, b.dataset.id);
    if (!next) return;
    const spill = next.store.length - before;
    save = next; resetLedgerPick();
    portMsg = [spill > 0 ? "switchedSpill" : "switchedShip", { ship: t("s_" + save.ship), n: spill }];
  }
  applyPlayerStats(true); persist(); renderPort(); hud(true);
  Snd.play(snd, { big: act === "ship" || act === "switch" });
  // keyboard focus: a closed panel hands it back to what it was about; any other control the page rebuilt is found again by its data-* (js/ledger-nav.js)
  if (ledgerFocus) { document.querySelector(ledgerFocus)?.focus(); ledgerFocus = null; }
  if (act === "port" || act === "hull") document.getElementById("ctx").scrollIntoView({ block: "nearest" });   // the panel opens under the deck: bring it into view
});
// Not enough gold: a disabled button never receives a click, so listen for the press itself.
document.getElementById("port").addEventListener("pointerdown", ev => { const b = ev.target.closest("[data-act]"); if (b && b.disabled) Snd.play("denied"); });
// A ship with every gun in the store can't fight back, so it stays in port and the ledger says why (js/tech.js).
function trySail() {
  if (MOUNTS.some(({ key }) => save[key].some(Boolean))) { setSail(); return; }
  portMsg = ["noGuns"]; renderPort(); Snd.play("denied");
  document.getElementById("pMsg").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
document.getElementById("sail").addEventListener("click", trySail);
// "Reset progress" moved to the settings panel (js/options.js, wipeProgress).
