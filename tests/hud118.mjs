// #118 / #114 in headless Chrome: the top lane keeps clear of the ship and the tutorial card, warnings jump explanations in the toast queue,
// the sea warning comes ~10 s early, the way-home chip under 25% hull (#144), the edge-of-the-chart hint, 0 page errors.
// Usage: node tests/hud118.mjs [url]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(what); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function open(opts) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en"); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true }));
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  await page.evaluate(() => { save.tutorialDone = true; tut.active = false; });
  await page.click("#sail");
  await sleep(500);
  await page.evaluate(() => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; spawnT = 1e9; player.maxHp = player.hp = 1e6; });
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }, sel);
const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const [name, vp] of [["desktop", { width: 1280, height: 720 }], ["phone", { width: 390, height: 844 }], ["landscape phone", { width: 800, height: 380 }]]) {
  console.log(name + ": the top lane");
  const { ctx, page, errors } = await open({ viewport: vp, hasTouch: vp.width < 500 });
  await page.evaluate(() => { player.x = PORT.x + 900; player.y = PORT.y; });
  await sleep(600);
  // a long explanation toast, and the tutorial card hopped to the top: they must not overlap, and the toast must not sit on the ship
  await page.evaluate(() => {
    hideSeaBanner(); bannerWait = []; const c = document.getElementById("coach"); c.hidden = false; c.classList.add("up"); document.getElementById("coachTxt").textContent = "Steer with A and D to turn the bow toward the gold ring.";
    toast(t("heatWhy"), false, 7000, TOAST_TIP);
  });
  await sleep(900);
  const ship = await page.evaluate(() => { const p = worldToCss(player.x, player.y), k = VIEW.cssW / S.cameras.main.worldView.width; return { left: p.x - 30 * k, right: p.x + 30 * k, top: p.y - 40 * k, bottom: p.y + 30 * k }; });
  const tr = await rect(page, "#toast"), cr = await rect(page, "#coach");
  check(await page.evaluate(() => toastOn), "the long toast is showing");
  check(!hit(tr, cr), "the long toast does not cover the tutorial card", { tr, cr });
  const held = await page.evaluate(() => document.getElementById("toast").style.visibility === "hidden");   // no room at all (a short screen under the card): the tip waits, unseen
  check(held || !hit(tr, ship), "the long toast does not cover the ship (or waits)", { tr, ship, held });
  // a sea banner and a Ship Lv banner: the ship stays free
  await page.evaluate(() => { document.getElementById("coach").classList.remove("up"); document.getElementById("coach").hidden = true; seaNow = null; showSeaBanner("reef"); });
  await sleep(900);
  const br = await rect(page, "#seaBanner");
  check(!hit(br, ship), "the sea banner does not cover the ship", { br, ship });
  check(errors.length === 0, "0 page errors", errors);
  await ctx.close();
}

console.log("desktop: priority, warnings, home chip, the edge");
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  // a warning arriving over a tip: it shows at once and the tip waits in the queue
  await page.evaluate(() => { toast("A one-time explanation that runs long", false, 7000, TOAST_TIP); });
  await sleep(300);
  await page.evaluate(() => toast("Hull alarm", false, 3000, TOAST_WARN));
  await sleep(300);
  const shown = await page.evaluate(() => ({ now: toastEl.textContent, queued: toastQueue.map(q => q.msg) }));
  check(shown.now === "Hull alarm" && shown.queued.includes("A one-time explanation that runs long"), "a warning replaces a tip, and the tip waits its turn", shown);
  await sleep(3500);

  // the sea warning: sailing out toward the Navy Lanes at speed warns well before the line
  const t0 = await page.evaluate(() => { player.maxHp = player.hp = 1e6; player.x = PORT.x - 1000; player.y = PORT.y; player.rot = Math.PI; player.speed = player.maxSpeed; aheadShown = {}; return { d: dist(player, PORT), lowLv: seaLowLv("lanes"), rating: shipRating(), danger: seaIsDanger("lanes") }; });
  await sleep(1500);
  const w = await page.evaluate(() => ({ text: toastEl.textContent, d: dist(player, PORT), edge: ringEdge(SEAS[2].L0) }));
  check(/Navy Lanes/.test(w.text) && /Warning/.test(w.text), "the Navy Lanes warning shows while the line is still some way off", { t0, w });
  check(w.edge - w.d > 380, "...and it came earlier than the old 380 px", w);
  await sleep(6000);

  // the way home under 25% hull (#144: 30% no longer shows it)
  await page.evaluate(() => { player.x = PORT.x + 1500; player.y = PORT.y; player.maxHp = 100; player.hp = 30; });
  await sleep(700);
  check(await page.evaluate(() => homeChip.hidden), "at 30% hull the way home stays hidden", null);
  await page.evaluate(() => { player.hp = 20; });
  await page.waitForFunction(() => !homeChip.hidden, null, { timeout: 2000 * SLOW }).catch(() => {});   // the chip check below reports a miss
  const chip = await page.evaluate(() => ({ hidden: homeChip.hidden, text: homeChip.textContent, tf: homeChip.querySelector("i").style.transform }));
  check(!chip.hidden && /Harbor \d+ m/.test(chip.text) && /rotate/.test(chip.tf), "under 25% hull the way home shows direction and distance", chip);
  const cr = await rect(page, "#homeChip"), tb = await page.evaluate(() => { const b = document.querySelector("#hud .bars").getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; });
  check(!hit(cr, tb), "the chip sits below the HUD bars", { cr, tb });
  await page.evaluate(() => { player.hp = 90; });
  await sleep(600);
  check(await page.evaluate(() => homeChip.hidden), "a healthy hull hides it again");

  // the edge of the chart
  await page.evaluate(() => { player.maxHp = player.hp = 1e6; player.x = W - 140; player.y = PORT.y; player.rot = 0; player.speed = player.maxSpeed; edgeShown = false; toastQueue = []; seaNow = "maelstrom"; hideSeaBanner(); bannerWait = []; });
  await sleep(1200);
  const e = await page.evaluate(() => toastEl.textContent);
  check(/Edge of the chart/.test(e), "reaching the map's edge says so", e);
  check(errors.length === 0, "0 page errors", errors);
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
process.exit(fails.length ? 1 : 0);
