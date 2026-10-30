// Unit tests for shot-away masts (js/masts.js, #43): the break odds, which mast goes, speed and turn by masts left, how chain shot's slow merges with
// the mast loss (the worse of the two, never both), the boss floor, the refit, and when a crippled AI ship stands and fires. Pure functions only;
// scripts load into one node:vm context.
// Usage: node --test tests/unit-masts.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/masts.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the odds: any ball a few percent, chain shot far more, both from config", () => {
  near(run("mastChance(false)"), run("MAST.chance")); near(run("mastChance(true)"), run("MAST.chain"));
  assert.ok(run("MAST.chain") >= 5 * run("MAST.chance"), "chain shot is much likelier to cut a mast");
  assert.ok(run("MAST.chance") > 0 && run("MAST.chance") <= 0.05);
});

test("mastRoll: breaks only when the die is under the odds, never past the last mast, never on a hull with none", () => {
  assert.equal(run("mastRoll(0, 3, 0.03, 0.02, 0)"), 1);       // the first standing mast
  assert.equal(run("mastRoll(0, 3, 0.03, 0.03, 0)"), 0);       // the die must be strictly under
  assert.equal(run("mastRoll(0, 3, 0.03, 0.5, 0)"), 0);
  assert.equal(run("mastRoll(0, 0, 1, 0, 0)"), 0);             // a fort has no masts
  assert.equal(run("mastRoll(7, 3, 1, 0, 0)"), 7);             // all three already gone
});

test("mastRoll: the second die picks among the masts still standing", () => {
  assert.equal(run("mastRoll(0, 3, 1, 0, 0)"), 1);
  assert.equal(run("mastRoll(0, 3, 1, 0, 0.5)"), 2);
  assert.equal(run("mastRoll(0, 3, 1, 0, 0.99)"), 4);
  assert.equal(run("mastRoll(1, 3, 1, 0, 0)"), 3);             // mast 0 is gone: the first standing one is mast 1
  assert.equal(run("mastRoll(1, 3, 1, 0, 0.99)"), 5);          // ...the last one is mast 2
  assert.equal(run("mastRoll(5, 3, 1, 0, 0.9)"), 7);           // one left: it goes whatever the pick
  assert.equal(run("mastRoll(0, 3, 1, 0, 1)"), 4);             // a pick of exactly 1 stays in range
});

test("a long run of rolls takes the masts off one by one and stops at none (statistical)", () => {
  const got = run(`(() => { let lost = 0, hits = 0, seq = []; let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    while (lost !== 7 && hits < 100000) { hits++; const n = mastRoll(lost, 3, mastChance(true), r(), r()); if (n !== lost) seq.push(mastLeft(n, 3)); lost = n; } return { hits, seq }; })()`);
  assert.deepEqual([...got.seq], [2, 1, 0]);
  assert.ok(got.hits > 2 && got.hits < 100000);
});

test("speed by masts left: 3 of 3 full, 2 of 3 about 70 percent, none a slow drift", () => {
  near(run("mastSpeedK(0, 3, false)"), 1);
  near(run("mastSpeedK(1, 3, false)"), 0.15 + 0.85 * 2 / 3);
  assert.ok(Math.abs(run("mastSpeedK(1, 3, false)") - 0.7) < 0.03);
  near(run("mastSpeedK(3, 3, false)"), 0.15 + 0.85 / 3);        // one of three left
  near(run("mastSpeedK(7, 3, false)"), run("MAST.floor"));
  near(run("mastSpeedK(1, 1, false)"), run("MAST.floor"));      // a one-masted hull loses it all at once
  assert.equal(run("mastSpeedK(5, 0, false)"), 1);               // no masts to lose
});

test("each mast lost slows the ship further, and the turn falls only a little", () => {
  const s = [0, 1, 3, 7].map(m => run(`mastSpeedK(${m}, 3, false)`)), t = [0, 1, 3, 7].map(m => run(`mastTurnK(${m}, 3)`));
  for (let i = 1; i < s.length; i++) { assert.ok(s[i] < s[i - 1]); assert.ok(t[i] < t[i - 1]); }
  near(t[0], 1); near(t[3], 1 - run("MAST.turnLoss"));
  assert.ok(t[3] >= 0.6, "a dismasted hull still turns");
});

test("a boss is never shot down to a drift: its speed holds at the boss floor", () => {
  near(run("mastSpeedK(7, 3, true)"), run("MAST.bossFloor"));
  near(run("mastSpeedK(0, 3, true)"), 1);
  assert.ok(run("mastSpeedK(7, 3, true)") > run("mastSpeedK(7, 3, false)"));
});

test("chain shot and lost masts are not added: the ship takes the worse of the two", () => {
  // a hull with 2 of 3 masts (0.717) hit by chain (0.6): the chain's slow, not 0.6 x 0.717
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 1, chainT: 3 })"), 0.6);
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 1, chainT: 0 })"), 0.15 + 0.85 * 2 / 3);   // chain over: only the masts
  // a hull with one mast left (0.433) is held to that while the chain's slow would be milder
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 3, chainT: 2 })"), 0.15 + 0.85 / 3);
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 0, chainT: 2 })"), 0.6);   // no masts lost: exactly the old chain shot
  near(run("rigTurn({ art: { masts: [1, 2, 3] }, mastLost: 0, chainT: 2 })"), 0.7);
  near(run("rigTurn({ art: { masts: [1, 2, 3] }, mastLost: 1, chainT: 2 })"), Math.min(0.7, 1 - 0.3 / 3));
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 0, chainT: 0 })"), 1);
});

test("rig of a ship with no art (a fort) or a boss", () => {
  near(run("rigSpeed({ chainT: 0 })"), 1); near(run("rigTurn({ chainT: 0 })"), 1);
  near(run("rigSpeed({ art: { masts: [1, 2, 3] }, mastLost: 7, boss: 'ned' })"), run("MAST.bossFloor"));
  near(run("rigSpeed({ art: { masts: [1] }, mastLost: 0xff })"), run("MAST.floor"));   // stray high bits are ignored: one mast, gone
  near(run("rigSpeed({ art: { masts: [1, 2] }, mastLost: 0xfc })"), 1);                 // ...and none of them are this hull's masts
});

test("which mast broke, and the refit: the lowest broken mast goes back up first", () => {
  assert.equal(run("mastGone(0, 4, 3)"), 2); assert.equal(run("mastGone(1, 5, 3)"), 2); assert.equal(run("mastGone(5, 5, 3)"), -1);
  assert.equal(run("mastMended(7, 3)"), 6); assert.equal(run("mastMended(6, 3)"), 4); assert.equal(run("mastMended(4, 3)"), 0); assert.equal(run("mastMended(0, 3)"), 0);
  assert.equal(run("mastLeft(mastFull(3), 3)"), 0); assert.equal(run("mastFull(3)"), 7);
});

test("a crippled AI ship stands and fires its broadside; a boss, a merchant, a fireship and a healthy ship do not", () => {
  const ship = x => `({ art: { masts: [1, 2, 3] }, mastLost: 7, rot: 0, guns: { left: [1], right: [1] }, ...${x} })`;
  const tac = x => run(`mastTactic(${ship(x)}, {}, 0.3)`);
  const t = tac("{}");
  assert.ok(t && t.thr < 0.5);
  assert.ok(Math.abs(Math.abs(t.desired - 0.3) - Math.PI / 2) < 1e-9, "heading 90 degrees off the line to the target");
  assert.equal(tac("{ boss: 'ned' }"), null); assert.equal(tac("{ merchant: true }"), null); assert.equal(tac("{ struck: true }"), null);
  assert.equal(tac("{ guns: { left: [], right: [] } }"), null);
  assert.equal(tac("{ mastLost: 0 }"), null); assert.equal(tac("{ mastLost: 1 }"), null);
  assert.equal(run(`mastTactic(${ship("{}")}, null, 0)`), null);
});

test("it turns to the side that is nearer its present heading", () => {
  const side = rot => { const t = run(`mastTactic({ art: { masts: [1, 2, 3] }, mastLost: 7, rot: ${rot}, guns: { left: [1] } }, {}, 0)`); return Math.sign(t.desired); };
  assert.equal(side(0.5), 1); assert.equal(side(-0.5), -1);
});

test("strings: both languages carry every mast text", () => {
  for (const k of ["fMastDown", "fMastFix", "mastLbl", "mastAria", "toastMast"]) { assert.ok(run(`STR.en.${k}`), "en " + k); assert.ok(run(`STR.zh.${k}`), "zh " + k); }
});
