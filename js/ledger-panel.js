"use strict";
// ---------- The ledger's context panel: the one panel under the gun deck (js/ledger-tabs.js owns the tabs and what is picked) ----------
// Nothing picked: one hint line. A gun port picked (deckSel, js/gunbay.js): the gun's card with its upgrades, the guns to put there instead
// (the store, and the ports of your other ships) and the armory (a new gun goes straight into the port). The hull picked (hullOpen): the
// ship's hull, sails and hold with before -> after and the price (this ship's own levels, even a yard ship's), then the ships to change to.
// An empty or unbought escort slot has no deck: its choices are the two cards of berthHtml, shown in the stage.
Object.assign(STR.en, {
  ctxHint: "Tap a gun port to change or upgrade its gun; tap the hull to upgrade the hull, sails or hold, or to change ship.", ctxClose: "Close",
  portHead: "{side} port {n}", portOn: "On the {ship}", emptyPortTip: "Empty port: pick a gun below to mount here, or buy a new one.",
  swapHead: "Put a gun here", swapStore: "In the store", swapNone: "No spare guns in the store or on your other ships.", buyHead: "Buy a new gun (Lv 1)",
  hullHead: "Hull · {ship}", hullSub: "Upgrades apply to this ship only.", changeHead: "Change ship",
  escSwapHint: "The old ship goes back to the yard; guns that fit its ports come along, the rest go to the store.",
  idleNone: "No idle ship in the yard.", assign: "Assign", evict: "Free this slot (the ship goes back to the yard)",
  berthTitle: "Escort slot {n}: no ship", berthAssign: "Assign from the yard", berthAssignSub: "Idle ships you own", berthBuy: "Buy a new ship for this escort",
  berthBuySub: "Bought and posted here in one step. Its ports start empty.", escAssigned: "{ship} now sails as escort {n}.",
  escAssignedSpill: "{ship} now sails as escort {n}; {m} gun(s) that did not fit went to the store.",
  escBoughtShip: "{ship} bought for escort {n}.", escEvicted: "Escort slot {n} is free; the ship is back in the yard.", escEvictedGuns: "Escort slot {n} is free; the ship is back in the yard and its {m} gun(s) went to the store.",
  tabFlag: "Flagship", tabEsc: "Escort {n}", tabEmpty: "Empty", tabBuy: "{n} gold", tabLock: "Locked", stOn: "Deployed", stOff: "Standby",
  hullAria: "Hull: upgrade the ship or change ship", sfootLv: "Lv {n}",
  escBuyShort: "Buy slot · {n} (need {d} more)", tabLockBounty: "Sink bounty {n}", tabLockOrder: "Buy slot {n} first",
  gain_hull: "Hull +{p}%", gain_sails: "Speed +{p}%", gain_hold: "Hold +{p}%", lockedShips: "Not unlocked yet ({n})", saleNone: "No other ship is for sale yet. Claim bounties to unlock more; what each one needs is listed below.",
});
Object.assign(STR.zh, {
  ctxHint: "點砲口換砲或升級，點船身升級船體、船帆、貨艙或換船。", ctxClose: "關閉",
  portHead: "{side}砲位 {n}", portOn: "在{ship}上", emptyPortTip: "空砲位：在下方挑一門砲裝上，或買一門新的。",
  swapHead: "換上別的砲", swapStore: "庫存", swapNone: "庫存和你其他船上都沒有可換的砲。", buyHead: "買新砲（Lv 1）",
  hullHead: "船身 · {ship}", hullSub: "升級只作用於這艘船。", changeHead: "換船",
  escSwapHint: "舊船回船塢；放得進新船砲位的砲會一起過去，其餘退回庫存。",
  idleNone: "船塢裡沒有閒置的船。", assign: "指派", evict: "讓出席位（船回船塢）",
  berthTitle: "隨從席位 {n}：沒有船", berthAssign: "從船廠指派", berthAssignSub: "你已擁有的閒置船", berthBuy: "買一艘新船給這個隨從",
  berthBuySub: "買下後直接派駐這個席位，砲位一開始是空的。", escAssigned: "{ship} 現在是隨從 {n}。",
  escAssignedSpill: "{ship} 現在是隨從 {n}；有 {m} 門放不下的砲退回了庫存。",
  escBoughtShip: "已買下 {ship} 給隨從 {n}。", escEvicted: "隨從席位 {n} 已讓出，船回到船塢。", escEvictedGuns: "隨從席位 {n} 已讓出，船回到船塢，船上的 {m} 門砲放回了庫存。",
  tabFlag: "旗艦", tabEsc: "隨從 {n}", tabEmpty: "空位", tabBuy: "{n} 金", tabLock: "鎖定", stOn: "出戰", stOff: "待命",
  hullAria: "船身：升級這艘船或換船", sfootLv: "Lv {n}",
  escBuyShort: "購買船位 · {n}（還差 {d}）", tabLockBounty: "擊敗首領 {n}", tabLockOrder: "先買船位 {n}",
  gain_hull: "船體 +{p}%", gain_sails: "航速 +{p}%", gain_hold: "貨艙 +{p}%", lockedShips: "尚未解鎖（{n}）", saleNone: "目前沒有其他船可買。完成懸賞就會解鎖更多，每艘的解鎖條件列在下面。",
});

const shipNameOf = e => esc(e.name || t("s_" + e.ship));
// The ship a tab shows: the flagship, or the yard ship in escort slot tab - 1 (null: nothing there).
const tabShipOf = n => (n === 0 ? activeShip(save) : escortShipOf(save, save.escorts[n - 1]));
const sideLabel = key => t(key === "bow" ? "bow" : key === "left" ? "larboard" : key === "right" ? "starboard" : "stern");

// ---------- ships: the rows of a ship's levels, the idle ones to change to, the models for sale ----------
const shipDs = (sh, h, s, o) => t("shipDs", { b: sh.slots.bow, s: sh.slots.left, t: sh.slots.stern,
  hp: YARD.hull.show(yardVal("hull", h, sh)), kn: YARD.sails.show(yardVal("sails", s, sh)), cargo: fmt(yardVal("hold", o, sh)) }) + (sh.gunK ? t("gunK", { k: sh.gunK }) : "") +
  t("shipGuns", { n: shipGuns(sh) }) + (sh.turn && sh.turn !== 1 ? t("shipTurn", { k: sh.turn }) : "");   // js/ship-lines.js
function yardRows(e) {   // hull, sails, hold of ship `e` (a yard entry or the flagship's activeShip): level, before -> after, the price at that hull's refit
  const sh = SHIPS[e.ship];
  return Object.entries(YARD).map(([k, y]) => {
    const lv = e[k], cur = y.show(yardVal(k, lv, sh));
    let btn, ds;
    if (lv >= y.max) { btn = `<button class="btn max" type="button" disabled>${t("max")}</button>`; ds = `<b>${cur}</b>`; }
    else { const c = y.cost(lv, sh), p = Math.round((yardVal(k, lv + 1, sh) / yardVal(k, lv, sh) - 1) * 100);   // what the next level adds, for the price
      const lvUp = k === "hull" && e.id === save.shipId && typeof lvGainHull === "function" ? lvGainHull() : "";   // the flagship's hull is part of Ship Lv (js/lv-path.js)
      btn = `<button class="btn" type="button" data-act="yard" data-k="${k}" data-id="${e.id}" ${save.gold < c ? "disabled" : ""}>${t("upgrade", { n: fmt(c) })}${gainLine(t("gain_" + k, { p }) + (lvUp ? " · " + lvUp : ""))}</button>`;
      ds = `<b>${cur}</b> <span class="up">→ ${y.show(yardVal(k, lv + 1, sh))}</span>`; }
    return `<div class="item"><div class="nm">${t("y_" + k)}<small>Lv ${lv}</small></div>${btn}<div class="ds">${ds}</div></div>`;
  }).join("");
}
// Yard ships not in an escort slot (any, for the flagship's tab) or free for slot `slot` (its own ship excluded): { entry, row } with the button for `act`.
function idleRows(slot) {
  const owned = ownedShips(), count = {};
  for (const e of owned) count[e.ship] = (count[e.ship] || 0) + 1;
  const cur = slot >= 0 && save.escorts[slot] ? save.escorts[slot].id : "";
  const list = slot < 0 ? save.fleet.filter(x => !save.escorts.some(e => e.id === x.id)) : escortCandidates(save, slot).filter(x => x.id !== cur);
  return list.sort((a, b) => idNum(a.id) - idNum(b.id)).map(e => {
    const sh = SHIPS[e.ship], nm = count[e.ship] > 1 ? t("shipNo", { ship: t("s_" + e.ship), n: idNum(e.id) }) : t("s_" + e.ship);
    const tag = sh.line ? `<small>${t("lineTag_" + sh.line)}</small>` : "";   // fast or heavy line (js/ship-lines.js)
    const label = e.name ? `${esc(e.name)}<small>${nm}</small>${tag}` : nm + tag;   // the ship's own name (js/flags.js)
    const btn = slot < 0 ? `<button class="btn" type="button" data-act="switch" data-id="${e.id}">${t("switchTo")}</button>`
      : `<button class="btn" type="button" data-act="escAssign" data-id="${slot}" data-ship="${e.id}">${t("assign")}</button>`;
    return `<div class="item"><div class="nm">${label}</div>${btn}<div class="ds">${shipDs(sh, e.hull, e.sails, e.hold)}${t("shipLvs", { h: e.hull, s: e.sails, o: e.hold })}</div></div>`;
  }).join("");
}
// The models the yard sells, the fast line then the heavy line (js/ship-lines.js), each compared with `vs` (a ship entry). slot < 0: you board it (the
// ship button, js/harbor.js); else it is bought straight into escort slot `slot` (escBuyShip, js/escort-ui.js). Both need a second tap.
function saleRows(slot, vs) {
  const owned = ownedShips(), count = {}, full = owned.length >= FLEET_MAX;
  for (const e of owned) count[e.ship] = (count[e.ship] || 0) + 1;
  const row = id => {
    const sh = SHIPS[id], lock = shipLock(id);   // Letters of Marque gate (js/campaign.js): null, or why not yet
    const key = slot < 0 ? null : `eship${slot}:${id}`, arm = slot < 0 ? shipArmed === id : armedTap(key);
    const act = slot < 0 ? `data-act="ship" data-id="${id}"` : `data-act="escBuyShip" data-id="${slot}" data-type="${id}"`;
    const label = arm ? t("shipArm") : buyLabel(id);
    const gain = slot < 0 ? lvGainShip(id) : t("lvGainEsc");   // what it does to Ship Lv: the guns come along to a ship you sail, an escort starts bare (js/lv-path.js)
    const btn = lock ? `<button class="btn" type="button" ${act} disabled>${t("locked")}</button>` : full ? `<button class="btn" type="button" ${act} disabled>${t("yardFull")}</button>`
      : `<button class="btn" type="button" ${act} ${save.gold < sh.cost ? "disabled" : ""}${arm ? armAttrs() : ""}>${label}${gainLine(gain)}</button>`;
    return `<div class="item${lock ? " locked" : ""}"><div class="nm">${t("s_" + id)}</div>${btn}<div class="ds">${shipDs(sh, 1, 1, 1)}${lock ? `<span class="lock">${lock}</span>` : count[id] ? `<span class="own up">${t(slot < 0 ? "ownedHint" : "ownedCount", { n: count[id] })}</span>` : ""}</div>${shipCmpHtml(sh, SHIPS[vs.ship], vs.ship)}</div>`;
  };
  // Per line: the models you already own first, then the ones on sale; the ones a Letter of Marque has not opened fold into one closed list at the end.
  const lines = SHIP_LINE_KEYS.map(line => SHIP_ORDER.filter(id => forSale(id) && SHIPS[id].line === line));
  const locked = lines.flat().filter(id => shipLock(id)).sort((a, b) => SHIPS[a].tier - SHIPS[b].tier);
  const open = line => line.filter(id => !shipLock(id)).sort((a, b) => !!count[b] - !!count[a]);   // stable: the yard's own order inside each group
  // a line with nothing on sale yet gets no bare heading; with nothing on sale at all, one line says why and the locked list starts open
  const none = !lines.some((l, i) => open(l).length);
  return SHIP_LINE_KEYS.map((line, i) => open(lines[i]).length ? `<p class="hint-s line-${line}">${t("line_" + line)}</p>` + open(lines[i]).map(row).join("") : "").join("") +
    (none ? `<p class="hint-s">${t("saleNone")}</p>` : "") +
    (locked.length ? `<details class="lockedships"${none ? " open" : ""}><summary>${t("lockedShips", { n: locked.length })}</summary>${locked.map(row).join("")}</details>` : "");
}

// ---------- the panels ----------
const xBtn = () => `<button class="x" type="button" data-act="ctxclose" aria-label="${t("ctxClose")}">×</button>`;
// Which ship the panel edits, in its title: "Flagship" or "Escort 2" (the tab's own role label), so a tap on the wrong tab shows at once.
const roleTag = () => `<span class="rtag">${tab === 0 ? t("tabFlag") : t("tabEsc", { n: tab })}</span>`;
// The tip at the top of a panel while the ship has empty ports: a gun in an empty port is the cheapest firepower there is.
const emptyTipHtml = () => { const n = typeof emptyPortsOf === "function" ? emptyPortsOf(tab) : 0; return n > 0 ? `<p class="hint-s emptyfirst">${t("emptyFirst", { n })}</p>` : ""; };
function hullPanelHtml() {
  const e = tabShipOf(tab), slot = tab - 1, idle = idleRows(slot < 0 ? -1 : slot);
  return `<div class="cpanel hullp">${xBtn()}<h3>${roleTag()}${t("hullHead", { ship: shipNameOf(e) })}</h3><p class="sub">${t("hullSub")}</p>${emptyTipHtml()}
    <div class="list" id="yard">${yardRows(e)}</div>
    <h4>${t("changeHead")}</h4><p class="hint-s">${t(slot < 0 ? "shipsHint" : "escSwapHint")}</p>
    <div class="list" id="ships"><p class="hint-s">${t("shipsOwned")}</p>${idle || `<p class="hint-s">${t("idleNone")}</p>`}<p class="hint-s">${t("shipsBuy")}</p>${saleRows(slot < 0 ? -1 : slot, e)}</div>
    ${slot >= 0 ? `<button class="btn ghost evict" type="button" data-act="escEvict" data-id="${slot}">${t("evict")}</button>` : ""}</div>`;
}
// A candidate: tap the tile to put that gun in the picked port at once; its small (i) opens the gun's card below the list (upgrade, lock, break down, compare).
const candBtn = (g, p, label) => {
  const at = `data-side="${p.side}" data-i="${p.i}"${p.e != null ? ` data-e="${p.e}"` : ""}`, name = t("gf_" + g.g) + " Lv " + g.lv + (label ? ", " + label : "");
  return `<div class="cand${candSel && samePlace(candSel, p) ? " prev" : ""}"><button class="slot${gunRar(g)}" type="button" data-act="gfrom" ${at} aria-label="${name}">${gunIcon(g.g + gunMark(g), "sm")}${t("g_" + g.g)}<small>Lv ${g.lv}${label ? " · " + label : ""}</small></button>` +
    `<button class="cinfo" type="button" data-act="gprev" ${at} aria-pressed="${!!candSel && samePlace(candSel, p)}" aria-label="${t("candInfo")}: ${name}">${t("candInfo")}</button></div>`;
};
// Guns that could go into the picked port: the store, then each other ship's mounted guns (labelled by ship and port).
function swapListHtml() {
  const groups = [], here = deckSel && deckSel.e != null ? deckSel.e : -1;
  if (save.store.length) groups.push([t("swapStore"), save.store.map((g, i) => candBtn(g, { side: "store", i }, ""))]);
  const ports = (mounts, e, name) => {
    const out = [];
    for (const { key } of MOUNTS) (mounts[key] || []).forEach((g, i) => { if (g) out.push(candBtn(g, { side: key, i, ...(e >= 0 ? { e } : {}) }, `${sideLabel(key)} ${i + 1}`)); });
    if (out.length) groups.push([name, out]);
  };
  if (here !== -1) ports(save, -1, `${t("tabFlag")} · ${shipNameOf(activeShip(save))}`);
  save.escorts.forEach((es, k) => { const y = escortShipOf(save, es); if (y && k !== here) ports(es.guns, k, `${t("tabEsc", { n: k + 1 })} · ${shipNameOf(y)}`); });
  const card = candSel && gunAt(candSel) ? `<div class="candcard">${gunCardHtml(candSel, true)}</div>` : "";
  return (groups.length ? groups.map(([name, btns]) => `<div class="cgrp"><div class="sub">${name}</div><div class="slots">${btns.join("")}</div></div>`).join("") : `<p class="hint-s">${t("swapNone")}</p>`) + card;
}
function gunPanelHtml() {
  const p = deckSel, gun = gunAt(p), y = p.e != null ? escortShipOf(save, save.escorts[p.e]) : activeShip(save);
  return `<div class="cpanel gunp">${xBtn()}<h3>${roleTag()}${t("portHead", { side: sideLabel(p.side), n: `<span class="n">${p.i + 1}</span>` })}${gun ? " · " + t("gf_" + gun.g) : ""}</h3><p class="sub">${t("portOn", { ship: y ? shipNameOf(y) : "" })}</p>
    ${emptyTipHtml()}${gunNoteHtml()}${gun ? gunCardHtml() : `<p class="hint-s">${t("emptyPortTip")}</p>`}
    <h4>${t("swapHead")}</h4>${swapListHtml()}
    <h4>${t("buyHead")}</h4><div class="list" id="armory">${armoryHtml()}</div></div>`;
}
function ctxHtml() {
  if (!tabShipOf(tab)) return "";   // an empty or unbought slot: its choices are in the stage (berthHtml)
  if (hullOpen) return hullPanelHtml();
  if (deckSel) return gunPanelHtml();
  return `${gunNoteHtml()}<p class="chint">${t("ctxHint")}</p>`;   // an Unload leaves nothing picked: its note and Undo stay on show
}

// ---------- an escort slot with no ship: assign an idle ship, or buy a new one for it ----------
function berthHtml(slot) {
  const idle = idleRows(slot), vs = activeShip(save);
  return `<div class="berth"><p class="role">${t("berthTitle", { n: slot + 1 })}</p><div class="cols">
    <div class="card"><h3>${t("berthAssign")}</h3><p class="sub">${t("berthAssignSub")}</p><div class="list">${idle || `<p class="hint-s">${t("idleNone")}</p>`}</div></div>
    <div class="card"><h3>${t("berthBuy")}</h3><p class="sub">${t("berthBuySub")}</p><div class="list" id="ships">${saleRows(slot, vs)}</div></div></div></div>`;
}
