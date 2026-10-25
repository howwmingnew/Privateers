// The new-captain safety net in headless Chrome: the red danger banner for a sea far above your rating, the glow toward an unseen
// shooter, the speed readout and the aground prompt, the touch sail buttons (and that they leave the other devices alone), the
// chart's touch-screen size, the Shallows' tamed crowd, 0 page errors.
// Usage: node tests/safety.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/safety";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(what); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));
const browser = await chromium.launch({ channel: "chrome", headless: true });

// A fresh save, sailing in the Shallows with the tutorial out of the way and the sea emptied.
async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(), errors = [];
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

console.log("Desktop: the danger banner, the glow, speed and aground");
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  // the Navy Lanes (Lv 6-8) against a new captain: a red warning, even on a first crossing
  await page.evaluate(() => { player.x = PORT.x - 2300; player.y = PORT.y + 60; });
  await page.waitForFunction(() => seaBanner.classList.contains("on"), null, { timeout: 8000 * SLOW }).catch(() => {});
  const b = await page.evaluate(() => ({ danger: seaBanner.dataset.danger, text: seaBanner.textContent, rating: shipRating() }));
  check(b.danger === "1" && /Danger/.test(b.text) && /Turn back/.test(b.text), "sailing into the Navy Lanes at Ship Lv " + b.rating + " raises the red warning banner", b);
  await page.screenshot({ path: join(out, "danger.png") });
  // the Shallows are a plain banner: no warning
  await page.evaluate(() => { hideSeaBanner(); seaNow = null; seaLastIn = {}; seaSortie = new Set(); player.x = PORT.x - 800; player.y = PORT.y + 60; });
  await sleep(3000);
  const q = await page.evaluate(() => ({ danger: seaBanner.dataset.danger || null, sea: seaNow }));
  check(q.danger === null, "the Shallows keep the plain banner", q);

  // a shooter far off screen: the glow lights the mark on that bearing; one in plain view does not
  await page.evaluate(() => { player.x = PORT.x + 900; player.y = PORT.y; window.__far = makeEnemy(S, player.x + 1500, player.y, 2, "pirate"); window.__near = makeEnemy(S, player.x + 120, player.y + 90, 2, "pirate"); });
  await sleep(400);   // the camera catches up with the move
  await page.evaluate(() => hurt(player, 5, 0, __near, null));
  const seen = await page.evaluate(() => document.querySelectorAll("#hitGlow i.on").length);
  check(seen === 0, "a small hit from a ship in view adds no glow (its own marker is enough)", seen);
  await page.evaluate(() => hurt(player, 5, 0, __far, null));
  const glow = await page.evaluate(() => [...document.querySelectorAll("#hitGlow i.on")].map(i => parseFloat(i.style.getPropertyValue("--a"))));
  check(glow.length === 1 && glow[0] === 0, "a hit from the east off screen lights the east mark", glow);
  await page.evaluate(() => hurt(player, player.maxHp * 0.2, 0, __near, null));
  const big = await page.evaluate(() => document.querySelectorAll("#hitGlow i.on").length);
  check(big === 2, "a heavy blow glows even from a ship in view", big);
  await page.evaluate(() => hurt(player, 5, 0, null, null));
  check((await page.evaluate(() => document.querySelectorAll("#hitGlow i.on").length)) === 2, "a hit with no shooter (a rock) adds nothing");

  // aground: full sail into a rock; the speed reads what the hull really does
  await page.evaluate(() => { enemies.forEach(e => { e.alive = false; e.spr.destroy(); e.badge?.destroy(); }); enemies.length = 0; });
  await page.evaluate(() => {
    const isl = islands.filter(i => !i.outpost).sort((a, b) => dist(a, PORT) - dist(b, PORT))[3];
    player.x = isl.x - isl.r * 0.9 - 80; player.y = isl.y; player.rot = 0; player.speed = 0; setSailLevel(3);
  });
  // a free helm dead on at the rock: the hull glides round it instead of sticking (js/ai-nav.js slideAlong)
  await sleep(3500);
  const gl = await page.evaluate(() => ({ kn: parseFloat(document.getElementById("speedTxt").textContent), stuck: document.getElementById("speedInd").classList.contains("stuck"), rot: player.rot }));
  check(!gl.stuck && gl.kn > 2, "full sail dead on at a rock: the hull glides along it, not aground", gl);
  // a helm held hard at the rock (the bow reset every few ms) still pins the hull: the readout and the prompt
  await page.evaluate(() => {
    const isl = islands.filter(i => !i.outpost).sort((a, b) => dist(a, PORT) - dist(b, PORT))[3];
    player.x = isl.x - isl.r * 0.9 - 80; player.y = isl.y; player.rot = 0; player.speed = 0; window.__pin = setInterval(() => { player.rot = 0; }, 4);
  });
  await sleep(3500);
  const g = await page.evaluate(() => ({ kn: document.getElementById("speedTxt").textContent, stuck: document.getElementById("speedInd").classList.contains("stuck"), prompt: !document.getElementById("aground").hidden, want: player.wantThr }));
  await page.evaluate(() => clearInterval(window.__pin));
  check(g.prompt && g.stuck && g.kn === "0.0 kn" && g.want === 1, "full sail against a rock: Speed reads 0.0 kn and the aground prompt shows", g);
  await page.screenshot({ path: join(out, "aground.png") });
  await page.evaluate(() => { player.rot = Math.PI; });
  await sleep(1800);
  const f = await page.evaluate(() => ({ kn: parseFloat(document.getElementById("speedTxt").textContent), prompt: !document.getElementById("aground").hidden }));
  check(!f.prompt && f.kn > 3, "turned away and sailing: the prompt is gone and the speed is real", f);
  // the wind dial says whose speed it is
  check(await page.evaluate(() => /^Wind \d+ kn$/.test(document.querySelector("#windDial .wd-kn").textContent)), "the wind dial reads 'Wind N kn'");
  check(await page.evaluate(() => getComputedStyle(document.getElementById("touchSail")).display === "none"), "a desktop has no touch sail buttons");
  check(errors.length === 0, "desktop: no page errors", errors);
  await ctx.close();
}

console.log("Phone: touch sail buttons and the chart");
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const i = await page.evaluate(() => ({ dev: device, shown: !document.getElementById("touchSail").hidden, mini: Math.round(document.getElementById("mini").getBoundingClientRect().width), pct: SETTINGS.miniPct }));
  check(i.dev === "touch" && i.shown, "the sail buttons show on a touch screen", i);
  check(i.pct === 150 && i.mini > 124, "the chart starts at 150% on a touch screen (" + i.mini + " px)", i);
  await touch("touchStart", 200, 560); await touch("touchMove", 270, 560);
  await sleep(2200);
  const full = await page.evaluate(() => ({ speed: player.speed, max: player.maxSpeed }));
  check(full.speed > full.max * 0.9, "no button pressed: a full pull is full speed, as before", full);
  await touch("touchEnd");
  await page.evaluate(() => { document.querySelector("#touchSail [data-d='-1']").scrollIntoView(); });
  const btn = await page.locator("#touchSail [data-d='-1']").boundingBox();
  for (let k = 0; k < 3; k++) await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
  const cap = await page.evaluate(() => ({ cap: touchCap, txt: document.querySelector("#touchSail b").textContent, minus: document.querySelector("#touchSail [data-d='-1']").disabled }));
  check(cap.cap === 0 && cap.txt === "Stopped" && cap.minus, "three taps on minus: Stopped", cap);
  await touch("touchStart", 200, 560); await touch("touchMove", 200, 640);   // pull down: the bow turns to the south, the ship stays put
  await sleep(2500);
  const st = await page.evaluate(() => ({ speed: player.speed, rot: player.rot, joy: joyVec.m }));
  check(st.joy > 0.9 && st.speed < 5 && Math.abs(Math.sin(st.rot)) > 0.5, "stick down at Stopped: the bow turns, the ship does not move", st);
  await touch("touchEnd");
  await page.screenshot({ path: join(out, "phone-stopped.png") });
  const plus = await page.locator("#touchSail [data-d='1']").boundingBox();
  for (let k = 0; k < 3; k++) await page.mouse.click(plus.x + plus.width / 2, plus.y + plus.height / 2);
  check((await page.evaluate(() => touchCap)) === 3, "three taps on plus: Full again");
  await page.evaluate(() => setTouchCap(1));
  await page.evaluate(() => { sendHome(); dock("return"); });
  await page.click("#sail"); await sleep(500);
  check((await page.evaluate(() => touchCap)) === 3, "a new departure starts at Full whatever the cap was");
  check(await page.evaluate(() => /Let go of the stick \(or lower the sail\)/.test(STR.en.moor_go_touch)), "the touch dock prompt names both ways to stop");
  check(errors.length === 0, "phone: no page errors", errors);
  await ctx.close();
}

console.log("A new captain's Shallows");
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  const r = await page.evaluate(() => {
    save.tutorialDone = true; player.x = PORT.x + 1000; player.y = PORT.y; setSail();
    for (let i = 0; i < 400; i++) step(0.05);
    const me = shipRating(), shallows = enemies.filter(e => e.alive && isOrdinary(e) && seaOfRing(e.ring).id === "shallows");
    return { me, n: shallows.length, over: shallows.filter(e => (e.threatL ?? e.L) > noviceCap(me)).length, near: nearRings(), total: seaCensus().total };
  });
  check(r.over === 0, "no ship in the Shallows out-fights a Lv " + r.me + " captain by more than one level", r);
  check(r.near.join() === "1,2" && r.total >= 25, "a new captain in the Shallows has rings 1-2 as the near rings, and the sea is still stocked", r);
  check(errors.length === 0, "shallows: no page errors", errors);
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nAll safety checks passed.");
process.exit(fails.length ? 1 : 0);
