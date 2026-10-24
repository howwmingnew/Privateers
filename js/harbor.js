"use strict";
// ---------- Harbor ----------
// prior: what a quick resupply on this pass through the ring already sold (js/mooring.js), for the ledger's message.
function dock(kind, prior = { sold: 0, bonus: 0 }) {
  runHook("dock", kind, cargo);   // kind "outpost" docks at the Hulk Outpost (js/campaign.js)
  paused = true; docked = true; deckSel = null;
  const sale = sellHold(kind);   // the hold sells at the sortie's plunder-streak price (js/plunder.js)
  const sold = sale.sold + prior.sold, bonus = Math.max(sale.bonus, prior.bonus);
  save.gold += sale.sold; cargo = 0; save.salvage = [];   // salvage aboard is sold now
  applyPlayerStats(true);
  player.speed = 0; player.burnT = 0;
  persist();
  // keep the message as a key so it re-renders when the language changes
  if (kind === "welcome") portMsg = [save.sunk === 0 ? "welcome" : "welcomeBack"];
  else if (kind === "sunk") portMsg = lastLost > 0 ? ["sunkWreckHalf", { n: fmt(lastLost) }] : ["sunkMsg"];
  else portMsg = sold > 0 ? (bonus > 0 ? ["soldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["sold", { n: fmt(sold) }]) : ["empty"];
  renderPort();
  document.getElementById("port").hidden = false;
  paintGunDeck();   // the ship needs the shown layout; the deck's ResizeObserver only fires on the next rendered frame
  document.querySelector("#port .sheet").scrollTop = 0;   // the result message is at the top; never open scrolled past it
  Snd.music("harbor"); Snd.ambience("harbor");
  if (kind === "return") { Snd.play("bell"); if (sale.sold > 0) Snd.play("coin", { amount: sale.sold, delay: 0.45 }); }
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
// Buying a ship wipes its yard upgrades, so the button needs a second tap within a few seconds.
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
  // ships: the current one and every bigger one (buying replaces the current ship)
  $("ships").innerHTML = SHIP_ORDER.slice(SHIP_ORDER.indexOf(save.ship)).map(id => {
    const sh = SHIPS[id], lock = shipLock(id);   // Letters of Marque gate (js/campaign.js): null, or why not yet
    const credit = id === save.ship ? 0 : tradeInCredit(id), net = sh.cost - credit;   // trade-in (js/plunder.js)
    const btn = id === save.ship ? `<button class="btn max" type="button" disabled>${t("yourShip")}</button>`
      : lock ? `<button class="btn" type="button" data-act="ship" data-id="${id}" disabled>${t("locked")}</button>`
      : `<button class="btn" type="button" data-act="ship" data-id="${id}" ${save.gold < net ? "disabled" : ""}>${shipArmed === id ? t("shipArm") : t("buy", { n: fmt(net) })}</button>`;
    const ds = t("shipDs", { b: sh.slots.bow, s: sh.slots.left, t: sh.slots.stern,
      hp: YARD.hull.show(yardVal("hull", 1, sh)), kn: YARD.sails.show(yardVal("sails", 1, sh)), cargo: fmt(yardVal("hold", 1, sh)) }) + (credit > 0 && !lock ? t("tradeIn", { n: fmt(credit) }) : "");
    return `<div class="item${lock ? " locked" : ""}"><div class="nm">${t("s_" + id)}</div>${btn}<div class="ds">${ds}${lock ? `<span class="lock">${lock}</span>` : ""}</div></div>`;
  }).join("");
  runHook("renderPort");   // wanted poster, outpost layout (js/campaign.js)
}

document.getElementById("port").addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act;
  let snd = act === "ship" ? "buy" : act === "yard" ? "upgrade" : "uiClick";
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
        if (el) el.textContent = t("buy", { n: fmt(shipNetCost(id)) });
      }, 3000);
      renderPort(); document.querySelector(`[data-act="ship"][data-id="${id}"]`)?.focus();
      Snd.play("uiClick");
      return;
    }
    shipArmed = null;
    const credit = tradeInCredit(id);   // 60% of the old ship's refit comes back (js/plunder.js)
    save = fitMounts({ ...save, gold: save.gold - SHIPS[id].cost + credit, ship: id, hull: 1, sails: 1, hold: 1 });   // the new ports start empty
    deckSel = null;
    portMsg = credit > 0 ? ["boughtShipTrade", { ship: t("s_" + id), n: fmt(credit) }] : ["boughtShip", { ship: t("s_" + id) }];
  }
  applyPlayerStats(true); persist(); renderPort(); hud(true);
  Snd.play(snd, { big: act === "ship" });
  // keep focus on the same control after re-render (keyboard users); a stored gun that moved aboard leaves the store
  // shorter, so focus falls back to the stored gun before it, or the port it went to
  const sel = act === "slot" ? `[data-act="slot"][data-side="${b.dataset.side}"][data-i="${b.dataset.i}"]`
    : act === "store" ? [`#bay [data-i="${b.dataset.i}"]`, `#bay [data-i="${b.dataset.i - 1}"]`, "#deck .slot"]
    : act === "ship" ? `#ships [data-act="ship"]:not(:disabled), #sail` : null;
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
