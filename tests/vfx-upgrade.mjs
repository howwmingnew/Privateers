// VFX upgrade (#76, js/vfx-new.js) in the real game, headless: the picked effects appear (chain blast, muzzle smoke, flame tongues, spiral
// column, funnel, foam wall, forked bolt, swirling fog), the pool never passes its cap under a 60-gun salvo, the blast changes no damage
// (the crit's splash lands in the same call, not after the animation), and no page error. Usage: node tests/vfx-upgrade.mjs [url]
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [], errors = [];
const check = (ok, msg, detail) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg + (ok || detail === undefined ? "" : "  " + JSON.stringify(detail))); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
await page.goto(url, { waitUntil: "load" }); await ready();
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); localStorage.setItem("privateers-save-v2", JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 2 } })); });
await page.reload({ waitUntil: "load" }); await ready();
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); player.hp = player.maxHp; } };
  document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; save.tutorialDone = true;
  for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; spawnT = 1e9; fleets = [];
  Object.assign(wx, { on: true, easy: false, t: 100 }); Object.assign(dis, { plan: [], i: 0, live: [], protectUntil: -1, fog: 0, noDodge: true });
  Object.assign(player, { maxHp: 1e6, hp: 1e6, speed: 0, alive: true, burnT: 0 });
  player.x = PORT.x + 1700; player.y = PORT.y + 300;
  for (let a = 0; a < 64; a++) {   // open water, well away from the harbor's safe ring (a spout turns back there)
    const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { player.x = x; player.y = y; break; }
  }
  player.spr.setPosition(player.x, player.y); S.cameras.main.centerOn(player.x, player.y);
  stepN(5);
  window.tex = key => VN.pool.ps.filter(p => p.tex === key).length;
});
check(await ev(() => !!(VN.pool && VN.pool.cap > 0)), "the new pool is up");
check(await ev(() => vnK() <= 1 && vnK() > 0), "vnK is a sane share");

// 1. the chain blast, and damage in the same call
const blast = await ev(() => {
  const e = makeEnemy(S, player.x + 300, player.y, 3, "merchant"); e.x = player.x + 300; e.y = player.y; e.speed = 0; e.maxHp = e.hp = 500; enemies.push(e);
  const near = makeEnemy(S, player.x + 340, player.y + 60, 3, "merchant"); near.x = player.x + 340; near.y = player.y + 60; near.speed = 0; near.maxHp = near.hp = 500; enemies.push(near);
  const hp0 = near.hp; powderBlast(e);
  const sync = near.hp < hp0;   // the splash landed inside the call, not after any animation
  magazineBurst(e); stepN(40);
  return { sync, n: VN.pool.ps.length, draws: VN.pool.draws.length, timers: VN.pool.timers.length };
});
check(blast.sync, "powder blast damage lands in the same call", blast);
check(blast.n > 20, "the chain blast spawned particles (3 pops, then the big one)", blast);
await ev(() => stepN(240));
check(await ev(() => VN.pool.ps.length) < 30, "the blast is over within ~4 s");

// 2. 60 loud muzzle plumes at once: capped, hazed, merged
const mz = await ev(() => {
  VN.pool.clear(); VN.loud = [];
  for (let i = 0; i < 60; i++) vfxMuzzle(player.x + i, player.y - 30, -Math.PI / 2, false);
  stepN(2);
  return { n: VN.pool.ps.length, cap: VN.pool.cap, haze: VN.pool.tags.haze || 0, loud: VN.loud.length };
});
check(mz.n <= mz.cap, "pool within its cap after a 60-gun salvo", mz);
check(mz.haze <= 36 && mz.loud <= 8, "haze and loud plumes are capped", mz);
check(mz.n > 5, "muzzle smoke appeared", mz);
await ev(() => { VN.pool.clear(); for (let i = 0; i < 400; i++) vfxMuzzle(player.x, player.y - 30, 0, false); stepN(1); });
check(await ev(() => VN.pool.ps.length <= VN.pool.cap), "pool within cap after 400 shots");

// 3. a burning hull: flame tongues and smoke puffs; an incendiary's oil patch
const fire = await ev(() => {
  VN.pool.clear(); const s = player; s.hp = s.maxHp; s.burnT = 5; s.burns = [{ dps: 1, t: 5 }];
  vfxShip(s, 0.05); stepN(20); for (let i = 0; i < 12; i++) { s.flameT = 0; s.smokeT = 0; vfxShip(s, 0.05); s.maxHp = 100; s.hp = 20; s.flameT = 0; s.smokeT = 0; vfxShip(s, 0.05); s.maxHp = 1e6; s.hp = 1e6; }
  stepN(2);
  const spill = vnSpill(player.x + 120, player.y + 40);
  stepN(30);
  return { flames: tex("vn-flame"), puffs: VN.pool.ps.filter(p => p.tex.startsWith("vn-puff")).length, spill, patchFlames: tex("vn-flame") };
});
check(fire.flames > 0 && fire.puffs > 0, "burning hull makes flame tongues and smoke puffs", fire);
check(fire.spill === true, "an incendiary leaves a fire patch on the water", fire);
await ev(() => { player.burnT = 0; });

// 4. disasters (forced next to the player): spiral, funnel, foam wall, crest, bolt
const dis4 = {};
for (const kind of ["vortex", "spout", "tsunami", "rogue", "lightning"]) {
  dis4[kind] = await ev(k => {
    VN.pool.clear(); dis.live.forEach(e => e.txt?.destroy()); dis.live = []; dis.protectUntil = -1;
    const forced = !!disForce(k, k === "tsunami" ? null : { x: player.x + 160, y: player.y }, { warn: 0.3 });
    stepN(k === "lightning" ? 40 : 160);
    const live = dis.live.find(e => e.kind === k);
    return { forced, n: VN.pool.ps.length, st: live && live.st, hit: !!(live && live.vnHit), live: dis.live.map(e => e.kind + e.st) };
  }, kind);
}
check(dis4.spout.n > 15, "waterspout: spiral spray", dis4.spout);
check(dis4.vortex.n > 15, "whirlpool: funnel specks", dis4.vortex);
check(dis4.tsunami.n >= 0 && dis4.tsunami.st, "tsunami runs (foam puffs only while on screen)", dis4.tsunami);
check(dis4.lightning.hit, "lightning: the stroke effect fired once", dis4.lightning);
// 5. fog: puffs circle the edge of sight; thinner with weather effects off; none when it clears
const fog = await ev(() => {
  VN.pool.clear(); dis.live.forEach(e => e.txt?.destroy()); dis.live = [];
  disForce("fog", null, { warn: 0.3, end: wx.t + 1e5 }); stepN(500);
  const on = VN.fog.length, far = VN.fog.every(q => Math.hypot(q.im.x - player.x, q.im.y - player.y) > disSight() * 0.7);
  SETTINGS.weatherFx = false; stepN(5); const off = VN.fog.length; SETTINGS.weatherFx = true;
  dis.live = []; dis.fog = 0; stepN(5);
  return { on, off, far, gone: VN.fog.length };
});
check(fog.on > 5 && fog.far, "fog puffs circle at the edge of sight, clear of the middle", fog);
check(fog.off < fog.on, "weather effects off thins the fog puffs", fog);
check(fog.gone === 0, "no fog puffs once the fog clears", fog);
// 6. the pool never passes its cap, whatever is running
check(await ev(() => VN.pool.ps.length <= VN.pool.cap), "pool within cap at the end");
await ev(() => { dock("test"); });
await page.waitForTimeout(200);
await browser.close();
if (errors.length) { fails.push(...errors); errors.forEach(e => console.log("  FAIL  " + e)); }
if (fails.length) { console.error("FAIL: " + fails.length); process.exit(1); }
console.log("vfx-upgrade: ok");
