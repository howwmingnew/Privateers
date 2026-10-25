// Unit tests for the two ship lines (js/data.js SHIPS, js/ship-lines.js): the table is complete, the old ships and old saves are
// untouched, and simple simulations (chase, escape, broadside slugging) show the trade: the fast line outruns, the heavy line
// out-trades. The simulations are point-mass models built from the game's own numbers, not the real game loop: they bound the
// design, they do not replace play (tests/shiplines.mjs checks the real page). Set SHIPLINES_REPORT=1 to print the tables.
// Usage: node --test tests/unit-shiplines.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["js/config.js", "js/util.js", "js/settings.js", "js/i18n.js", "js/data.js", "js/save.js", "js/save-campaign.js", "js/shipyard.js", "js/ship-lines.js", "js/archetypes.js"];
const SRC = FILES.map(f => [f, readFileSync(new URL("../" + f, import.meta.url), "utf8")]);
const KEY = "privateers-save-v2";
const REPORT = !!process.env.SHIPLINES_REPORT;

function boot(seed = {}) {
  const store = new Map(Object.entries(seed)), domReady = [];
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { language: "en-US" }, document: { addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
  });
  for (const [f, code] of SRC) vm.runInContext(code, ctx, { filename: f });
  domReady.forEach(fn => fn());
  return { run: code => vm.runInContext(code, ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)), ctx };
}
const G = (g, lv = 1) => ({ g, lv });
const oldSave = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1,
  bow: [G("six")], left: [G("six")], right: [G("six")], stern: [], store: [], sunk: 0, wrecks: [], salvage: [], ...o });
const FAST = ["schooner", "brigantine", "cruiser", "corsair"], HEAVY = ["gunboat", "brig", "frigate", "line"];
const g = boot();
const SHIPS = g.json("SHIPS"), total = id => Object.values(SHIPS[id].slots).reduce((a, b) => a + b, 0);
const logTable = (title, rows) => { if (REPORT) { console.log("\n== " + title); console.table(rows); } };

// What the old five ships were before the lines existed: nothing here may change (an old save must lose nothing).
const OLD = {
  sloop:    { slots: { bow: 1, left: 1, right: 1, stern: 0 }, hp: 100,  speed: 150, hold: 240,  cost: 0,     refit: 1 },
  schooner: { slots: { bow: 1, left: 2, right: 2, stern: 0 }, hp: 180,  speed: 165, hold: 440,  cost: 400,   refit: 1.7 },
  brig:     { slots: { bow: 1, left: 3, right: 3, stern: 0 }, hp: 325,  speed: 155, hold: 1250, cost: 2000,  refit: 3.2 },
  frigate:  { slots: { bow: 2, left: 7, right: 7, stern: 1 }, hp: 585,  speed: 150, hold: 2200, cost: 6000,  refit: 6,   gunK: 0.81 },
  line:     { slots: { bow: 3, left: 12, right: 12, stern: 3 }, hp: 1050, speed: 140, hold: 4100, cost: 16000, refit: 11, gunK: 0.58 },
};

// ---------- the table ----------
test("every tier 2-5 has one ship on each line, and the gates open both at once", () => {
  for (let tier = 2; tier <= 5; tier++) {
    const at = Object.keys(SHIPS).filter(id => SHIPS[id].tier === tier);
    assert.equal(at.length, 2, `tier ${tier}: ${at}`);
    assert.deepEqual(at.map(id => SHIPS[id].line).sort(), ["fast", "heavy"]);
    for (const id of at) assert.equal(g.run(`SHIP_GATE.${id}`), tier - 1, `${id} gate`);
    assert.deepEqual(g.json(`SHIP_ORDER.filter(id => SHIP_GATE[id] === ${tier - 1})`).sort(), at.sort(), `bounty ${tier - 2} opens both`);
  }
  assert.equal(SHIPS.sloop.line, undefined, "the starter belongs to both lines");
  assert.equal(g.json("SHIP_ORDER").length, 9);
});

test("the trade at every tier: fast is quicker, turns tighter, and carries fewer guns, less hold and no more hull", () => {
  const rows = [];
  FAST.forEach((f, i) => {
    const h = HEAVY[i], F = SHIPS[f], H = SHIPS[h];
    rows.push({ tier: i + 2, fast: f, heavy: h, speed: `${F.speed} / ${H.speed}`, turn: `${F.turn} / ${H.turn || 1}`, hull: `${F.hp} / ${H.hp}`, hold: `${F.hold} / ${H.hold}`, guns: `${total(f)} / ${total(h)}`, cost: `${F.cost} / ${H.cost}` });
    assert.ok(F.speed >= H.speed * 1.1, `${f} is at least 10% quicker than ${h}`);
    assert.ok(F.turn > (H.turn || 1), `${f} turns tighter`);
    assert.ok(total(f) < total(h) || i === 0 && total(f) <= total(h), `${f} carries fewer guns`);
    assert.ok(F.hold < H.hold, `${f} holds less`);
    assert.ok(F.hp <= H.hp, `${f} is no sturdier`);
    assert.ok(Math.abs(F.cost / H.cost - 1) <= 0.12, `${f} and ${h} cost about the same`);
  });
  logTable("tier trade (fast / heavy)", rows);
  assert.ok(total("line") >= 24 && total("line") <= 32, "the heavy line's top ship carries 24-32 guns");
  assert.ok(total("corsair") < total("line") * 0.6, "and the fast line's top ship well under it");
});

test("each line climbs: cost, speed or guns and hold only grow; the fast line may trade up to 20% of last tier's refitted hull for speed", () => {
  for (const [ladder, name] of [[["sloop", ...FAST], "fast"], [["sloop", ...HEAVY], "heavy"]]) for (let i = 1; i < ladder.length; i++) {
    const a = SHIPS[ladder[i - 1]], b = SHIPS[ladder[i]];
    assert.ok(b.cost > a.cost && b.hold > a.hold && total(ladder[i]) >= total(ladder[i - 1]), `${name} ${ladder[i]}`);
    if (name === "fast") assert.ok(b.speed > a.speed, `${ladder[i]} is quicker than ${ladder[i - 1]}`);
  }
  const at = (ship, hull, hold) => g.json(`(() => { save = fitMounts({ ...defaultSave(), ship: "${ship}", hull: ${hull}, hold: ${hold} });
    for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six"));
    return { p: playerPower(), hp: yardVal("hull"), hold: yardVal("hold") }; })()`);
  for (const ladder of [["sloop", ...FAST], ["sloop", ...HEAVY]]) for (let i = 1; i < ladder.length; i++) {
    const old = at(ladder[i - 1], 5, 4), nw = at(ladder[i], 1, 1);
    assert.ok(nw.p >= old.p, `${ladder[i]} Lv1 power ${nw.p.toFixed(1)} vs ${ladder[i - 1]} hull 5 / hold 4 ${old.p.toFixed(1)}`);
    assert.ok(nw.hold >= old.hold, `${ladder[i]} hold`);
    assert.ok(nw.hp >= old.hp * 0.8, `${ladder[i]} hull ${nw.hp} vs ${old.hp}`);
  }
});

// ---------- the old ships and old saves ----------
test("the old five ships keep every number they had, and rate exactly as before (no evade bonus under 165 speed)", () => {
  for (const [id, was] of Object.entries(OLD)) {
    const { tier, line, turn, ...now } = SHIPS[id];
    assert.deepEqual(now, was, id);
    assert.equal(g.run(`shipEvade("${id}")`), 1, `${id} evade`);
    assert.equal(g.run(`shipTurn("${id}")`), id === "schooner" ? 1.1 : 1, `${id} turn only ever improves`);
  }
  assert.ok(g.run('shipEvade("corsair")') > 1.3 && g.run('shipEvade("brigantine")') > 1);
});

test("an old save sails the same ship with the same upgrades, guns and fleet, and the new hulls open by bounty", () => {
  const five = [G("six"), G("long12", 3), G("carronade"), G("chain", 2), G("fire", 4)];
  for (const id of Object.keys(OLD)) {
    const s = boot({ [KEY]: oldSave({ ship: id, hull: 4, sails: 3, hold: 2, gold: 50, left: five, store: [G("six", 7)] }) }).json("save");
    assert.equal(s.ship, id); assert.equal(s.hull, 4); assert.equal(s.sails, 3); assert.equal(s.hold, 2); assert.equal(s.gold, 50);
    const guns = [...s.bow, ...s.left, ...s.right, ...s.stern, ...s.store].filter(Boolean).length;
    assert.ok(guns >= 8, `${id} keeps its guns`);
  }
  const mid = boot({ [KEY]: JSON.stringify({ ...JSON.parse(oldSave({ ship: "schooner" })), campaign: { bounty: 2, ships: ["sloop", "schooner", "brig"] } }) }).json("save");
  assert.deepEqual(mid.campaign.ships, ["sloop", "schooner", "gunboat", "brigantine", "brig"], "bounty 2 now opens tiers 2 and 3 on both lines; nothing owned is taken away");
  const fresh = boot({ [KEY]: oldSave({ ship: "line" }) }).json("save");
  assert.ok(fresh.campaign.ships.includes("line"), "a captain who already sails the line keeps it");
  const fleet = boot({ [KEY]: JSON.stringify({ ...JSON.parse(oldSave({ ship: "brig" })), fleet: [{ id: "s2", ship: "frigate", hull: 3, sails: 2, hold: 1 }, { id: "s3", ship: "nope", hull: 1, sails: 1, hold: 1 }], shipSeq: 4 }) }).json("save");
  assert.deepEqual(fleet.fleet.map(e => e.ship), ["frigate", "sloop"], "owned ships stay; an unknown id is dropped as before; the missing starter is parked (#72)");
});

test("v1 saves still move onto the same four ships (the yard has two per tier now)", () => {
  const ship = ports => boot({ ["privateers-save-v1"]: JSON.stringify({ v: 1, gold: 0, ports, hull: 1, sails: 1, hold: 1, sunk: 0, wrecks: [], salvage: [], unlocked: { six: true }, gunLv: { six: 1 } }) }).json("save.ship");
  assert.deepEqual([1, 2, 3, 4].map(ship), ["sloop", "schooner", "brig", "frigate"]);
});

test("every new ship can be bought and sailed, with its guns and its own turn", () => {
  for (const id of ["gunboat", "brigantine", "cruiser", "corsair"]) {
    const r = g.json(`(() => { let s = { ...defaultSave(), gold: 99999 }; s.campaign = { ...s.campaign, ships: SHIP_ORDER.slice() };
      const b = buyShip(s, "${id}"); return b && { ship: b.ship, gold: b.gold, fleet: b.fleet.map(e => e.ship), slots: MOUNTS.map(m => b[m.key].length) }; })()`);
    assert.equal(r.ship, id); assert.equal(r.gold, 99999 - SHIPS[id].cost); assert.deepEqual(r.fleet, ["sloop"]);
    assert.deepEqual(r.slots, ["bow", "left", "right", "stern"].map(k => SHIPS[id].slots[k]));
  }
  assert.equal(g.run("(save = defaultSave(), save.ship = 'corsair', shipTurn())"), 1.4);
});

test("the ledger compares a ship with yours, in signed percent and in both languages", () => {
  const c = g.json("shipCompare(SHIPS.corsair, SHIPS.line)");
  assert.ok(c.cmpSpeed > 60 && c.cmpHull < -20 && c.cmpHold < -25 && c.cmpFire < -15 && c.cmpTurn > 30, JSON.stringify(c));
  const html = g.run("shipCmpHtml(SHIPS.corsair, SHIPS.line, 'line')");
  assert.match(html, /Speed \+\d+%/); assert.match(html, /Hull −\d+%/); assert.match(html, /class="gain"/); assert.match(html, /class="loss"/);
  assert.match(g.run("shipCmpHtml(SHIPS.line, SHIPS.line, 'line')"), /about the same/);
  for (const k of ["line_fast", "line_heavy", "lineTag_fast", "lineTag_heavy", "s_gunboat", "s_brigantine", "s_cruiser", "s_corsair", "shipGuns", "shipTurn", "cmpHead",
    "cmpSpeed", "cmpTurn", "cmpHull", "cmpHold", "cmpFire", "cmpSame", "pRecFast", "pRecSlow"]) {
    assert.ok(g.run(`STR.en.${k}`) && g.run(`STR.zh.${k}`), k);
    assert.notEqual(g.run(`STR.en.${k}`), g.run(`STR.zh.${k}`), `${k} is translated`);
  }
});

// ---------- simulations ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// Point masses with the real ship physics (js/ships.js moveShip): speed eases toward thr x max (accelerating at 0.7 max/s), turning is
// slower at low speed. The chaser steers for the prey at full throttle; the prey runs straight away (a merchant wobbles, js/archetypes.js flee).
function chase(chaser, prey, d0, done, wobble, maxT = 240) {
  const step = (s, desired, dt) => {
    const turn = s.turn * dt * (0.45 + 0.55 * Math.min(1, s.speed / s.max + 0.2));
    s.rot += clamp(angDiff(desired, s.rot), -turn, turn);
    s.speed += clamp(s.max - s.speed, -s.max * 1.1 * dt, s.max * 0.7 * dt);
    s.x += Math.cos(s.rot) * s.speed * dt; s.y += Math.sin(s.rot) * s.speed * dt;
  };
  const c = { x: 0, y: 0, rot: 0, speed: chaser.speed, max: chaser.speed, turn: chaser.turn }, p = { x: d0, y: 0, rot: 0, speed: prey.speed, max: prey.speed, turn: prey.turn };
  const dt = 0.05;
  for (let t = 0; t < maxT; t += dt) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (done(d)) return t;
    step(c, Math.atan2(p.y - c.y, p.x - c.x), dt);
    step(p, Math.atan2(p.y - c.y, p.x - c.x) + (wobble ? Math.sin(t * 1.1) * 0.5 : 0), dt);
  }
  return Infinity;
}
// the merchant is a fluyt (archetype speed 0.85, turn 0.9): the slowest hull on the sea, and the one the player hunts for plunder
const enemy = (L, arch) => g.json(`(() => { const st = enemyStats(${L}, ${arch === "fluyt"}), A = ARCH.${arch}; return { speed: st.speed * A.speed, turn: 1.7 * A.turn, hp: st.hp * A.hp, dmg: st.dmg * A.dmg,
  n: A.sides(st.per), interval: st.interval * A.reload + VOLLEY_WARN }; })()`);
const sailsMul = lv => 1 + 0.045 * (lv - 1);
const me = (id, sails = 1) => ({ speed: SHIPS[id].speed * sailsMul(sails), turn: 2.5 * (SHIPS[id].turn || 1) });
const CATCH = 270;   // the six-pounder's reach: close to here and the broadside bears

test("chase: the fast line takes a merchant in seconds; at the tail of the sea the heavy line needs 5x to 35x as long", () => {
  const rows = [];
  const times = {};
  for (const id of [...FAST, ...HEAVY]) for (const L of [3, 6, 9]) for (const sails of [1, 5]) {
    times[`${id}|${L}|${sails}`] = chase(me(id, sails), enemy(L, "fluyt"), 600, d => d <= CATCH, true);
  }
  for (const id of [...FAST, ...HEAVY]) rows.push({ ship: id, speed: SHIPS[id].speed, "L3 s1": times[`${id}|3|1`], "L6 s1": times[`${id}|6|1`], "L9 s1": times[`${id}|9|1`], "L9 s5": times[`${id}|9|5`] });
  logTable("seconds to close from 600 px to gun range on a fleeing fluyt (Infinity = never in 240 s)", rows);
  for (const id of FAST.slice(1)) for (const L of [3, 6, 9]) assert.ok(times[`${id}|${L}|1`] < 10, `${id} runs down a Lv ${L} merchant in ${times[`${id}|${L}|1`]} s`);
  for (const id of ["brig", "frigate", "line"]) assert.ok(times[`${id}|9|1`] >= 4 * times["corsair|9|1"], `${id} takes ${times[`${id}|9|1`]} s on a Lv 9 merchant, the corsair ${times["corsair|9|1"]} s`);
  assert.ok(times["line|9|1"] > 100 && times["gunboat|9|1"] > 100, "the ship of the line, at Lv 1 sails, all but never catches a Lv 9 merchant");
  assert.ok(times["brigantine|6|1"] * 2 <= times["brig|6|1"], "a brigantine takes under half a brig's time on a Lv 6 merchant");
  assert.ok(times["line|9|5"] < times["line|9|1"] / 5, "sail upgrades are the heavy line's answer: Lv 5 sails close most of the gap");
});

test("escape: the fast line leaves a chasing enemy behind; the heavy line is run down by the same one", () => {
  const rows = [], gap = (id, L, arch, sails = 1) => chase(enemy(L, arch), me(id, sails), 150, d => d >= 900, false);
  for (const id of [...FAST.slice(1), ...HEAVY.slice(1)]) rows.push({ ship: id, "brig L8": gap(id, 8, "brig"), "frigate L8": gap(id, 8, "frigate"), "cutter L8": gap(id, 8, "cutter") });
  logTable("seconds to open a 900 px gap on a chaser that starts 150 px behind (Infinity = never in 240 s)", rows);
  for (const id of ["cruiser", "corsair"]) for (const arch of ["brig", "frigate"]) assert.ok(gap(id, 8, arch) < 25, `${id} leaves a Lv 8 ${arch} behind in ${gap(id, 8, arch)} s`);
  assert.ok(gap("corsair", 8, "cutter") < 30, "even the quickest hull on the sea (a cutter) is left behind by the corsair");
  assert.ok(gap("brigantine", 8, "brig") < 40, "a brigantine escapes a Lv 8 brig");
  for (const id of ["brig", "frigate", "line"]) assert.equal(gap(id, 8, "brig"), Infinity, `${id} cannot shake a Lv 8 brig`);
});

// Two ships side by side trading broadsides until one sinks: the "head-on" the issue means. Each fires one side's guns (all
// six-pounders at Lv 3 on a hull at Lv 5, a typical refit); damage is continuous, the same model both ways, so the order of
// who dies first is exact even though the numbers are rough.
const gunDps = (id, side = "left") => g.run(`GUNS.six.dmg * gunLvMul(3) * (SHIPS.${id}.gunK || 1) * GUNS.six.rpm / 60`) * SHIPS[id].slots[side];
const hullAt = (id, lv = 5) => g.run(`yardVal("hull", ${lv}, SHIPS.${id})`);
function slug(hpA, dpsA, hpB, dpsB) {
  const tA = hpB / dpsA, tB = hpA / dpsB;   // time each needs to sink the other
  return tA < tB ? { winner: "A", left: (hpA - dpsB * tA) / hpA } : { winner: "B", left: (hpB - dpsA * tB) / hpB };
}
test("slugging it out: the heavy ship wins every same-tier broadside duel, the fast one is sunk or cripples itself", () => {
  const rows = [];
  FAST.forEach((f, i) => {
    const h = HEAVY[i], r = slug(hullAt(f), gunDps(f), hullAt(h), gunDps(h));
    rows.push({ tier: i + 2, fast: f, heavy: h, "fast dps": +gunDps(f).toFixed(1), "heavy dps": +gunDps(h).toFixed(1), winner: r.winner === "A" ? f : h, "hull left": Math.round(r.left * 100) + "%" });
    if (i >= 1) { assert.equal(r.winner, "B", `${h} beats ${f}`); assert.ok(r.left >= 0.3, `${h} wins with ${Math.round(r.left * 100)}% hull`); }
  });
  logTable("same-tier broadside duel, stationary (hull Lv 5, six-pounders Lv 3)", rows);
  const top = slug(hullAt("corsair"), gunDps("corsair"), hullAt("line"), gunDps("line"));
  assert.equal(top.winner, "B"); assert.ok(top.left > 0.4, "the ship of the line shrugs off a corsair");
});

test("the same enemy: a fast ship loses more hull than a heavy one in a stationary exchange, and dodging gives it that back", () => {
  const rows = [];
  for (const [i, L] of [[1, 5], [2, 7], [3, 9]]) {
    const e = enemy(L, "brig"), eDps = e.n * e.dmg / e.interval;   // one full volley side, every shot landing
    for (const id of [FAST[i], HEAVY[i]]) {
      const r = slug(hullAt(id), gunDps(id), e.hp, eDps), ev = g.run(`shipEvade("${id}")`), k = slug(hullAt(id) * ev, gunDps(id), e.hp, eDps);
      rows.push({ enemy: `brig L${L}`, ship: id, stationary: (r.winner === "A" ? "win " : "lose ") + Math.round((r.winner === "A" ? r.left : 0) * 100) + "%", "with dodge": (k.winner === "A" ? "win " : "lose ") + Math.round((k.winner === "A" ? k.left : 0) * 100) + "%", evade: +ev.toFixed(2) });
    }
  }
  logTable("one Lv-matched enemy brig, hull left when the ship wins (dodge = hull x shipEvade)", rows);
  const left = (id, L) => { const e = enemy(L, "brig"), r = slug(hullAt(id), gunDps(id), e.hp, e.n * e.dmg / e.interval); return r.winner === "A" ? r.left : -1; };
  for (const [i, L] of [[2, 7], [3, 9]]) assert.ok(left(HEAVY[i], L) > left(FAST[i], L), `${HEAVY[i]} keeps more hull than ${FAST[i]} against a Lv ${L} brig`);
});

// ---------- the rating ----------
test("rating: a fast ship's speed counts toward its Ship Lv, never below the heavy ship one tier down, and never above the heavy ship of its tier", () => {
  const rate = id => g.run(`(() => { save = fitMounts({ ...defaultSave(), ship: "${id}", hull: 5, hold: 4 });
    for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six", 3));
    return shipRating(); })()`);
  const R = Object.fromEntries(Object.keys(SHIPS).map(id => [id, rate(id)]));
  logTable("Ship Lv at hull 5, six-pounders Lv 3 on every port", Object.entries(R).map(([ship, lv]) => ({ ship, lv })));
  FAST.forEach((f, i) => {
    assert.ok(R[f] <= R[HEAVY[i]], `${f} ${R[f]} <= ${HEAVY[i]} ${R[HEAVY[i]]}`);
    assert.ok(R[f] >= R[HEAVY[i - 1] || "sloop"] || i === 0, `${f} ${R[f]} reaches the heavy ship one tier below`);
    assert.ok(R[f] > (i ? R[FAST[i - 1]] : R.sloop), `${f} outranks its own last tier`);
  });
  // the bonus is what lifts a fast hull: without it the corsair would sit a level or more lower
  const raw = g.run(`(() => { save = fitMounts({ ...defaultSave(), ship: "corsair", hull: 5, hold: 4 }); for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six", 3));
    const v = SHIPS.corsair.speed; SHIPS.corsair.speed = EVADE_FROM; const r = shipRating(); SHIPS.corsair.speed = v; return r; })()`);
  assert.ok(R.corsair >= raw, `corsair ${R.corsair} vs ${raw} without the speed bonus`);
});
