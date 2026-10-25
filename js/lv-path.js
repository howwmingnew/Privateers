"use strict";
// ---------- Ship Lv progress, what an upgrade does to it, and the cheapest way up to a bounty's level (#98) ----------
// Ship Lv is whole levels of the enemy ladder (shipRating, js/data.js), so a gun level (+15% damage, about +3% rating power) barely
// moves it: the HUD, the ledger and every upgrade button show the share of the way to the next level instead, and the poster says how far
// short you are and what to buy first. All of it works on previews of the save (playerPower's `what`); nothing here changes it.
Object.assign(STR.en, {
  shipLvP: "Ship Lv {n} · next {p}%", statLvP: "Ship <b>Lv {n}</b> · next {p}%",
  lvGainUp: "Ship Lv → {n}", lvGainPct: "Ship Lv progress +{p}%",
  pRecGap: "About {x} levels to go.", pRecPath: "Cheapest way up: upgrade {what} first; about {gold} gold of upgrades in all.",
  pRecPathBig: "Upgrades alone will not get there: look at a bigger ship.", pRecWhatHull: "the hull",
});
Object.assign(STR.zh, {
  shipLvP: "船艦 Lv {n} · 下一級 {p}%", statLvP: "船艦 <b>Lv {n}</b> · 下一級 {p}%",
  lvGainUp: "船艦 Lv → {n}", lvGainPct: "船艦 Lv 進度 +{p}%",
  pRecGap: "還差約 {x} 級。", pRecPath: "最省的補法：先升級{what}，全部補齊約再花 {gold} 金幣。",
  pRecPathBig: "光靠升級補不到：考慮換更大的船。", pRecWhatHull: "船體",
});

const lvLabelText = () => { const r = lvProgress(); return t("shipLvP", { n: r.lv, p: r.pct }); };
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

// The upgrades (guns on the flagship, then the hull) bought one at a time, always the one that adds the most rating power per gold,
// until the power of level `want` is reached: { gold, first: the first purchase ({ kind: "gun", gun } or { kind: "hull" }) or null if
// nothing is needed }, or null when upgrades alone cannot get there.
function lvPath(want) {
  const goal = enemyPower(want), ports = MOUNTS.flatMap(({ key }) => save[key]).filter(Boolean), lv = new Map(ports.map(g => [g, g.lv]));
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
