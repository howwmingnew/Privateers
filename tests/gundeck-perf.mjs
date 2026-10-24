// Gun-deck frame cost: a Ship of the Line with every port armed fires a broadside every 0.75 s into a 34-ship brawl.
// Same method as tests/art-perf.mjs, but on a phone (390x844, 4x CPU slowdown by default). Run it against a build
// with fewer ports (e.g. main before js/gundeck.js) for the "current big-battle level" to compare with.
// Usage: node tests/gundeck-perf.mjs [url] [frames] [cpuRate] [width] [height]
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const N = +(process.argv[3] || 600), RATE = +(process.argv[4] || 4), vw = +(process.argv[5] || 390), vh = +(process.argv[6] || 844);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: vw < 500, hasTouch: vw < 500 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); } catch (e) {} });
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S);
await page.waitForTimeout(600);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
const res = await page.evaluate(async N => {
  save = fitMounts({ ...save, ship: "line" });
  const kinds = ["six", "long12", "carronade", "fire"];
  for (const { key } of MOUNTS) save[key] = save[key].map((_, i) => gunItem(kinds[i % 4]));
  applyPlayerStats(true);
  const guns = Object.values(player.guns).reduce((n, a) => n + a.length, 0);
  document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
  let ax = PORT.x + 1700, ay = PORT.y + 300;
  for (let a = 0; a < 64; a++) {
    const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { ax = x; ay = y; break; }
  }
  Object.assign(player, { x: ax, y: ay, maxHp: 1e9, hp: 1e9 });
  for (let i = 0; i < 40 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
  const pack = () => {
    for (let i = 0; i < 6 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
    for (const e of enemies) if (e.alive && dist(e, player) > 800) {
      const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 450;
      e.x = player.x + Math.cos(a) * r; e.y = player.y + Math.sin(a) * r; e.rot = a + Math.PI / 2;
    }
  };
  const game = S.game, gl = game.renderer.gl;
  game.loop.sleep();
  let t = performance.now(); const times = []; let peakBalls = 0, volleys = 0;
  const step = i => {
    if (i % 30 === 0) pack();
    if (i % 45 === 0) {   // four ships fore, aft and on both beams, so every mount is engaged and all the guns go off
      const near = enemies.filter(e => e.alive).sort((a, b) => dist(a, player) - dist(b, player)).slice(0, 4);
      near.forEach((e, k) => { const a = player.rot + k * Math.PI / 2; e.x = player.x + Math.cos(a) * 170; e.y = player.y + Math.sin(a) * 170; });
      playerFire(); volleys++;
    }
    joyVec = { x: Math.cos(i / 90), y: Math.sin(i / 90), m: 0.6 };
    const t0 = performance.now(); t += 16.667;
    game.step(t, 16.667); if (gl) gl.finish();
    peakBalls = Math.max(peakBalls, balls.length);
    return performance.now() - t0;
  };
  for (let i = 0; i < 120; i++) step(i);
  peakBalls = 0; volleys = 0;
  for (let i = 0; i < N; i++) times.push(step(i));
  game.loop.wake();
  const s = [...times].sort((a, b) => a - b), q = k => s[Math.min(s.length - 1, Math.floor(s.length * k))];
  return { guns, frames: N, mean: +(times.reduce((a, b) => a + b, 0) / N).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2),
    ships: enemies.filter(e => e.alive).length + 1, onScreen: enemies.filter(e => e.alive && onScreen(e.x, e.y, 0)).length, peakBalls, volleys, renderer: gl ? "webgl" : "canvas" };
}, N);
console.log(JSON.stringify({ viewport: `${vw}x${vh}`, cpuRate: RATE, ...res }));
if (errors.length) { console.error("page errors:\n" + errors.join("\n")); process.exitCode = 1; }
await browser.close();
