// #119 combat readability in headless Chrome: the shooter that just hit you is ringed (on screen) or gets a flashing edge box (off screen),
// the aim line on a Navy ship is the same red as on a pirate (#141), the bow chevron is drawn ahead of your hull,
// a rim sits behind each enemy plate at night and in rain, and an edge box never lands on a level plate. 0 page errors.
// Usage: node tests/readmarks.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/readmarks";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(`${what}: ${JSON.stringify(detail)}`); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await ctx.addInitScript(() => {
  if (sessionStorage.getItem("__seeded")) return;
  sessionStorage.setItem("__seeded", "1");
  localStorage.clear(); localStorage.setItem("privateers-lang", "en");
  localStorage.setItem("privateers-settings", JSON.stringify({ muted: true }));   // test pages are silent
});
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 15000 * SLOW });
await page.evaluate(() => Snd.setMuted(true));
await page.click("[data-smoke=start]");
await page.evaluate(() => { if (!docked) dock("welcome"); });
await page.waitForFunction(() => docked, null, { polling: 50, timeout: 5000 * SLOW });
await page.evaluate(() => { save.tutorialDone = true; tut.active = false; });
await page.click("#sail");
await sleep(400);

// open water, hull and sea calm, nothing else near; the clock stands still so the scene holds
await page.evaluate(() => {
  for (let a = 0; a < 80; a++) {
    const x = PORT.x + Math.cos(a) * 2300, y = PORT.y + Math.sin(a) * 2300;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 900)) { Object.assign(player, { x, y, speed: 0, rot: 0, maxHp: 1e9, hp: 1e9 }); break; }
  }
  for (const e of enemies) { e.x = player.x + 6000 * (player.x < W / 2 ? 1 : -1); e.y = player.y; }
  S.cameras.main.centerOn(player.x, player.y);
});
const put = (faction, dx, dy, L = 3) => page.evaluate(([faction, dx, dy, L]) => {
  const e = makeEnemy(S, player.x + dx, player.y + dy, L, faction, undefined, true);
  Object.assign(e, { speed: 0, maxSpeed: 0, thinkT: 1e9, ignore: new Map(), target: null }); e.fixed = false;
  return (window.__placed ||= []).push(e) - 1;   // a handle, not an index into enemies: the sea retires far ships (js/world-seas.js managePopulation) and shifts the indexes
}, [faction, dx, dy, L]);

// ---- 1. aim colour: a Navy ship in the line is the same red as a pirate (#141)
const navy = await put("navy", 260, 0), pirate = await put("pirate", -260, 0);
const aim = (idx, rot) => page.evaluate(([idx, rot]) => {
  Object.assign(player, { rot, speed: 0 });
  const e = window.__placed[idx], m = MOUNTS.find(m => m.key === "bow") || MOUNTS[0], gun = player.guns[m.key][0];
  const mz = muzzle(player, m, gun.pi, gun.pn); gun.cd = 0;
  const tg = lineHits(mz.x, mz.y, mz.a, gun.range * 3);
  return { hit: tg === e, col: aimColor(true, tg) };
}, [idx, rot]);
const aN = await aim(navy, 0), aP = await aim(pirate, Math.PI);
check(aN.hit && aN.col === 0xff4a2e, "a Navy ship in the aim line is red, no violet", aN);
check(aP.hit && aP.col === 0xff4a2e, "a pirate in the aim line is red", aP);

// ---- 2. bow chevron + plate rim at night in rain: the layer draws without errors and has something in it
await page.evaluate(() => { Object.assign(wx, { on: true }); wx.w = { kind: "storm", rain: 1, storm: 1, hour: "night", spell: 0 }; Object.assign(player, { rot: -Math.PI / 4 }); });
await sleep(500);
const layer = await page.evaluate(() => ({ cmds: rmG ? rmG.commandBuffer.length : 0, depth: rmG ? rmG.depth : null, dark: wxDark(), rim: rimAlpha(wxDark(), true) }));
check(layer.cmds > 20 && layer.depth === 8.95, "the readability layer is drawn (chevron + plate rims)", layer);
await page.screenshot({ path: out + "/night-rain.png" });

// ---- 3. a shooter that just hit you: a ring when seen, a flashing, top-ranked edge box when not
const near = await put("pirate", 200, 160);
const hit = await page.evaluate(i => { const e = window.__placed[i]; runHook("hurt", player, 5, e); return hitMarks.some(h => h.src === e); }, near);
check(hit === true, "a hit registers a marker on the shooter", hit);
await sleep(300);
await page.screenshot({ path: out + "/shooter-ring.png" });
const far = await put("pirate", 1500, 0);   // off screen to the east, within the edge box range
await page.evaluate(i => runHook("hurt", player, 5, window.__placed[i]), far);
await sleep(500);
const box = await page.evaluate(() => [...document.querySelectorAll("#edgeMarks .em.atk")].map(el => ({ edge: el.dataset.edge, on: el.classList.contains("on") })));
check(box.length === 1 && box[0].edge === "right", "the off-screen shooter's edge box is flagged and on the right edge", box);

// ---- 4. an edge box never lands on a level plate: crowd the right edge with plates and a far ship
for (let i = 0; i < 4; i++) await put("merchant", 560, -150 + i * 90, 2);
await put("pirate", 2600, 0);
await sleep(600);
const clash = await page.evaluate(() => {
  const plates = enemies.filter(e => e.alive && e.badge && e.badge.visible).map(e => { const v = S.cameras.main.worldView, k = VIEW.cssW / v.width, b = e.badge, w = b.displayWidth * k, h = b.displayHeight * k, x = (b.x - v.x) * k, y = (b.y - v.y) * k; return { l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 }; })
    .filter(r => r.r > 0 && r.l < VIEW.cssW && r.b > 0 && r.t < VIEW.cssH);
  const boxes = [...document.querySelectorAll("#edgeMarks .em:not(.gone)")].map(el => el.getBoundingClientRect());
  return { plates: plates.length, boxes: boxes.length, hits: boxes.filter(b => plates.some(r => b.left < r.r && b.right > r.l && b.top < r.b && b.bottom > r.t)).length };
});
check(clash.plates >= 3 && clash.boxes >= 1 && clash.hits === 0, "no edge box sits on a level plate", clash);
await page.screenshot({ path: out + "/edge-vs-plates.png" });

check(errors.length === 0, "0 page errors", errors);
await browser.close();
if (fails.length) { console.log("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
console.log("\nreadmarks: all passed");
