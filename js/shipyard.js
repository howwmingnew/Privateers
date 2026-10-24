"use strict";
// ---------- Shipyard: every ship you buy stays, and you can switch back to it ----------
// The ship you sail is still save.ship / hull / sails / hold (so combat, the daily sea and the rest read it as before),
// with its id in save.shipId. Every other ship waits in save.fleet [{ id, ship, hull, sails, hold }], one entry per ship
// bought (so the same model can be owned twice, each with its own upgrades). shipSeq is the next id number.
// Cannons are not tied to a ship: they move aboard whichever ship you switch to; ports that don't exist there send
// their guns back to the store (fitMounts, js/save.js).
Object.assign(STR.en, {
  shipsOwned: "Your ships", shipsBuy: "Buy a ship", switchTo: "Switch", yardFull: "Yard full", shipNo: "{ship} #{n}",
  shipLvs: " · hull Lv {h}, sails Lv {s}, hold Lv {o}",
  switchedShip: "You are aboard the <em>{ship}</em>. Your cannons came with you.",
  switchedSpill: "You are aboard the <em>{ship}</em>. Your cannons came with you; <em>{n}</em> had no port and went back to the store.",
});
Object.assign(STR.zh, {
  shipsOwned: "已擁有的船", shipsBuy: "購買船隻", switchTo: "換上", yardFull: "船塢已滿", shipNo: "{ship} #{n}",
  shipLvs: " · 船體 Lv {h}、船帆 Lv {s}、貨艙 Lv {o}",
  switchedShip: "你換到<em>{ship}</em>上了，火砲一起搬了過來。",
  switchedSpill: "你換到<em>{ship}</em>上了，火砲一起搬了過來；有 <em>{n}</em> 門砲沒有砲位，放回了庫存。",
});
SAVE_DEFAULTS.push(() => ({ shipId: "s1", fleet: [], shipSeq: 2 }));

const SHIP_ID = /^s\d{1,6}$/;
const idNum = id => Number(id.slice(1));
const activeShip = (s = save) => ({ id: s.shipId, ship: s.ship, hull: s.hull, sails: s.sails, hold: s.hold });
// Every ship owned, the one you sail included, in the order bought.
const ownedShips = (s = save) => [activeShip(s), ...s.fleet].sort((a, b) => idNum(a.id) - idNum(b.id));
// The starter sloop is free, so the yard does not sell it (it would be an endless supply of ships).
const forSale = type => Object.hasOwn(SHIPS, type) && SHIPS[type].cost > 0;
const canBuyShip = (s, type) => forSale(type) && s.gold >= SHIPS[type].cost && s.fleet.length + 1 < FLEET_MAX;

// Pure: a new save aboard `ship` (or `entry`), with the ship you left parked in the yard.
function boardShip(s, entry, patch = {}) {
  const parked = activeShip(s);
  return fitMounts({ ...s, ...patch, shipId: entry.id, ship: entry.ship, hull: entry.hull, sails: entry.sails, hold: entry.hold,
    fleet: s.fleet.filter(e => e.id !== entry.id).concat(parked) });
}
// Buy a new ship of `type` at full price and sail it (hull, sails and hold at Lv 1). Returns the save, or null if it can't.
function buyShip(s, type) {
  if (!canBuyShip(s, type)) return null;
  const seq = Math.max(s.shipSeq, ...ownedShips(s).map(e => idNum(e.id) + 1));
  return boardShip(s, { id: "s" + seq, ship: type, hull: 1, sails: 1, hold: 1 }, { gold: s.gold - SHIPS[type].cost, shipSeq: seq + 1 });
}
// Switch to a ship waiting in the yard, free. Returns the save, or null if there is no such ship.
function switchShip(s, id) {
  const entry = s.fleet.find(e => e.id === id);
  return entry ? boardShip(s, entry) : null;
}

SAVE_SANITIZERS.push(s => {
  const active = SHIP_ID.test(s.shipId) ? s.shipId : "s1", seen = new Set([active]), fleet = [];
  for (const e of Array.isArray(s.fleet) ? s.fleet : []) {
    if (!isObj(e) || typeof e.id !== "string" || !SHIP_ID.test(e.id) || seen.has(e.id) || !Object.hasOwn(SHIPS, e.ship) || fleet.length + 1 >= FLEET_MAX) continue;
    seen.add(e.id);
    fleet.push({ id: e.id, ship: e.ship, hull: toInt(e.hull, 1, YARD.hull.max, 1), sails: toInt(e.sails, 1, YARD.sails.max, 1), hold: toInt(e.hold, 1, YARD.hold.max, 1) });
  }
  const top = Math.max(...[...seen].map(idNum));
  return { ...s, shipId: active, fleet, shipSeq: Math.max(toInt(s.shipSeq, 1, 999999, 1), top + 1) };
});
