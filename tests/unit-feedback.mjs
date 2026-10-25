// Unit tests for the phase-1 feedback fixes (#68 gun bay moves + x5 upgrade, #69 grapple pull, #71 bosses left alone, #72 owned ships,
// #73 sticky ledger gold). Pure functions only; scripts load into one node:vm context, as in tests/unit-rematch.mjs.
// Usage: node --test tests/unit-feedback.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/archetypes.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);

// ---------- #71: bosses and their guards are left to the player ----------
test("#71 bossFeud: other AI never target a boss or guard, and they pick no other AI", () => {
  const boss = "{ boss: 'ned' }", guard = "{ escortOf: 'ned' }", other = "{ faction: 'navy' }", rematch = "{ boss: 'ned', rematch: true }";
  for (const b of [boss, guard, rematch]) {
    assert.equal(run(`bossFeud(${other}, ${b})`), true, "an AI aiming at a boss-side ship is refused");
    assert.equal(run(`bossFeud(${b}, ${other})`), true, "a boss-side ship aiming at an AI is refused");
  }
});

test("#71 bossFeud: the player, the player's escorts and the boss's own side stay fair", () => {
  assert.equal(run("bossFeud({ boss: 'ned' }, { isPlayer: true })"), false);
  assert.equal(run("bossFeud({ isPlayer: true }, { boss: 'ned' })"), false);
  assert.equal(run("bossFeud({ boss: 'ned' }, { ally: true })"), false, "a boss may fight the player's escorts");
  assert.equal(run("bossFeud({ ally: true }, { escortOf: 'ned' })"), false, "and the escorts may fight the boss's guard");
  assert.equal(run("bossFeud({ boss: 'ned' }, { escortOf: 'ned' })"), false, "a boss and its guard are one side");
  assert.equal(run("bossFeud({ faction: 'navy' }, { faction: 'pirate' })"), false, "ordinary AI feuds are untouched");
  assert.equal(run("bossFeud(null, { boss: 'ned' })"), false);
});
