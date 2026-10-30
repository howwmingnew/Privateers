// Harbor ring checks (js/mooring.js): sailing through the dock ring sells the hold and mends the hull with no menu;
// stopping inside it for 3 s opens the ledger. Desktop keyboard, the phone's touch stick, and the tutorial's sell step.
// Usage: node tests/harbor.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

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
  await until(page, () => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function until(page, fn, arg = null, { timeout = 8000 * SLOW } = {}) {
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
  await page.waitForTimeout(450 * SLOW);
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
  toast: document.getElementById("toast").classList.contains("on") ? document.getElementById("toast").textContent : "",
  tally: document.getElementById("tally")?.classList.contains("on") ? document.getElementById("tally").textContent : "", sorties: save.stats.sorties, statGold: save.stats.gold, enemies: enemies.length }));

// ---------- 1. desktop: pass through = quick resupply; stop for 3 s = the ledger ----------
{
  const { ctx, page } = await open(D, { tag: "desk" });
  await toSea(page);
  // just set sail, still inside the ring and stopped: the ledger must not reopen by itself
  await page.waitForTimeout(3600 * SLOW);
  const s0 = await state(page);
  ok("after Set sail the ship sits in the ring without the ledger reopening; the only prompt says to sail out first",
    !s0.docked && !s0.canDock && /Sail out of the ring/.test(s0.prompt), s0);

  const before = await state(page);
  await ev(page, () => { window.__resets = 0; const orig = resetEnemies; window.resetEnemies = sc => { window.__resets++; orig(sc); }; });
  await atRingEdge(page, { cargo: 80, hp: 0.3 });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  await until(page, () => cargo === 0);
  await page.waitForTimeout(250 * SLOW);
  const s1 = await state(page);
  const resets = await ev(page, () => window.__resets);
  ok("sailing into the ring sells the hold at once, reported by the tally alone (no toast), and no ledger",
    !s1.docked && !s1.paused && s1.gold - before.gold === 80 && /cargo/i.test(s1.tally) && !/Sold the hold/.test(s1.toast), s1);
  ok("quick resupply keeps the sortie: no sea reset, no new sortie, gold counted in the log", resets === 0 && s1.sorties === before.sorties && s1.statGold - before.statGold === 80, { resets, s1 });
  ok("while the tally is up the stop prompt waits (one report of the sale)", s1.prompt === "" && s1.t === 0, s1.prompt);
  await until(page, () => /\+80/.test(document.getElementById("tally").textContent), null, { timeout: 3000 * SLOW });
  ok("the tally counts up to the 80 gold paid", true);
  await ev(page, () => { tallyUntil = 0; });   // the tally's 3.2 s would outlast the pass: end it here
  await until(page, () => !document.getElementById("moor").hidden || !moor.inside, null, { timeout: 2000 * SLOW });
  const s1b = await state(page);
  ok("moving in the ring after the tally: the prompt says how to stop for the ledger", /furl them \(S\)/.test(s1b.prompt), s1b.prompt);
  await page.waitForTimeout(500 * SLOW);
  const s2 = await state(page);
  ok("the hull mends quickly while inside the ring", s2.hp > s1.hp && s2.hp >= 0.5, { from: s1.hp, to: s2.hp });
  await page.screenshot({ path: join(out, "desk-pass.png") });
  // keep sailing straight through and out the far side: still no ledger
  await until(page, () => !moor.inside, null, { timeout: 8000 * SLOW });
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
  await until(page, () => moor.t === 0, null, { timeout: 3000 * SLOW });
  await page.keyboard.press("KeyS");
  const t0 = Date.now();
  await until(page, () => docked, null, { timeout: 9000 * SLOW });
  const held = (Date.now() - t0) / 1000;
  const s5 = await ev(page, () => ({ msg: document.getElementById("pMsg").textContent, port: !document.getElementById("port").hidden, prompt: !document.getElementById("moor").hidden }));
  ok("moving resets the timer; stopped again, the ledger opens after about 3 s", held > 2.6 && held < 6, { held });
  ok("the ledger's message names what the pass already sold, and the prompt is gone", s5.port && /45/.test(s5.msg) && !s5.prompt, s5);
  await page.waitForTimeout(450 * SLOW);
  await page.click("#sail");
  await until(page, () => !docked && !paused);
  await page.waitForTimeout(3600 * SLOW);
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
  await ev(page, () => { tallyUntil = 0; });
  await until(page, () => !document.getElementById("moor").hidden || !moor.inside, null, { timeout: 2000 * SLOW });
  const m1b = await state(page);
  ok("touch: the prompt tells a phone player to let go of the stick", /Let go of the stick/.test(m1b.prompt), m1b.prompt);
  await tp("touchEnd");
  await until(page, () => moor.t > 1);
  await page.screenshot({ path: join(out, "touch-holding.png") });
  await until(page, () => docked, null, { timeout: 6000 * SLOW });
  ok("touch: let go and wait 3 s, the ledger opens", await ev(page, () => docked && !document.getElementById("port").hidden));
  await ctx.close();
}

// ---------- 3. first voyage: selling on a pass moves the coach on, and it says how to open the ledger ----------
{
  const { ctx, page } = await open(D, { tag: "tutorial" });
  await toSea(page, { tutorial: true });
  await ev(page, () => { tut.active = true; save.sunk = 1; enterStep(5); });   // the lesson reaches "sell" with a kill behind it (js/tutorial.js: loot alone, say a wreck's, does not move the card on)
  await atRingEdge(page, { cargo: 60 });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  await until(page, () => tut.step === 6);
  const c = await ev(page, () => ({ docked, txt: document.getElementById("coachTxt").textContent }));
  ok("tutorial: the sell step passes on a quick sale at sea; the coach says to stop in the ring for the ledger", !c.docked && /hold still to open the ledger/.test(c.txt), c);
  await ctx.close();
}

// ---------- 4. #116: furled sail stops short, the cursor owns the sail while a button steers, the prompt names the sail, the touch dial tells the truth ----------
{
  const { ctx, page } = await open(D, { tag: "furl" });
  await toSea(page);
  await atRingEdge(page, {});
  const run = async (hold) => {   // sail Full at top speed in open water, then S three times (optionally with a turn key let go at the same moment)
    await ev(page, () => { canDock = false; player.x = PORT.x + DOCK_R + 500; player.y = PORT.y; player.rot = 0; player.speed = player.maxSpeed; setSailLevel(3); });
    const x0 = await ev(page, () => player.x);
    if (hold) await page.keyboard.down("KeyA");
    await page.keyboard.press("KeyS"); await page.keyboard.press("KeyS"); await page.keyboard.press("KeyS");
    if (hold) await page.keyboard.up("KeyA");
    await page.waitForTimeout(2500 * SLOW);   // long enough to be at rest if it is going to be
    return ev(page, x => ({ run: Math.round(Math.hypot(player.x - x, player.y - PORT.y)), max: Math.round(player.maxSpeed), sp: Math.round(player.speed), lv: sailLevel }), x0);
  };
  const a = await run(false), b = await run(true);
  ok("S to Stopped from full speed coasts under 0.3 s of top speed (no overshoot past the ring)", a.run < a.max * 0.3, a);
  ok("S while a turn key is let go at the same moment does not start the coast either", b.run < b.max * 0.3, b);
  // the cursor owns the sail while a mouse button steers
  const at = await ev(page, () => { player.rot = 0; player.speed = 0; setSailLevel(0); const c = S.game.canvas.getBoundingClientRect(), cam = S.cameras.main, k = S.game.canvas.width / c.width;
    return { x: (player.x - cam.worldView.x) * cam.zoom / k, y: (player.y - cam.worldView.y) * cam.zoom / k }; });
  await page.mouse.move(at.x, at.y - 80); await page.mouse.down({ button: "right" }); await page.waitForTimeout(300 * SLOW);
  await page.keyboard.press("KeyW");
  const h = await ev(page, () => ({ lv: sailLevel, by: sailByMouse, txt: document.getElementById("sailTxt").textContent, toast: document.getElementById("toast").textContent }));
  ok("right button held: the cursor sets the sail (80 px = Slow), the dial says so, W is ignored and a toast explains", h.lv === 1 && h.by && /by cursor/.test(h.txt) && /cursor sets the sail/.test(h.toast), h);
  await page.mouse.up({ button: "right" }); await page.waitForTimeout(200 * SLOW);
  await page.keyboard.press("KeyW");
  const r = await ev(page, () => ({ lv: sailLevel, by: sailByMouse, txt: document.getElementById("sailTxt").textContent }));
  ok("button let go: the sail stays, the 'by cursor' tag goes, and W works again", r.lv === 2 && !r.by && !/cursor/.test(r.txt), r);
  // in the ring with the sail up: the prompt says which key furls it
  await atRingEdge(page, { speed: 40 });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  await until(page, () => moor.inside && /Sails are still up/.test(document.getElementById("moor").textContent), null, { timeout: 4000 * SLOW });
  ok("in the ring with the sail still up the prompt names the sail and the S key", await ev(page, () => /Sails are still up \(Full\): furl them \(S\)/.test(document.getElementById("moor").textContent)));
  await ctx.close();
}
{
  const { ctx, page } = await open(M, { mobile: true, tag: "touch-dial" });
  await toSea(page);
  await atRingEdge(page, {});
  await ev(page, () => { player.x = PORT.x + DOCK_R + 500; canDock = false; });
  const cdp = await ctx.newCDPSession(page);
  const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const dial = () => ev(page, () => document.querySelector("#touchSail b").textContent);
  await tp("touchStart", 260, 600); await tp("touchMove", 230, 600); await tp("touchMove", 200, 600);
  await page.waitForTimeout(400 * SLOW);
  const pulled = await dial();
  await tp("touchEnd");
  await page.waitForTimeout(400 * SLOW);
  const lifted = await dial();
  ok("touch dial reads Full while the stick is pulled, Stopped once the finger lifts", pulled === "Full" && lifted === "Stopped", { pulled, lifted });
  await ev(page, () => setTouchCap(1));
  await page.waitForTimeout(200 * SLOW);
  ok("a lowered cap still reads as the cap (labelled 'Sail max')", await ev(page, () => document.querySelector("#touchSail b").textContent === "Slow" && /max/i.test(document.querySelector("#touchSail small").textContent)));
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors. Screenshots in ${out}`);
process.exit(failed.length || errors.length ? 1 : 0);
