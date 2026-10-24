// Collision damage in headless Chrome (js/collision.js): hugging an island or the harbor costs nothing, a full-speed rock
// hurts but does not kill, ramming a ship hurts both (the heavy hull less), AI ships collide with each other too, and AI
// ships don't wreck themselves on islands over and over. Pure formulas are in tests/unit-collision.mjs.
// Usage: node tests/collision.mjs [url]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [], errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
const save = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [] });
await page.goto(url, { waitUntil: "load" });
await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false })); }, save);
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
await page.evaluate(() => { if (!docked) dock("welcome"); });
await page.evaluate(() => setSail());
await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
await page.evaluate(() => {
  window.__think = think; window.think = () => {};   // AI frozen: the test steers every ship itself
  window.__land = []; const land = crashLand; window.crashLand = (s, dmg, src, ...r) => { window.__land.push({ s, dmg, src }); return land(s, dmg, src, ...r); };
  window.__gone = list => { for (const s of list) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); } };
  window.spawnEnemy = () => null;   // no new ships join the sea mid-test
  __gone(enemies.slice());   // only the ships a check places itself are afloat, so nothing else can shoot or sink them
  save.tutorialDone = true; tutorialReset();
});
const wait = ms => page.waitForTimeout(ms * SLOW);

// the island nearest the harbor but outside its safe waters and away from the outpost, and a point d px off it, port side
const approach = (d, speedK) => page.evaluate(([d, speedK]) => {
  const isl = islands.filter(i => !i.outpost && Math.hypot(i.x - PORT.x, i.y - PORT.y) > SAFE_R + 300)
    .sort((a, b) => Math.hypot(a.x - PORT.x, a.y - PORT.y) - Math.hypot(b.x - PORT.x, b.y - PORT.y))[0];
  const a = Math.atan2(isl.y - PORT.y, isl.x - PORT.x), R = isl.r * 0.9 + (player.hw ?? 13) + 5;
  Object.assign(player, { x: isl.x + Math.cos(a) * (R + d), y: isl.y + Math.sin(a) * (R + d), rot: a + Math.PI, hp: player.maxHp, alive: true });
  player.crashBook = new Map(); window.__land.length = 0;
  clearInterval(window.__drive);
  window.__drive = setInterval(() => { player.rot = a + Math.PI; player.speed = player.maxSpeed * speedK; }, 8);
  return { maxHp: player.maxHp, maxSpeed: player.maxSpeed };
}, [d, speedK]);
const stop = () => page.evaluate(() => clearInterval(window.__drive));

// 1. slow: touching an island at a crawl costs nothing
await approach(60, 0.15); await wait(1800); await stop();
let r = await page.evaluate(() => ({ hp: player.hp, maxHp: player.maxHp, hits: window.__land.length }));
check(r.hp === r.maxHp && r.hits === 0, `slow touch of an island: no damage (hp ${r.hp.toFixed(1)}/${r.maxHp}, ${r.hits} blows)`);

// 2. full speed: it hurts, not every frame, and does not kill
const info = await approach(160, 1); await wait(2600); await stop();
r = await page.evaluate(() => ({ hp: player.hp, maxHp: player.maxHp, alive: player.alive, hits: window.__land.filter(l => l.s === player).length, first: window.__land.length ? window.__land[0].dmg : 0 }));
const lostPct = 100 * r.first / r.maxHp;
check(r.alive && lostPct >= 8 && lostPct < 40 && r.hp > 0, `full speed into an island: the first blow is clearly felt but far from fatal (${lostPct.toFixed(1)}% of ${r.maxHp}, top speed ${info.maxSpeed}; hp left ${r.hp.toFixed(0)})`);
check(r.hits >= 1 && r.hits <= 3, `the same rock does not bleed the ship every frame (${r.hits} blows in 2.6 s, cooldown 0.8 s)`);

// 3. a crippled hull (under the spare line) can be finished by rock
await approach(160, 1); await page.evaluate(() => { player.hp = player.maxHp * 0.05; }); await wait(2200); await stop();
r = await page.evaluate(() => ({ alive: player.alive, hp: player.hp, maxHp: player.maxHp }));
check(r.hp < r.maxHp * 0.05 || !r.alive, `a crippled hull can be finished by rock (hp ${r.hp.toFixed(1)}, alive ${r.alive})`);
await wait(2500);   // let the respawn and the ledger come up, then back to sea
await page.evaluate(() => { if (docked) setSail(); player.alive = true; player.hp = player.maxHp; });

// 4. harbor island: full speed into it, no damage
await page.evaluate(() => {
  if (docked) setSail();
  Object.assign(player, { x: PORT.x + 200, y: PORT.y, rot: Math.PI, hp: player.maxHp, alive: true }); player.crashBook = new Map(); window.__land.length = 0;
  window.__drive = setInterval(() => { player.rot = Math.PI; player.speed = player.maxSpeed; if (docked) { docked = false; paused = false; } }, 8);
});
await wait(1800); await stop();
r = await page.evaluate(() => ({ hp: player.hp, maxHp: player.maxHp, hits: window.__land.length }));
check(r.hp === r.maxHp && r.hits === 0, `full speed into the harbor island: no damage (hp ${r.hp.toFixed(1)}/${r.maxHp}, ${r.hits} blows)`);

// 5. ships ramming ships: the player (sloop) rams a heavy man-of-war and then a light cutter, both lying still
const ram = cls => page.evaluate(async cls => {
  const x0 = 1500, y0 = 1500, e = makeEnemy(S, x0 + 200, y0, 5, "pirate", cls), list = [e];
  e.speed = 0; e.rot = 0; e.hp = e.maxHp; window.__land.length = 0;
  Object.assign(player, { x: x0, y: y0, rot: 0, hp: player.maxHp, alive: true }); player.crashBook = new Map();
  const drive = setInterval(() => { player.rot = 0; player.speed = player.maxSpeed; e.speed = 0; }, 8);
  await new Promise(r => setTimeout(r, 2200)); clearInterval(drive); player.speed = 0;
  const f = o => { const l = window.__land.find(x => x.s === o); return l ? l.dmg / o.maxHp : 0; };
  const out = { pl: f(player), en: f(e), enAlive: e.alive, plAlive: player.alive, mass: [hullMass(player), hullMass(e)] };
  __gone(list);
  return out;
}, cls);
const heavy = await ram("manowar"), light = await ram("cutter");
const pct = x => (x * 100).toFixed(1) + "%", masses = o => o.mass.map(m => m.toFixed(2)).join(" vs ");
check(heavy.pl > 0 && heavy.en > 0, `ramming a man-of-war hurts both (player ${pct(heavy.pl)}, enemy ${pct(heavy.en)})`);
check(light.pl > 0 && light.en > 0, `ramming a cutter hurts both (player ${pct(light.pl)}, enemy ${pct(light.en)})`);
check(heavy.pl > heavy.en, `the heavy hull wins: the sloop loses more than the man-of-war (masses ${masses(heavy)})`);
check(light.en > light.pl, `the light hull loses: the cutter loses more than the sloop (masses ${masses(light)})`);
check(heavy.plAlive && light.plAlive && heavy.enAlive && light.enAlive, "nobody died of a single ramming");

// 5b. a slow touch between ships (under the speed threshold) still costs a little, both sides
const touch = await page.evaluate(async () => {
  const x0 = 1500, y0 = 1500, e = makeEnemy(S, x0 + 60, y0, 5, "pirate", "brig"), list = [e];
  e.speed = 0; e.rot = 0; e.hp = e.maxHp; window.__land.length = 0;
  Object.assign(player, { x: x0, y: y0, rot: 0, hp: player.maxHp, alive: true }); player.crashBook = new Map();
  const drive = setInterval(() => { player.rot = 0; player.speed = player.maxSpeed * 0.15; e.speed = 0; }, 8);
  await new Promise(r => setTimeout(r, 1500)); clearInterval(drive); player.speed = 0;
  const out = { pl: player.maxHp - player.hp, en: e.maxHp - e.hp, blows: window.__land.length };
  __gone(list); return out;
});
check(touch.pl > 0 && touch.en > 0 && touch.pl < 8, `a slow touch between ships costs a little (player ${touch.pl.toFixed(1)} hp, enemy ${touch.en.toFixed(1)} hp: a few bumps, never a wreck)`);

// 6. AI against AI: two hulls meeting head-on both take damage
const ai = await page.evaluate(async () => {
  const a = makeEnemy(S, player.x - 80, player.y - 400, 5, "pirate", "brig"), b = makeEnemy(S, player.x + 80, player.y - 400, 5, "navy", "frigate"), list = [a, b];
  for (const s of list) { s.hp = s.maxHp; s.speed = 0; }
  a.rot = 0; b.rot = Math.PI; window.__land.length = 0;
  const drive = setInterval(() => { a.speed = a.maxSpeed; b.speed = b.maxSpeed; }, 8);
  await new Promise(r => setTimeout(r, 1800)); clearInterval(drive); a.speed = b.speed = 0;
  const f = o => { const l = window.__land.find(x => x.s === o); return l ? l.dmg / o.maxHp : 0; };
  const out = { a: f(a), b: f(b), blows: window.__land.length, pos: [a.x, a.y, b.x, b.y, a.speed], alive: a.alive && b.alive };
  __gone(list);
  return out;
});
check(ai.a > 0 && ai.b > 0 && ai.alive, `AI against AI: both hurt, both afloat (brig ${pct(ai.a)}, frigate ${pct(ai.b)}; ${JSON.stringify(ai.pos)})`);

// 7. a fireship's contact is its own explosion: no collision damage on top
const fire = await page.evaluate(() => {
  const f = makeEnemy(S, 1800, 1800, 5, "pirate", "fireship"), o = makeEnemy(S, 1900, 1800, 5, "navy", "brig"), list = [f, o];
  f.vx = 150; window.__land.length = 0; crashShips(f, o, 1, 0); const n = window.__land.length;
  __gone(list); return n;
});
check(fire === 0, "a fireship's contact is not counted twice as a collision");

// 8. AI avoidance: AI ships released beside islands, aimed straight at them, do not keep ramming them
await page.evaluate(() => { window.think = window.__think; });
const wreck = await page.evaluate(async () => {
  // ships far from the player are culled (js/world-seas.js), so the player sails to the islands first
  const open = islands.filter(i => !i.outpost && Math.hypot(i.x - PORT.x, i.y - PORT.y) > SAFE_R + 200);
  Object.assign(player, { x: open[0].x, y: open[0].y + open[0].r + 250, speed: 0 });
  const list = [], isls = open.filter(i => Math.hypot(i.x - player.x, i.y - player.y) < 1100).slice(0, 6);
  isls.forEach((isl, k) => {
    const a = k * 1.1, R = isl.r * 0.9 + 18 + 5;
    const e = makeEnemy(S, isl.x + Math.cos(a) * (R + 150), isl.y + Math.sin(a) * (R + 150), 4, "pirate", "brig");
    e.rot = a + Math.PI; e.speed = e.maxSpeed; e.wander = { x: isl.x - Math.cos(a) * 600, y: isl.y - Math.sin(a) * 600 }; e.thinkT = 60;   // wants to go straight through the rock
    list.push(e);
  });
  window.__land.length = 0;
  await new Promise(r => setTimeout(r, 16000));
  const out = list.map(e => ({ alive: e.alive, crashes: window.__land.filter(l => l.s === e && !l.src).length, shipHits: window.__land.filter(l => l.s === e && l.src).length, hp: e.hp / e.maxHp, burn: e.burnT, cls: e.cls }));
  __gone(list);
  return out;
});
const worst = Math.max(...wreck.map(w => w.crashes)), total = wreck.reduce((n, w) => n + w.crashes, 0);
check(wreck.every(w => w.alive || (w.crashes === 0 && w.shipHits === 0)), `no AI ship was sunk by a collision in 16 s beside islands (${wreck.length} ships; hp ${wreck.map(w => Math.round(w.hp * 100)).join(",")}%)`);
check(worst <= 2, `AI does not ram the same coast again and again: crashes per ship ${wreck.map(w => w.crashes).join(",")} (total ${total}, worst ${worst})`);

check(errors.length === 0, `no page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.log(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\ncollision: all checks passed");
