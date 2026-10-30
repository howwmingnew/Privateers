"use strict";
// ---------- Ship Lv progress, what an upgrade does to it, and the cheapest way up to a bounty's level (#98) ----------
// Ship Lv is whole levels of the enemy ladder (shipRating, js/data.js), so a gun level (+15% damage, about +3% rating power) barely
// moves it: the HUD, the ledger and every upgrade button show the share of the way to the next level instead, and the poster says how far
// short you are and what to buy first. All of it works on previews of the save (playerPower's `what`); nothing here changes it.
Object.assign(STR.en, {
  shipLvP: "Ship Lv {n} · next {p}%", shipLvN: "Ship Lv {n}", lvNext: " · next {p}%", statLvP: "Ship <b>Lv {n}</b> · next {p}%",
  lvGainUp: "Ship Lv → {n}", lvGainPct: "Ship Lv progress +{p}%",
  lvGainDown: "Ship Lv falls to {n} (fresh hull)", lvFalls: "Ship Lv falls to {n}", lvLossPct: "Ship Lv progress −{p}%", lvSame: "Ship Lv unchanged",
  lvGainStore: "Goes to the store: no Ship Lv change until mounted", lvGainEsc: "Escort: flagship Ship Lv unchanged, ports start empty",
  emptyFirst: "This ship has {n} empty port(s): filling empty ports first is the best value.",
  pRecGap: "About {x} levels to go.", pRecRoute: "Route: {steps}; about {gold} gold in all.",
  pRecPathBig: "Upgrades alone will not get there: look at a bigger ship.",
  rtBuy: "buy a {ship}", rtSwitch: "sail your {ship}", rtKeep: "keep your {ship}", rtFill: "fill {n} empty port(s)", rtUp: "upgrade {n} gun(s)", rtHull: "hull +{n} Lv", rtJoin: ", ",
});
Object.assign(STR.zh, {
  shipLvP: "船艦 Lv {n} · 下一級 {p}%", shipLvN: "船艦 Lv {n}", lvNext: " · 下一級 {p}%", statLvP: "船艦 <b>Lv {n}</b> · 下一級 {p}%",
  lvGainUp: "船艦 Lv → {n}", lvGainPct: "船艦 Lv 進度 +{p}%",
  lvGainDown: "船艦 Lv 降到 {n}（新船體從 Lv 1 起算）", lvFalls: "船艦 Lv 降到 {n}", lvLossPct: "船艦 Lv 進度 −{p}%", lvSame: "船艦 Lv 不變",
  lvGainStore: "放進庫存：裝上砲位前不影響船艦 Lv", lvGainEsc: "隨從：不影響旗艦船艦 Lv，砲位一開始是空的",
  emptyFirst: "這艘船還有 {n} 個空砲位：先補滿空砲位最划算。",
  pRecGap: "還差約 {x} 級。", pRecRoute: "路線：{steps}，全部約 {gold} 金幣。",
  pRecPathBig: "光靠升級補不到：考慮換更大的船。",
  rtBuy: "買一艘{ship}", rtSwitch: "換上你的{ship}", rtKeep: "留著{ship}", rtFill: "補滿 {n} 個空砲位", rtUp: "升級 {n} 門砲", rtHull: "船體再升 {n} 級", rtJoin: "、",
});

const lvLabelText = () => { const r = lvProgress(); return t("shipLvP", { n: r.lv, p: r.pct }); };
// The HUD label: the progress part in its own span, so a very short screen can drop it (css/style.css) and keep the level.
const lvLabelHtml = () => { const r = lvProgress(); return `${t("shipLvN", { n: r.lv })}<span class="lvp">${t("lvNext", { p: r.pct })}</span>`; };
// "Ship Lv progress +4%" for the what-if `what` (playerPower), "Ship Lv → 3" when it crosses a level, "" when it changes nothing.
function lvGainText(what) {
  const a = lvProgress(), b = lvProgress(what);
  if (b.lv > a.lv) return t("lvGainUp", { n: b.lv });
  if (b.lv < a.lv) return t("lvFalls", { n: b.lv });   // a swap can weaken the ship (a new Lv 1 gun over a Lv 4 one)
  const d = Math.round((b.frac - a.frac) * 100);
  return d >= 1 ? t("lvGainPct", { p: d }) : d <= -1 ? t("lvLossPct", { p: -d }) : b.frac > a.frac ? t("lvGainPct", { p: "<1" }) : "";
}
// The preview of raising the flagship's mounted gun `gun` (the object in save) by `n` levels; "" for a stored gun or an escort's.
const lvGainGun = (gun, n) => (gun && MOUNTS.some(({ key }) => save[key].includes(gun)) ? lvGainText({ gun: g => (g === gun ? { ...g, lv: g.lv + n } : g) }) : "");
// The flagship's hull one level up. Sails and hold are not part of the rating.
const lvGainHull = () => lvGainText({ hull: save.hull + 1 });
// A new gun `id` (Lv 1) bought for the flagship: into the picked port `into` (a place of the flagship: it replaces the gun there, or fills an empty port)
// or, with no flagship port picked, into the store, where it adds nothing until it is mounted.
function lvGainNewGun(id, into) {
  if (!into) return t("lvGainStore");
  const old = typeof gunAt === "function" ? gunAt(into) : null;
  return lvGainText(old ? { gun: g => (g === old ? gunItem(id) : g) } : { extra: [gunItem(id)] }) || t("lvSame");
}
// Boarding a ship bought at the yard, with the guns that fit it carried over (buyShip, js/shipyard.js): Ship Lv before -> after, which can fall (a new hull
// is Lv 1 all round). Worked on a preview save swapped in for the length of the call; the real one is put back whatever happens.
function lvGainShip(type) {
  if (typeof buyShip !== "function" || !Object.hasOwn(SHIPS, type)) return "";
  const real = save, next = buyShip({ ...real, gold: Math.max(real.gold, SHIPS[type].cost) }, type);   // the price is shown by the button: the preview ignores it
  if (!next) return "";
  const a = lvProgress();
  let b; save = next; try { b = lvProgress(); } finally { save = real; }
  if (b.lv > a.lv) return t("lvGainUp", { n: b.lv });
  if (b.lv < a.lv) return t("lvGainDown", { n: b.lv });
  const d = Math.round((b.frac - a.frac) * 100);
  return d >= 1 ? t("lvGainPct", { p: d }) : d <= -1 ? t("lvLossPct", { p: -d }) : t("lvSame");
}
// How many ports of the picked tab's ship are empty (n = 0 the flagship, else the escort in slot n - 1; an escort with no ship has no ports).
function emptyPortsOf(n) {
  if (n > 0 && !(save.escorts[n - 1] && save.escorts[n - 1].id)) return 0;
  const mounts = n === 0 ? save : save.escorts[n - 1].guns || {}, ship = SHIPS[n === 0 ? save.ship : (save.fleet.find(x => x.id === save.escorts[n - 1].id) || {}).ship];
  return ship ? MOUNTS.reduce((c, { key }) => c + Array.from({ length: ship.slots[key] }, (_, i) => (mounts[key] || [])[i]).filter(g => !g).length, 0) : 0;
}

// The upgrades (new guns for the empty ports, the mounted guns, then the hull) bought one at a time, always the one that adds the most rating power
// per gold, until the power of level `want` is reached: { gold, first: the first purchase ({ kind: "fill" | "gun", gun } or { kind: "hull" }) or null if
// nothing is needed, fills: new guns bought for empty ports, ups: mounted guns upgraded, hull: hull levels }, or null when upgrades alone cannot get there.
// `empties` is how many ports have no gun (each takes a new Lv 1 gun of any type); the walk runs on whatever `save` is at the time.
// Every state of the save it reads (ship, hull, each gun with its level and mods, the worn gear) goes into the memo key: renderPort asks every time
// the ledger redraws, and the greedy walk below is hundreds of playerPower calls.
let lvPathMemo = { sig: "", want: 0, out: null };
function lvPath(want) {
  const sig = JSON.stringify([save.ship, save.hull, MOUNTS.map(({ key }) => save[key]), save.gear && save.gear.worn]);
  if (lvPathMemo.sig !== sig || lvPathMemo.want !== want) lvPathMemo = { sig, want, out: lvPathCalc(want, emptyPortsOf(0)) };
  return lvPathMemo.out;
}
function lvPathCalc(want, empties = 0) {
  const goal = enemyPower(want), ports = MOUNTS.flatMap(({ key }) => save[key]).filter(Boolean), added = [], lv = new Map(ports.map(g => [g, g.lv]));
  const top = Math.max(...GUN_ORDER.map(id => playerPower({ gun: g => ({ ...g, lv: GUN_MAX }), hull: YARD.hull.max, extra: Array.from({ length: empties }, () => gunItem(id, GUN_MAX)) })));
  if (top < goal) return null;   // not even a full refit gets there: skip the walk
  let hull = save.hull, gold = 0, first = null;
  const power = (h = hull) => playerPower({ gun: g => (lv.has(g) ? { ...g, lv: lv.get(g) } : g), hull: h, extra: added.map(a => ({ ...a, lv: lv.get(a) })) });
  for (let step = 0; step < 400; step++) {
    const p = power();
    if (p >= goal) return { gold, first, fills: added.length, ups: ports.concat(added).filter(g => lv.get(g) > g.lv).length, hull: hull - save.hull };
    let best = null;
    const offer = (dp, cost, what) => { if (!best || dp / cost > best.rate) best = { rate: dp / cost, cost, what }; };
    for (const g of ports.concat(added)) {
      const was = lv.get(g);
      if (was >= GUN_MAX) continue;
      lv.set(g, was + 1); const dp = power() - p; lv.set(g, was);
      offer(dp, gunUpCost({ g: g.g, lv: was }), { kind: "gun", gun: g });
    }
    if (added.length < empties) for (const id of GUN_ORDER) {
      const gun = gunItem(id); added.push(gun); lv.set(gun, 1); const dp = power() - p; added.pop(); lv.delete(gun);
      offer(dp, GUNS[id].cost, { kind: "fill", gun });
    }
    if (hull < YARD.hull.max) offer(power(hull + 1) - p, YARD.hull.cost(hull, SHIPS[save.ship]), { kind: "hull" });
    if (!best) return null;
    gold += best.cost; first = first || best.what;
    if (best.what.kind === "fill") { added.push(best.what.gun); lv.set(best.what.gun, 1); }
    else if (best.what.kind === "gun") lv.set(best.what.gun, lv.get(best.what.gun) + 1); else hull++;
  }
  return null;
}
// Runs `f` with a preview save swapped in; the real one is put back whatever happens.
function onSave(next, f) { const real = save; save = next; try { return f(); } finally { save = real; } }
// The cheapest way to Ship Lv `want` from here, whole: keep this ship (lvPath), sail one you already own (free), or buy one a bounty has opened for sale
// (its price comes on top of the upgrades and the guns come along: buyShip, js/shipyard.js; the yard's 60% trade-in is left out, so the gold reads a little high).
// { kind: "keep" | "switch" | "buy", ship, gold: all of it, fills, ups, hull }, or null when no hull you could have gets there.
let lvRouteMemo = { sig: "", want: 0, out: null };
function lvRoute(want) {
  const owned = Array.isArray(save.fleet) ? save.fleet : [], open = (save.campaign && save.campaign.ships) || [];
  const sig = JSON.stringify([save.ship, save.hull, MOUNTS.map(({ key }) => save[key]), save.gear && save.gear.worn, owned, open, save.shipId]);
  if (lvRouteMemo.sig !== sig || lvRouteMemo.want !== want) lvRouteMemo = { sig, want, out: lvRouteCalc(want, owned, open) };
  return lvRouteMemo.out;
}
function lvRouteCalc(want, owned, open) {
  const opts = [], keep = lvPath(want);
  if (keep) opts.push({ kind: "keep", ship: save.ship, ...keep });
  if (typeof buyShip === "function" && typeof switchShip === "function") {
    const walk = (kind, ship, next, price) => {
      const r = next && onSave(next, () => lvPathCalc(want, emptyPortsOf(0)));
      if (r) opts.push({ kind, ship, ...r, gold: r.gold + price });
    };
    const seen = new Set([save.ship]);
    for (const e of owned) if (!seen.has(e.ship)) { seen.add(e.ship); walk("switch", e.ship, switchShip(save, e.id), 0); }
    for (const id of SHIP_ORDER) if (!seen.has(id) && forSale(id) && open.includes(id)) walk("buy", id, buyShip({ ...save, gold: Math.max(save.gold, SHIPS[id].cost) }, id), SHIPS[id].cost);
  }
  return opts.reduce((a, b) => (!a || b.gold < a.gold ? b : a), null);
}
// The poster's lines under the goal when you are short of `n`: how far, and the route (which ship, how many ports to fill or upgrade, about how much gold).
function lvShortHtml(n) {
  const me = lvProgress(), r = lvRoute(n);
  const steps = !r ? "" : [t(r.kind === "buy" ? "rtBuy" : r.kind === "switch" ? "rtSwitch" : "rtKeep", { ship: t("s_" + r.ship) }), r.fills && t("rtFill", { n: r.fills }),
    r.ups && t("rtUp", { n: r.ups }), r.hull && t("rtHull", { n: r.hull })].filter(Boolean).join(t("rtJoin"));
  return `<span class="how">${t("pRecGap", { x: Math.max(0.1, n - me.lv - me.frac).toFixed(1) })} ` +
    (r ? t("pRecRoute", { steps, gold: fmt(Math.round(r.gold / 10) * 10) }) : t("pRecPathBig")) + `</span>`;
}
