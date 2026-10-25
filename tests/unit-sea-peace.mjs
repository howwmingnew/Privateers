// Unit tests for #102: peace for a newcomer's first bounty, the second warning before the deepest sea, hull alerts and plate spread.
// Pure functions only, loaded into node:vm contexts. Usage: node --test tests/unit-sea-peace.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new Proxy(function () {}, { get: (_, k) => (k === "length" ? 0 : dom), apply: () => dom, construct: () => dom, set: () => true });
function boot(files) {
  const store = new Map();
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Number, JSON, document: dom, window: dom,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    onHook() {}, STR: { en: {}, zh: {} }, shipRating: () => 1,
  });
  for (const f of files) vm.runInContext(src(f), ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test("bounty peace: only before the first bounty is claimed, and only near Red Ned's lair", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("bountyPeace(0, PEACE_R - 1)"), true);
  assert.equal(g.run("bountyPeace(0, PEACE_R + 1)"), false, "far from the lair the sea is as usual");
  assert.equal(g.run("bountyPeace(1, 100)"), false, "the later bounties keep their crowds");
});

test("sea ahead: warns once within the edge distance, for a dangerous sea only", () => {
  const g = boot(["js/novice.js"]);
  assert.equal(g.run("seaAheadDue(SEA_AHEAD_R - 1, true, false)"), true);
  assert.equal(g.run("seaAheadDue(SEA_AHEAD_R + 1, true, false)"), false, "still far");
  assert.equal(g.run("seaAheadDue(-5, true, false)"), false, "already across: the red banner has it");
  assert.equal(g.run("seaAheadDue(100, false, false)"), false, "a captain who can take the sea is not warned");
  assert.equal(g.run("seaAheadDue(100, true, true)"), false, "once per approach");
});

test("#105: until the first bounty the Navy spares the captain anywhere; pirates and boss ships are not spared", () => {
  const g = boot(["js/novice.js"]);
  g.run("spare = { bounty: false, shallows: false, navy: true, cap: 2 }");
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 8 })"), true, "a Lv 8 Navy ship leaves a newcomer alone, in any sea");
  assert.equal(g.run("noviceSpare({ faction: 'pirate', L: 8 })"), false, "pirates still attack");
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 8, boss: 'hale' })"), false);
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 8, fixed: true })"), false, "a shore battery is not a patrol");
  g.run("spare = { bounty: false, shallows: false, navy: false, cap: 2 }");
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 8 })"), false, "after the first bounty the Navy hunts as usual");
});

test("noviceSpare: bosses and escorts are never spared; ordinary ships follow the zone", () => {
  const g = boot(["js/novice.js"]);
  g.run("spare = { bounty: true, shallows: false, cap: 2 }");
  assert.equal(g.run("noviceSpare({ faction: 'pirate', L: 3 })"), true);
  assert.equal(g.run("noviceSpare({ faction: 'pirate', boss: 'ned' })"), false);
  assert.equal(g.run("noviceSpare({ faction: 'pirate', escortOf: 'ned' })"), false);
  assert.equal(g.run("noviceSpare({ faction: 'navy', ally: true })"), false);
  g.run("spare = { bounty: false, shallows: true, cap: 2 }");
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 7 })"), true, "a Lv 7 Navy ship does not hunt a novice in the Shallows");
  assert.equal(g.run("noviceSpare({ faction: 'navy', L: 2 })"), false, "one within the cap still can");
  assert.equal(g.run("noviceSpare({ faction: 'pirate', L: 7 })"), false);
});

test("hull alert: fires once under a quarter, re-arms over 45%", () => {
  const g = boot(["js/hull-alert.js"]);
  assert.deepEqual(g.json("hullAlertStep(true, 0.5)"), { armed: true, fire: false });
  assert.deepEqual(g.json("hullAlertStep(true, 0.2)"), { armed: false, fire: true });
  assert.deepEqual(g.json("hullAlertStep(false, 0.1)"), { armed: false, fire: false }, "no repeat while it stays low");
  assert.deepEqual(g.json("hullAlertStep(false, 0.3)"), { armed: false, fire: false }, "mended a little: not yet re-armed");
  assert.deepEqual(g.json("hullAlertStep(false, 0.6)"), { armed: true, fire: false });
});

test("tipOnce: true the first time, false after", () => {
  const g = boot(["js/hull-alert.js"]);
  assert.equal(g.run("tipOnce('heat')"), true);
  assert.equal(g.run("tipOnce('heat')"), false);
  assert.equal(g.run("tipOnce('mend')"), true, "another note is its own");
});

test("plate spread: overlapping plates are lifted clear, separate ones stay", () => {
  const g = boot(["js/plate-spread.js"]);
  const ys = g.json("spreadPlates([{ x: 100, y: 100, w: 60, h: 18 }, { x: 110, y: 104, w: 60, h: 18 }])");
  assert.equal(ys[1], 104, "the lower plate stays where it was");
  assert.ok(104 - ys[0] >= 18, `the upper plate clears it (${ys[0]})`);
  assert.deepEqual(g.json("spreadPlates([{ x: 0, y: 0, w: 60, h: 18 }, { x: 300, y: 2, w: 60, h: 18 }])"), [0, 2], "far apart: untouched");
  const three = g.json("spreadPlates([{ x: 0, y: 100, w: 60, h: 18 }, { x: 5, y: 102, w: 60, h: 18 }, { x: -5, y: 101, w: 60, h: 18 }])");
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(three[i] - three[j]) >= 18, `plates ${i}/${j} clear: ${three}`);
});
