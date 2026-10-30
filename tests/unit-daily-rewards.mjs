// Unit tests for the daily-sea rewards (js/daily-rewards.js, #39): one reward per daily number, a lost run earns nothing, rewards are
// cosmetic and live apart from the campaign save and the daily record, the stores clean up hand-edited data, and every name is in both languages.
// Scripts load into one node:vm context, as in tests/unit-flags.mjs. Usage: node --test tests/unit-daily-rewards.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js",
  "js/flags.js", "js/daily.js", "js/daily-rewards.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
function boot(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
  });
  vm.runInContext("var LIVERY = { player: { hull: '#6e3d1f', flag: '#2f8ad6', flag2: '#fff7e2', pennant: '#3fa9ff', trim: '#2f8ad6' } };", ctx);
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)), store };
}
const g = boot();

test("claim: a win earns the first reward and the first-win badge", () => {
  const r = g.json("rewardClaim(freshRewards(), 57, true)");
  assert.equal(r.status, "new");
  assert.equal(r.item, "paint:ebony");
  assert.deepEqual(r.badges, ["first"]);
  assert.deepEqual(r.store.owned, ["paint:ebony"]);
  assert.equal(r.store.wins, 1);
});

test("once per day: the same daily number never pays twice", () => {
  const once = g.json("rewardClaim(freshRewards(), 57, true).store");
  const again = g.json(`rewardClaim(${JSON.stringify(once)}, 57, true)`);
  assert.equal(again.status, "done");
  assert.equal(again.item, null);
  assert.deepEqual(again.badges, []);
  assert.deepEqual(again.store, once, "the store is unchanged by a replay");
  const next = g.json(`rewardClaim(${JSON.stringify(once)}, 58, true)`);
  assert.equal(next.item, "emblem:crown", "the next day gives the next reward");
});

test("a lost run earns nothing and does not use up the day", () => {
  const lost = g.json("rewardClaim(freshRewards(), 57, false)");
  assert.equal(lost.status, "lost");
  assert.deepEqual(lost.store, g.json("freshRewards()"));
  const won = g.json(`rewardClaim(${JSON.stringify(lost.store)}, 57, true)`);
  assert.equal(won.status, "new", "winning the same day afterwards still pays");
});

test("claim never mutates its input", () => {
  const before = g.run("globalThis.s0 = sanitizeRewards({ days: { 5: 'paint:ebony' }, owned: ['paint:ebony'], wins: 1 }); JSON.stringify(s0)");
  g.run("rewardClaim(s0, 6, true)");
  assert.equal(g.run("JSON.stringify(s0)"), before);
});

test("rewards run out: all ten are handed out once, then only badges", () => {
  let s = g.json("freshRewards()");
  const items = [];
  for (let n = 1; n <= 12; n++) { const r = g.json(`rewardClaim(${JSON.stringify(s)}, ${n}, true)`); s = r.store; if (r.item) items.push(r.item); }
  assert.equal(items.length, 10);
  assert.equal(new Set(items).size, 10);
  assert.equal(s.owned.length, 10);
  assert.equal(s.wins, 12);
  const extra = g.json(`rewardClaim(${JSON.stringify(s)}, 13, true)`);
  assert.equal(extra.item, null);
  assert.equal(extra.store.days[13], "", "the day is still marked claimed");
});

test("badges: streaks need consecutive numbers, wins do not", () => {
  const run = days => { let s = g.json("freshRewards()"), last; for (const n of days) { last = g.json(`rewardClaim(${JSON.stringify(s)}, ${n}, true)`); s = last.store; } return { s, last }; };
  assert.ok(!run([1, 2]).s.badges.includes("streak3"));
  assert.ok(run([1, 2, 3]).s.badges.includes("streak3"));
  assert.ok(!run([1, 2, 4]).s.badges.includes("streak3"), "a gap breaks the run");
  assert.ok(run([1, 3, 5, 7, 9, 11, 13]).s.badges.includes("wins7"), "seven wins in any days");
});

test("equip: only an owned paint can be worn, and \"\" returns to the standard hull", () => {
  const owned = g.json("rewardClaim(freshRewards(), 1, true).store");
  assert.equal(g.json(`rewardEquipPaint(${JSON.stringify(owned)}, "ebony")`).paint, "ebony");
  assert.equal(g.json(`rewardEquipPaint(${JSON.stringify(owned)}, "crimson")`).paint, "", "crimson is not owned");
  assert.equal(g.json(`rewardEquipPaint(rewardEquipPaint(${JSON.stringify(owned)}, "ebony"), "")`).paint, "");
});

test("sanitize: junk, unknown ids and a paint that is not owned are dropped", () => {
  const s = g.json(`sanitizeRewards({ days: { "5": "paint:ebony", "x": "paint:sea", "6": "gold:1000", "0": "" }, owned: ["paint:ebony", "gold", 7], badges: ["first", "nope"], wins: -3, paint: "sea" })`);
  assert.deepEqual(s.days, { 5: "paint:ebony" });
  assert.deepEqual(s.owned, ["paint:ebony"]);
  assert.deepEqual(s.badges, ["first"]);
  assert.equal(s.wins, 0);
  assert.equal(s.paint, "");
  for (const junk of ["null", "[]", "'x'", "7"]) assert.deepEqual(g.json(`sanitizeRewards(${junk})`), g.json("freshRewards()"));
});

test("save separation: rewards have their own key and never touch the campaign save or the daily record", () => {
  const b = boot({ "privateers-save-v2": JSON.stringify({ v: 2, gold: 123 }), "privateers-daily-v1": JSON.stringify({ v: 1, days: {}, streak: 0, bestStreak: 0, last: 0 }) });
  const saveBefore = b.store.get("privateers-save-v2"), dailyBefore = b.store.get("privateers-daily-v1");
  assert.equal(b.run("REWARDS_KEY"), "privateers-rewards-v1");
  assert.notEqual(b.run("REWARDS_KEY"), b.run("DAILY_KEY"));
  b.run("saveRewards(rewardClaim(loadRewards(), 9, true).store)");
  assert.ok(b.store.has("privateers-rewards-v1"));
  assert.equal(b.store.get("privateers-save-v2"), saveBefore);
  assert.equal(b.store.get("privateers-daily-v1"), dailyBefore);
  assert.equal(b.run("loadRewards().owned.length"), 1, "it reads back");
});

test("save separation: the campaign save has no reward field and a poisoned store cannot change balance numbers", () => {
  const sv = g.json("defaultSave()");
  assert.ok(!("rewards" in sv) && !("badges" in sv) && !("paint" in sv));
  const b = boot({ "privateers-rewards-v1": JSON.stringify({ owned: ["paint:ebony"], paint: "ebony", gold: 1e9, hull: 99, days: {} }) });
  assert.deepEqual(Object.keys(b.json("loadRewards()")).sort(), ["badges", "days", "owned", "paint", "v", "wins"]);
  assert.equal(b.json("defaultSave()").gold, g.json("defaultSave().gold"));
  assert.equal(b.run("rewardPaint()"), "ebony");
  assert.equal(boot({ "privateers-rewards-v1": "{broken" }).run("loadRewards().wins"), 0);
});

test("cosmetics: paint changes only the hull colour of the livery; reward colours and emblems are valid flags", () => {
  const b = boot({ "privateers-rewards-v1": JSON.stringify({ owned: ["paint:ebony"], paint: "ebony", days: {} }) });
  const liv = b.json("LIVERY[flagLivery({ main: 'navy', alt: 'rose', emblem: 'crown' })]");
  assert.equal(liv.hull, b.run("HULL_PAINTS.ebony"));
  assert.equal(liv.emblem, "crown");
  const std = g.json("LIVERY[flagLivery({ main: 'blue', alt: 'white', emblem: 'diag' })]");
  assert.equal(std.hull, "#6e3d1f", "no paint: the standard hull");
  assert.deepEqual(g.json("cleanFlag({ main: 'lime', alt: 'navy', emblem: 'wave' })"), { main: "lime", alt: "navy", emblem: "wave" });
  assert.deepEqual(g.json("cleanFlag({ main: 'nope' })"), g.json("DEFAULT_FLAG"));
  for (const id of g.json("FLAG_REWARD_COLORS")) assert.match(g.run(`FLAG_HEX.${id}`), /^#[0-9a-f]{6}$/);
  for (const id of g.json("Object.keys(HULL_PAINTS)")) assert.match(g.run(`HULL_PAINTS.${id}`), /^#[0-9a-f]{6}$/);
});

test("flag card offers a reward only once it is owned", () => {
  const b = boot({ "privateers-rewards-v1": JSON.stringify({ owned: ["emblem:moon", "color:lime"], days: {} }) });
  assert.deepEqual(b.json("flagChoices(FLAG_EMBLEMS, 'emblem').slice(-1)"), ["moon"]);
  assert.ok(b.json("flagChoices(FLAG_COLORS, 'color')").includes("lime"));
  assert.ok(!g.json("flagChoices(FLAG_COLORS, 'color')").includes("lime"));
});

test("strings: every reward, paint, badge and emblem has English and Chinese text", () => {
  for (const lang of ["en", "zh"]) {
    for (const id of g.json("REWARD_ITEMS")) assert.ok(g.run(`(STR.${lang}[${JSON.stringify(({ color: "fc_", emblem: "fe_", paint: "hp_" })[id.split(":")[0]] + id.split(":")[1])}])`), `${lang} ${id}`);
    for (const b of g.json("REWARD_BADGES")) assert.ok(g.run(`STR.${lang}.bd_${b.id}`), `${lang} bd_${b.id}`);
    for (const k of ["rwTitle", "rwNew", "rwDone", "rwLost", "rwNone", "rwBadgeNew", "rwEquip", "rwBadges", "rwPaint", "rwPaintStd", "rwKindColor", "rwKindEmblem", "rwKindPaint"]) assert.ok(g.run(`STR.${lang}.${k}`), `${lang} ${k}`);
  }
});

test("result html: new, done and lost say the right thing", () => {
  const html = r => g.run(`rewardHtml(${JSON.stringify(r)})`);
  assert.match(html({ status: "new", item: "paint:ebony", badges: ["first"] }), /Ebony[\s\S]*First sea cleared/);
  assert.match(html({ status: "done", item: null, badges: [] }), /already claimed/);
  assert.match(html({ status: "lost", item: null, badges: [] }), /Sink the captain/);
});

test("badge line for the share card: two names then a count", () => {
  assert.equal(g.run("rewardBadgeLine(freshRewards())"), "");
  assert.match(g.run("rewardBadgeLine(sanitizeRewards({ badges: ['first', 'streak3', 'wins7'] }))"), /^Badges: First sea cleared · Three days running \+1$/);
});
