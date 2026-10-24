"use strict";
// ---------- Harbor ----------
// prior: what a quick resupply on this pass through the ring already sold (js/mooring.js), for the ledger's message.
function dock(kind, prior = { sold: 0, bonus: 0 }) {
  const svc = serviceOf(kind);   // js/ports.js: a supply station neither buys nor sells, a trade port does not mend
  runHook("dock", kind, svc.sell ? cargo : 0);   // kind "outpost" docks at the Hulk Outpost (js/campaign.js)
  paused = true; docked = true; deckSel = null;
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
  else if (kind === "sunk") portMsg = lastLost > 0 ? ["sunkWreckHalf", { n: fmt(lastLost) }] : ["sunkMsg"];
  else if (kind === "supply") portMsg = ["supplyMsg"];
  else if (kind === "trade") portMsg = sold > 0 ? (bonus > 0 ? ["tradeSoldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["tradeSold", { n: fmt(sold) }]) : ["tradeEmpty"];
  else portMsg = sold > 0 ? (bonus > 0 ? ["soldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["sold", { n: fmt(sold) }]) : ["empty"];
  renderPort();
  document.getElementById("port").hidden = false;
  paintGunDeck();   // the ship needs the shown layout; the deck's ResizeObserver only fires on the next rendered frame
  document.querySelector("#port .sheet").scrollTop = 0;   // the result message is at the top; never open scrolled past it
  Snd.music("harbor"); Snd.ambience("harbor");
  if (kind === "return" || isStationKind(kind)) Snd.play("bell");
  if (sale.sold > 0 && (kind === "return" || kind === "outpost" || kind === "trade")) sortieTally({ ...tally, bonus: sale.bonus, gold: sale.sold });   // count-up (js/juice-ui.js)
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
  for (const b of balls) b.spr.destroy();
  balls.length = 0;
  // fill up to the sea's ship count (a convoy is several ships from one spawn)
  for (let i = 0; i < ENEMY_COUNT * 2 && enemies.filter(e => e.alive && !e.boss && !e.escortOf).length < ENEMY_COUNT; i++) spawnEnemy(sc);
  seaReset(sc);   // shore batteries and their treasure (js/forts.js)
}

let portMsg = ["welcome"];
// Buying a ship costs its full price, so the button needs a second tap within a few seconds.
let shipArmed = null, shipArmedAt = 0, shipArmTimer;
function renderPort() {
  const $ = id => document.getElementById(id);
  $("pMsg").innerHTML = t(...portMsg);
  $("pGold").textContent = fmt(save.gold);
  $("pStats").innerHTML = `<span><b>${t("s_" + save.ship)}</b></span><span>${t("statLv", { n: shipRating() })}</span><span><b>${YARD.hull.show(yardVal("hull"))}</b></span>` +
    `<span><b>${YARD.sails.show(yardVal("sails"))}</b></span><span>${t("statHold", { n: fmt(yardVal("hold")) })}</span><span>${t("statSunk", { n: save.sunk })}</span>`;
  renderGunBay();   // the picked gun's card and the gun store (js/gunbay.js), before the deck so a picked port shows lit
  renderDeck($("deck"));   // gun deck: the ship bow-up with each gun port beside its muzzle (js/deck-art.js)
  $("armory").innerHTML = armoryHtml();
  // shipwright
  $("yard").innerHTML = Object.entries(YARD).map(([k, y]) => {
    const lv = save[k], cur = y.show(yardVal(k));
    let btn, ds;
    if (lv >= y.max) { btn = `<button class="btn max" type="button" disabled>${t("max")}</button>`; ds = `<b>${cur}</b>`; }
    else { const c = y.cost(lv); btn = `<button class="btn" type="button" data-act="yard" data-k="${k}" ${save.gold < c ? "disabled" : ""}>${t("upgrade", { n: fmt(c) })}</button>`;
      ds = `<b>${cur}</b> <span class="up">→ ${y.show(yardVal(k, lv + 1))}</span>`; }
    return `<div class="item"><div class="nm">${t("y_" + k)}<small>Lv ${lv}</small></div>${btn}<div class="ds">${ds}</div></div>`;
  }).join("");
  // ships: the ones bought (switch free), then every model the yard sells (js/shipyard.js)
  const owned = ownedShips(), count = {};
  for (const e of owned) count[e.ship] = (count[e.ship] || 0) + 1;
  const shipDs = (sh, h, s, o) => t("shipDs", { b: sh.slots.bow, s: sh.slots.left, t: sh.slots.stern,
    hp: YARD.hull.show(yardVal("hull", h, sh)), kn: YARD.sails.show(yardVal("sails", s, sh)), cargo: fmt(yardVal("hold", o, sh)) }) + (sh.gunK ? t("gunK", { k: sh.gunK }) : "");
  const mine = owned.map(e => {
    const sh = SHIPS[e.ship], me = e.id === save.shipId, nm = count[e.ship] > 1 ? t("shipNo", { ship: t("s_" + e.ship), n: idNum(e.id) }) : t("s_" + e.ship);
    const label = e.name ? `${esc(e.name)}<small>${nm}</small>` : nm;   // the ship's own name (js/flags.js)
    const btn = me ? `<button class="btn max" type="button" disabled>${t("yourShip")}</button>` : `<button class="btn" type="button" data-act="switch" data-id="${e.id}">${t("switchTo")}</button>`;
    return `<div class="item"><div class="nm">${label}</div>${btn}<div class="ds">${shipDs(sh, e.hull, e.sails, e.hold)}${t("shipLvs", { h: e.hull, s: e.sails, o: e.hold })}</div></div>`;
  }).join("");
  const full = owned.length >= FLEET_MAX;
  const sale = SHIP_ORDER.filter(forSale).map(id => {
    const sh = SHIPS[id], lock = shipLock(id);   // Letters of Marque gate (js/campaign.js): null, or why not yet
    const btn = lock ? `<button class="btn" type="button" data-act="ship" data-id="${id}" disabled>${t("locked")}</button>`
      : full ? `<button class="btn" type="button" data-act="ship" data-id="${id}" disabled>${t("yardFull")}</button>`
      : `<button class="btn" type="button" data-act="ship" data-id="${id}" ${save.gold < sh.cost ? "disabled" : ""}>${shipArmed === id ? t("shipArm") : t("buy", { n: fmt(sh.cost) })}</button>`;
    return `<div class="item${lock ? " locked" : ""}"><div class="nm">${t("s_" + id)}</div>${btn}<div class="ds">${shipDs(sh, 1, 1, 1)}${lock ? `<span class="lock">${lock}</span>` : ""}</div></div>`;
  }).join("");
  $("ships").innerHTML = `<p class="hint-s">${t("shipsOwned")}</p>${mine}<p class="hint-s">${t("shipsBuy")}</p>${sale}`;
  runHook("renderPort");   // wanted poster, outpost layout (js/campaign.js)
}

document.getElementById("port").addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act;
  let snd = act === "ship" || act === "switch" ? "buy" : act === "yard" ? "upgrade" : "uiClick";
  if (GUN_ACTS.includes(act)) {   // picking, swapping, buying and upgrading guns (js/gunbay.js)
    snd = gunAct(act, b.dataset);
    if (!snd) return;
  } else if (act === "yard") {
    const k = b.dataset.k; save.gold -= YARD[k].cost(save[k]); save[k]++;
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
        if (el) el.textContent = t("buy", { n: fmt(SHIPS[id].cost) });
      }, 3000);
      renderPort(); document.querySelector(`[data-act="ship"][data-id="${id}"]`)?.focus();
      Snd.play("uiClick");
      return;
    }
    shipArmed = null;
    const bought = buyShip(save, id);
    if (!bought) return;
    save = bought; deckSel = null;
    portMsg = ["boughtShip", { ship: t("s_" + id) }];
  } else if (act === "switch") {   // a ship from the yard, free; guns that don't fit go back to the store
    const before = save.store.length, next = switchShip(save, b.dataset.id);
    if (!next) return;
    const spill = next.store.length - before;
    save = next; deckSel = null;
    portMsg = [spill > 0 ? "switchedSpill" : "switchedShip", { ship: t("s_" + save.ship), n: spill }];
  }
  applyPlayerStats(true); persist(); renderPort(); hud(true);
  Snd.play(snd, { big: act === "ship" || act === "switch" });
  // keep focus on the same control after re-render (keyboard users); a stored gun that moved aboard leaves the store
  // shorter, so focus falls back to the stored gun before it, or the port it went to
  const sel = act === "slot" ? `[data-act="slot"][data-side="${b.dataset.side}"][data-i="${b.dataset.i}"]`
    : act === "store" ? [`#bay [data-i="${b.dataset.i}"]`, `#bay [data-i="${b.dataset.i - 1}"]`, "#deck .slot"]
    : act === "swap" ? '#gunSel [data-act="swap"]'
    : act === "ship" || act === "switch" ? `#ships [data-act="${act}"]:not(:disabled), #ships [data-act="ship"]:not(:disabled), #sail` : null;
  if (sel) [].concat(sel).map(q => document.querySelector(q)).find(Boolean)?.focus();
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
