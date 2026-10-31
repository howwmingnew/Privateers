// Unit tests for the rematch logic (js/rematch.js): who sails again, what a rematch pays, that old saves need no migration,
// and the hall's fastest-sinking record. Pure functions only; scripts load into one node:vm context, as in tests/unit-phase2.mjs.
// Usage: node --test tests/unit-rematch.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/postcard.js", "js/logbook.js", "js/hall.js", "js/archetypes.js", "js/world-seas.js", "js/campaign.js", "js/rematch.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
const ctx = vm.createContext({
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
  console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
});
vm.runInContext("function runActive() { return false; } function runBounty() { return null; } function runKind() { return null; } function runLink() { return ''; }", ctx);
for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
const json = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
const run = code => vm.runInContext(code, ctx);
const ids = code => json(code).map(b => b.id);

test("rematch: nobody beaten, nobody sails again", () => {
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 0, REMATCH_MAX)"), []);
});

test("rematch: only beaten captains, farthest lair first, capped at REMATCH_MAX", () => {
  assert.equal(run("REMATCH_MAX"), 2);
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 1, REMATCH_MAX)"), ["ned"]);
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 2, REMATCH_MAX)"), ["smuggler", "ned"]);   // #140: the smuggler's lair (mid-ring 4) is past Ned's
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 3, REMATCH_MAX)"), ["carey", "smuggler"]);
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 5, REMATCH_MAX)"), ["hale", "saint"]);
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 6, REMATCH_MAX)"), ["thorne", "hale"]);   // the whole war won: the two farthest
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 6, 1)"), ["thorne"]);
  assert.equal(json("rematchPicks(BOUNTIES, 6, 99)").length, 6);
  assert.deepEqual(ids("rematchPicks(BOUNTIES, 3, 0)"), []);
});

test("rematch: picking never reorders or shrinks the campaign list", () => {
  run("rematchPicks(BOUNTIES, 6, 6)");
  assert.deepEqual(ids("BOUNTIES"), ["ned", "smuggler", "carey", "saint", "hale", "thorne"]);
});

test("rematch: pays REMATCH_PCT of the bounty, scaled by loot, never the full chest", () => {
  assert.equal(run("REMATCH_PCT"), 0.25);
  assert.equal(run("rematchReward(BOUNTIES[0])"), 100);
  assert.equal(run("rematchReward(BOUNTIES[1])"), 500);   // the smuggler's 2000
  assert.equal(run("rematchReward(BOUNTIES[5])"), 5000);
  assert.equal(run("rematchReward(BOUNTIES[0], 1.5)"), 150);
  for (let i = 0; i < 6; i++) assert.ok(run(`rematchReward(BOUNTIES[${i}]) < BOUNTIES[${i}].reward`));
});

test("rematch: an old save's beaten captains come from the (migrated) bounty count alone", () => {
  // a v1 save past Mother Carey (count 2 of 5) moves to 3 of 6 (#140, sanitizeCampaignSave): Ned, the smuggler it skipped, Carey
  const s = json(`sanitizeSave(JSON.parse('{"v":2,"gold":900,"sunk":40,"campaign":{"bounty":2}}'))`);
  assert.equal(s.campaign.bounty, 3);
  assert.deepEqual(Object.keys(s.campaign).sort(), ["bounty", "deaths", "order", "outpost", "rank", "ships", "won"]);   // order: the bounty-list version
  assert.deepEqual(ids(`rematchPicks(BOUNTIES, ${s.campaign.bounty}, REMATCH_MAX)`), ["carey", "smuggler"]);
});

test("rematch: a sinking never moves the campaign (claimBounty is not on its path)", () => {
  const src = readFileSync(new URL("../js/rematch.js", import.meta.url), "utf8").split(/\r?\n/).filter(l => !l.trimStart().startsWith("//")).join(" ");
  assert.ok(!/claimBounty|save\.campaign\s*=|bounties:/.test(src), "rematch.js must not touch campaign progress or the bounty count");
});

test("rematch: the hall keeps the fastest sinking per captain, and a slower rematch is not a record", () => {
  const first = json(`hallApply(freshHall(), { type: "boss", id: "ned", sec: 80 })`);
  assert.deepEqual(first.hall.boss, { ned: 80 }); assert.equal(first.broke, true);
  const slower = json(`hallApply(${JSON.stringify(first.hall)}, { type: "boss", id: "ned", sec: 95 })`);
  assert.deepEqual(slower.hall.boss, { ned: 80 }); assert.equal(slower.broke, false);
  const faster = json(`hallApply(${JSON.stringify(first.hall)}, { type: "boss", id: "ned", sec: 61.24 })`);
  assert.deepEqual(faster.hall.boss, { ned: 61.2 }); assert.equal(faster.broke, true);
});

test("rematch: strings exist in both languages", () => {
  for (const k of ["rematchTag", "rematchPay"]) {
    assert.ok(run(`STR.en.${k}`) && run(`STR.zh.${k}`), k);
  }
  assert.match(run(`t("rematchTag", { name: "X" })`), /X/);
});
