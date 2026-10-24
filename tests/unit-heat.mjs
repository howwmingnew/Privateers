// Unit tests for Navy heat and the Admiral's fleet (js/heat.js): the pure rules (stars, cooling, bounty multiplier, hunter and
// Admiral tables), the config's sanity bounds, the admiral fleet type, and the strings. Scripts load into one node:vm context.
// Usage: node --test tests/unit-heat.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/archetypes.js", "js/fleet.js", "js/heat.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const plan = (type, lead, room) => JSON.parse(run(`JSON.stringify(fleetPlan("${type}", ${lead}, ${room}))`));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("stars: one per 20 heat, capped at five, never negative", () => {
  assert.deepEqual([0, 19.9, 20, 39, 40, 60, 80, 99.9, 100, 140, -5].map(h => run(`heatStars(${h})`)), [0, 0, 1, 1, 2, 3, 4, 4, 5, 5, 0]);
});

test("bounty: +20% a star, exactly double at five", () => {
  assert.equal(run("heatBountyMul(0)"), 1);
  near(run("heatBountyMul(1)"), 1.2); near(run("heatBountyMul(3)"), 1.6);
  near(run("heatBountyMul(5)"), 2); near(run("heatBountyMul(9)"), 2);
});

test("heat: gains stop at the cap; one navy sinking is not a star by itself", () => {
  assert.equal(run("heatMax()"), 100);
  assert.equal(run("heatGain(95, 14)"), 100);
  assert.equal(run("heatStars(heatGain(0, HEAT_PER_SINK))"), 0);   // one stray navy ship: a new captain sees nothing
  assert.equal(run("heatStars(heatGain(heatGain(0, HEAT_PER_SINK), HEAT_PER_SINK))"), 1);
});

test("heat: hunters and the flagship are worth their own amounts", () => {
  assert.equal(run("heatForSink({})"), run("HEAT_PER_SINK"));
  assert.equal(run("heatForSink({ hunter: true })"), run("HEAT_HUNTER_SINK"));
  assert.equal(run("heatForSink({ admiral: true })"), run("HEAT_FLAGSHIP_SINK"));
  assert.ok(run("HEAT_HUNTER_SINK < HEAT_PER_SINK"));   // killing hunters must not feed the chase
});

test("cooling: holds for the calm period, then drains at a steady rate to zero", () => {
  assert.equal(run("heatCool(60, 0, 1)"), 60);
  assert.equal(run("heatCool(60, HEAT_CALM_S - 0.1, 1)"), 60);
  near(run("heatCool(60, HEAT_CALM_S, 1)"), 60 - run("HEAT_COOL"));
  assert.equal(run("heatCool(0.5, 99, 5)"), 0);
  // a maxed captain who stops fighting is cold again in under two minutes: the escape is always there
  const total = run("HEAT_CALM_S + heatMax() / HEAT_COOL");
  assert.ok(total < 120, `${total}`);
});

test("hunters: none below two stars; more, faster and stronger as the stars climb", () => {
  assert.equal(run("HEAT_HUNT_FROM"), 2);
  for (const k of [0, 1]) assert.equal(run(`HEAT_HUNT_MAX[${k}]`), 0);
  for (let k = 3; k <= 5; k++) {
    assert.ok(run(`HEAT_HUNT_EVERY[${k}] < HEAT_HUNT_EVERY[${k - 1}]`), `every ${k}`);
    assert.ok(run(`HEAT_HUNT_MAX[${k}] >= HEAT_HUNT_MAX[${k - 1}]`) && run(`HEAT_HUNT_LV[${k}] >= HEAT_HUNT_LV[${k - 1}]`));
  }
  assert.ok(run("HEAT_HUNT_MAX[5] >= 2") && run("HEAT_HUNT_LV[2] === 0"));   // the first hunters are no stronger than the local sea
  for (const a of ["HEAT_HUNT_MAX", "HEAT_HUNT_EVERY", "HEAT_HUNT_LV"]) assert.equal(run(`${a}.length`), 6);
  assert.equal(run("FLEET_TYPES.patrol.faction"), "navy");
});

test("hunters: a patrol of at most stars-1 wingmen, within the sea's size cap", () => {
  for (const stars of [2, 3, 4, 5]) for (const ring of [1, 4, 9]) for (let i = 0; i < 30; i++) {
    const n = plan("patrol", `{ L: ${ring}, ring: ${ring}, arch: "brig" }`, stars - 1).length;
    assert.ok(n >= 1 && n <= stars - 1 && n + 1 <= run(`fleetMaxSize(${ring})`), `stars ${stars} ring ${ring}: ${n}`);
  }
});

test("admiral: his fleet type is navy, in a wedge, three ships or more, and never picked as a normal navy fleet", () => {
  assert.equal(run("FLEET_TYPES.admiral.faction"), "navy");
  assert.equal(run("FLEET_TYPES.admiral.formation"), "wedge");
  assert.equal(run('fleetTypeFor("navy")'), "patrol");   // ordinary navy leaders still lead patrols
  for (const ring of [3, 6, 10]) for (let i = 0; i < 30; i++) {
    const n = plan("admiral", `{ L: ${ring}, ring: ${ring}, arch: "manowar" }`, 4).length;
    assert.ok(n >= 2 && n + 1 <= run(`fleetMaxSize(${ring})`), `ring ${ring}: ${n}`);
  }
  const mix = new Set(Array.from({ length: 60 }, () => plan("admiral", '{ L: 8, ring: 8, arch: "manowar" }', 4)).flat());
  assert.ok(mix.has("frigate"));
});

test("admiral: late-campaign gate, spacing, and what heat does to it", () => {
  assert.equal(run("ADMIRAL_AFTER"), 4);
  assert.ok(run("ADMIRAL_AFTER < 5"));   // before the last captain, not after
  near(run("admiralWait(0, 0)"), run("ADMIRAL_EVERY[0]")); near(run("admiralWait(0, 1)"), run("ADMIRAL_EVERY[1]"));
  assert.ok(run("admiralWait(5, 0.5) < admiralWait(0, 0.5)"));
  assert.ok(run("admiralWait(5, 0)") > 100);   // he is an event, not a stream
  assert.ok(run("ADMIRAL_GONE > ADMIRAL_R[1] * 2"));   // he is only dropped when far out of play
  assert.ok(run("ADMIRAL_HP > 1 && ADMIRAL_LOOT > 1 && ADMIRAL_LV >= 1"));
});

test("config: nothing is a silent infinite or zero", () => {
  assert.ok(run("HEAT_STARS * HEAT_STAR_SIZE === 100"));
  near(run("HEAT_BOUNTY_STEP * HEAT_STARS"), 1);   // 'doubles' at the top
  assert.ok(run("HEAT_COOL > 0 && HEAT_CALM_S > 0 && HEAT_HUNT_FIRST > 0"));
  assert.ok(run("HEAT_HUNT_R[0] > 600 && HEAT_HUNT_R[1] > HEAT_HUNT_R[0]"));   // out of sight at the horizon
});

test("strings: every heat string exists in both languages, with the same placeholders", () => {
  for (const k of ["heat_lbl", "heat_aria", "heatUp", "heatUpHunt", "heatCooled", "heatHunt", "admiralSighted", "fleet_admiral"]) {
    const en = run(`STR.en.${k}`), zh = run(`STR.zh.${k}`);
    assert.ok(en && zh, k); assert.ok(/[一-鿿]/.test(zh), k);
    assert.deepEqual(en.match(/\{\w+\}/g) || [], zh.match(/\{\w+\}/g) || [], k);
  }
});
