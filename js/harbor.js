"use strict";
// ---------- Harbor ----------
function dock(kind) {
  paused = true; docked = true;
  const { sold, bonus } = sellHold(kind);   // the hold sells at the sortie's plunder-streak price (js/plunder.js)
  save.gold += sold; cargo = 0;
  applyPlayerStats(true);
  player.speed = 0; player.burnT = 0;
  persist();
  // keep the message as a key so it re-renders when the language changes
  if (kind === "welcome") portMsg = [save.sunk === 0 ? "welcome" : "welcomeBack"];
  else if (kind === "sunk") portMsg = lastLost > 0 ? ["sunkWreckHalf", { n: fmt(lastLost) }] : ["sunkMsg"];
  else portMsg = sold > 0 ? (bonus > 0 ? ["soldStreak", { n: fmt(sold), p: Math.round(bonus * 100) }] : ["sold", { n: fmt(sold) }]) : ["empty"];
  renderPort();
  document.getElementById("port").hidden = false;
  Snd.music("harbor"); Snd.ambience("harbor");
  if (kind === "return") { Snd.play("bell"); if (sold > 0) Snd.play("coin", { amount: sold, delay: 0.45 }); }
  document.getElementById("joy").hidden = true; joyVec = { x: 0, y: 0, m: 0 };
}
function setSail() {
  document.getElementById("port").hidden = true;
  docked = false; paused = false; canDock = false;
  resetEnemies(S);
  Snd.play("sail"); Snd.music("sea"); Snd.ambience("sea");
}
// Every departure starts from a fresh sea: no ship left waiting outside the harbor, no shot still in flight.
function resetEnemies(sc) {
  for (const e of enemies) { sc.tweens.killTweensOf(e.spr); e.spr.destroy(); e.badge?.destroy(); }
  enemies.length = 0;
  for (const b of balls) b.spr.destroy();
  balls.length = 0;
  for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy(sc);
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
  // gun deck diagram: one row per mount the ship has
  const slotRow = (side, label) => {
    if (!save[side].length) return "";
    const btns = save[side].map((id, i) =>
      `<button class="slot" type="button" data-act="slot" data-side="${side}" data-i="${i}" aria-label="${t("slotAria", { side: label, n: i + 1, gun: t("gf_" + id) })}">${t("g_" + id)}<small>Lv ${save.gunLv[id]}</small></button>`).join("");
    return `<div class="row"><div class="lbl">${label}</div><div class="slots">${btns}</div></div>`;
  };
  $("deck").innerHTML = slotRow("bow", t("bow")) + slotRow("left", t("larboard")) + `<div class="hullbar" aria-hidden="true"></div>` +
    slotRow("right", t("starboard")) + slotRow("stern", t("stern"));
  // armory
  $("armory").innerHTML = GUN_ORDER.map(id => {
    const g = GUNS[id], lv = save.gunLv[id], m = gunLvMul(lv), owned = save.unlocked[id];
    const dmgTxt = t("dmg", { n: Math.round(g.dmg * m) }) + (g.burn ? t("burn", { n: Math.round(g.burn * m * BURN_T) }) : "") + (g.chain ? t("chainFx", { n: CHAIN_T }) : "");
    let btn;
    if (!owned) btn = `<button class="btn" type="button" data-act="buy" data-id="${id}" ${save.gold < g.cost ? "disabled" : ""}>${t("buy", { n: fmt(g.cost) })}</button>`;
    else if (lv >= GUN_MAX) btn = `<button class="btn max" type="button" disabled>${t("max")}</button>`;
    else { const c = gunUpCost(id); btn = `<button class="btn" type="button" data-act="up" data-id="${id}" ${save.gold < c ? "disabled" : ""}>${t("upgrade", { n: fmt(c) })}</button>`; }
    const next = owned && lv < GUN_MAX ? ` <span class="up">→ ${Math.round(g.dmg * gunLvMul(lv + 1))}</span>` : "";
    return `<div class="item"><div class="nm">${t("gf_" + id)}<small>${owned ? "Lv " + lv : t("notOwned")}</small></div>${btn}
      <div class="ds">${dmgTxt}${next} · ${t("range", { n: g.range })} · ${t("rpm", { n: g.rpm })} · ${t("gn_" + id)}</div></div>`;
  }).join("");
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
    const sh = SHIPS[id], credit = id === save.ship ? 0 : tradeInCredit(id), net = sh.cost - credit;   // trade-in: js/plunder.js
    const btn = id === save.ship ? `<button class="btn max" type="button" disabled>${t("yourShip")}</button>`
      : `<button class="btn" type="button" data-act="ship" data-id="${id}" ${save.gold < net ? "disabled" : ""}>${shipArmed === id ? t("shipArm") : t("buy", { n: fmt(net) })}</button>`;
    const ds = t("shipDs", { b: sh.slots.bow, s: sh.slots.left, t: sh.slots.stern,
      hp: YARD.hull.show(yardVal("hull", 1, sh)), kn: YARD.sails.show(yardVal("sails", 1, sh)), cargo: fmt(yardVal("hold", 1, sh)) }) + (credit > 0 ? t("tradeIn", { n: fmt(credit) }) : "");
    return `<div class="item"><div class="nm">${t("s_" + id)}</div>${btn}<div class="ds">${ds}</div></div>`;
  }).join("");
}

document.getElementById("port").addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === "slot") {
    const owned = GUN_ORDER.filter(id => save.unlocked[id]);
    const arr = save[b.dataset.side], i = +b.dataset.i;
    arr[i] = owned[(owned.indexOf(arr[i]) + 1) % owned.length];
  } else if (act === "buy") {
    const id = b.dataset.id; save.gold -= GUNS[id].cost; save.unlocked[id] = true;
    portMsg = ["bought", { gun: t("gf_" + id) }];
  } else if (act === "up") {
    const id = b.dataset.id; save.gold -= gunUpCost(id); save.gunLv[id]++;
  } else if (act === "yard") {
    const k = b.dataset.k; save.gold -= YARD[k].cost(save[k]); save[k]++;
  } else if (act === "ship") {
    const id = b.dataset.id;
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
    save = fitMounts({ ...save, gold: save.gold - SHIPS[id].cost + credit, ship: id, hull: 1, sails: 1, hold: 1 });
    portMsg = credit > 0 ? ["boughtShipTrade", { ship: t("s_" + id), n: fmt(credit) }] : ["boughtShip", { ship: t("s_" + id) }];
  }
  applyPlayerStats(true); persist(); renderPort(); hud(true);
  Snd.play(act === "buy" || act === "ship" ? "buy" : act === "up" || act === "yard" ? "upgrade" : "uiClick", { big: act === "ship" });
  // keep focus on the same control after re-render (keyboard users)
  const sel = act === "slot" ? `[data-act="slot"][data-side="${b.dataset.side}"][data-i="${b.dataset.i}"]`
    : act === "ship" ? `#ships [data-act="ship"]:not(:disabled), #sail` : null;
  if (sel) document.querySelector(sel)?.focus();
});
// Not enough gold: a disabled button never receives a click, so listen for the press itself.
document.getElementById("port").addEventListener("pointerdown", ev => { const b = ev.target.closest("[data-act]"); if (b && b.disabled) Snd.play("denied"); });
document.getElementById("sail").addEventListener("click", setSail);
const resetBtn = document.getElementById("reset");
let resetArmed = false;
resetBtn.addEventListener("click", () => {
  Snd.play("uiClick");
  if (!resetArmed) { resetArmed = true; resetBtn.textContent = t("resetArm"); setTimeout(() => { resetArmed = false; resetBtn.textContent = t("reset"); }, 3000); return; }
  save = defaultSave(); persist(); resetArmed = false; resetBtn.textContent = t("reset");
  for (let i = crates.length - 1; i >= 0; i--) if (crates[i].wreck) { crates[i].spr.destroy(); crates[i].label?.destroy(); crates.splice(i, 1); }
  applyPlayerStats(true); dock("welcome"); hud(true);
});
