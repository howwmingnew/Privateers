// Harbor ring checks (js/mooring.js): sailing through the dock ring sells the hold and mends the hull with no menu;
// stopping inside it for 3 s opens the ledger. Desktop keyboard, the phone's touch stick, and the tutorial's sell step.
// Usage: node tests/harbor.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/harbor";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const D = { width: 1280, height: 720 }, M = { width: 390, height: 844 };

async function open(viewport, { mobile = false, tag = "" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "load" });
  await until(page, () => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function until(page, fn, arg = null, { timeout = 8000 } = {}) {
  try { await page.waitForFunction(fn, arg, { polling: 50, timeout }); }
  catch (e) {
    const s = await page.evaluate(() => typeof player === "undefined" || !player ? "not booted" : JSON.stringify({ paused, docked, canDock,
      d: Math.round(dist(player, PORT)), sp: Math.round(player.speed), moor })).catch(() => "n/a");
    throw new Error(`timed out waiting for ${fn.toString().slice(0, 90)} | state ${s}`);
  }
}
// From the title to open sea, tutorial off, no enemy near the harbor to interfere.
async function toSea(page, { tutorial = false } = {}) {
  await page.click("[data-smoke=start]");   // a fresh save sails straight out (js/menu.js); dock for a clean departure
  await ev(page, () => { if (!docked) dock("welcome"); });
  await until(page, () => docked);
  if (!tutorial) await ev(page, () => { save.tutorialDone = true; tutorialReset(); });
  await page.waitForTimeout(450);
  await page.click("#sail");
  await until(page, () => !docked && !paused);
}
// Park the ship outside the ring (arms canDock), then put it just inside. The default heading cuts across the ring
// clear of the harbor island (bumping into it would stop the ship, and a stopped ship moors).
const atRingEdge = (page, setup = {}) => ev(page, s => {
  player.x = PORT.x + DOCK_R + 200; player.y = PORT.y; player.speed = 0;
  canDock = true;
  for (const e of enemies) if (dist(e, PORT) < SAFE_R + 400) { e.x = PORT.x - 3000; e.y = PORT.y - 3000; }
  player.x = PORT.x + DOCK_R - 12; player.y = PORT.y; player.rot = s.rot ?? Math.PI * 0.65;
  player.speed = s.speed ?? 0;
  if (s.cargo) cargo = s.cargo;
  if (s.hp) player.hp = player.maxHp * s.hp;
}, setup);
const state = page => ev(page, () => ({ docked, paused, canDock, gold: save.gold, cargo, hp: +(player.hp / player.maxHp).toFixed(2), sp: Math.round(player.speed),
  t: +moor.t.toFixed(2), inside: moor.inside, prompt: document.getElementById("moor").hidden ? "" : document.getElementById("moor").textContent,
  toast: document.getElementById("toast").textContent, sorties: save.stats.sorties, statGold: save.stats.gold, enemies: enemies.length }));

// ---------- 1. desktop: pass through = quick resupply; stop for 3 s = the ledger ----------
{
  const { ctx, page } = await open(D, { tag: "desk" });
  await toSea(page);
  // just set sail, still inside the ring and stopped: the ledger must not reopen by itself
  await page.waitForTimeout(3600);
  const s0 = await state(page);
  ok("after Set sail the ship sits in the ring without the ledger reopening or a prompt", !s0.docked && !s0.canDock && !s0.prompt, s0);

  const before = await state(page);
  await ev(page, () => { window.__resets = 0; const orig = resetEnemies; window.resetEnemies = sc => { window.__resets++; orig(sc); }; });
  await atRingEdge(page, { cargo: 80, hp: 0.3 });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  await until(page, () => cargo === 0);
  await page.waitForTimeout(250);
  const s1 = await state(page);
  const resets = await ev(page, () => window.__resets);
  ok("sailing into the ring sells the hold at once, with a toast, and no ledger", !s1.docked && !s1.paused && s1.gold - before.gold === 80 && /Sold the hold for 80/.test(s1.toast), s1);
  ok("quick resupply keeps the sortie: no sea reset, no new sortie, gold counted in the log", resets === 0 && s1.sorties === before.sorties && s1.statGold - before.statGold === 80, { resets, s1 });
  ok("moving in the ring: the prompt says how to stop for the ledger", /Drop sail/.test(s1.prompt) && s1.t === 0, s1.prompt);
  await page.waitForTimeout(500);
  const s2 = await state(page);
  ok("the hull mends quickly while inside the ring", s2.hp > s1.hp && s2.hp >= 0.5, { from: s1.hp, to: s2.hp });
  await page.screenshot({ path: join(out, "desk-pass.png") });
  // keep sailing straight through and out the far side: still no ledger
  await until(page, () => !moor.inside, null, { timeout: 8000 });
  const s3 = await state(page);
  ok("sailing straight through and out never opens the ledger; the prompt goes away", !s3.docked && !s3.prompt && s3.hp === 1, s3);

  // stop inside: the gold ring fills, then the ledger opens, its message naming the quick sale
  await page.keyboard.press("KeyS"); await page.keyboard.press("KeyS"); await page.keyboard.press("KeyS");
  await atRingEdge(page, { cargo: 45 });
  await until(page, () => moor.t > 1.2);
  const s4 = await state(page);
  await page.screenshot({ path: join(out, "desk-holding.png") });
  ok("stopped in the ring: the timer runs and the prompt says to hold still", !s4.docked && s4.t > 1 && /Hold still|Opening/.test(s4.prompt) && s4.cargo === 0, s4);
  // moving again resets it
  await page.keyboard.press("KeyW");
  await until(page, () => moor.t === 0, null, { timeout: 3000 });
  await page.keyboard.press("KeyS");
  const t0 = Date.now();
  await until(page, () => docked, null, { timeout: 9000 });
  const held = (Date.now() - t0) / 1000;
  const s5 = await ev(page, () => ({ msg: document.getElementById("pMsg").textContent, port: !document.getElementById("port").hidden, prompt: !document.getElementById("moor").hidden }));
  ok("moving resets the timer; stopped again, the ledger opens after about 3 s", held > 2.6 && held < 6, { held });
  ok("the ledger's message names what the pass already sold, and the prompt is gone", s5.port && /45/.test(s5.msg) && !s5.prompt, s5);
  await page.waitForTimeout(450);
  await page.click("#sail");
  await until(page, () => !docked && !paused);
  await page.waitForTimeout(3600);
  ok("setting sail from that ledger does not reopen it while the ship stays put", !(await ev(page, () => docked)));
  await ctx.close();
}

// ---------- 2. phone: the touch stick sails in, letting go stops the ship and the ledger opens ----------
{
  const { ctx, page } = await open(M, { mobile: true, tag: "touch" });
  await toSea(page);
  const g0 = await ev(page, () => save.gold);
  await atRingEdge(page, { cargo: 30 });
  const cdp = await ctx.newCDPSession(page);
  const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await tp("touchStart", 260, 600); await tp("touchMove", 230, 600); await tp("touchMove", 200, 600);
  await until(page, () => cargo === 0 && player.speed > 20);
  const m1 = await state(page);
  await page.screenshot({ path: join(out, "touch-pass.png") });
  ok("touch: steering into the ring sells the hold with no menu", !m1.docked && m1.gold - g0 === 30, m1);
  ok("touch: the prompt tells a phone player to let go of the stick", /Let go of the stick/.test(m1.prompt), m1.prompt);
  await tp("touchEnd");
  await until(page, () => moor.t > 1);
  await page.screenshot({ path: join(out, "touch-holding.png") });
  await until(page, () => docked, null, { timeout: 6000 });
  ok("touch: let go and wait 3 s, the ledger opens", await ev(page, () => docked && !document.getElementById("port").hidden));
  await ctx.close();
}

// ---------- 3. first voyage: selling on a pass moves the coach on, and it says how to open the ledger ----------
{
  const { ctx, page } = await open(D, { tag: "tutorial" });
  await toSea(page, { tutorial: true });
  await ev(page, () => { tut.active = true; enterStep(5); });
  await atRingEdge(page, { cargo: 60 });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  await until(page, () => tut.step === 6);
  const c = await ev(page, () => ({ docked, txt: document.getElementById("coachTxt").textContent }));
  ok("tutorial: the sell step passes on a quick sale at sea; the coach says to stop in the ring for the ledger", !c.docked && /hold still to open the ledger/.test(c.txt), c);
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors. Screenshots in ${out}`);
process.exit(failed.length || errors.length ? 1 : 0);
