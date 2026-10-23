// Frame-cost benchmark: 30+ ships fighting around the player (Ship of the Line, every gun type).
// Steps the game by hand in fixed 16.67 ms frames and times update + render (+ gl.finish so GPU work counts).
// Usage: node tests/art-perf.mjs [url] [frames] [width] [height]
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const N = +(process.argv[3] || 600), vw = +(process.argv[4] || 1280), vh = +(process.argv[5] || 720);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S);
await page.waitForTimeout(600);
const res = await page.evaluate(async N => {
  save = fitMounts({ ...save, ship: "line", unlocked: { six: true, long12: true, carronade: true, fire: true } });
  ["left", "right"].forEach(k => save[k] = save[k].map((_, i) => ["six", "long12", "carronade", "fire"][i % 4]));
  applyPlayerStats(true);
  document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
  // open water well outside the safe ring
  let ax = PORT.x + 1700, ay = PORT.y + 300;
  for (let a = 0; a < 64; a++) {
    const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { ax = x; ay = y; break; }
  }
  Object.assign(player, { x: ax, y: ay, maxHp: 1e9, hp: 1e9 });
  for (let i = 0; i < 40 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
  const pack = () => {   // keep 30+ ships in one brawl around the player
    for (let i = 0; i < 6 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
    for (const e of enemies) if (e.alive && dist(e, player) > 800) {
      const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 450;
      e.x = player.x + Math.cos(a) * r; e.y = player.y + Math.sin(a) * r; e.rot = a + Math.PI / 2;
    }
  };
  const game = S.game, gl = game.renderer.gl;
  game.loop.sleep();
  let t = performance.now(); const times = [];
  const step = i => {
    if (i % 30 === 0) pack();
    if (i % 45 === 0) playerFire();
    joyVec = { x: Math.cos(i / 90), y: Math.sin(i / 90), m: 0.6 };
    const t0 = performance.now(); t += 16.667;
    game.step(t, 16.667); if (gl) gl.finish();
    return performance.now() - t0;
  };
  for (let i = 0; i < 120; i++) step(i);            // warm-up
  let peakParticles = 0, peakObjs = 0;
  for (let i = 0; i < N; i++) {
    times.push(step(i));
    if (i % 20 === 0) {
      let p = 0; S.children.list.forEach(o => { if (o.getAliveParticleCount) p += o.getAliveParticleCount(); });
      peakParticles = Math.max(peakParticles, p); peakObjs = Math.max(peakObjs, S.children.list.length);
    }
  }
  game.loop.wake();
  const s = [...times].sort((a, b) => a - b), q = k => s[Math.min(s.length - 1, Math.floor(s.length * k))];
  return { frames: N, mean: +(times.reduce((a, b) => a + b, 0) / N).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2),
    ships: enemies.filter(e => e.alive).length + 1, onScreen: enemies.filter(e => e.alive && onScreen(e.x, e.y, 0)).length,
    sunk: save.sunk, peakParticles, peakObjs, zoom: +S.cameras.main.zoom.toFixed(3), renderer: gl ? "webgl" : "canvas" };
}, N);
console.log(JSON.stringify(res));
if (errors.length) { console.error("page errors:\n" + errors.join("\n")); process.exitCode = 1; }
await browser.close();
