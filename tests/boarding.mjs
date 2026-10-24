// Boarding in headless Chrome (js/boarding.js, js/strike.js): a struck merchant can be boarded by lying alongside for 2 s
// (progress, gold, the prize gun into the gun store, the prize ship scuttled, no collision damage), a full gun store pays gold and
// keeps every gun, drifting off drains the progress, a beaten warship may strike and can be boarded, and a boss, an escort, a convoy
// escort and the tutorial target are never boarded even when struck. Pure rules are in tests/unit-boarding.mjs.
// Usage: node tests/boarding.mjs [url]     (exit 1 on any failed check or page error)
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
const save = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], store: [] });
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
  window.__gone = list => { for (const s of list) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); } };
  window.spawnEnemy = () => null;   // no new ships join the sea mid-test
  __gone(enemies.slice());
  save.tutorialDone = true; tutorialReset();
  window.__fixRnd = v => { window.boardRoll = () => v; window.surrenderRoll = () => v; };   // 0: every roll succeeds and picks the first gun; 0.99: every roll fails
  window.__freeRnd = () => { delete window.boardRoll; delete window.surrenderRoll; };
  // a ship at the player's side, pinned in place; the player is pinned too so the relative speed is nil
  window.__ship = (cls, faction, L = 3, extra = {}) => {
    const x0 = 1500, y0 = 1500, e = makeEnemy(S, x0, y0, L, faction, cls);
    Object.assign(e, { rot: 0, speed: 0, hp: e.maxHp, ...extra });
    return e;
  };
  window.__moor = (e, off = 6) => {   // the player lies on the prize's port side, hulls just apart
    const d = shipRadius(player) + shipRadius(e) + off;
    e.x = 1500; e.y = 1500; e.speed = 0; e.spr.setPosition(e.x, e.y);
    setSailLevel(0); Object.assign(player, { x: 1500, y: 1500 + d, rot: 0, speed: 0, hp: player.maxHp, alive: true });
    clearInterval(window.__drive);
    window.__drive = setInterval(() => { player.speed = 0; e.speed = 0; e.x = 1500; e.y = 1500; player.x = 1500; player.y = 1500 + d + (window.__off || 0); }, 8);   // the weather's lee drift would otherwise carry them apart
  };
  window.__off = 0;
});
const wait = ms => page.waitForTimeout(ms * SLOW);
const stop = () => page.evaluate(() => { clearInterval(window.__drive); window.__off = 0; });
const strike = (e = "E") => page.evaluate(e => { const s = window[e]; s.hp = s.maxHp * 0.3; hurt(s, 1, 0, player, null); return { struck: !!s.struck, alive: s.alive }; }, e);

console.log("Sound and strings exist");
check(await page.evaluate(() => typeof SND_SFX.board === "object" && !!STR.en.boardHint && !!STR.zh.boardHint && !!STR.zh.toastPrizeGun), "the boarding sound and both languages' strings are loaded");

console.log("A struck merchant: board her in about 2 s");
await page.evaluate(() => {
  window.E = __ship("fluyt", "merchant", 3, { loot: 200 }); __moor(E);
  window.__before = { gold: save.gold, store: save.store.length, sunk: save.sunk, streak, hp: player.hp };
  __fixRnd(0);   // a gun, and the first one the faction yields
});
check((await strike()).struck, "a beaten merchant strikes her colours");
check(await page.evaluate(() => !isHostile(E, player) && boardable(E) && E.lootWas === 200 && E.loot === 0), "she is no longer hostile, is boardable, and her cargo already went over the side");
await wait(900);
let r = await page.evaluate(() => ({ t: board.t, ship: board.ship === E, alive: E.alive, hp: player.hp, maxHp: player.maxHp }));
check(r.ship && r.t > 0.4 && r.t < 1.4 && r.alive, `progress climbs while alongside (${r.t.toFixed(2)} s of 2 after ~0.9 s)`);
check(r.hp === r.maxHp, `lying alongside is no collision: the player lost no hull (${r.hp}/${r.maxHp})`);
await wait(1700);
r = await page.evaluate(() => ({ alive: E.alive, boarded: !!E.boarded, gold: save.gold - __before.gold, store: save.store.slice(), n: save.store.length - __before.store, streak, hp: player.hp, maxHp: player.maxHp, persisted: JSON.parse(localStorage.getItem("privateers-save-v2")).store.length }));
await page.evaluate(() => __freeRnd());
check(r.boarded && !r.alive, "after 2 s the boarding completes and the prize is scuttled");
check(r.gold === 100, `the boarding party pays half her cargo in gold at once (${r.gold}, expected 100)`);
check(r.n === 1 && r.store[0].g === "six" && r.store[0].lv === 1, `the prize gun lands in the gun store (${JSON.stringify(r.store)})`);
check(r.persisted === 1, "the gun store is saved to disk");
check(r.hp === r.maxHp, "still no hull lost");
check(await page.evaluate(() => streak === __before.streak + 1), "the boarded ship counts toward the plunder streak");
await stop();

console.log("Drifting off drains the progress");
await page.evaluate(() => { window.E = __ship("fluyt", "merchant", 3, { loot: 100 }); __moor(E); __fixRnd(0.99); });
await strike(); await wait(1000);
const t1 = await page.evaluate(() => board.t);
await page.evaluate(() => { window.__off = 120; });   // the player slips 120 px away
await wait(900);
r = await page.evaluate(() => ({ t: board.t, alive: E.alive, boarded: !!E.boarded }));
check(t1 > 0.5 && r.t < t1 - 0.5 && r.alive && !r.boarded, `drifting out of range drains the progress (${t1.toFixed(2)} -> ${r.t.toFixed(2)}), no boarding`);
await page.evaluate(() => { window.__off = 0; });
await page.waitForFunction(() => E.boarded, null, { timeout: 8000 * SLOW }).catch(() => {});
r = await page.evaluate(() => ({ alive: E.alive, boarded: !!E.boarded, gold: save.gold, bt: board.t, d: Math.round(dist(player, E)), need: Math.round(shipRadius(player) + shipRadius(E) + BOARD_GAP), rel: Math.hypot(player.vx - E.vx, player.vy - E.vy), pv: player.speed, ev: E.speed, str: !!E.struck, ok: boardable(E), cand: !!boardCandidate() }));
check(r.boarded && !r.alive, "coming back alongside finishes the job " + JSON.stringify(r));
await page.evaluate(() => __freeRnd());
await stop();

console.log("Prize ships with no luck: gold only");
const none = await page.evaluate(() => ({ store: save.store.length }));
check(none.store === 1, `the unlucky roll (0.99) gave no gun the second time (store still ${none.store})`);

console.log("A full gun store: gold instead, nothing eaten");
await page.evaluate(() => {
  save = { ...save, store: Array.from({ length: MAX_STORE }, (_, i) => gunItem(i % 2 ? "long12" : "six", 1 + (i % 3))) };
  window.__full = { gold: save.gold, store: JSON.stringify(save.store) };
  window.E = __ship("fluyt", "merchant", 3, { loot: 100 }); __moor(E); __fixRnd(0);
});
await strike(); await wait(2800);
r = await page.evaluate(() => ({ boarded: !!E.boarded, gold: save.gold - __full.gold, store: JSON.stringify(save.store) === __full.store, n: save.store.length, max: MAX_STORE }));
await page.evaluate(() => __freeRnd());
check(r.boarded && r.n === r.max && r.store, `the store stays exactly as it was (${r.n}/${r.max}, unchanged ${r.store})`);
check(r.gold === 50 + 30, `the gun became gold: half the cargo (50) + a 6-pounder's armory price (30), got ${r.gold}`);
await stop();

console.log("A beaten warship may strike, and can be boarded");
await page.evaluate(() => { save = { ...save, store: [] }; window.E = __ship("brig", "pirate", 3, { loot: 160 }); __moor(E); __fixRnd(0.99); });
await page.evaluate(() => { E.hp = E.maxHp * 0.08; hurt(E, 0.1, 0, player, null); });
check(await page.evaluate(() => !E.struck && E.surrenderRolled), "a failed roll (0.99): she fights on, and the roll is spent");
await page.evaluate(() => { __freeRnd(); __gone([E]); window.E = __ship("brig", "navy", 3, { loot: 160 }); __moor(E); __fixRnd(0); E.hp = E.maxHp * 0.08; hurt(E, 0.1, 0, player, null); });
check(await page.evaluate(() => E.struck && boardable(E) && !isHostile(E, player) && E.loot === 160 && E.lootWas === 160 && Object.keys(E.vol).length === 0), "a lucky roll (0): the navy brig strikes, keeps her loot, and her guns fall silent");
await page.evaluate(() => { window.__g0 = save.gold; });
await wait(2800);
r = await page.evaluate(() => ({ boarded: !!E.boarded, alive: E.alive, gold: save.gold - __g0, store: save.store.length, hp: player.hp, maxHp: player.maxHp }));
await page.evaluate(() => __freeRnd());
check(r.boarded && !r.alive && r.hp === r.maxHp, "the warship is boarded and scuttled without hurting the player");
check(r.gold >= 80 + 64, `boarding gold (80) plus the sinking's bounty (${Math.round(160 * 0.4)}) are both paid (got ${r.gold})`);
check(r.store === 1, "a navy prize gun reaches the store");
await stop();

console.log("Not boardable, struck or not");
const kinds = await page.evaluate(() => {
  const mk = (cls, f, extra, dx) => { const e = __ship(cls, f, 3, { loot: 100, struck: true, ...extra }); e.x = 1500 + dx; e.y = 1500; e.spr.setPosition(e.x, e.y); return e; };
  window.__nb = { boss: mk("brig", "pirate", { boss: "x" }, 0), escort: mk("brig", "pirate", { escortOf: 1 }, 0), convoy: mk("brig", "navy", { escort: true }, 0), tut: mk("fluyt", "merchant", {}, 0) };
  tut.target = __nb.tut;
  const near = Object.values(__nb);
  near.forEach((e, i) => { e.x = 1500 + i * 5; e.y = 1500 + (i - 1.5) * 5; e.speed = 0; });
  window.__g1 = save.gold; window.__s1 = save.store.length;
  Object.assign(player, { x: 1500, y: 1500 + 80, rot: 0, speed: 0, hp: player.maxHp });
  window.__drive = setInterval(() => { player.speed = 0; player.x = 1500; player.y = 1500 + 80; }, 8);
  return near.map(e => boardable(e));
});
check(kinds.every(k => k === false), `a boss, a captain's escort, a convoy escort and the tutorial target are not boardable even when struck (${kinds.join(",")})`);
await wait(2800);
r = await page.evaluate(() => ({ alive: Object.values(__nb).every(e => e.alive && !e.boarded), which: Object.entries(__nb).map(([k, e]) => k + ":" + e.alive + ":" + !!e.boarded + ":" + Math.round(e.hp)).join(" "), progress: board.t, ship: !!board.ship, gold: save.gold === __g1, store: save.store.length === __s1 }));
check(r.alive && !r.ship && r.progress === 0 && r.gold && r.store, JSON.stringify(r) + " none of them is boarded after 2.8 s alongside: all afloat, no progress, no gold, no gun");
await page.evaluate(() => { tut.target = null; __gone(Object.values(__nb)); });
await stop();

check(errors.length === 0, `0 page errors${errors.length ? " -> " + errors.join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ` + fails.join("\n- ") : "\nAll boarding checks passed");
process.exit(fails.length || errors.length ? 1 : 0);
