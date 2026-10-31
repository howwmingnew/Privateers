// Unit tests for #140: the fast smuggler between Red Ned and Mother Carey, and everything that used to count bounties now naming its captain
// (js/save-campaign.js BOUNTY_ORDER / bountyDone / SHIP_GATE / BOUNTY_RANK, js/campaign.js BOUNTIES / claimBounty), plus the v1 -> v2 save migration.
// Scripts load into one node:vm context, as in tests/unit-rematch.mjs. Usage: node --test tests/unit-bounty140.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/hooks.js", "js/data.js", "js/save.js", "js/save-campaign.js",
  "js/postcard.js", "js/logbook.js", "js/hall.js", "js/art.js", "js/archetypes.js", "js/world-seas.js", "js/ports.js", "js/campaign.js", "js/rematch.js", "js/bounty-rec.js",
  "js/achievements.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const dom = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : dom), apply: () => dom, set: () => true, construct: () => dom });
function boot() {
  const ctx = vm.createContext({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: "en-US" }, document: dom, window: dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    console: { log() {}, warn() {}, error: (...a) => { throw new Error(a.join(" ")); } }, setTimeout, clearTimeout, performance,
  });
  // stand-ins for the scene, the HUD and the daily run: claimBounty only needs them to exist
  vm.runInContext(`function runActive() { return false; } function runBounty() { return null; } function runKind() { return null; } function runLink() { return ''; }
    var S = null, toasts = []; function toast(m) { toasts.push(m); } function hud() {} function floatText() {} function buildMiniBase() {}`, ctx);
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  run("save = sanitizeSave({})");
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const g = boot();
const load = camp => g.json(`sanitizeSave(${JSON.stringify({ v: 2, gold: 9, campaign: camp })}).campaign`);

test("order: Ned -> the smuggler -> Carey, and BOUNTIES matches the save's BOUNTY_ORDER", () => {
  assert.deepEqual(g.json("BOUNTIES.map(b => b.id)"), ["ned", "smuggler", "carey", "saint", "hale", "thorne"]);
  assert.deepEqual(g.json("BOUNTY_ORDER"), g.json("BOUNTIES.map(b => b.id)"));
  assert.equal(g.run("BOUNTY_COUNT"), 6);
});

test("poster ready levels rise strictly: Ned 3 -> smuggler 6 -> Carey 8 (base game), and on through the war", () => {
  assert.equal(g.run("save.ngPlus"), 0);
  const rec = g.json("BOUNTIES.map(bountyRecLv)");
  assert.deepEqual(rec.slice(0, 3), [3, 6, 8]);
  for (let i = 1; i < rec.length; i++) assert.ok(rec[i] > rec[i - 1], `poster ${i + 1} (${rec[i]}) above poster ${i} (${rec[i - 1]})`);
  assert.equal(g.run("bountyMargin(BOUNTIES[1])"), 2, "the smuggler sets his own margin");
});

test("the smuggler: a lone fast runner on a schooner hull, mid-ring 4, tethered short of the Navy Lanes", () => {
  const b = g.json("BOUNTIES[1]");
  assert.equal(b.cls, "cutter"); assert.equal(g.run("ARCH.cutter.plan"), "kite");
  assert.equal(b.art, "schooner"); assert.equal(g.run("bossArt(BOUNTIES[1])"), "schooner");
  assert.equal(g.run("bossClsName(BOUNTIES[1])"), "schooner");
  assert.equal(b.stands, undefined, "he runs: never stands like Ned");
  assert.deepEqual(b.escorts, []); assert.equal(b.reward, 2000); assert.equal(b.faction, "pirate");
  assert.equal(b.L, 4); assert.equal(b.r, g.run("ringMid(4)"));
  assert.ok(b.hpMul > g.run("BOUNTIES[0].hpMul") && b.hpMul <= g.run("BOUNTIES[2].hpMul"), "a medium hull, between Ned's and Carey's");
  const sp = g.run("bountyDry(BOUNTIES[1]).maxSpeed");
  for (const id of ["sloop", "schooner", "gunboat"]) assert.ok(sp > g.run(`SHIPS.${id}.speed`) * 1.15, `clearly faster than a stock ${id} (${sp})`);
  assert.ok(g.run("ringMid(4) + BOUNTIES[1].tether + TETHER_SLACK") < g.run("ringEdge(6)"), "even the slack beyond the line stays out of the Navy Lanes");
});

test("every lair is on its own level's ring, and the smuggler's lair is clear of every other lair, the outpost and the stations", () => {
  for (const b of g.json("BOUNTIES.map(b => ({ id: b.id, L: b.L, ring: ringAt(b.r) }))")) assert.equal(b.ring, b.L, b.id);
  const d = g.json(`(() => { const me = lairOf(BOUNTIES[1]);
    return [...BOUNTIES.slice(0, 1), ...BOUNTIES.slice(2)].map(lairOf).concat([OUTPOST], STATIONS).map(p => Math.hypot(p.x - me.x, p.y - me.y)); })()`);
  assert.ok(Math.min(...d) > 900, `nearest ${Math.round(Math.min(...d))} px`);
  assert.equal(new Set(g.json("BOUNTIES.map(b => b.ang)")).size, 6, "no two captains share a bearing");
});

test("ship gates by captain: the smuggler opens the brig tier, Mother Carey opens no hull", () => {
  assert.deepEqual(g.json(`shipsFor("ned")`), ["schooner", "gunboat"]);
  assert.deepEqual(g.json(`shipsFor("smuggler")`).sort(), ["brig", "brigantine"]);
  assert.deepEqual(g.json(`shipsFor("carey")`), []);
  assert.deepEqual(g.json(`shipsFor("saint")`).sort(), ["cruiser", "frigate"]);
  assert.deepEqual(g.json(`shipsFor("hale")`).sort(), ["corsair", "line"]);
  assert.deepEqual(g.json(`shipsFor("thorne")`), []);
  g.run("save = sanitizeSave({})");
  assert.equal(g.run(`shipLock("brig")`), "Sink Quicksilver Quinn to unlock");
  assert.equal(g.run(`shipLock("sloop")`), null);
});

test("id-based thresholds keep each feature on its boss", () => {
  const at = n => g.json(`(() => { const c = { bounty: ${n} };
    return { outpost: bountyDone(c, OUTPOST_AFTER), admiral: bountyDone(c, ADMIRAL_AFTER), war: (save.campaign = c, warLevels(WAR_RING)), shallow: warLevels(WAR_RING - 1) }; })()`);
  // claimed: 0 none, 1 ned, 2 +smuggler, 3 +carey, 4 +saint, 5 +hale, 6 +thorne
  const rows = [0, 1, 2, 3, 4, 5, 6].map(at);
  assert.deepEqual(rows.map(r => r.outpost), [false, false, false, false, true, true, true], "the Hulk Outpost after the Saint");
  assert.deepEqual(rows.map(r => r.admiral), [false, false, false, false, false, true, true], "the Admiral after Hale");
  assert.deepEqual(rows.map(r => r.war), [0, 0, 0, 0, 1, 2, 2], "war levels: +1 after the Saint, +2 after Hale");
  assert.equal(at(6).shallow, 0, "only the deep rings");
  assert.equal(g.run("WAR_MAX"), 2, "heatMaxLevel (js/heat.js) still adds the most war levels there are");
  assert.equal(g.run(`bountyDone({ bounty: 6 }, "nobody")`), false);
  assert.equal(g.run(`bountyDone(null, "ned")`), false);
});

test("ranks per bounty: the smuggler brings none, the finale keeps Pirate Lord", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(n => g.run(`rankAfter(${n})`)), [0, 1, 1, 2, 3, 4, 4]);
});

test("claiming each bounty in turn: rank, hulls, outpost, toast and achievement by id", () => {
  const b = boot();
  b.run("save = sanitizeSave({}); save.ach = {}");
  const seen = [];
  for (let i = 0; i < 5; i++) {   // the finale's claim schedules the victory screen on the scene; stop before it
    b.run(`toasts = []; claimBounty(BOUNTIES[${i}], { x: 0, y: 0 })`);
    seen.push(b.json("({ n: save.campaign.bounty, rank: save.campaign.rank, ships: save.campaign.ships, outpost: save.campaign.outpost, order: save.campaign.order, toasts, ach: Object.keys(save.ach) })"));
  }
  assert.deepEqual(seen.map(s => s.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(seen.map(s => s.rank), [1, 1, 2, 3, 4]);
  assert.deepEqual(seen.map(s => s.outpost), [false, false, false, true, true]);
  assert.ok(seen.every(s => s.order === 2));
  assert.deepEqual(seen[0].ships, ["sloop", "schooner", "gunboat"]);
  assert.deepEqual(seen[1].ships, ["sloop", "schooner", "gunboat", "brigantine", "brig"], "the smuggler opens the brig tier");
  assert.deepEqual(seen[2].ships, seen[1].ships, "Mother Carey opens no hull");
  assert.ok(seen[0].toasts.includes("Bounty claimed! You are now a Privateer."));
  assert.ok(seen[1].toasts.includes("Bounty claimed!"), JSON.stringify(seen[1].toasts));
  assert.ok(!seen[1].toasts.some(m => /now a/.test(m)), "no rank line when the rank does not rise");
  assert.ok(seen[2].toasts.includes("Bounty claimed! You are now a Captain."));
  const ach = seen[4].ach;
  for (const id of ["bounty_1", "bounty_smuggler", "bounty_2", "bounty_3", "bounty_4", "charmed"]) assert.ok(ach.includes(id), id);
  assert.ok(!ach.includes("bounty_5"), "bounty_5 stays Thorne's");
  assert.deepEqual(seen[1].ach.filter(a => a.startsWith("bounty")).sort(), ["bounty_1", "bounty_smuggler"]);
  assert.ok(!seen[2].ach.includes("charmed") && seen[3].ach.includes("charmed"), "Charmed Life still comes with the Saint");
});

test("migration: a fresh campaign is v2 and stays put", () => {
  const c = g.json("freshCampaign()");
  assert.equal(c.order, 2); assert.equal(c.bounty, 0);
  assert.deepEqual(load(c), { ...c });
  assert.deepEqual(g.json("sanitizeSave({}).campaign"), c);
});

test("migration: v1 saves at 0 and 1 keep their count, 2+ skip the smuggler they never met", () => {
  const z = load({ bounty: 0 });
  assert.deepEqual([z.order, z.bounty, z.rank, z.outpost, z.ships], [2, 0, 0, false, ["sloop"]]);
  const one = load({ bounty: 1, ships: ["sloop", "schooner", "gunboat"] });
  assert.deepEqual([one.order, one.bounty, one.rank, one.outpost], [2, 1, 1, false], "Ned done: next poster is the smuggler");
  assert.deepEqual(one.ships, ["sloop", "schooner", "gunboat"]);
  const two = load({ bounty: 2, ships: ["sloop", "schooner", "gunboat", "brigantine", "brig"] });
  assert.deepEqual([two.bounty, two.rank, two.outpost], [3, 2, false], "past Carey: next poster is the Saint, rank Captain");
  assert.deepEqual(two.ships, ["sloop", "schooner", "gunboat", "brigantine", "brig"]);
  const three = load({ bounty: 3 });
  assert.deepEqual([three.bounty, three.rank, three.outpost], [4, 3, true], "past the Saint: the outpost stays open");
  const won = load({ bounty: 5, won: true, deaths: 4 });
  assert.deepEqual([won.bounty, won.rank, won.outpost, won.won, won.deaths], [6, 4, true, true, 4]);
  assert.equal(won.ships.length, 9);
  assert.equal(load({ bounty: 4, won: true }).won, false, "won needs all six");
});

test("migration: idempotent, a migrated save loaded again is never shifted twice", () => {
  for (const n of [0, 1, 2, 3, 4, 5]) {
    const once = load({ bounty: n, won: n === 5 }), twice = load(once), thrice = load(twice);
    assert.deepEqual(twice, once, `v1 bounty ${n}`);
    assert.deepEqual(thrice, once);
  }
  assert.equal(load({ order: 2, bounty: 2 }).bounty, 2, "an order-2 count of 2 is Ned and the smuggler");
  assert.equal(load({ order: 2, bounty: 99 }).bounty, 6, "clamped to the list");
  assert.equal(load({ bounty: 99 }).bounty, 6);
});

test("migration: a captain keeps every hull already listed or sailed, whatever the gates say", () => {
  const c = g.json(`sanitizeSave({ v: 2, ship: "frigate", campaign: { bounty: 1, ships: ["sloop", "brig"] } }).campaign`);
  assert.deepEqual(c.ships, ["sloop", "schooner", "gunboat", "brig", "frigate"]);
});

test("strings: the smuggler and the new lines exist in both languages", () => {
  for (const k of ["boss_smuggler", "intro_smuggler", "done_smuggler", "bountyClaimed", "cls_schooner", "ach_bounty_smuggler", "achd_bounty_smuggler"])
    assert.ok(g.run(`STR.en.${k}`) && g.run(`STR.zh.${k}`), k);
  assert.equal(g.run("STR.zh.boss_smuggler"), "水銀奎恩");
  assert.doesNotMatch(g.run("STR.en.done_carey"), /yard/, "Carey no longer promises a hull");
  assert.doesNotMatch(g.run("STR.zh.done_carey"), /造船廠/);
  assert.match(g.run("STR.en.done_smuggler"), /brig/);
  assert.match(g.run("STR.en.achd_charmed"), /four/);
  assert.match(g.run("STR.zh.achd_charmed"), /前四張/);
  assert.equal(g.json("ACH").length, 21);
});

test("islands: a saved seed keeps its map; only the islands on the smuggler's lair are taken away (owner, #157)", () => {
  for (const seed of [424242, 1234567, 98765, 7]) {
    const json = g.json(`(() => {
      save.wrecks = [];
      const now = genIslands(${seed}), i = BOUNTIES.findIndex(b => b.id === "smuggler"), b = BOUNTIES.splice(i, 1)[0];
      const before = genIslands(${seed}); BOUNTIES.splice(i, 0, b);   // the generator as it was before the smuggler existed
      const L = clearSpots().find(p => p.late), near = o => Math.hypot(o.x - L.x, o.y - L.y) < L.r + o.r;
      return { now, kept: before.filter(o => !near(o)), gone: before.filter(near).length, onLair: now.filter(near).length };
    })()`);
    assert.deepEqual(json.now, json.kept, `seed ${seed}: every other island stays exactly where it was`);
    assert.equal(json.onLair, 0, `seed ${seed}: nothing on the new lair`);
    assert.ok(json.gone <= 4, `seed ${seed}: only a few islands give way (${json.gone})`);   // a 330 px lair fits a handful of 60-190 px islands at most
  }
});

test("migration: a save moved past the smuggler gets his achievement, once (owner, #157)", () => {
  const full = s => g.json(`sanitizeSave(${JSON.stringify({ v: 2, gold: 9, ...s })})`);
  const past = full({ campaign: { bounty: 2 }, ach: { bounty_1: 111, bounty_2: 222 } });
  assert.ok(past.ach.bounty_smuggler > 0, "past Carey: counted as sunk, so unlocked");
  assert.equal(past.ach.bounty_2, 222, "the old ones are kept as they were");
  assert.deepEqual(full(past).ach, past.ach, "loaded again: not granted twice, same unlock time");
  assert.equal(full({ campaign: { bounty: 1 }, ach: { bounty_1: 111 } }).ach.bounty_smuggler, undefined, "only Ned: the smuggler is still ahead");
  assert.equal(full({ campaign: { order: 2, bounty: 3 }, ach: {} }).ach.bounty_smuggler, undefined, "an order-2 save earns it by sinking him, not by loading");
  assert.equal(full({ campaign: { bounty: 3 }, ach: { bounty_smuggler: 5 } }).ach.bounty_smuggler, 5, "an existing unlock keeps its time");
});
