// Staged in-game captures for the art pass, with deterministic time (the rAF loop is put to sleep and the game is
// stepped by hand in 16.67 ms frames; tweens are pinned to the same step because Phaser 3.80 tweens read Date.now()).
// Usage: node tests/art-shots.mjs [url] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const url = process.argv[2] || "http://127.0.0.1:8765/index.html", out = process.argv[3] || ".review/art-shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];

async function open(vw, vh, dpr = 1, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${vw}x${vh}@${dpr}] ${e.message}`));
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && S && S.sys.isActive(), null, { timeout: 15000 });
  await page.evaluate(() => {
    setSail();
    S.game.loop.sleep(); window.__t = performance.now(); S.tweens.getDelta = () => 16.667;
    window.adv = ms => { for (let i = 0, n = Math.round(ms / 16.667); i < n; i++) { __t += 16.667; S.game.step(__t, 16.667); } };
    // open water away from islands, ~2 rings out
    window.arena = (() => {
      for (let r = 1200; r < 2400; r += 150) for (let a = 0; a < 64; a++) { const x = PORT.x + Math.cos(a) * r, y = PORT.y + Math.sin(a) * r;
        if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 480)) return { x, y }; }
      return { x: PORT.x + 1400, y: PORT.y };
    })();
    window.ship = (cls, faction, L, dx, dy, rot, hpK = 1) => {   // an enemy of a given class/faction placed beside the player
      spawnEnemy(S); const e = enemies[enemies.length - 1];
      Object.assign(e, { faction, merchant: faction === "merchant", L, x: player.x + dx, y: player.y + dy, rot, speed: 0, hp: e.maxHp * hpK });
      applyShipArt(e, cls); refreshBadge(e); e.spr.setPosition(e.x, e.y).setRotation(rot);
      return e;
    };
    window.clearSea = () => { for (const e of enemies) { e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; spawnT = 999; };
    window.playerAs = (cls, guns) => {
      save = fitMounts({ ...save, ship: cls, unlocked: { six: true, long12: true, carronade: true, fire: true } });
      if (guns) ["left", "right"].forEach(k => save[k] = save[k].map((_, i) => gunItem(guns[i % guns.length], 3)));
      applyPlayerStats(true);
      Object.assign(player, { x: arena.x, y: arena.y, rot: 0, speed: 0 }); player.spr.setPosition(player.x, player.y);
      S.cameras.main.centerOn(player.x, player.y);
    };
  });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

// 1. the player in each of the five classes, with a cutter, brig and fluyt alongside for scale
{
  const { ctx, page } = await open(1280, 720);
  for (const cls of ["sloop", "schooner", "brig", "frigate", "line"]) {
    await page.evaluate(cls => { clearSea(); playerAs(cls); player.rot = -0.25;
      ship("cutter", "pirate", 2, 230, -120, 2.6); ship("brig", "navy", 4, -250, 150, 0.3); ship("fluyt", "merchant", 3, 260, 170, -2.8); adv(250); }, cls);
    const z = await page.evaluate(() => S.cameras.main.zoom.toFixed(3));
    console.log(`class ${cls}: zoom ${z}`);
    await shot(page, `class-${cls}`);
  }
  // 2. combat with several factions; some ships already hurt so smoke and flames show
  await page.evaluate(() => {
    clearSea(); playerAs("frigate", ["six", "long12", "carronade", "fire"]); player.rot = 0; player.maxHp = player.hp = 1e6;
    ship("brig", "pirate", 4, 30, 200, 0, 0.45); ship("cutter", "pirate", 2, 330, -60, 3.1); ship("frigate", "navy", 7, -330, -180, 0.2, 0.2);
    ship("brig", "navy", 5, 360, 230, 3.4); ship("fluyt", "merchant", 3, -120, 260, 0.1); ship("line", "pirate", 10, -380, 140, -0.3, 0.6);
    adv(1200); playerFire(); adv(260);
  });
  await shot(page, "combat-volley");
  await page.evaluate(() => { adv(900); });
  await shot(page, "combat-after");
  // 3. a sinking, mid-animation
  await page.evaluate(() => {
    clearSea(); playerAs("brig"); player.rot = 0;
    window.victim = ship("frigate", "pirate", 6, 0, 150, 0, 0.02); victim.hp = 1; ship("brig", "navy", 4, -300, -160, 0.4);
    adv(100); playerFire();
    for (let i = 0; i < 200 && victim.alive; i++) adv(17);
  });
  await page.evaluate(() => adv(60)); await shot(page, "sink-0.06s");
  await page.evaluate(() => adv(400)); await shot(page, "sink-0.45s");
  await page.evaluate(() => adv(500)); await shot(page, "sink-0.95s");
  await page.evaluate(() => adv(700)); await shot(page, "sink-1.65s");
  // 4. low hull: vignette, smoke and flames on the player
  await page.evaluate(() => { clearSea(); playerAs("schooner"); player.hp = player.maxHp * 0.18; player.speed = 150; joyVec = { x: 1, y: 0.2, m: 1 }; adv(900); joyVec = { x: 0, y: 0, m: 0 }; });
  await shot(page, "lowhull");
  await ctx.close();
}
// 5. mobile portrait at zoom 0.55, at 1x and at 3x device pixels (canvas capped at 2x)
for (const dpr of [1, 3]) {
  const { ctx, page } = await open(390, 844, dpr, true);
  await page.evaluate(() => {
    clearSea(); playerAs("brig", ["six", "long12", "six"]); player.rot = -1.4; player.maxHp = player.hp = 1e6;
    ship("brig", "pirate", 5, 170, -60, -1.7, 0.4); ship("cutter", "pirate", 2, -160, -260, 1.2); ship("frigate", "navy", 7, -150, 240, -1.2);
    ship("fluyt", "merchant", 3, 170, 330, 2.0); ship("line", "boss", 9, 120, -420, 2.6); enemies[enemies.length - 1].boss = true; applyShipArt(enemies[enemies.length - 1]);
    adv(900); playerFire(); adv(240);
  });
  const z = await page.evaluate(() => ({ zoom: S.cameras.main.zoom, label: labelScale(), res: enemies.map(e => e.badge && e.badge.style.resolution) }));
  console.log(`mobile dpr ${dpr}:`, JSON.stringify(z));
  await shot(page, `mobile-dpr${dpr}`);
  await ctx.close();
}
// 6. scenery at 2x: the harbour and an island
{
  const { ctx, page } = await open(1280, 720, 2);
  await page.evaluate(() => { clearSea(); S.cameras.main.stopFollow(); S.cameras.main.centerOn(PORT.x, PORT.y); adv(300); });
  await shot(page, "harbor-dpr2");
  await page.evaluate(() => { const i = islands.slice().sort((a, b) => b.r - a.r)[3]; S.cameras.main.centerOn(i.x, i.y); adv(50); });
  await shot(page, "island-dpr2");
  await page.evaluate(() => { S.cameras.main.setZoom(S.cameras.main.zoom * 0.3); S.cameras.main.centerOn(PORT.x + 900, PORT.y + 400); adv(50); });
  await shot(page, "sea-depth-overview");
  await ctx.close();
}
await browser.close();
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no page errors");
