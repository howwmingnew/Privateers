// Unit tests for the crew (#66, js/crew.js): seats per hull size, the role bonuses and their cap with gear of the same kind (repair, speed, storm
// through gx, reload through crewReloadK), only the best of each role counting, hiring (price, pool, roster limit), the pool refreshed once per
// sortie, the bounty veteran's roll, injury only when the flagship sinks and recovery after the rest (the surgeon's cut), who sails when a smaller
// hull has fewer seats, the save's validation (hostile fields, old saves with no crew), and every string in both languages.
// Usage: node --test tests/unit-crew.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/gear-core.js", "js/gear-text.js", "js/save.js", "js/save-campaign.js",
  "js/shipyard.js", "js/gear-save.js", "js/escorts.js", "js/crew.js", "js/gear-fx.js", "js/crew-ui.js"];
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const f of FILES) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// a save on `ship` with these crew members (role, grade, on, rest), ids 0..n-1
run(`var fixed = v => () => v;
  var mk = (ship, members = [], extra = {}) => sanitizeSave({ ...defaultSave(), ship, gold: 5000, ...extra,
    crew: { list: members.map(([role, gr = 1, on = true, rest = 0], i) => ({ id: i, role, gr, n: i, on, rest })), pool: extra.pool || [], poolAt: 0, seq: members.length } });`);

test("seats: tiers 1-2 small (2), 3 medium (3), 4-5 large (4), for every ship in SHIPS", () => {
  const want = { sloop: 2, schooner: 2, gunboat: 2, brigantine: 3, brig: 3, cruiser: 4, frigate: 4, corsair: 4, line: 4 };
  assert.deepEqual(Object.keys(want).sort(), json("Object.keys(SHIPS)").sort(), "every ship is covered");
  for (const [id, n] of Object.entries(want)) {
    assert.equal(run(`crewSeats("${id}")`), n, id);
    assert.equal(run(`crewSize("${id}")`), n === 2 ? "small" : n === 3 ? "medium" : "large", id);
  }
  assert.equal(run(`crewSeats("nope")`), 2, "an unknown hull is small");
});

test("bonuses: able / veteran values, best of each role counts, a second of the same role adds nothing", () => {
  run(`save = mk("frigate", [["gunner"], ["carpenter"], ["navigator", 2], ["surgeon"]])`);
  assert.deepEqual(json("crewBest(save)"), { reload: 0.08, repair: 0.25, spd: 0.05, storm: 0.25, rest: 1 });
  run(`save = mk("frigate", [["gunner"], ["gunner", 2], ["gunner"]])`);
  assert.deepEqual(json("crewBest(save)"), { reload: 0.12 }, "three gunners: the veteran's 12%, nothing summed");
  run(`save = mk("frigate", [["gunner", 1, false], ["carpenter", 1, true, 2]])`);
  assert.deepEqual(json("crewBest(save)"), {}, "ashore or hurt: no bonus");
});

test("cap with gear: crew adds to the same gear effect but never past GEAR_CAP, and never lowers the gear alone", () => {
  assert.deepEqual(json("[GEAR_CAP.repair, GEAR_CAP.spd, GEAR_CAP.storm]"), [1, 0.25, 0.7]);
  run(`save = mk("frigate", [["carpenter", 2], ["navigator", 2]])`);
  assert.deepEqual(json("crewMix({}, save)"), { repair: 0.4, spd: 0.05, storm: 0.25 }, "no gear: the crew's own shares");
  assert.deepEqual(json("crewMix({ repair: 0.9, spd: 0.24, storm: 0.6, hp: 0.3 }, save)"), { repair: 1, spd: 0.25, storm: 0.7, hp: 0.3 }, "at the cap, other effects untouched");
  assert.deepEqual(json("crewMix({ spd: 0.3 }, save)").spd, 0.3, "gear alone over the cap (a hand edit) is not cut");
  // through gx: a worn sail with +10% speed and the veteran navigator
  run(`save = { ...save, gear: { ...save.gear, worn: { ...save.gear.worn, sail: { p: "sail", lv: 1, r: 1, af: [["spd", 0.1]] } } } }`);
  const sail = run("gearTotals(save.gear.worn).spd");
  near(run("gx('spd')"), Math.min(0.25, sail + 0.05));
  near(run("gearMul('repair')"), 1.4); near(run("gearCut('storm')"), 0.75);
  run(`save = { ...save, crew: { ...save.crew, list: [] } }`);
  near(run("gx('spd')"), sail, 1e-9);   // the cache follows the roster
});

test("reload: the gunner adds to the gun's own reload affix up to CREW_RELOAD_CAP; the rating counts it; escorts' guns do not", () => {
  run(`save = mk("sloop", [["gunner"]])`);
  near(run("crewReloadK(0)"), 0.08); near(run("crewReloadK(0.1)"), 0.18); near(run("crewReloadK(0.21)"), 0.25); near(run("crewReloadK(0.3)"), 0.3);
  near(run("gunReload({ g: 'six', lv: 1 })"), 1.08);
  const withGunner = run("playerPower()");
  run(`save = mk("sloop", [["gunner", 2]])`); near(run("crewReloadK(0)"), 0.12);
  run(`save = mk("sloop", [])`);
  near(run("crewReloadK(0.1)"), 0.1); near(run("gunReload({ g: 'six', lv: 1 })"), 1);
  assert.ok(withGunner > run("playerPower()"), "a gunner raises the ship rating's firepower");
  run(`save = mk("sloop", [["gunner", 2]])`);
  const esc = json(`escortBattery("brig", { bow: [{ g: "six", lv: 1 }], left: [], right: [], stern: [] }).bow[0].interval`);
  run(`save = mk("sloop", [])`);
  near(json(`escortBattery("brig", { bow: [{ g: "six", lv: 1 }], left: [], right: [], stern: [] }).bow[0].interval`), esc);
});

test("hiring: price grows with the roster, joins aboard while seats last then ashore, needs the gold, never past CREW_MAX", () => {
  run(`save = mk("sloop", [], { gold: 1000, pool: [{ role: "gunner", n: 5 }, { role: "surgeon", n: 6 }, { role: "navigator", n: 7 }] })`);
  assert.equal(run("crewCost(save)"), 200);
  run("var h1 = crewHire(save, 1)");
  assert.equal(run("h1.gold"), 800); assert.deepEqual(json("h1.crew.list"), [{ id: 0, role: "surgeon", gr: 1, n: 6, on: true, rest: 0 }]);
  assert.deepEqual(json("h1.crew.pool.map(p => p.n)"), [5, 7], "the hired one leaves the pool");
  assert.equal(run("crewCost(h1)"), 300);
  run("var h2 = crewHire(crewHire(h1, 0), 0)");
  assert.equal(run("h2.gold"), 1000 - 200 - 300 - 400);
  assert.deepEqual(json("h2.crew.list.map(c => [c.role, c.on])"), [["surgeon", true], ["gunner", true], ["navigator", false]], "the sloop's two seats, then ashore");
  assert.equal(run("crewHire(h2, 0)"), null, "pool empty");
  assert.equal(run("crewHire({ ...h1, gold: 299 }, 0)"), null, "too little gold");
  run(`save = mk("line", ["gunner", "gunner", "surgeon", "surgeon", "carpenter", "carpenter", "navigator", "navigator"].map(r => [r, 1, false]), { gold: 1e6, pool: [{ role: "gunner", n: 9 }] })`);
  assert.equal(run("crewList(save).length"), 8); assert.equal(run("crewHire(save, 0)"), null, "roster full");
  assert.deepEqual(json("[CREW_HIRE, CREW_HIRE_STEP, CREW_MAX, CREW_POOL]"), [200, 0.5, 8, 3]);
});

test("pool: drawn once per sortie count (a reload draws nothing new), three able hands, names not already taken", () => {
  run(`save = mk("sloop", [["gunner"], ["carpenter"]], { stats: { sorties: 4 } })`);
  run(`var p0 = { ...save, crew: { ...save.crew, poolAt: -1, pool: [] } }, p1 = crewRefresh(p0, mulberry32(3))`);
  assert.equal(run("p1.crew.poolAt"), 4);
  const pool = json("p1.crew.pool");
  assert.equal(pool.length, 3);
  assert.ok(pool.every(p => p.gr === 1 && ["gunner", "carpenter", "surgeon", "navigator"].includes(p.role)));
  const names = pool.map(p => p.n);
  assert.equal(new Set(names).size, 3, "distinct names"); assert.ok(!names.includes(0) && !names.includes(1), "not a name on the roster");
  assert.equal(run("crewRefresh(p1, mulberry32(9)) === p1"), true, "same sortie: the same pool");
  run(`var p2 = crewRefresh({ ...p1, stats: { ...p1.stats, sorties: 5 } }, mulberry32(9))`);
  assert.equal(run("p2.crew.poolAt"), 5); assert.equal(run("p2.crew.pool.length"), 3);
});

test("bounty veteran: CREW_BOSS_CHANCE, a grade-2 member, aboard when a seat is free, none on a full roster", () => {
  assert.equal(run("CREW_BOSS_CHANCE"), 0.4);
  run(`save = mk("sloop", [["gunner"]])`);
  assert.equal(run("crewBossRoll(save, fixed(0.41))"), null, "no luck");
  const r = json("crewBossRoll(save, fixed(0.39))");
  assert.equal(r.m.gr, 2); assert.equal(r.m.on, true); assert.equal(r.m.id, 1); assert.equal(r.save.crew.list.length, 2);
  run(`save = mk("sloop", [["gunner"], ["surgeon"]])`);
  assert.equal(run("crewBossRoll(save, fixed(0)).m.on"), false, "seats full: waits ashore");
  run(`save = mk("line", Array.from({ length: 8 }, () => ["gunner", 1, false]))`);
  assert.equal(run("crewBossRoll(save, fixed(0))"), null);
});

test("injury: only a sinking hurts, only those aboard, for CREW_REST sorties; the surgeon aboard cuts it", () => {
  run(`save = mk("brig", [["gunner"], ["carpenter"], ["navigator", 1, false]])`);
  const calm = json("crewDock(save, false)");
  assert.deepEqual(calm.hurt, []); assert.deepEqual(calm.save.crew.list, json("save.crew.list"), "a normal return changes nobody");
  const sunk = json("crewDock(save, true)");
  assert.deepEqual(sunk.hurt.sort(), [0, 1]);
  assert.deepEqual(sunk.save.crew.list.map(c => [c.rest, c.on]), [[3, false], [3, false], [0, false]], "the aboard are hurt and ashore; the one ashore is fine");
  assert.equal(sunk.save.crew.list.length, 3, "nobody is lost");
  for (const [crew, rest] of [[[["surgeon"], ["gunner"]], 2], [[["surgeon", 2], ["gunner"]], 1], [[["surgeon", 1, false], ["gunner"]], 3]]) {
    run(`save = mk("brig", ${JSON.stringify(crew)})`);
    assert.equal(run("crewDock(save, true).save.crew.list.find(c => c.role === 'gunner').rest"), rest, JSON.stringify(crew));
  }
});

test("recovery: the hurt sit out exactly their rest in sorties, can't be sent aboard meanwhile, then return to their seat", () => {
  run(`save = mk("sloop", [["gunner"], ["carpenter"], ["navigator", 1, false]])`);
  run("var d = crewDock(save, true).save");
  assert.equal(run("crewSetOn(d, 0, true)"), null, "hurt: can't go aboard");
  assert.equal(run("crewSetOn(d, 2, true).crew.list[2].on"), true, "a fit one ashore can take the empty seat");
  const states = [];
  for (let i = 0; i < 3; i++) { states.push(json("[crewAboard(d).map(c => c.id), d.crew.list.map(c => c.rest)]")); run("d = crewDock(d, false).save"); }
  assert.deepEqual(states.map(s => s[1]), [[3, 3, 0], [2, 2, 0], [1, 1, 0]]);
  assert.ok(states.every(s => s[0].length === 0), "nobody hurt sails meanwhile");
  assert.deepEqual(json("d.crew.list.map(c => [c.rest, c.on])"), [[0, true], [0, true], [0, false]], "back after three sorties, in their seats");
  // a seat taken meanwhile: the one who comes back last waits ashore
  run(`d = crewDock(mk("sloop", [["gunner"], ["carpenter", 1, false]]), true).save; d = crewSetOn(d, 1, true)`);
  run("for (let i = 0; i < 3; i++) d = crewDock(d, false).save");
  assert.deepEqual(json("d.crew.list.map(c => [c.rest, c.on])"), [[0, true], [0, true]], "two seats: both fit in");
  run(`d = crewDock(mk("sloop", [["gunner"], ["surgeon", 1, false], ["carpenter", 1, false]]), true).save; d = crewSetOn(crewSetOn(d, 1, true), 2, true)`);
  run("for (let i = 0; i < 3; i++) d = crewDock(d, false).save");
  assert.deepEqual(json("d.crew.list.map(c => [c.rest, c.on])"), [[0, false], [0, true], [0, true]], "seats full: back but ashore");
});

test("smaller hull: the extras go ashore in roster order, stay on the roster, and the captain picks who sails", () => {
  run(`save = mk("frigate", [["gunner"], ["carpenter"], ["navigator"], ["surgeon"]])`);
  assert.equal(run("crewAboard(save).length"), 4);
  run(`var small = fitCrew({ ...save, ship: "sloop" })`);
  assert.deepEqual(json("small.crew.list.map(c => c.on)"), [true, true, false, false]);
  assert.equal(run("small.crew.list.length"), 4, "still owned");
  assert.deepEqual(json("crewAboard({ ...save, ship: 'sloop' }).map(c => c.id)"), [0, 1], "before the flags are fitted, the seats still limit");
  assert.equal(run("crewSetOn(small, 2, true)"), null, "no free seat");
  run("small = crewSetOn(crewSetOn(small, 0, false), 3, true)");
  assert.deepEqual(json("crewAboard(small).map(c => c.role)"), ["carpenter", "surgeon"]);
  assert.deepEqual(json("fitCrew(small)"), json("small"), "idempotent");
});

test("save: an old save gets an empty crew; hostile fields are coerced, never thrown on", () => {
  assert.deepEqual(json(`sanitizeSave({ v: 2, gold: 10 }).crew`), { list: [], pool: [], poolAt: -1, seq: 0 });
  for (const bad of ['"x"', "null", "[]", "42", "{ list: 'no', pool: {}, poolAt: 'soon', seq: -9 }"]) {
    assert.deepEqual(json(`sanitizeSave({ v: 2, crew: ${bad} }).crew`), { list: [], pool: [], poolAt: -1, seq: 0 }, bad);
  }
  const hostile = { v: 2, ship: "sloop", crew: {
    list: [{ id: 3, role: "gunner", gr: 99, n: 999, on: true, rest: 999 }, { id: 3, role: "carpenter", gr: "2", n: -4, on: "yes", rest: -5 },
      { id: "x", role: "__proto__" }, { role: "toString" }, null, "pirate", { id: 1e9, role: "navigator", on: true }, { id: 7, role: "surgeon", on: true },
      ...Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, role: "gunner" }))],
    pool: [{ role: "gunner", gr: 2, n: 3 }, { role: "king" }, { role: "surgeon", n: "x" }, { role: "navigator" }, { role: "carpenter" }],
    poolAt: 1e30, seq: "lots" } };
  const raw = JSON.stringify(hostile).replace('"seq":"lots"', '"seq":"lots","__proto__":{"evil":1}');   // a real own "__proto__" key, as JSON.parse makes it
  const s = json(`sanitizeSave(JSON.parse(${JSON.stringify(raw)}))`);
  const list = s.crew.list;
  assert.equal(list.length, 8, "never more than CREW_MAX");
  assert.deepEqual(list[0], { id: 3, role: "gunner", gr: 2, n: 23, on: false, rest: 3 }, "grade, name and rest clamped; hurt means ashore");
  assert.deepEqual({ ...list[1], id: 0 }, { id: 0, role: "carpenter", gr: 2, n: 0, on: false, rest: 0 }, "'yes' is not aboard");
  assert.ok(list[1].id > 103 && list[2].id > 103 && list[2].role === "navigator", "a repeated or out-of-range id gets a new one past every kept id");
  assert.equal(new Set(list.map(c => c.id)).size, 8, "ids unique");
  assert.ok(list.every(c => ["gunner", "carpenter", "surgeon", "navigator"].includes(c.role)));
  assert.ok(list.filter(c => c.on).length <= 2, "the sloop's seats");
  assert.ok(s.crew.seq > Math.max(...list.map(c => c.id)), "the next id is new");
  assert.deepEqual(s.crew.pool, [{ role: "gunner", gr: 1, n: 3 }, { role: "surgeon", gr: 1, n: 0 }, { role: "navigator", gr: 1, n: 0 }], "the pool is able hands only, at most three");
  assert.equal(s.crew.poolAt, Number.MAX_SAFE_INTEGER);
  assert.equal(run("({}).evil"), undefined);
  assert.deepEqual(json("sanitizeSave(sanitizeSave(" + JSON.stringify(s) + ")).crew"), s.crew, "idempotent");
});

test("strings: every crew text in both languages, names included", () => {
  const keys = json(`Object.keys(STR.en).filter(k => /^(crew|cr_|cg_|cfx_|cn\\d|csz_)/.test(k))`);
  assert.ok(keys.length > 50, `${keys.length} keys`);
  const missing = json(`${JSON.stringify(keys)}.filter(k => typeof STR.zh[k] !== "string" || !STR.zh[k].trim())`);
  assert.deepEqual(missing, []);
  const zhOnly = json(`Object.keys(STR.zh).filter(k => /^(crew|cr_|cg_|cfx_|cn\\d|csz_)/.test(k) && !(k in STR.en))`);
  assert.deepEqual(zhOnly, []);
  assert.equal(json(`Array.from({ length: CREW_NAMES }, (_, i) => STR.en["cn" + i] && STR.zh["cn" + i]).filter(Boolean).length`), run("CREW_NAMES"));
});
