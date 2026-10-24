// Frame cost of the highlight replay (#20): a 34-ship brawl (tests/art-perf.mjs's method) with recording off and on, ROUNDS runs of each,
// interleaved (the order swaps every round, so drift and warm-up fall on both), the MEDIAN of each side compared. Run unthrottled and
// with the CPU slowed 4x (Chrome DevTools throttling: a stand-in for a weak machine). Passes when recording on costs at most 10% more.
// Also times the real loop (rAF intervals) unthrottled. Prints a markdown table for the PR.
// Usage: node tests/replay-perf.mjs [url] [rounds] [frames]
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const ROUNDS = +(process.argv[3] || 7), N = +(process.argv[4] || 300);
const SLOW = +process.env.TEST_SLOW || 1;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
await ctx.addInitScript(() => { if (sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded", "1"); localStorage.clear(); localStorage.setItem("privateers-lang", "en"); });
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
await page.click("[data-smoke=start]");
await page.waitForTimeout(500 * SLOW);
await page.evaluate(() => { if (docked) setSail(); });
await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
await page.evaluate(() => {
  save.tutorialDone = true; tutorialReset(); window.managePopulation = () => {};
  document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
  let ax = PORT.x + 1700, ay = PORT.y + 300;
  for (let a = 0; a < 64; a++) {
    const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { ax = x; ay = y; break; }
  }
  Object.assign(player, { x: ax, y: ay, maxHp: 1e9, hp: 1e9 });
  window.__pack = () => {
    for (let i = 0; i < 6 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
    for (const e of enemies) if (e.alive && dist(e, player) > 800) {
      const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 450;
      e.x = player.x + Math.cos(a) * r; e.y = player.y + Math.sin(a) * r; e.rot = a + Math.PI / 2;
    }
  };
  for (let i = 0; i < 40; i++) __pack();
});
const cdp = await ctx.newCDPSession(page);

// one run: update + render per frame, stepping by hand with a little real time between frames (so the 30 fps copy and the encoder have work)
const stepped = (on, frames) => page.evaluate(async ({ on, frames }) => {
  saveSettings({ replay: on });
  const game = S.game, gl = game.renderer.gl;
  game.loop.sleep();
  let t = performance.now(); const times = [];
  for (let i = 0; i < 80 + frames; i++) {
    if (i % 30 === 0) __pack();
    if (i % 45 === 0) playerFire();
    joyVec = { x: Math.cos(i / 90), y: Math.sin(i / 90), m: 0.6 };
    const t0 = performance.now(); t += 16.667;
    game.step(t, 16.667); if (gl) gl.finish();
    if (i >= 80) times.push(performance.now() - t0);
    if (i % 4 === 0) await new Promise(r => setTimeout(r, 12));
  }
  game.loop.wake();
  const s = [...times].sort((a, b) => a - b);
  return { mean: times.reduce((a, b) => a + b, 0) / frames, p50: s[Math.floor(s.length / 2)], rec: RP.running };
}, { on, frames });
const live = on => page.evaluate(async on => {
  saveSettings({ replay: on });
  await new Promise(r => setTimeout(r, 600));
  const iv = []; let last = performance.now();
  await new Promise(res => { const end = last + 3000; const f = n => { iv.push(n - last); last = n; n < end ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  return { mean: iv.reduce((a, b) => a + b, 0) / iv.length, rec: RP.running };
}, on);

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const f = x => x.toFixed(2);
const rows = [];
let failed = 0;
async function compare(label, run, key) {
  const off = [], on = [];
  for (let r = 0; r < ROUNDS; r++) {
    for (const mode of r % 2 ? [true, false] : [false, true]) {
      const res = await run(mode);
      if (res.rec !== mode) { console.log(`FAIL ${label}: recording was ${res.rec}, wanted ${mode}`); failed++; }
      (mode ? on : off).push(res[key]);
    }
  }
  const mo = med(off), mn = med(on), pct = (mn / mo - 1) * 100, pass = mn <= mo * 1.1;
  if (!pass) failed++;
  rows.push(`| ${label} | ${f(mo)} | ${f(mn)} | ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% | ${off.map(f).join(" ")} / ${on.map(f).join(" ")} | ${pass ? "✅" : "❌"} |`);
  console.log(`${pass ? "ok  " : "FAIL"} ${label}: median off ${f(mo)} ms, on ${f(mn)} ms (${pct.toFixed(1)}%)`);
}
await compare("update+render per frame (ms)", on => stepped(on, N), "mean");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await compare("update+render per frame, CPU 4x slower (ms)", on => stepped(on, Math.round(N / 2)), "mean");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
await compare("live rAF interval (ms)", live, "mean");
console.log(`\n| 量測（${ROUNDS} 輪交錯，取中位數） | 關 | 開 | 差 | 每輪（關 / 開） | ≤10% |\n|---|---|---|---|---|---|\n${rows.join("\n")}`);
if (errors.length) { console.log("page errors:", errors.slice(0, 5)); failed++; }
await browser.close();
process.exit(failed ? 1 : 0);
