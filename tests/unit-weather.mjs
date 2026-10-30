// Unit tests for wind and weather (js/config.js, js/util.js, js/weather-core.js): the speed factor for running before or beating
// into the wind, the storm's yaw / leeway / ball drift, the weather chain and its fades, and that one seed gives one sky.
// Usage: node --test tests/unit-weather.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = ["js/config.js", "js/util.js", "js/weather-core.js"].map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const ctx = vm.createContext({ Math, Date, Float32Array });
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("running before a full wind gains WIND.tail, beating into it loses WIND.head, across it changes nothing", () => {
  const tail = run("windFactor(0, { dir: 0, strength: 1 })"), head = run("windFactor(Math.PI, { dir: 0, strength: 1 })"), beam = run("windFactor(Math.PI / 2, { dir: 0, strength: 1 })");
  near(tail, 2.5); near(head, 0.7); near(beam, 1);
  assert.ok(tail > beam && beam > head);
});

test("geared sails never push the wind past x3 or below x0.7", () => {
  near(run("windFactor(0, { dir: 0, strength: 1 }, 1.35)"), 3);
  near(run("windFactor(0, { dir: 0, strength: 1 }, 5)"), 3);
  near(run("windFactor(Math.PI, { dir: 0, strength: 1 }, 1, 2)"), 0.7);
});

test("the best sail gear (item level 5, Lv 10, top tail roll) just reaches the x3 cap, a bare ship sits at x2.5; head gear lifts the x0.7", () => {
  const best = run("1 + Math.min(GEAR_CAP.tail, GEAR_AFFIX.sail.tail[1] * GEAR_ILV_K[GEAR_ILV_K.length - 1] * (1 + GEAR_LV_STEP * (GEAR_LV_MAX - 1)))");   // one sail slot, one tail affix: no stacking
  const raw = run(`1 + WIND.tail * ${best} - 1`) + 1;
  assert.ok(raw >= 3 && raw < 3.05, `best gear lands at the cap, not far past it (${raw})`);
  near(run(`windFactor(0, { dir: 0, strength: 1 }, ${best})`), 3);
  near(run("windFactor(0, { dir: 0, strength: 1 })"), 2.5);
  assert.ok(run("windFactor(Math.PI, { dir: 0, strength: 1 }, 1, 0.5)") > 0.7);
});

test("a calm gives less of the effect, and anything at or above WIND.full gives all of it", () => {
  const half = run("windFactor(0, { dir: 0, strength: WIND.full / 2 })");
  near(half, 1.75);
  near(run("windFactor(0, { dir: 0, strength: 1 })"), run("windFactor(0, { dir: 0, strength: WIND.full })"));
  near(run("windFactor(0, { dir: 0, strength: 0 })"), 1);
});

test("an angle in between is in between (45 degrees off the wind)", () => {
  const f = run("windFactor(Math.PI / 4, { dir: 0, strength: 1 })");
  assert.ok(f > 1 && f < 2.5);
  near(f, 1 + 1.5 * Math.cos(Math.PI / 4));
});

test("storm yaw: none in fair weather, slews a hull ahead of the wind off it, bounded, and stays well under a ship's turn rate", () => {
  assert.equal(run("stormYaw(0.3, { dir: 0, strength: 1 }, 0, 1)"), 0);
  const w = "{ dir: 0, strength: 1 }";
  assert.ok(Math.abs(run(`stormYaw(0.4, ${w}, 1, 0)`)) > 0.05, "off the wind axis it turns");
  assert.ok(run(`stormYaw(0.4, ${w}, 1, 0)`) > 0 && run(`stormYaw(-0.4, ${w}, 1, 0)`) < 0, "away from the wind axis: beam-on");
  near(run(`stormYaw(Math.PI / 2, ${w}, 1, 0)`), 0, 1e-12);   // already beam-on: balanced
  const max = run("WEATHER.yaw * 0.85");
  for (let r = -3.2; r <= 3.2; r += 0.1) for (const s of [-1, 0, 1]) assert.ok(Math.abs(run(`stormYaw(${r}, ${w}, 1, ${s})`)) <= max + 1e-9);
  assert.ok(max < 2.2 / 4, "the player's turn rate (2.2-2.5 rad/s) is many times larger, so a held course stays steady");
});

test("leeway and ball drift: zero without a storm, downwind with one, scaled by wind strength", () => {
  assert.deepEqual({ ...run("stormLeeway({ dir: 1, strength: 1 }, 0)") }, { x: 0, y: 0 });
  const l = run("stormLeeway({ dir: 0, strength: 1 }, 1)");
  near(l.x, run("WEATHER.leeway")); near(l.y, 0, 1e-9);
  const d = run("ballDrift({ dir: Math.PI / 2, strength: 1 }, 1)");
  near(d.x, 0, 1e-9); near(d.y, run("WEATHER.ballDrift"));
  assert.ok(run("stormLeeway({ dir: 0, strength: 0.3 }, 1)").x < l.x);
  assert.ok(run("WEATHER.leeway") < 60 && run("WEATHER.ballDrift") < 80, "small next to a ship's 150+ px/s and a ball's 480 px/s");
});

test("the weather at a given seed and time is always the same (the daily sea)", () => {
  for (const seed of [1, 1234, 2147000000, 987654321]) for (const t of [0, 10, 75, 200, 999]) {
    assert.deepEqual({ ...run(`weatherAt(${seed}, ${t})`) }, { ...run(`weatherAt(${seed}, ${t})`) });
    assert.deepEqual({ ...run(`windAt(${seed}, ${t})`) }, { ...run(`windAt(${seed}, ${t})`) });
  }
  assert.equal(run("hourOf(42)"), run("hourOf(42)"));
});

test("different seeds give different skies; every kind and hour turns up", () => {
  const kinds = new Set(), hours = new Set(), winds = new Set();
  for (let s = 1; s <= 300; s++) { const w = run(`weatherAt(${s}, 5)`); kinds.add(w.kind); hours.add(w.hour); winds.add(run(`windAt(${s}, 5)`).dir.toFixed(3)); }
  assert.deepEqual([...kinds].sort(), ["clear", "rain", "storm"]);
  assert.deepEqual([...hours].sort(), ["day", "dusk", "night"]);
  assert.ok(winds.size > 250);
});

test("the opening weather and the hour follow the configured odds (roughly)", () => {
  const n = 3000, c = { clear: 0, rain: 0, storm: 0 }, h = { day: 0, dusk: 0, night: 0 };
  for (let s = 1; s <= n; s++) { c[run(`weatherAt(${s}, 0)`).kind]++; h[run(`hourOf(${s})`)]++; }
  for (const [k, p] of Object.entries(run("WEATHER.first"))) assert.ok(Math.abs(c[k] / n - p) < 0.05, `${k}: ${c[k] / n}`);
  for (const [k, p] of Object.entries(run("WEATHER.hour"))) assert.ok(Math.abs(h[k] / n - p) < 0.05, `${k}: ${h[k] / n}`);
});

test("weather changes over a long sortie, in spells of 75-150 s, and fades instead of jumping", () => {
  let changed = 0, seeds = 0;
  for (let s = 1; s <= 60; s++) {
    const kinds = new Set();
    for (let t = 0; t <= 1800; t += 5) kinds.add(run(`weatherAt(${s}, ${t})`).kind);
    seeds++; if (kinds.size > 1) changed++;
  }
  assert.ok(changed / seeds > 0.8, `${changed}/${seeds} seeds changed weather within 30 min`);
  let prev = run("weatherAt(7, 0)"), worst = 0;
  for (let t = 0.25; t <= 900; t += 0.25) {
    const w = run(`weatherAt(7, ${t})`);
    worst = Math.max(worst, Math.abs(w.rain - prev.rain), Math.abs(w.storm - prev.storm)); prev = w;
  }
  assert.ok(worst < 0.1, `largest step per 0.25 s: ${worst}`);
  const b = run("WEATHER.seg");
  assert.ok(run("wxSpell(5, 0).end") >= b[0] && run("wxSpell(5, 0).end") <= b[1]);
});

test("rain and storm levels stay in 0..1 and a storm always brings rain", () => {
  for (let s = 1; s <= 40; s++) for (let t = 0; t < 900; t += 7) {
    const w = run(`weatherAt(${s}, ${t})`);
    assert.ok(w.rain >= 0 && w.rain <= 1 && w.storm >= 0 && w.storm <= 1);
    assert.ok(w.storm <= w.rain + 1e-9);
  }
});

test("the wind wanders slowly, stays in range, and blows harder and more in a storm than in fair weather", () => {
  let maxTurn = 0, prev = run("windAt(11, 0)");
  for (let t = 0.5; t <= 600; t += 0.5) {
    const w = run(`windAt(11, ${t})`);
    assert.ok(w.strength >= run("WEATHER.windMin") && w.strength <= 1);
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(w.dir - prev.dir), Math.cos(w.dir - prev.dir))) / 0.5); prev = w;
  }
  assert.ok(maxTurn < 0.25, `turns at most ${maxTurn.toFixed(3)} rad/s`);
  let fair = 0, storm = 0;
  for (let s = 1; s <= 200; s++) {
    fair += run(`windAt(${s}, 9, { kind: "clear", rain: 0, storm: 0 })`).strength;
    storm += run(`windAt(${s}, 9, { kind: "storm", rain: 1, storm: 1 })`).strength;
  }
  assert.ok(storm / 200 > fair / 200 + 0.3, `fair ${fair / 200}, storm ${storm / 200}`);
  assert.ok(storm / 200 >= run("WIND.full"), "a storm blows at full effect");
});

test("the dial's knots span the configured range", () => {
  assert.equal(run("windKnots({ strength: 0 })"), 4);
  assert.equal(run("windKnots({ strength: 1 })"), 40);
});
