"use strict";
// ---------- Ports: supply stations and trade ports on the open sea (roadmap #13) ----------
// Both dock through the same ring as Safe Harbor (js/mooring.js): sail through for a quick service, hold still to open a
// slim ledger (no shipyard, no armory). A supply station only mends the hull, for a fee that grows with its level ring,
// and neither buys nor sells; its ledger leaves the hold aboard. A trade port only buys: the hold sells at the plunder
// streak's price and nothing else (no bank, no hull repair, no ships or guns). Death rules are unchanged. Both sit
// inside a truce circle (STATION_TRUCE_R): no ship fires on the player there, and idle ships sail out of it.
// Fewer stations lie in the deadlier seas: Shallows 2, Reef Straits 2, Navy Lanes 1, the Maelstrom none.
Object.assign(STR.en, {
  stationName_supply: "Supply Station", stationName_trade: "Trade Port",
  stationMap_supply: "SUPPLY STATION", stationMap_trade: "TRADE PORT",
  stationNote_supply: "A repair berth on the open sea: the crew patch hulls for a fee (deeper seas cost more). Nothing is bought or sold here, and your hold stays aboard.",
  stationNote_trade: "A trading dock: it buys your whole hold for gold and does nothing else. No repairs, ships or guns, and no bank.",
  supplyMsg: "Hull patched at the berth. Your hold is still aboard.",
  tradeSold: "Sold the hold for <em>{n} gold</em>.", tradeSoldStreak: "Sold the hold for <em>{n} gold</em>, plunder streak +{p}% included.",
  tradeEmpty: "Your hold is empty. This port only buys cargo.",
  fSupplyIn: "Repairs: {n} gold for a full hull", supplyBroke: "Not enough gold for repairs",
  fSupplyFull: "Hull is sound, no repairs needed", fTradeIn: "Buys your whole hold",
  supplyAuto: "Supply station: repairs are paid automatically as the hull mends, up to {n} gold for a full hull.",
  supplyPaid: "Repairs paid: {n} gold for {p}% of the hull.",
});
Object.assign(STR.zh, {
  stationName_supply: "補給站", stationName_trade: "交易港",
  stationMap_supply: "補給站", stationMap_trade: "交易港",
  stationNote_supply: "海上的修船碼頭：水手收費修補船體（越外海越貴）。這裡不買也不賣，貨艙的貨物留在船上。",
  stationNote_trade: "專收貨物的碼頭：整個貨艙換成金幣，其他什麼都不做。不能修船、買船、買砲，也沒有銀行。",
  supplyMsg: "船體在碼頭補好了，貨艙的貨物還在船上。",
  tradeSold: "貨艙賣得 <em>{n} 金幣</em>。", tradeSoldStreak: "貨艙賣得 <em>{n} 金幣</em>，已含連續劫掠加成 +{p}%。",
  tradeEmpty: "貨艙是空的。這個港口只收購貨物。",
  fSupplyIn: "修船：整個船體 {n} 金幣", supplyBroke: "金幣不夠，無法修船",
  fSupplyFull: "船體完好，不需修理", fTradeIn: "收購貨物",
  supplyAuto: "補給站：船體修補時自動扣金幣，整個船體最多 {n} 金幣。",
  supplyPaid: "修船費已付：{n} 金幣，修好 {p}% 船體。",
});

// Fixed spots (found by scanning the ring midlines for the point farthest from every bounty lair, the hulk outpost and the
// other stations: at least ~1300 px from each), so the same on every map and in every save.
const STATION_DEFS = [
  { id: "supply-2", kind: "supply", ring: 2, ang: 1.25 },
  { id: "trade-2",  kind: "trade",  ring: 2, ang: -0.55 },
  { id: "supply-4", kind: "supply", ring: 4, ang: -2.3 },
  { id: "trade-5",  kind: "trade",  ring: 5, ang: 1.85 },
  { id: "supply-7", kind: "supply", ring: 7, ang: -0.9 },
];
const STATIONS = STATION_DEFS.map(d => ({ ...d, ...polarPt(d.ang, ringMid(d.ring)) }));
// What nearestHarbor (js/campaign.js) hands the mooring ring: the same shape as the harbor's, plus the kind and ring.
const STATION_DOCKS = STATIONS.map(p => ({ x: p.x, y: p.y, outpost: false, kind: p.kind, ring: p.ring, id: p.id }));

// What each dock kind does inside the ring (js/mooring.js) and at the ledger (js/harbor.js).
const SERVICES = {
  return: { sell: true, heal: true }, outpost: { sell: true, heal: true },
  supply: { sell: false, heal: true, fee: true }, trade: { sell: true, heal: false },
};
const serviceOf = kind => SERVICES[kind] || SERVICES.return;
const isStationKind = kind => kind === "supply" || kind === "trade";
const supplyFee = ring => SUPPLY_FEE_PER_RING * ring;   // gold from an empty hull to a full one
// The daily sea has no harbor, stations or trade ports (and its sinkings pay nothing: js/plunder.js, js/combat.js): their art,
// chart marks, edge markers, truce circles and the harbor island's collision all stand down while it runs (js/run.js).
// A #seed= voyage can still dock, so it keeps all of it. Everything comes back when the run is left.
const portsOff = () => typeof runActive === "function" && runActive() && runKind() === "daily";
// Show or hide the harbor and stations on the sea; called when a run starts or ends.
function syncPorts() {
  const on = !portsOff();
  for (const o of [...stationObjs, ...harborObjs, ...harborBeams]) o.setVisible(on);
  if (harborLabel) harborLabel.setVisible(on && !titleOpen);
}
// The station whose truce circle holds s (or null). A plain loop on squared distances: inSafe (js/ships.js) asks this in
// every hostility check, many times a frame.
const stationAt = (s, r = STATION_TRUCE_R) => {
  if (portsOff()) return null;
  for (const p of STATIONS) { const dx = s.x - p.x, dy = s.y - p.y; if (dx * dx + dy * dy < r * r) return p; }
  return null;
};
// Pure: one step of a paid repair. Heals up to SUPPLY_HEAL of max hull per second, never more than the hull is missing, and
// never more than the gold on hand pays for. Returns the new hp and the (fractional) gold it cost.
function supplyStep(hp, maxHp, dt, gold, ring, k = 1) {   // k: a legendary supply hold mends faster (js/gear-fx.js)
  const missing = maxHp - hp;
  if (missing <= 0 || gold <= 0 || dt <= 0) return { hp, cost: 0 };
  let heal = Math.min(missing, maxHp * SUPPLY_HEAL * k * dt), cost = heal / maxHp * supplyFee(ring);
  if (cost > gold) { heal *= gold / cost; cost = gold; }
  return { hp: hp + heal, cost };
}

// ---------- At sea: the ring's service (called from js/mooring.js) ----------
let feeCarry = 0, brokeShown = false, feePaid = 0, feeFrom = 0;   // feePaid: gold taken on this visit; feeFrom: the hull share it started from
// Says what the visit cost, once, so gold never leaves without a reason.
function stationBill() {
  if (feePaid <= 0) return;
  toast(t("supplyPaid", { n: feePaid, p: Math.max(1, Math.round((player.hp / player.maxHp - feeFrom) * 100)) }));
  feePaid = 0;
}
function stationHeal(hb, dt) {
  const r = supplyStep(player.hp, player.maxHp, dt, save.gold, hb.ring, typeof gxDockK === "function" ? gxDockK() : 1);
  player.hp = r.hp;
  feeCarry += r.cost;
  const whole = Math.min(Math.floor(feeCarry), save.gold);
  if (whole > 0) { save.gold -= whole; feeCarry -= whole; feePaid += whole; hud(true); }
  if (player.hp >= player.maxHp) stationBill();   // the hull is whole: the bill comes now, not only when the ship leaves
  if (r.cost <= 0 && player.hp < player.maxHp && save.gold < 1 && !brokeShown) { brokeShown = true; toast(t("supplyBroke")); sfx("denied"); }
}
// The moment the ship enters a station's ring: its name, then what it does (or that nothing is needed). The hold-still hint
// under the ship is the same one Safe Harbor shows (js/mooring.js).
function stationGreet(hb, kind) {
  const x = player.x, y = player.y - 40;
  floatText(x, y - 22, t("stationName_" + kind), "#f6f1e3", 15);
  const sound = player.hp >= player.maxHp;
  feePaid = 0; feeFrom = player.hp / player.maxHp;
  if (kind === "supply" && !sound && save.gold >= 1) toast(t("supplyAuto", { n: supplyFee(hb.ring) }));
  floatText(x, y, kind === "supply" ? t(sound ? "fSupplyFull" : "fSupplyIn", { n: supplyFee(hb.ring) }) : t("fTradeIn"), "#9fe0a0", 15);
  if (kind === "trade" && cargo <= 0) toast(t("tradeEmpty"));
}
function stationLeft() { stationBill(); if (feeCarry > 0 || brokeShown) persist(); feeCarry = 0; brokeShown = false; }

// ---------- The ledger's face (js/campaign-ui.js reads these) ----------
let dockKind = "return";
onHook("dock", kind => { dockKind = kind; });
const dockNoteKey = () => isStationKind(dockKind) ? "stationNote_" + dockKind : "outpostNote";
const dockTitleKey = () => isStationKind(dockKind) ? "stationName_" + dockKind : "outpostName";

// ---------- Art: Safe Harbor's buoyed ring in the station's colour, a plank jetty with stores, a moored ship ----------
let stationObjs = [], stationLabels = [];
function paintStation(c, C, kind) {
  const rng = mulberry32(kind === "supply" ? 31 : 37), glow = kind === "supply" ? "120,214,150" : "240,199,102", accent = kind === "supply" ? "#43b97a" : "#d9a93a";
  const g = c.createRadialGradient(C, C, 30, C, C, 170);
  g.addColorStop(0, `rgba(${glow},.45)`); g.addColorStop(1, `rgba(${glow},0)`); c.fillStyle = g; c.fillRect(0, 0, C * 2, C * 2);
  c.save(); c.setLineDash([3, 9]); c.beginPath(); c.arc(C, C, DOCK_R, 0, TAU); c.lineWidth = 1.5; c.strokeStyle = "rgba(246,241,227,.3)"; c.stroke(); c.restore();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.3, x = C + Math.cos(a) * DOCK_R, y = C + Math.sin(a) * DOCK_R, on = i % 2 ? "#f4efe2" : accent;
    dot(c, x + 1.2, y + 1.2, 4.2, "rgba(0,20,30,.35)"); dot(c, x, y, 4, on); dot(c, x, y, 1.6, i % 2 ? accent : "#f4efe2");
  }
  const jetty = [-8, 12, -26, 84], len = Math.hypot(jetty[2] - jetty[0], jetty[3] - jetty[1]);
  c.save(); c.translate(C + jetty[0], C + jetty[1]); c.rotate(Math.atan2(jetty[3] - jetty[1], jetty[2] - jetty[0]));
  c.save(); blur(c, 4, "rgba(0,0,0,.45)"); c.fillStyle = "#6b4a2a"; c.fillRect(0, -7, len, 14); c.restore();
  for (let d = 0; d < len; d += 5) { c.fillStyle = rng() < 0.5 ? "#8a6238" : "#7a5530"; c.fillRect(d, -7, 4.2, 14); }
  for (const d of [6, len - 6]) { dot(c, d, -8, 2.2, WOOD); dot(c, d, 8, 2.2, WOOD); }
  c.restore();
  const crate = (x, y, w) => {
    c.save(); blur(c, 2, "rgba(0,0,0,.45)"); c.fillStyle = "#9a6a36"; c.fillRect(C + x - w / 2, C + y - w / 2, w, w); c.restore();
    c.strokeStyle = "#5a3a1c"; c.lineWidth = 1; c.strokeRect(C + x - w / 2 + 0.5, C + y - w / 2 + 0.5, w - 1, w - 1);
    line(c, C + x - w / 2, C + y - w / 2, C + x + w / 2, C + y + w / 2, 0.8, "#5a3a1c");
  };
  const barrel = (x, y) => { dot(c, C + x + 1, C + y + 1, 4.2, "rgba(0,0,0,.3)"); dot(c, C + x, C + y, 4, "#7a4f2a"); dot(c, C + x, C + y, 2.2, "#5a3a1c"); };
  if (kind === "trade") { crate(-20, 52, 11); crate(-31, 64, 10); crate(-14, 66, 9); crate(46, -40, 11); crate(56, -53, 9); }
  else { barrel(-18, 48); barrel(-30, 60); barrel(-13, 62); barrel(46, -42); barrel(56, -54); line(c, C + 40, C - 70, C + 66, C - 86, 3, "#6b4a2a"); }
  c.save(); blur(c, 10, "rgba(255,214,120,.9)"); dot(c, C + jetty[2], C + jetty[3], 3, "#ffe7a8"); c.restore();
}
function buildStations(sc) {
  if (stationObjs.length) return;
  const C = DOCK_R + 26;
  for (const kind of ["supply", "trade"]) if (!sc.textures.exists("station-" + kind)) bakeCanvas(sc, "station-" + kind, C * 2, C * 2, artRes(), c => paintStation(c, C, kind));
  for (const p of STATIONS) {
    const key = "station-" + p.kind, ship = shipArt(p.kind === "trade" ? "fluyt" : "sloop", "merchant", { furled: true }, sc);
    const base = sc.add.image(p.x, p.y, key).setScale(1 / artResOf(key)).setDepth(1);
    const hull = sc.add.image(p.x + (p.kind === "trade" ? 10 : -8), p.y - 6, ship).setScale(1 / artResOf(ship)).setRotation(p.kind === "trade" ? -0.4 : 0.5).setDepth(4.2);
    sc.tweens.add({ targets: hull, angle: hull.angle + rand(1, 1.8), duration: rand(2200, 3200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const label = labelText(sc.add.text(p.x, p.y + 122, t("stationMap_" + p.kind), { fontFamily: UI_FONT, fontSize: "18px", fontStyle: "700", color: "#f6f1e3" })
      .setOrigin(0.5).setAlpha(0.7).setDepth(1));
    label.stationKind = p.kind;
    stationObjs.push(base, hull, label); stationLabels.push(label);
  }
}
onHook("ready", () => buildStations(S));
onHook("lang", () => { for (const l of stationLabels) l.setText(t("stationMap_" + l.stationKind)); });
