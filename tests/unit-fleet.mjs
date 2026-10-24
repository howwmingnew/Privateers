// Unit tests for AI fleets (js/fleet.js): formation slots, fleet composition and its caps, the wingman's 80% firepower,
// seeded generation, and the lead-loss reactions. Pure functions only; scripts load into one node:vm context.
// Usage: node --test tests/unit-fleet.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/archetypes.js", "js/fleet.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("formation: column trails the lead in a straight line", () => {
  const s = json('formationSlots("column", 3, 100)');
  assert.deepEqual(s.map(p => p.ax), [-100, -200, -300]);
  assert.ok(s.every(p => p.ay === 0));
});

test("formation: line sits abreast, alternating sides, never ahead of the lead", () => {
  const s = json('formationSlots("line", 4, 100)');
  assert.deepEqual(s.map(p => p.ay), [100, -100, 200, -200]);
  assert.ok(s.every(p => p.ax <= 0 && p.ax > -50));
});

test("formation: wedge widens astern, both flanks even", () => {
  const s = json('formationSlots("wedge", 4, 100)');
  assert.deepEqual(s.map(p => Math.sign(p.ay)), [1, -1, 1, -1]);
  assert.ok(s[2].ax < s[0].ax && Math.abs(s[2].ay) > Math.abs(s[0].ay));
  assert.equal(s[0].ay, -s[1].ay); assert.equal(s[0].ax, s[1].ax);
});

test("formation: slotWorld turns with the lead's heading", () => {
  const p = json("slotWorld({ x: 1000, y: 1000, rot: 0 }, { ax: -100, ay: 50 })");
  near(p.x, 900); near(p.y, 1050);
  const q = json("slotWorld({ x: 1000, y: 1000, rot: Math.PI / 2 }, { ax: -100, ay: 50 })");   // bound south: astern is north, starboard is west
  near(q.x, 950); near(q.y, 900);
});

test("fleet plan: 1-4 wingmen, never past the sea's size cap or the room", () => {
  for (const ring of [1, 3, 6, 10]) for (const type of ["wolfpack", "patrol", "convoy"]) for (let i = 0; i < 60; i++) {
    const n = json(`fleetPlan("${type}", { L: ${ring}, ring: ${ring}, arch: "brig" }, 9)`).length;
    assert.ok(n === 0 || (n >= 1 && n + 1 <= run(`fleetMaxSize(${ring})`)), `${type} ring ${ring}: ${n}`);
  }
  assert.equal(json('fleetPlan("wolfpack", { L: 6, ring: 6, arch: "brig" }, 0)').length, 0);   // no room, no fleet
  assert.equal(json('fleetPlan("convoy", { L: 6, ring: 6, arch: "fluyt" }, 1)').length, 0);    // a convoy needs three ships
});

test("fleet plan: each type brings its own class mix", () => {
  const all = (type, lead) => new Set(Array.from({ length: 80 }, () => json(`fleetPlan("${type}", ${lead}, 4)`)).flat());
  assert.deepEqual([...all("wolfpack", '{ L: 2, ring: 2, arch: "cutter" }')], ["cutter"]);
  assert.ok(all("wolfpack", '{ L: 7, ring: 7, arch: "brig" }').has("fireship"));
  const conv = json('fleetPlan("convoy", { L: 3, ring: 3, arch: "fluyt" }, 4)');
  assert.equal(conv[conv.length - 1], "brig"); assert.ok(conv.slice(0, -1).every(c => c === "fluyt"));
  assert.ok(all("patrol", '{ L: 8, ring: 8, arch: "manowar" }').has("frigate"));
  assert.deepEqual([...all("patrol", '{ L: 1, ring: 1, arch: "cutter" }')], ["cutter"]);
});

test("fleet plan: the same seed makes the same fleets (daily runs)", () => {
  const plans = seed => json(`(setGenRng(mulberry32(${seed})), Array.from({ length: 30 }, (_, i) => fleetPlan(["wolfpack", "patrol", "convoy"][i % 3], { L: 1 + i % 10, ring: 1 + i % 10, arch: "brig" }, 4)))`);
  assert.deepEqual(plans(20261024), plans(20261024));
  assert.notDeepEqual(plans(20261024), plans(20261025));
  run("setGenRng(null)");
});

test("firepower: a wingman's effective fire is 80% of the lead's", () => {
  run(`var lead = outfitEnemy({ L: 5, x: 0, y: 0, ignore: new Map() }, "brig"); var wing = outfitEnemy({ L: 5, x: 0, y: 0, ignore: new Map() }, "brig"); fleetFirepower(wing);`);
  // damage per second x hit share (1 / aim spread), summed over every gun
  const eff = e => run(`Object.values(${e}.guns).flat().reduce((a, g) => a + g.dmg / g.interval, 0) / ${e}.aimSpread`);
  near(eff("wing") / eff("lead"), 0.8, 1e-9);
  assert.ok(run("wing.guns.left[0].interval > lead.guns.left[0].interval") && run("wing.aimSpread > lead.aimSpread"));   // both knobs moved
  assert.equal(run("wing.fireMul"), 0.8);
  assert.equal(run("lead.fireMul"), undefined);
});

test("firepower: stacking on the same ship multiplies, and a custom share works", () => {
  run(`var w2 = outfitEnemy({ L: 3, x: 0, y: 0, ignore: new Map() }, "frigate"); var b2 = outfitEnemy({ L: 3, x: 0, y: 0, ignore: new Map() }, "frigate"); fleetFirepower(w2, 0.5);`);
  const eff = e => run(`Object.values(${e}.guns).flat().reduce((a, g) => a + g.dmg / g.interval, 0) / ${e}.aimSpread`);
  near(eff("w2") / eff("b2"), 0.5, 1e-9);
});

test("caps: a fleet never fills the sea, and the share the config grants is bounded", () => {
  assert.ok(run("FLEETS_AT_SEA") * 5 >= run("FLEET_SHIPS") - 6);
  assert.ok(run("FLEET_SHIPS") < run("ENEMY_COUNT"));   // loners always remain
  assert.ok(run("fleetMaxSize(10)") <= 5 && run("fleetMaxSize(1)") >= 2);
  for (const sea of ["shallows", "reef", "lanes", "maelstrom"]) assert.ok(run(`FLEET_CHANCE.${sea}`) > 0 && run(`FLEET_CHANCE.${sea}`) < 0.5);
});

test("types: each faction leads its own kind of fleet, with a known temper", () => {
  assert.equal(run('fleetTypeFor("pirate")'), "wolfpack"); assert.equal(run('fleetTypeFor("navy")'), "patrol");
  assert.equal(run('fleetTypeFor("merchant")'), "convoy"); assert.equal(run('fleetTypeFor("pirate2")'), null);
  for (const k of ["wolfpack", "patrol", "convoy"]) assert.ok(["charge", "scatter", "mixed"].includes(run(`FLEET_TYPES.${k}.leadLoss`)));
});

test("strings: every fleet string exists in both languages", () => {
  for (const k of ["fleet_wolfpack", "fleet_patrol", "fleet_convoy", "fleetCharge", "fleetScatter"]) {
    assert.ok(run(`STR.en.${k}`) && run(`STR.zh.${k}`), k);
    assert.ok(/[一-鿿]/.test(run(`STR.zh.${k}`)));
  }
});
