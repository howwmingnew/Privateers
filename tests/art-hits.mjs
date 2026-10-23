// Does hit detection match the drawn hulls? Two checks for every hull class:
//  1. geometry: sample the hull outline (hullHalf, the same function that draws it) against hitShip()'s capsule.
//     A ball (radius 3.5) whose centre is on the planking must register; one whose centre is more than a ball radius
//     off the planking is a clear miss and must not.
//  2. live: real cannonballs through the real game loop, grazing along each side just inside / clearly outside the
//     hull, and across the bow and stern tips.
// Usage: node tests/art-hits.mjs [url]
import { chromium } from "playwright";
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => typeof player !== "undefined" && player && S && S.sys.isActive());
const res = await page.evaluate(() => {
  const BALL_R = 3.5, out = { geometry: {}, live: {} };
  for (const cls of Object.keys(SHIP_ART)) {
    const a = SHIP_ART[cls], s = applyShipArt({ x: 0, y: 0, rot: 0 }, cls, "pirate");
    // distance from (x, y) to the hull outline, negative inside
    const inside = (x, y) => { const u = x / a.len + 0.5; return u >= 0 && u <= 1 && Math.abs(y) <= hullHalf(a, u); };
    let hullPx = 0, missedInside = 0, maxMissDepth = 0, falseHit = 0, capPx = 0;
    const edgeDist = (x, y) => {   // brute force: nearest outline sample
      let d = 1e9; for (let i = 0; i <= 200; i++) { const u = i / 200, w = hullHalf(a, u), px = (u - 0.5) * a.len; d = Math.min(d, Math.hypot(px - x, w - Math.abs(y))); }
      d = Math.min(d, Math.abs(x + a.len / 2) + Math.max(0, Math.abs(y) - hullHalf(a, 0)));   // transom
      return d;
    };
    for (let x = -a.len / 2 - 8; x <= a.len / 2 + 8; x += 0.5) for (let y = -a.beam / 2 - 8; y <= a.beam / 2 + 8; y += 0.5) {
      const inH = inside(x, y), hit = hitShip(s, x, y);
      if (hit) capPx++;
      if (inH) { hullPx++; if (!hit) { missedInside++; maxMissDepth = Math.max(maxMissDepth, edgeDist(x, y)); } }
      else if (hit && edgeDist(x, y) > BALL_R) falseHit++;
    }
    out.geometry[cls] = { len: a.len, beam: a.beam, hl: s.hl, hw: s.hw, hullPx: hullPx * 0.25, capPx: capPx * 0.25,
      onHullButNoHit_px2: missedInside * 0.25, worstDepth: +maxMissDepth.toFixed(2), clearMissButHit_px2: falseHit * 0.25 };
  }
  return out;
});
// live balls: target at a random heading, shots in its own frame, stepped by hand
const live = await page.evaluate(() => {
  setSail(); for (const e of enemies) { e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; spawnT = 1e9;
  Object.assign(player, { x: PORT.x, y: PORT.y - 3000, alive: true, maxHp: 1e9, hp: 1e9 });
  islands = islands.filter(i => Math.hypot(i.x - PORT.x - 600, i.y - PORT.y + 2400) > i.r + 400);   // islands are rolled per game: keep the range clear
  S.game.loop.sleep(); let t = performance.now();
  const adv = n => { for (let i = 0; i < n; i++) { t += 16.667; S.game.step(t, 16.667); } };
  const res = {};
  for (const cls of ["cutter", "sloop", "brig", "frigate", "line", "fluyt"]) {
    const a = SHIP_ART[cls], rows = [];
    // [along-axis start, lateral offset, direction] in the target's frame; expect = should it hit?
    const cases = [
      ["graze in", -a.len, a.beam / 2 - 2, 0, true], ["graze out", -a.len, a.beam / 2 + 3.5 + 2, 0, false],
      ["graze in (port)", -a.len, -(a.beam / 2 - 2), 0, true], ["graze out (port)", -a.len, -(a.beam / 2 + 5.5), 0, false],
      ["across bow tip", a.len / 2 - 3, -60, Math.PI / 2, true], ["past bow", a.len / 2 + 5, -60, Math.PI / 2, false],
      ["across stern", -a.len / 2 + 2, -60, Math.PI / 2, true], ["past stern", -a.len / 2 - 5.5, -60, Math.PI / 2, false],
    ];
    for (const [name, u0, v0, dir, expect] of cases) {
      spawnEnemy(S); const e = enemies[enemies.length - 1];
      const rot = Math.random() * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot);
      Object.assign(e, { x: PORT.x + 600, y: PORT.y - 2400, rot, speed: 0, maxSpeed: 1e-6, turnRate: 0, hp: 1e6, maxHp: 1e6, guns: { left: [], right: [] } });
      applyShipArt(e, cls, "pirate");
      const sx = e.x + c * u0 - sn * v0, sy = e.y + sn * u0 + c * v0, ang = rot + dir;
      balls.push({ spr: S.add.image(sx, sy, "ball").setDepth(7), x: sx, y: sy, vx: Math.cos(ang) * BALL_SPEED, vy: Math.sin(ang) * BALL_SPEED,
        life: 0.5, life0: 0.5, dmg: 1, burn: 0, fromPlayer: true, owner: player });
      adv(36);
      const hit = e.hp < 1e6;
      rows.push({ name, expect, hit, ok: hit === expect });
      e.spr.destroy(); e.badge?.destroy(); enemies.splice(enemies.indexOf(e), 1);
    }
    res[cls] = rows;
  }
  S.game.loop.wake();
  return res;
});
let fails = 0;
console.log("geometry (px^2 of disagreement; worstDepth = deepest on-hull point that would not register):");
for (const [cls, g] of Object.entries(res.geometry)) console.log(" ", cls.padEnd(9), JSON.stringify(g));
console.log("live balls:");
for (const [cls, rows] of Object.entries(live)) {
  const bad = rows.filter(r => !r.ok); fails += bad.length;
  console.log(" ", cls.padEnd(9), bad.length ? "FAIL " + bad.map(r => `${r.name} (expected ${r.expect ? "hit" : "miss"})`).join(", ") : `ok (${rows.length} shots)`);
}
if (errors.length) { console.log("page errors:", errors); fails++; }
console.log(fails ? `FAIL: ${fails}` : "PASS");
await browser.close();
process.exitCode = fails ? 1 : 0;
