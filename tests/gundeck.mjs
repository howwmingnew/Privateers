// Big gun decks (#10): the line of battle armed to the last port, a broadside rolling off gun by gun, the gun bay usable on a
// desktop and on a phone, and an old save's short rows laid out on the new ship.
// Usage: node tests/gundeck.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
// A spend of CONFIRM_GOLD or more (a gun upgrade or purchase, a break-down) arms its button on the first tap (#117): press again once it shows "Tap again to confirm".
const sureClick = async (page, sel) => { await page.click(sel); if (await page.evaluate(s => !!document.querySelector(s + "[data-armed]"), sel)) { await page.waitForTimeout(450); await page.click(sel); } };

const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/gundeck";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); };
const D = { width: 1280, height: 720 }, M = { width: 390, height: 844 };
const five = ["six", "long12", "carronade", "chain", "fire"].map((g, i) => ({ g, lv: i + 1 }));
const OLD_LINE = { v: 2, gold: 50000, ship: "line", hull: 3, sails: 2, hold: 2, sunk: 3, wrecks: [], salvage: [], store: [{ g: "fire", lv: 2 }],
  bow: [{ g: "six", lv: 1 }, { g: "six", lv: 1 }], stern: [{ g: "long12", lv: 1 }, { g: "six", lv: 1 }], left: five, right: five };

async function open(viewport, { mobile = false, tag = "", save } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); if (s) localStorage.setItem("privateers-save-v2", JSON.stringify(s)); }, save || null);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
  return { ctx, page };
}
// Straight to the harbor ledger with the line of battle, every port armed (one in five empty, so a swap has somewhere to go).
async function toLedger(page) {
  await page.evaluate(() => {
    save = fitMounts({ ...save, ship: "line", gold: 99999 });
    const kinds = ["six", "long12", "carronade", "chain", "fire"];
    for (const { key } of MOUNTS) save[key] = save[key].map((_, i) => (i % 5 === 4 ? null : gunItem(kinds[i % 5], 1 + (i % 4))));
    applyPlayerStats(true); titleOpen = false; const ti = document.getElementById("title"); if (ti) ti.hidden = true;
    paused = true; dock("welcome"); document.getElementById("port").hidden = false;
  });
  await page.waitForTimeout(600 * SLOW);
}

for (const [name, vp, mobile] of [["desktop", D, false], ["phone", M, true]]) {
  const { ctx, page } = await open(vp, { mobile, tag: name });
  await toLedger(page);
  const info = await page.evaluate(() => {
    const slots = [...document.querySelectorAll("#deck .slot")], sheet = document.querySelector(".sheet");
    return { n: slots.length, dense: document.getElementById("deck").classList.contains("dense"), sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      minW: Math.round(Math.min(...slots.map(b => b.getBoundingClientRect().width))), minH: Math.round(Math.min(...slots.map(b => b.getBoundingClientRect().height))),
      offScreenX: slots.filter(b => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length,
      lines: document.querySelectorAll(".dk-lines g").length };
  });
  ok(`${name}: all 30 gun ports are on the deck, dense layout, none outside the screen, no sideways scroll`, info.n === 30 && info.dense && info.offScreenX === 0 && info.sheetOverflow <= 1 && info.lines === 30, info);
  ok(`${name}: every port is big enough to tap (>= 24 px tall)`, info.minH >= 24 && info.minW >= 50, { minW: info.minW, minH: info.minH });
  await page.evaluate(() => document.getElementById("deck").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${out}/${name}-deck.png` });
  // pick a port, level it from the card, then move it into an empty port
  const first = page.locator('#deck .slot[data-side="left"][data-i="0"]'), empty = page.locator('#deck .slot[data-side="left"][data-i="4"]');
  await first.scrollIntoViewIfNeeded(); await first.click();
  const card = await page.evaluate(() => { const c = document.querySelector("#ctx .gcard"); if (!c) return null; const r = c.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
  ok(`${name}: tapping a port shows its gun card, inside the screen`, card && card.top >= 0 && card.bottom <= card.vh + 1, card);
  const g0 = await page.evaluate(() => ({ gold: save.gold, lv: save.left[0].lv, gun: save.left[0].g }));
  await sureClick(page, '#ctx [data-act="gup"]');
  const g1 = await page.evaluate(() => ({ gold: save.gold, lv: save.left[0].lv }));
  ok(`${name}: the card's upgrade levels that gun and spends gold`, g1.lv === g0.lv + 1 && g1.gold < g0.gold, { g0, g1 });
  await page.screenshot({ path: `${out}/${name}-card.png` });
  await page.locator('#ctx [data-act="unload"]').click();   // the gun goes to the store (the last place in it) ...
  await empty.scrollIntoViewIfNeeded(); await empty.click();   // ... and an empty port picked lists the store: that gun mounts there
  await page.locator('#ctx [data-act="gfrom"][data-side="store"]').last().click();
  const sw = await page.evaluate(() => ({ a: save.left[0], b: save.left[4] }));
  ok(`${name}: unloading a gun and mounting it on an empty port moves it there`, sw.a === null && sw.b && sw.b.g === g0.gun && sw.b.lv === g1.lv, sw);
  await ctx.close();
}

// Rolling broadside: guns go off one after another across a fraction of a second, not all in one frame.
{
  const { ctx, page } = await open(D, { tag: "volley" });
  await toLedger(page);
  const res = await page.evaluate(async () => {
    // Seeded dice: gun spread and the ring ships' headings decide how many balls hit a hull (and vanish) before the peak is counted.
    let sd = 1234567; Math.random = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    wx.on = false; dis.live = []; dis.plan = [];
    for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six"));
    applyPlayerStats(true); document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
    Object.assign(player, { x: PORT.x + 1700, y: PORT.y + 300, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 });
    islands = islands.filter(i => Math.hypot(i.x - player.x, i.y - player.y) > i.r + 500);   // islands are rolled per game: a rock under the player would shove it off the test line
    const game = S.game; game.loop.sleep(); let now = performance.now();   // stepped by hand: 16.667 ms frames, the camera follows
    const step = () => { now += 16.667; game.step(now, 16.667); };
    const ring = [0, 1, 2, 3].map(k => makeEnemy(S, player.x + Math.cos(k * Math.PI / 2) * 150, player.y + Math.sin(k * Math.PI / 2) * 150, 3, "pirate", undefined, true));
    for (const x of enemies.splice(0, enemies.length, ...ring)) if (!ring.includes(x)) { x.alive = false; x.spr.destroy(); x.badge?.destroy(); }   // the sea's own ships (unseeded) would soak up balls too
    spawnT = 1e9;   // and no top-ups
    // the ring ships are untouchable (negative hit box): they only give the guns something to see, a ball that hit one would leave the count early
    const place = () => ring.forEach((e, k) => { const a = k * Math.PI / 2; Object.assign(e, { x: player.x + Math.cos(a) * 150, y: player.y + Math.sin(a) * 150, rot: a + Math.PI / 2, hl: -1e3, hw: -1e3, speed: 0, maxHp: 1e9, hp: 1e9 }); });
    for (let i = 0; i < 30; i++) { place(); S.cameras.main.centerOn(player.x, player.y); step(); }
    place();
    const ready = Object.values(player.guns).reduce((n, a) => n + a.length, 0), samples = [];
    playerFire();
    for (let i = 0; i < 54; i++) { samples.push([Math.round(i * 16.667), balls.filter(b => b.fromPlayer).length]); step(); }
    game.loop.wake();
    return { ready, samples, onCd: Object.values(player.guns).flat().filter(g => g.cd > 0).length };
  });
  const counts = res.samples.map(s => s[1]), peak = Math.max(...counts), early = res.samples.find(s => s[0] >= 100);
  ok("volley: all 30 guns of the ship are loaded and fire (each goes on cooldown)", res.ready === 30 && res.onCd === 30, { ready: res.ready, onCd: res.onCd });
  ok("volley: the balls leave one after another, not all in one frame", early && early[1] > 0 && early[1] < peak && new Set(counts).size >= 5, { early, peak, steps: new Set(counts).size });
  ok("volley: a good part of the thirty balls is in the air at once, never above the cap", peak >= 15 && peak <= 220, { peak });
  await page.screenshot({ path: `${out}/volley.png` });
  await ctx.close();
}

// Hold-to-fire: after the hold delay, only guns whose aim line is red (would hit now) fire; the setting turns it off.
{
  const { ctx, page } = await open(D, { tag: "autofire" });
  await toLedger(page);
  const run = async on => page.evaluate(async on => {
    for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six"));
    applyPlayerStats(true); document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
    document.querySelector(`[data-set="auto"][data-v="${on ? "on" : "off"}"]`).click();
    Object.assign(player, { x: PORT.x + 1700, y: PORT.y + 300, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 });
    islands = islands.filter(i => Math.hypot(i.x - player.x, i.y - player.y) > i.r + 500);   // islands are rolled per game: a rock under the player would shove it off the test line
    const game = S.game; game.loop.sleep(); let now = performance.now(); const step = () => { now += 16.667; game.step(now, 16.667); };
    // Fixed target: same class (hull size), same heading, seeded dice; which aim lines are red depends on all three.
    let sd = 7654321; Math.random = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    wx.on = false; dis.live = []; dis.plan = [];
    // The only ship in the sea. resetEnemies above filled the whole sea with unseeded dice and managePopulation would top it up near the player:
    // a stray ship on the starboard beam turned that side's aim lines red too (fired 14 of 12) in about one run in eight, on any machine.
    const e = makeEnemy(S, player.x + 30, player.y - 150, 3, "pirate", "brig", true);
    for (const x of enemies.splice(0, enemies.length, e)) if (x !== e) { x.alive = false; x.spr.destroy(); x.badge?.destroy(); }
    spawnT = 1e9;
    const place =() => Object.assign(e, { x: player.x + 30, y: player.y - 150, rot: 0, turnRate: 0, maxSpeed: 1e-6, speed: 0, maxHp: 1e9, hp: 1e9 });   // off the larboard beam, a bit aft of centre
    for (let i = 0; i < 30; i++) { place(); S.cameras.main.centerOn(player.x, player.y); step(); }
    // The hold length is re-armed before every step: stepped by hand, a busy machine could stretch the real clock past the hold delay.
    for (let i = 0; i < 5; i++) { spaceDownAt = performance.now() - 40; place(); step(); }   // not held long enough yet
    const early = Object.values(player.guns).flat().filter(g => g.cd > 0).length;
    for (let i = 0; i < 6; i++) { spaceDownAt = performance.now() - 1000; place(); step(); }
    const fired = Object.values(player.guns).flat().filter(g => g.cd > 0).length, redNow = (() => { let n = 0;
      for (const m of MOUNTS) for (const g of player.guns[m.key]) { const mz = muzzle(player, m, g.pi, g.pn); if (lineHits(mz.x, mz.y, mz.a, g.range)) n++; } return n; })();
    spaceDownAt = 0; game.loop.wake();
    return { early, fired, redNow, setting: SETTINGS.autoFire, rot: +player.rot.toFixed(3), spd: player.speed, dx: Math.round(e.x - player.x), dy: Math.round(e.y - player.y), erot: +e.rot.toFixed(2), hl: e.hl, hw: e.hw, zoom: S.cameras.main.zoom };
  }, on);
  const onRes = await run(true);
  ok("auto-fire: a short hold fires nothing; a long hold fires some guns but not the whole side", onRes.early === 0 && onRes.fired > 0 && onRes.fired < 12, onRes);
  await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => typeof player !== "undefined" && player && titleOpen); await toLedger(page);
  const offRes = await run(false);
  ok("auto-fire: switched off in settings, holding fires nothing", offRes.setting === false && offRes.fired === 0, offRes);
  await ctx.close();
}

// An old save (five guns a side on the ship of the line) loads onto the new twelve-port rows, centred, nothing lost.
{
  const { ctx, page } = await open(D, { tag: "oldsave", save: OLD_LINE });
  const key = a => a.map(g => g && g.g + g.lv).join(",");
  const s = await page.evaluate(() => ({ left: save.left, bow: save.bow, stern: save.stern, store: save.store, gold: save.gold }));
  const kept = key(s.left.slice(3, 8));
  ok("old save: five-gun sides sit in the middle of the twelve ports, same guns and levels", s.left.length === 12 && kept === "six1,long122,carronade3,chain4,fire5" && s.left.filter(Boolean).length === 5, { kept, n: s.left.length });
  ok("old save: bow and stern fill to three ports, the store and gold are untouched", s.bow.length === 3 && s.stern.length === 3 && s.bow.filter(Boolean).length === 2 && s.store.length === 1 && s.gold === 50000, { bow: s.bow.length, stern: s.stern.length });
  await page.evaluate(() => persist());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof save !== "undefined" && save.left);
  const again = await page.evaluate(() => save.left);
  ok("old save: loading the converted save again moves nothing", key(again) === key(s.left), { again: key(again) });
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors. Screenshots in ${out}`);
process.exit(failed.length || errors.length ? 1 : 0);
