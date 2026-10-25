"use strict";
// ---------- Ship Lv progress, what an upgrade does to it, and the cheapest way up to a bounty's level (#98) ----------
// Ship Lv is whole levels of the enemy ladder (shipRating, js/data.js), so a gun level (+15% damage, about +3% rating power) barely
// moves it: the HUD, the ledger and every upgrade button show the share of the way to the next level instead, and the poster says how far
// short you are and what to buy first. All of it works on previews of the save (playerPower's `what`); nothing here changes it.
Object.assign(STR.en, {
  shipLvP: "Ship Lv {n} · next {p}%", shipLvN: "Ship Lv {n}", lvNext: " · next {p}%", statLvP: "Ship <b>Lv {n}</b> · next {p}%",
  lvGainUp: "Ship Lv → {n}", lvGainPct: "Ship Lv progress +{p}%",
  lvGainDown: "Ship Lv falls to {n} (fresh hull)", lvLossPct: "Ship Lv progress −{p}%", lvSame: "Ship Lv unchanged",
  lvGainStore: "Goes to the store: no Ship Lv change until mounted", lvGainEsc: "Escort: flagship Ship Lv unchanged, ports start empty",
  emptyFirst: "This ship has {n} empty port(s): filling empty ports first is the best value.",
  pRecGap: "About {x} levels to go.", pRecPath: "Cheapest way up: upgrade {what} first; about {gold} gold of upgrades in all.",
  pRecPathBig: "Upgrades alone will not get there: look at a bigger ship.", pRecWhatHull: "the hull",
});
Object.assign(STR.zh, {
  shipLvP: "船艦 Lv {n} · 下一級 {p}%", shipLvN: "船艦 Lv {n}", lvNext: " · 下一級 {p}%", statLvP: "船艦 <b>Lv {n}</b> · 下一級 {p}%",
  lvGainUp: "船艦 Lv → {n}", lvGainPct: "船艦 Lv 進度 +{p}%",
  lvGainDown: "船艦 Lv 降到 {n}（新船體從 Lv 1 起算）", lvLossPct: "船艦 Lv 進度 −{p}%", lvSame: "船艦 Lv 不變",
  lvGainStore: "放進庫存：裝上砲位前不影響船艦 Lv", lvGainEsc: "隨從：不影響旗艦船艦 Lv，砲位一開始是空的",
  emptyFirst: "這艘船還有 {n} 個空砲位：先補滿空砲位最划算。",
  pRecGap: "還差約 {x} 級。", pRecPath: "最省的補法：先升級{what}，全部補齊約再花 {gold} 金幣。",
  pRecPathBig: "光靠升級補不到：考慮換更大的船。", pRecWhatHull: "船體",
});

const lvLabelText = () => { const r = lvProgress(); return t("shipLvP", { n: r.lv, p: r.pct }); };
// The HUD label: the progress part in its own span, so a very short screen can drop it (css/style.css) and keep the level.
const lvLabelHtml = () => { const r = lvProgress(); return `${t("shipLvN", { n: r.lv })}<span class="lvp">${t("lvNext", { p: r.pct })}</span>`; };
// "Ship Lv progress +4%" for the what-if `what` (playerPower), "Ship Lv → 3" when it crosses a level, "" when it changes nothing.
function lvGainText(what) {
  const a = lvProgress(), b = lvProgress(what);
  if (b.lv > a.lv) return t("lvGainUp", { n: b.lv });
  const d = Math.round((b.frac - a.frac) * 100);
  return d >= 1 ? t("lvGainPct", { p: d }) : b.frac > a.frac ? t("lvGainPct", { p: "<1" }) : "";
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

// The upgrades (guns on the flagship, then the hull) bought one at a time, always the one that adds the most rating power per gold,
// until the power of level `want` is reached: { gold, first: the first purchase ({ kind: "gun", gun } or { kind: "hull" }) or null if
// nothing is needed }, or null when upgrades alone cannot get there.
// Every state of the save it reads (ship, hull, each gun with its level and mods, the worn gear) goes into the memo key: renderPort asks every time
// the ledger redraws, and the greedy walk below is hundreds of playerPower calls.
let lvPathMemo = { sig: "", want: 0, out: null };
function lvPath(want) {
  const sig = JSON.stringify([save.ship, save.hull, MOUNTS.map(({ key }) => save[key]), save.gear && save.gear.worn]);
  if (lvPathMemo.sig !== sig || lvPathMemo.want !== want) lvPathMemo = { sig, want, out: lvPathCalc(want) };
  return lvPathMemo.out;
}
function lvPathCalc(want) {
  const goal = enemyPower(want), ports = MOUNTS.flatMap(({ key }) => save[key]).filter(Boolean), lv = new Map(ports.map(g => [g, g.lv]));
  const top = playerPower({ gun: g => ({ ...g, lv: GUN_MAX }), hull: YARD.hull.max });
  if (top < goal) return null;   // not even a full refit gets there: skip the walk
  let hull = save.hull, gold = 0, first = null;
  const power = (h = hull) => playerPower({ gun: g => (lv.has(g) ? { ...g, lv: lv.get(g) } : g), hull: h });
  for (let step = 0; step < 400; step++) {
    const p = power();
    if (p >= goal) return { gold, first };
    let best = null;
    const offer = (dp, cost, what) => { if (!best || dp / cost > best.rate) best = { rate: dp / cost, cost, what }; };
    for (const g of ports) {
      const was = lv.get(g);
      if (was >= GUN_MAX) continue;
      lv.set(g, was + 1); const dp = power() - p; lv.set(g, was);
      offer(dp, gunUpCost({ g: g.g, lv: was }), { kind: "gun", gun: g });
    }
    if (hull < YARD.hull.max) offer(power(hull + 1) - p, YARD.hull.cost(hull, SHIPS[save.ship]), { kind: "hull" });
    if (!best) return null;
    gold += best.cost; first = first || best.what;
    if (best.what.kind === "gun") lv.set(best.what.gun, lv.get(best.what.gun) + 1); else hull++;
  }
  return null;
}
// The poster's lines under the goal when you are short of `n`: how far, and what to buy first.
function lvShortHtml(n) {
  const me = lvProgress(), path = lvPath(n);
  const what = path && path.first ? (path.first.kind === "hull" ? t("pRecWhatHull") : t("gf_" + path.first.gun.g)) : "";
  return `<span class="how">${t("pRecGap", { x: Math.max(0.1, n - me.lv - me.frac).toFixed(1) })} ` +
    (path && path.first ? t("pRecPath", { what, gold: fmt(path.gold) }) : t("pRecPathBig")) + `</span>`;
}
