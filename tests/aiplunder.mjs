// AI plunder checks in headless Chrome (js/ai-plunder.js): an idle pirate sails to loose loot and takes it, levels up at the price,
// carries what it took and drops it when sunk, a fighting ship ignores loot, a daily run switches it off, and the next departure
// starts every ship at its designed level. Usage: node tests/aiplunder.mjs [url]
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
await page.goto(url, { waitUntil: "load" }); await ready();
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("privateers-save-v2", JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], settings: { muted: true } })); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); });
await page.reload({ waitUntil: "load" }); await ready();
const sail = () => page.evaluate(() => { if (!docked) { sendHome(); dock("return"); } setSail(); });

// One pirate alone in open water far from the harbor; every other ship sent to the far corner. Returns the spot.
const isolate = () => page.evaluate(() => {
  let spot = null;
  for (let x = 1200; x < W - 300 && !spot; x += 300) for (let y = 600; y < H - 300 && !spot; y += 300)
    if (Math.hypot(x - PORT.x, y - PORT.y) > SAFE_R + 900 && !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 700)) spot = { x, y };
  const e = enemies.find(o => o.alive && o.faction === "pirate" && !o.boss && !o.escortOf && o.A && !o.A.boom);
  for (const o of enemies) if (o !== e) { o.x = spot.x > W / 2 ? 200 : W - 200; o.y = spot.y > H / 2 ? 200 : H - 200; o.spr.setPosition(o.x, o.y); }
  Object.assign(e, { x: spot.x, y: spot.y, angry: 9999, target: null }); e.spr.setPosition(e.x, e.y);
  player.x = PORT.x + 140; player.y = PORT.y; player.hp = player.maxHp = 1e6;
  crates.length = 0; window.__e = e;
  return { spot, L: e.L, hp: e.maxHp, cost: aipCost(e.L, 0), cls: e.cls };
});
const wait = (fn, arg, ms = 25000) => page.waitForFunction(fn, arg, { timeout: ms * SLOW }).then(() => true, () => false);

console.log("Plunder and level up");
await sail();
const o = await isolate();
// a crate worth just under the price: taken, but no level
let r = await page.evaluate(() => { const e = window.__e; return { x: e.x, y: e.y }; });
await page.evaluate(([x, y, v]) => { window.__c = addCrate(x + 260, y + 80, v, null); window.__e.rot = 0; }, [r.x, r.y, o.cost - 1]);
check(await wait(() => window.__c.value === 0), "an idle pirate sails to a crate 270 px away and takes it");
r = await page.evaluate(() => { const e = window.__e; return { up: e.up || 0, stolen: e.stolen || 0, hp: e.maxHp }; });
check(r.stolen === o.cost - 1 && r.up === 0 && r.hp === o.hp, `loot just under the price (${o.cost - 1}/${o.cost}) is carried, no level yet`);

// a second crate crosses the price: one level
const lvBefore = await page.evaluate(() => window.__e.threatL);
const dmgBefore = await page.evaluate(() => window.__e.guns.left[0]?.dmg ?? window.__e.guns.bow[0]?.dmg ?? 0);
await page.evaluate(() => { const e = window.__e; window.__c = addCrate(e.x + 200, e.y - 100, 5, null); });
check(await wait(() => window.__c.value === 0), "a second crate is taken too");
r = await page.evaluate(() => { const e = window.__e; return { up: e.up, hp: e.maxHp, threat: e.threatL, text: e.badge.text, dmg: e.guns.left[0]?.dmg ?? e.guns.bow[0]?.dmg ?? 0, spent: e.spent }; });
check(r.up === 1, "crossing the price gives one level");
check(Math.abs(r.hp / o.hp - 1.12) < 1e-6, `hull grew by 12% (${o.hp.toFixed(1)} -> ${r.hp.toFixed(1)})`);
check(r.dmg === 0 || Math.abs(r.dmg / dmgBefore - 1.1) < 1e-6, `gun damage grew by 10% (${dmgBefore.toFixed(2)} -> ${r.dmg.toFixed(2)})`);
check(r.threat >= lvBefore + 1 && r.text.includes("Lv " + r.threat), `the badge reads a level higher (${r.text})`);

// sunk: everything it carried floats out as a crate
const carried = await page.evaluate(() => window.__e.stolen);
r = await page.evaluate(() => {
  const e = window.__e; crates.length = 0; player.x = e.x - 260; player.y = e.y; player.hp = player.maxHp = 1e6;
  hurt(e, e.maxHp * 10, 0, player);
  return { total: crates.filter(c => !c.wreck).reduce((n, c) => n + c.value, 0), base: e.loot };
});
check(carried === o.cost - 1 + 5, `it carried ${carried} (both crates)`);
check(r.total >= carried + Math.round(r.base * 0.6), `its crate holds the carried ${carried} on top of its own loot (${r.total})`);

console.log("Fighting ships and daily");
await sail(); await isolate();
r = await page.evaluate(() => {
  const e = window.__e; crates.length = 0; addCrate(e.x + 100, e.y, 50, null);
  e.target = { x: e.x + 300, y: e.y };   // a target inside AIP_BREAK
  const near = aipSeek(e, 300, 0.1);
  const far = aipSeek(e, AIP_BREAK + 100, 0.1);
  e.target = null;
  const idle = aipSeek(e, 0, 0.1);
  return { near, far: !!far, idle: !!idle };
});
check(r.near === null, "a ship with a target in range ignores loot");
check(r.far && r.idle, "a ship whose target is far, or that has none, goes for it");
r = await page.evaluate(() => { const e = window.__e; const before = aipOn(e); startRun("daily"); const during = enemies.every(o => !aipOn(o)); runLeave(); return { before, during }; });
check(r.before === true && r.during === true, "a daily run turns plunder off for every ship");

console.log("Next sortie");
await sail(); await isolate();
await page.evaluate(() => { const e = window.__e; e.stolen = 9999; aipGrow(e); });
check(await page.evaluate(() => window.__e.up === AIP_MAX_UP), "a rich pirate reaches the cap");
await page.evaluate(() => { sendHome(); dock("return"); setSail(); });
r = await page.evaluate(() => ({ n: enemies.length, grown: enemies.filter(e => e.up || e.stolen || e.spent).length, wrong: enemies.filter(e => !e.boss && !e.escortOf && !e.fixed && e.threatL < e.L - 3).length }));
check(r.n > 0 && r.grown === 0, `after returning to port and sailing again, no ship keeps its levels or loot (${r.n} ships)`);
check(await page.evaluate(() => !JSON.stringify(save).includes("stolen")), "nothing about it is saved");

check(errors.length === 0, `0 page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log("\nall ok");
