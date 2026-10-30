// AI fleets in headless Chrome (js/fleet.js): fleets spawn in all three kinds under the caps, hold formation, fan out or form
// a line on the player, react when the lead sinks, never pile up on an island, come out the same from the same seed, and
// cost no page errors. Saves formation pictures to <outDir> (default .review/fleet, not committed).
// Usage: node tests/fleet.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/fleet";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const SAVE = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 2 }, escortGift: "had" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
await page.goto(url, { waitUntil: "load" }); await ready();
await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-lang", "en"); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); }, SAVE);
await page.reload({ waitUntil: "load" }); await ready();
const ev = (fn, arg) => page.evaluate(fn, arg);

// Test rig, in the page: open water at a ring, fixed-step frames, player parked and made unkillable.
await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.openAt = (ring, near = 420, skip = 0) => {   // a point in the ring with no island within `near`
    for (let a = 0, n = 0; a < 200; a++) { const p = polarPt(a * 0.37, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near) && n++ >= skip) return p; }
    return polarPt(0, ringMid(ring));
  };
  window.ringPt = (da) => { const a = Math.atan2(player.y - PORT.y, player.x - PORT.x), r = dist(player, PORT); return polarPt(a + da / r, r); };   // da px along the player's own ring
  window.pin = e => { e.angry = 1e6; return e; };   // the sea may not retire it (js/world-seas.js managePopulation)
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; spawnT = 1e9; };   // an empty sea for a staged scene
  window.park = p => { Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 }); player.spr.setPosition(p.x, p.y); };
  window.depart = () => { spawnT = 0; document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  window.sig = () => fleets.filter(fleetLive).map(f => f.type + ":" + f.ships.filter(s => s.alive).map(s => s.cls).join("+")).sort().join("|");
  depart();
});

console.log("Spawning: all three kinds, under the caps");
const seen = new Set(); let capOk = true, capDetail = "", maxFleets = 0, maxShips = 0, sizes = new Set(), allSized = true;
for (let i = 0; i < 60 && (seen.size < 3 || i < 12); i++) {
  const r = await ev(i => {
    park(openAt(2 + (i % 8), 300, i)); depart(); resetEnemies(S); stepN(2);
    const live = fleets.filter(fleetLive), ordinary = enemies.filter(e => e.alive && isOrdinary(e)).length;
    const inFleets = live.reduce((a, f) => a + f.ships.filter(s => s.alive).length, 0);
    return { types: live.map(f => f.type), n: live.length, inFleets, ordinary, sizes: live.map(f => f.ships.filter(s => s.alive).length),
      okSize: live.every(f => f.ships.filter(s => s.alive).length >= 2 && f.ships.filter(s => s.alive).length <= fleetMaxSize(f.lead.ring)),
      sameFaction: live.every(f => f.ships.every(s => s.faction === f.lead.faction && s.L === f.lead.L)),
      wingFire: live.every(f => f.ships.every(s => s === f.lead || s.fireMul === 0.8)) && live.every(f => f.lead.fireMul === undefined) };
  }, i);
  r.types.forEach(t => seen.add(t)); r.sizes.forEach(s => sizes.add(s));
  maxFleets = Math.max(maxFleets, r.n); maxShips = Math.max(maxShips, r.inFleets);
  if (r.n > 4 || r.inFleets > 14 || r.ordinary > 30) { capOk = false; capDetail = JSON.stringify(r); }
  if (!r.okSize || !r.sameFaction || !r.wingFire) { allSized = false; capDetail = JSON.stringify(r); }
}
check(["wolfpack", "patrol", "convoy"].every(t => seen.has(t)), `departures bring wolfpacks, navy patrols and convoys (${[...seen]})`);
check(capOk, `never more than 4 fleets / 14 fleet ships / 30 ordinary ships (peak ${maxFleets} fleets, ${maxShips} ships) ${capDetail}`);
check(allSized && sizes.size >= 2, `fleets are 2-5 ships of one faction and level, wingmen fire at 80% (sizes ${[...sizes].sort()}) ${allSized ? "" : capDetail}`);

console.log("Formation held at sea");
const held = await ev(() => {
  const rows = [];
  for (const type of ["wolfpack", "patrol", "convoy"]) {
    park(openAt(5, 900)); depart(); clearSea();
    const p = openAt(5, 500, 3), face = Math.atan2(PORT.y - p.y, PORT.x - p.x) + Math.PI / 2;
    const T = FLEET_TYPES[type], classes = type === "convoy" ? ["fluyt", "fluyt", "brig"] : type === "patrol" ? ["brig", "brig", "brig"] : ["cutter", "cutter", "cutter"];
    const lead = makeEnemy(S, p.x, p.y, 5, T.faction, type === "convoy" ? "fluyt" : type === "patrol" ? "frigate" : "brig");
    lead.rot = face; lead.speed = lead.maxSpeed * 0.5;
    const ws = classes.map((c, i) => { const q = slotWorld(lead, formationSlots(T.formation, 3)[i]); const e = makeEnemy(S, q.x, q.y, 5, T.faction, c); e.rot = face; if (c === "brig" && type === "convoy") e.escort = true; return e; });
    const f = makeFleet(type, [lead, ...ws]); f.ships.forEach(pin);
    park({ x: p.x + 1900 * Math.cos(face + 1.2), y: p.y + 1900 * Math.sin(face + 1.2) });   // far off: nobody fights
    const samples = []; let worst = 0;
    for (let i = 0; i < 15; i++) { stepN(60); if (i >= 3) for (const w of ws) { samples.push(w.strayD); worst = Math.max(worst, w.strayD); } }
    rows.push({ type, left: ws.filter(w => w.alive && w.fleet === f).length, near: Math.round(100 * samples.filter(d => d < 200).length / samples.length), worst: Math.round(worst), moved: Math.round(Math.hypot(lead.x - p.x, lead.y - p.y)) });
  }
  return rows;
});
for (const r of held) check(r.left === 3 && r.near >= 70 && r.worst < 700, `${r.type}: 3 wingmen stay with the lead for 15 s (${r.near}% of samples within 200px of the slot, worst ${r.worst}px)`);

console.log("Engaging the player");
const shotFleet = async (name, setup) => {
  await ev(setup);
  await ev(() => { S.cameras.main.setZoom(0.55); S.cameras.main.centerOn(player.x, player.y); });
  await page.screenshot({ path: join(out, name + ".png") });
};
const eng = await ev(() => {
  const rows = [];
  for (const type of ["wolfpack", "patrol"]) {
    park(openAt(5, 1150)); depart(); clearSea();
    const T = FLEET_TYPES[type], p = ringPt(480);
    const lead = makeEnemy(S, p.x, p.y, 5, T.faction, type === "patrol" ? "frigate" : "brig");
    lead.rot = Math.atan2(player.y - p.y, player.x - p.x);
    const ws = [0, 1, 2].map(i => { const q = slotWorld(lead, formationSlots(T.formation, 3)[i]); const e = makeEnemy(S, q.x, q.y, 5, T.faction, type === "patrol" ? "brig" : "cutter"); e.rot = lead.rot; return e; });
    huntT = 1e9;   // no hunters on top of the patrol (#120: the Navy opens fire only from two stars, so heat is held up in the loop)
    const f = makeFleet(type, [lead, ...ws]);
    window["fleet_" + type] = f;
    const spread = () => { const a = f.ships.filter(s => s.alive).map(s => Math.atan2(s.y - player.y, s.x - player.x)); const m = a[0]; const d = a.map(x => angDiff(x, m)); return Math.max(...d) - Math.min(...d); };
    let best = 0;
    for (let i = 0; i < 12; i++) {
      heat = 100; heatQuiet = 0; stepN(30);
      best = Math.max(best, spread());
    }
    rows.push({ type, info: f.ships.map(s => (s.target === player ? 'T' : s.target ? 't:' + s.target.faction + s.target.cls + s.target.alive : '-') + (s.ignore.size ? 'i' : '') + (s.fleet ? 'f' : '') + Math.round(dist(s, player))).join(' '), targeted: f.ships.filter(s => s.alive && s.target === player).length, spread: +best.toFixed(2), alive: f.ships.filter(s => s.alive).length });
  }
  return rows;
});
for (const r of eng) check(r.targeted >= 3, `${r.type}: the fleet turns on the player together (${r.targeted} of ${r.alive} ships have it targeted: ${r.info})`);
check(eng[0].spread > 0.5, `wolfpack wingmen fan out around the target (bearing spread ${eng[0].spread} rad)`);
await shotFleet("wolfpack-engage", () => { stepN(1); });
await shotFleet("patrol-engage", () => { stepN(1); });

console.log("Formation pictures, at sea");
const pics = [];
for (const type of ["wolfpack", "patrol", "convoy"]) {
  await ev(type => {
    park(openAt(5, 1150)); depart(); clearSea();
    const T = FLEET_TYPES[type], p = { x: player.x + 300, y: player.y - 40 };
    const lead = makeEnemy(S, p.x, p.y, 5, T.faction, type === "convoy" ? "fluyt" : type === "patrol" ? "frigate" : "brig");
    lead.rot = Math.PI * 0.55;
    const cl = type === "convoy" ? ["fluyt", "fluyt", "fluyt", "brig"] : type === "patrol" ? ["brig", "brig", "frigate", "brig"] : ["cutter", "cutter", "brig", "cutter"];
    const ws = cl.map((c, i) => { const q = slotWorld(lead, formationSlots(T.formation, 4)[i]); const e = makeEnemy(S, q.x, q.y, 5, T.faction, c); e.rot = lead.rot; return e; });
    makeFleet(type, [lead, ...ws]);
    for (const e of enemies) if (e.alive && !e.fleet) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); }
    stepN(2);
    for (const e of enemies) { e.spr.setPosition(e.x, e.y).setRotation(e.rot); }
    hideSeaBanner(); S.cameras.main.setZoom(0.8); S.cameras.main.centerOn(p.x, p.y);
  }, type);
  await page.screenshot({ path: join(out, "formation-" + type + ".png") }); pics.push(type);
}
check(pics.length === 3, "formation pictures saved to " + out);

console.log("Losing the lead");
const loss = await ev(() => {
  const rows = [];
  for (const type of ["wolfpack", "patrol", "convoy"]) {
    park(openAt(5, 1150)); depart(); clearSea();
    const T = FLEET_TYPES[type], p = ringPt(500);
    const lead = makeEnemy(S, p.x, p.y, 5, T.faction, type === "convoy" ? "fluyt" : "brig"); lead.rot = Math.atan2(player.y - p.y, player.x - p.x);
    const cl = type === "convoy" ? ["fluyt", "fluyt", "brig"] : ["brig", "brig", "brig", "brig"];
    const ws = cl.map((c, i) => { const q = slotWorld(lead, formationSlots(T.formation, cl.length)[i]); const e = makeEnemy(S, q.x, q.y, 5, T.faction, c); e.rot = lead.rot; if (type === "convoy" && c === "brig") e.escort = true; return e; });
    const f = makeFleet(type, [lead, ...ws]);
    sink(lead, player);
    const now = S.time.now / 1000;
    const kinds = ws.map(w => w.rageT > now ? "charge" : w.scatterT > now ? "scatter" : "none");
    const d0 = ws.map(w => dist(w, player));
    stepN(120);
    const d1 = ws.map(w => dist(w, player));
    stepN(180);
    const d2 = ws.map(w => dist(w, player));
    rows.push({ type, info: ws.map(w => [w.target === player ? 'T' : w.target ? 't' + w.target.faction + w.target.cls + (w.target.alive ? '' : 'X') + (w.target === w ? 'self' : '') : '-', w.rageT > S.time.now / 1000 ? 'R' : '', w.unstickT > S.time.now / 1000 ? 'U' : '', w.fleet ? 'f' : '', w.alive ? '' : 'X', Math.round(w.speed)].join('')), d0: d0.map(Math.round), d1: d1.map(Math.round), kinds, closing: ws.map((w, i) => d1[i] < d0[i] - 40 || d1[i] < 300), opening: ws.map((w, i) => d2[i] > d0[i] + 40), lost: f.lost, fleetOver: ws.every(w => w.fleet === f) });
  }
  return rows;
});
const L = Object.fromEntries(loss.map(r => [r.type, r]));
check(L.wolfpack.lost && L.wolfpack.kinds.includes("charge") && L.wolfpack.kinds.includes("scatter") && !L.wolfpack.kinds.includes("none"), `wolfpack: some charge and some scatter when the lead sinks (${L.wolfpack.kinds})`);
check(L.patrol.kinds.every(k => k === "charge"), `navy patrol: every wingman charges the killer (${L.patrol.kinds})`);
check(L.convoy.kinds.join() === "scatter,scatter,charge", `convoy: the fluyts scatter, the escort charges (${L.convoy.kinds})`);
const chargers = r => r.kinds.map((k, i) => k === 'charge' ? r.closing[i] : null).filter(v => v !== null), runners = r => r.kinds.map((k, i) => k === 'scatter' ? r.opening[i] : null).filter(v => v !== null);
check(chargers(L.patrol).every(Boolean) && chargers(L.wolfpack).every(Boolean) && runners(L.wolfpack).every(Boolean) && runners(L.convoy).every(Boolean), `chargers close on the player and scatterers run (patrol ${L.patrol.d0} -> ${L.patrol.d1}, wolfpack ${L.wolfpack.d0} -> ${L.wolfpack.d1}) ${L.wolfpack.kinds}`);

console.log("Hit one, all answer");
const alarm = await ev(() => {
  park(openAt(5, 1150)); depart(); clearSea();
  const p = { x: player.x + 1500, y: player.y }, T = FLEET_TYPES.patrol;
  const lead = makeEnemy(S, p.x, p.y, 5, "navy", "frigate");
  const ws = [0, 1].map(i => { const q = slotWorld(lead, formationSlots("line", 2)[i]); return makeEnemy(S, q.x, q.y, 5, "navy", "brig"); });
  makeFleet("patrol", [lead, ...ws]);
  hurt(ws[0], 5, 0, player);
  return ws.concat([lead]).filter(s => s.attacker === player && s.angry > 0).length;
});
check(alarm === 3, `shooting a wingman turns the whole fleet on the shooter (${alarm} of 3 ships)`);

console.log("Not stuck on islands");
const stuck = await ev(() => {
  const res = [];
  for (let trial = 0; trial < 4; trial++) {
    park(openAt(2 + trial * 2, 600, trial)); depart(); resetEnemies(S);
    park({ x: 300, y: 300 });   // far corner: nothing fights, the sea keeps its own order
    const live = fleets.filter(fleetLive); live.forEach(f => f.ships.forEach(pin));
    stepN(1800);
    const snap = () => new Map(live.flatMap(f => f.ships.filter(s => s.alive).map(s => [s, { x: s.x, y: s.y }])));
    const p0 = snap(); stepN(720); const p1 = snap(); stepN(720);   // two windows of 12 s: a ship may pause once, not stay put
    for (const f of live) for (const s of f.ships) if (s.alive && p0.has(s) && p1.has(s) && !s.target) {   // a ship in a fight circles its quarry as it likes; this is about ships under way
      const m1 = Math.hypot(p1.get(s).x - p0.get(s).x, p1.get(s).y - p0.get(s).y), m2 = Math.hypot(s.x - p1.get(s).x, s.y - p1.get(s).y);
      res.push({ moved: Math.round(Math.max(m1, m2)), inRock: islands.some(i => Math.hypot(i.x - s.x, i.y - s.y) < i.r * 0.9), type: f.type, cls: s.cls, x: Math.round(s.x), y: Math.round(s.y) });
    }
  }
  return res;
});
const frozen = stuck.filter(r => r.moved < 40 || r.inRock);
check(stuck.length >= 6 && frozen.length === 0, `${stuck.length} fleet ships watched for 24 s after 30 s at sea: none stayed put through two 12 s windows or sits inside a rock (${frozen.length} stuck) ${JSON.stringify(frozen)}`);

console.log("Seeded generation");
const seeded = await ev(() => {
  const run = () => { setGenRng(mulberry32(20261024)); park(openAt(5, 600)); depart(); resetEnemies(S); const s = sig(); setGenRng(null); return s; };
  const a = run(), b = run(), c = (() => { setGenRng(mulberry32(7)); park(openAt(5, 600)); depart(); resetEnemies(S); const s = sig(); setGenRng(null); return s; })();
  return { a, b, c };
});
check(seeded.a === seeded.b && seeded.a.length > 0, `the same seed raises the same fleets (${seeded.a.slice(0, 80)})`);
check(seeded.a !== seeded.c, "another seed raises other fleets");

console.log("Chart");
const chart = await ev(() => { depart(); park(openAt(5, 600)); resetEnemies(S); stepN(5); let ok = true; try { hud(true); } catch (e) { ok = false; } return { ok, fleets: fleets.filter(fleetLive).length }; });
check(chart.ok, `the chart draws with ${chart.fleets} fleets at sea`);

check(errors.length === 0, `no page errors${errors.length ? " -> " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
console.log("\nfleet: all checks passed");
