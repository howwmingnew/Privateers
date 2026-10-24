// Unit tests for the big gun decks (js/data.js SHIPS slots + gunK, js/save.js old-save layout, js/gundeck.js rolling broadsides).
// Usage: node --test tests/unit-gundeck.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js", "js/gundeck.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const SAVE_KEY = "privateers-save-v2";

function boot(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
    navigator: { language: "en-US" }, document: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    balls: [],
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  return { run, json: code => JSON.parse(run(`JSON.stringify(${code})`)), ctx, store };
}
const G = (g, lv = 1) => ({ g, lv });
const oldSave = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: [G("six")], left: [G("six")], right: [G("six")],
  stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });

test("ship slots: each side within MAX_PORTS, the ladder only grows, the ship of the line carries 30 guns", () => {
  const g = boot(), max = g.run("MAX_PORTS");
  for (const ladder of [["sloop", "schooner", "brigantine", "cruiser", "corsair"], ["sloop", "gunboat", "brig", "frigate", "line"]]) {   // the fast and the heavy line
    let prev = null;
    for (const id of ladder) {
      const s = g.json(`SHIPS.${id}.slots`);
      for (const k of Object.keys(s)) { assert.ok(s[k] <= max, `${id} ${k}`); if (prev) assert.ok(s[k] >= prev[k], `${id} ${k} shrank`); }
      prev = s;
    }
  }
  const line = g.json("SHIPS.line.slots");
  assert.ok(line.left >= 10 && line.left === line.right, "10-15 guns a side");
  assert.equal(line.bow + line.left + line.right + line.stern, 30);
});

test("an old save's short rows of ports move to the middle of the longer row, once, and keep every gun", () => {
  const five = [G("six"), G("long12", 3), G("carronade"), G("chain", 2), G("fire", 4)];
  const g = boot({ [SAVE_KEY]: oldSave({ ship: "line", bow: [G("six"), G("six")], left: five, right: five, stern: [G("long12"), G("six")], store: [G("fire", 5)] }) });
  const s = g.json("save"), slots = g.json("SHIPS.line.slots");
  for (const k of ["bow", "left", "right", "stern"]) assert.equal(s[k].length, slots[k], k);
  assert.deepEqual(s.left.slice(3, 8), five, "centred: (12 - 5) / 2 = 3 empty ports first");
  assert.equal(s.left.filter(Boolean).length, 5);
  assert.deepEqual(s.bow, [G("six"), G("six"), null], "2 of 3 bow ports: (3 - 2) / 2 rounds down, no shift");
  assert.deepEqual(s.store, [G("fire", 5)], "the store is untouched");
  const again = g.json("sanitizeSave(JSON.parse(JSON.stringify(save)))");
  assert.deepEqual(again.left, s.left, "loading a converted save again changes nothing");
  assert.deepEqual(again.right, s.right);
});

test("a full row is never shifted, and a smaller old ship keeps its guns at the same ports", () => {
  const row = Array.from({ length: 12 }, (_, i) => (i === 0 ? G("long12") : null));
  const g = boot({ [SAVE_KEY]: oldSave({ ship: "line", left: row, right: row, bow: [null, null, G("six")], stern: [null, null, null] }) });
  const s = g.json("save");
  assert.deepEqual(s.left, row);
  assert.deepEqual(s.bow, [null, null, G("six")]);
  const f = boot({ [SAVE_KEY]: oldSave({ ship: "frigate", left: [G("six"), G("six"), G("six"), G("six")], right: [G("six")], bow: [G("six"), G("six")] }) }).json("save");
  assert.equal(f.left.length, 7); assert.equal(f.left.filter(Boolean).length, 4);
  assert.deepEqual(f.left.map(Boolean), [false, true, true, true, true, false, false], "(7 - 4) / 2 = 1 empty port first");
});

test("balance: a gun hits for its hull's gunK, and a full big deck lands about a quarter more than the old ladder did", () => {
  const g = boot();
  const power = (ship, six) => g.run(`(() => { save = fitMounts({ ...defaultSave(), ship: "${ship}" });
    for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six"));
    return playerPower() ** 2 / yardVal("hull"); })()`);   // dps of a fully armed ship
  const oldGuns = { sloop: 3, schooner: 5, brig: 7, frigate: 11, line: 14 }, dps6 = g.json("GUNS.six.dmg * GUNS.six.rpm / 60 * MOUNT_UPTIME");
  for (const id of Object.keys(oldGuns)) {
    const ratio = power(id) / (oldGuns[id] * dps6);
    if (id === "frigate" || id === "line") assert.ok(ratio >= 1.2 && ratio <= 1.3, `${id} ${ratio.toFixed(3)}`);
    else assert.ok(Math.abs(ratio - 1) < 0.5 || ratio >= 1, `${id} ${ratio.toFixed(3)}`);
  }
  assert.ok(power("line") > power("frigate") && power("frigate") > power("brig"), "the ladder holds when armed");
  assert.equal(g.run("shipGunK('sloop')"), 1);
  assert.ok(g.run("shipGunK('line')") < g.run("shipGunK('frigate')"), "the bigger the deck, the lighter each gun");
  assert.equal(g.run("(save = defaultSave(), shipGunK())"), 1, "defaults to the ship in the save");
});

test("rolling broadside: from the stern forward, finished inside ROLL_MAX_MS, only a few plumes and reports", () => {
  const g = boot(), gap = g.run("ROLL_GAP_MS"), maxMs = g.run("ROLL_MAX_MS"), fx = g.run("FX_GUNS");
  assert.deepEqual(g.json("rollPlan(0)"), []);
  assert.deepEqual(g.json("rollPlan(1)"), [{ i: 0, delay: 0, loud: true }]);
  const small = g.json("rollPlan(5)");
  assert.deepEqual(small.map(p => p.delay), [0, 1, 2, 3, 4].map(k => k * gap), "a small side keeps the old gap between guns");
  assert.ok(small.every(p => p.loud));
  for (const n of [6, 7, 12, 15]) {
    const plan = g.json(`rollPlan(${n})`), delays = plan.map(p => p.delay);
    assert.equal(delays[0], 0);
    assert.ok(delays.every((d, i) => i === 0 || d > delays[i - 1]), `${n}: one gun after another`);
    assert.ok(delays[n - 1] <= maxMs, `${n}: ${delays[n - 1]} ms`);
    const loud = plan.filter(p => p.loud).length;
    assert.ok(plan[0].loud && loud >= 1 && loud <= fx, `${n}: ${loud} loud`);
  }
  assert.equal(g.json("rollPlan(12)")[11].delay, Math.round(maxMs), "a big side takes the whole allowance");
});

test("ball cap and the dense gun bay", () => {
  const g = boot();
  assert.equal(g.run("ballRoom()"), true);
  g.run("balls.length = MAX_BALLS");
  assert.equal(g.run("ballRoom()"), false);
  assert.deepEqual(["sloop", "schooner", "brig", "frigate", "line"].map(s => g.run(`denseDeck("${s}")`)), [false, false, false, true, true]);
});
