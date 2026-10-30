// Unit tests for #98: Ship Lv progress (js/data.js ratingAt / lvProgress), what an upgrade does to it, the cheapest path to a bounty's level
// (js/lv-path.js) and the poster's margin rule (js/bounty-rec.js). Pure functions, loaded into one node:vm context.
// Usage: node --test tests/unit-lvpath.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js", "js/ship-lines.js", "js/arsenal.js", "js/lv-path.js", "js/bounty-rec.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);

function boot(lang = "en") {
  const store = new Map([["privateers-lang", lang]]), ready = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") ready.push(fn); } }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  ready.forEach(fn => fn());   // the save loads here, once every file (shipyard adds the fleet) has added its defaults
  const run = code => vm.runInContext(code, ctx);
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const levelUp = (g, lv) => g.run(`for (const { key } of MOUNTS) save[key] = save[key].map(x => x && { ...x, lv: ${lv} })`);

test("ratingAt: the level is shipRating's, the share runs 0 at a level's power to just under 1 at the next one's", () => {
  const g = boot();
  const lo = g.run("enemyPower(3)"), hi = g.run("enemyPower(4)");
  assert.deepEqual(g.json(`ratingAt(${lo})`), { lv: 3, pct: 0 });
  const mid = g.json(`ratingAt(${(lo + hi) / 2})`);
  assert.equal(mid.lv, 3);
  assert.ok(Math.abs(mid.pct - 0.5) < 1e-9, "halfway in power is 50%");
  const top = g.json(`ratingAt(${hi - 1e-6})`);
  assert.equal(top.lv, 3);
  assert.ok(top.pct > 0.99 - 1e-9 && top.pct <= 0.99, "never shows 100%: that is the next level");
  assert.equal(g.json(`ratingAt(${hi})`).lv, 4, "the next level's power is the next level");
  assert.equal(g.json("ratingAt(0)").pct, 0, "below the ladder's first rung is 0%");
});

test("lvProgress: a fresh sloop is Lv 2 with its share to Lv 3; shipRating is the same level", () => {
  const g = boot();
  const r = g.json("lvProgress()");
  assert.equal(r.lv, 2);
  assert.equal(r.lv, g.run("shipRating()"));
  assert.ok(r.pct > 0 && r.pct < 100, JSON.stringify(r));
  assert.equal(r.pct, Math.floor(r.frac * 100));
  const want = (g.run("playerPower()") - g.run("enemyPower(2)")) / (g.run("enemyPower(3)") - g.run("enemyPower(2)"));
  assert.ok(Math.abs(r.frac - want) < 1e-9, "linear in power between the two rungs");
});

test("what-if previews do not touch the save, and a better gun or hull only ever adds", () => {
  const g = boot();
  const before = g.run("JSON.stringify(save)");
  const p0 = g.run("playerPower()");
  const gun = g.run("save.left[0]");
  assert.ok(g.run("playerPower({ gun: x => (x === save.left[0] ? { ...x, lv: x.lv + 1 } : x) })") > p0);
  assert.ok(g.run("playerPower({ hull: save.hull + 1 })") > p0);
  assert.equal(g.run("JSON.stringify(save)"), before, "save unchanged");
  assert.equal(g.run("playerPower()"), p0);
  assert.ok(gun, "a gun is mounted");
});

test("every gun upgrade on a fresh sloop shows a Ship Lv progress gain, the one that crosses a level says so", () => {
  const g = boot();
  const gain = g.run("lvGainGun(save.left[0], 1)");
  assert.match(gain, /^Ship Lv progress \+\d+%$/);
  const p = +gain.match(/\d+/)[0];
  assert.ok(p >= 3 && p <= 8, `one gun level on a three-gun sloop is a few percent of the way to Lv 3, got ${p}`);
  // the same upgrade from just under Lv 3 crosses it
  levelUp(g, 4);
  assert.equal(g.run("shipRating()"), 3);
  levelUp(g, 3);
  assert.equal(g.run("shipRating()"), 2);
  const cross = g.run("lvGainGun(save.left[0], 2)");   // Lv 3 -> 5 on one gun: 1.32x on a third of the dps
  assert.match(cross, /^Ship Lv (→ \d|progress \+\d+%)$/);
  levelUp(g, 6);
  const near = g.run("lvProgress()");
  assert.equal(near.lv, 3);
  assert.equal(g.run("lvGainGun(save.left[0], 5)").startsWith("Ship Lv"), true);
  assert.equal(g.run("lvGainGun({ g: 'six', lv: 1 }, 1)"), "", "a gun that is not on the flagship's ports is not part of the rating");
});

test("a gun upgrade that does cross a level reads 'Ship Lv → N'", () => {
  const g = boot();
  levelUp(g, 3);
  // find a boost size that crosses: raise one gun until the rating level changes
  const n = g.run("(() => { for (let k = 1; k <= 7; k++) { if (lvProgress({ gun: x => (x === save.left[0] ? { ...x, lv: x.lv + k } : x) }).lv > lvProgress().lv) return k; } return 0; })()");
  assert.ok(n >= 1, "one gun can be raised high enough to reach Lv 3");
  assert.equal(g.run(`lvGainGun(save.left[0], ${n})`), "Ship Lv → 3");
  assert.match(boot("zh").run("lvGainHull()"), /^船艦 Lv 進度 \+\d+%$/);
});

test("the hull upgrade shows its progress; sails and hold are not part of the rating", () => {
  const g = boot();
  assert.match(g.run("lvGainHull()"), /^Ship Lv progress \+\d+%$/);
  assert.equal(g.run("playerPower() === playerPower({})"), true);
  const a = g.run("playerPower()");
  g.run("save = { ...save, sails: 5, hold: 6 }");
  assert.equal(g.run("playerPower()"), a);
});

test("lvPath: nothing to buy when already there; otherwise gold and the first purchase, and every purchase is affordable-priced from the tables", () => {
  const g = boot();
  assert.deepEqual(g.json("lvPath(2)"), { gold: 0, first: null, fills: 0, ups: 0, hull: 0 });
  const p = g.json("lvPath(3)");
  assert.ok(p && p.gold > 0 && p.first, JSON.stringify(p));
  assert.equal(p.first.kind, "gun", "a Lv 1 gun costs 12 gold for +15% of a third of the damage: far better value than the 110-gold hull");
  assert.ok(p.gold <= 250, `Lv 3 from a fresh sloop costs about 180 gold of upgrades, got ${p.gold}`);
  // the plan really reaches the level: buy what it would buy and check
  const reach = g.run(`(() => { const goal = enemyPower(3); let gold = 0; for (let n = 0; n < 200 && playerPower() < goal; n++) {
    const best = save.left.concat(save.right, save.bow).filter(Boolean).sort((a, b) => a.lv - b.lv)[0]; gold += gunUpCost(best); best.lv++; } return { gold, ok: playerPower() >= goal }; })()`);
  assert.ok(reach.ok);
  assert.ok(Math.abs(reach.gold - p.gold) <= 15, `evenly levelled guns cost about what the plan says: ${reach.gold} vs ${p.gold}`);
});

test("lvPath: a level far beyond what upgrades can reach on this hull is null, and the poster says to look at a bigger ship", () => {
  const g = boot();
  assert.equal(g.run("lvPath(30)"), null);
  assert.match(g.run("lvShortHtml(30)"), /bigger ship/);
  assert.match(g.run("lvShortHtml(3)"), /Route: keep your Sloop, upgrade \d+ gun\(s\).*; about \d+ gold in all/);
  assert.match(g.run("lvShortHtml(3)"), /levels to go/);
});

test("lvPath: the result is memoised on the save it reads, and any change to guns or hull recomputes it", () => {
  const g = boot();
  assert.ok(g.run("lvPath(3) === lvPath(3)"), "same save, same answer object: no second walk");
  const before = g.json("lvPath(3)");
  g.run("save.left.concat(save.right, save.bow).filter(Boolean).forEach(x => { x.lv = 3; })");
  const after = g.json("lvPath(3)");
  assert.ok(!after || after.gold < before.gold, `upgraded guns change the plan (${before.gold} -> ${after && after.gold})`);
  assert.equal(g.run("lvPath(30)"), null);
});

test("lvRoute: a sloop that cannot reach Lv 8 by upgrades is told which open hull to buy, how many ports to fill and upgrade, and the gold", () => {
  const g = boot();
  g.run("save.campaign = { ships: ['sloop', 'schooner', 'gunboat'] }");   // Red Ned sunk: the two tier-2 hulls are open (SHIP_GATE)
  assert.equal(g.run("lvPath(8)"), null, "the stock sloop cannot upgrade its way there");
  const r = g.json("lvRoute(8)");
  assert.ok(r, "an open hull gets there");
  assert.equal(r.kind, "buy");
  assert.ok(["schooner", "gunboat"].includes(r.ship));
  assert.ok(r.gold > g.run(`SHIPS.${r.ship}.cost`), "the price plus the refit");
  assert.ok(r.fills >= 1, "the new hull has empty ports to fill: " + JSON.stringify(r));
  assert.ok(Number.isInteger(r.ups) && Number.isInteger(r.hull));
  assert.equal(g.run(`onSave(buyShip({ ...save, gold: 99999 }, '${r.ship}'), () => lvPathCalc(8, emptyPortsOf(0)).gold) + SHIPS.${r.ship}.cost`), r.gold, "price + the walk on the bought hull");
  assert.match(g.run("lvShortHtml(8)"), new RegExp(`Route: buy a ${g.run(`t('s_${r.ship}')`)}, fill \\d+ empty port\\(s\\).*gold in all`));
  assert.match(boot("zh").run("(save.campaign = { ships: ['sloop', 'schooner', 'gunboat'] }, lvShortHtml(8))"), /路線：買一艘.*補滿 \d+ 個空砲位.*全部約 [\d.,]+K? 金幣/);
  assert.equal(g.run("save.ship"), "sloop", "the preview never touches the save");
});

test("lvRoute: a hull the bounty has not opened is never offered, and an owned one is a free switch", () => {
  const g = boot();
  assert.ok(!g.run("(() => { const r = lvRoute(8); return r && r.kind === 'buy'; })()"), "nothing but the sloop is open on a fresh save");
  g.run("save.campaign = { ships: ['sloop', 'schooner', 'gunboat'] }; save.fleet = [{ id: 's2', ship: 'gunboat', hull: 1, sails: 1, hold: 1 }]; save.shipSeq = 3");
  const r = g.json("lvRoute(8)");
  assert.ok(r && r.kind === "switch" && r.ship === "gunboat", JSON.stringify(r));
  assert.match(g.run("lvShortHtml(8)"), /Route: sail your Gunboat/);
});

test("the poster's margin: a bounty can set its own (Red Ned asks one level), the rest keep boss + escort", () => {
  const g = boot();
  assert.equal(g.run("bountyMargin({ escorts: [], margin: 1 })"), 1);
  assert.equal(g.run("bountyMargin({ escorts: [] })"), 2);
  assert.equal(g.run("bountyMargin({ escorts: [{ cls: 'brig' }] })"), 3);
  assert.equal(g.run("bountyMargin({ escorts: [], margin: 0 })"), 0, "a margin of 0 is a margin, not 'unset'");
  // #122: Mother Carey (with her escort) asks +2 in all, one under the default +3, so her poster reads about Ship Lv 8; set on the bounty, not in the constants
  const camp = readFileSync(new URL("../js/campaign.js", import.meta.url), "utf8");
  assert.match(camp.match(/\{ id: "carey"[^\n]*/)[0], /escorts: \[\{ cls: "brig" \}\], margin: 2 \}/);
  assert.doesNotMatch(camp.match(/\{ id: "saint"[^\n]*/)[0], /margin/, "the later bounties keep the default");
  assert.equal(g.run("BOSS_MARGIN + ESCORT_MARGIN"), 3);
});

test("every new string exists in both languages, with its placeholders", () => {
  const g = boot();
  for (const k of ["shipLvP", "statLvP", "lvGainUp", "lvGainPct", "pRecGap", "pRecRoute", "pRecPathBig", "rtBuy", "rtSwitch", "rtKeep", "rtFill", "rtUp", "rtHull", "rtJoin", "pRecYou"])
    assert.ok(g.run(`STR.en.${k}`) && g.run(`STR.zh.${k}`), k);
  for (const k of ["shipLvP", "statLvP"]) for (const l of ["en", "zh"]) assert.match(g.run(`STR.${l}.${k}`), /\{n\}.*\{p\}/, `${l}.${k}`);
  assert.match(g.run('t("shipLvP", { n: 2, p: 40 })'), /Ship Lv 2 · next 40%/);
  assert.equal(boot("zh").run('t("shipLvP", { n: 2, p: 40 })'), "船艦 Lv 2 · 下一級 40%");
  for (const k of ["pRecCalc", "pRecWhy", "pRecWhyEsc", "lvHow"]) for (const l of ["en", "zh"]) assert.doesNotMatch(g.run(`STR.${l}.${k}`), /巢穴|海上標籤|lair|badge at sea/, `${l}.${k} says it in plain words`);
});
