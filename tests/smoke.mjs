// Smoke test: boots the game in headless Chrome, plays for a while, and fails on any page error.
// Usage: node tests/smoke.mjs [url] [outDir]
//   url    defaults to http://127.0.0.1:8765/index.html (run `npm run serve` first)
//   outDir defaults to .review/smoke (screenshots land here)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/smoke";
mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function run(name, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${name}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof save !== "undefined", null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(800 * SLOW);
  await page.screenshot({ path: join(out, `${name}-1-boot.png`) });

  // Walk through any front-end screens until the sea is live (title, harbor, tutorial dialogs).
  for (let i = 0; i < 6; i++) {
    const live = await page.evaluate(() => typeof docked !== "undefined" && !docked && !paused);
    if (live) break;
    const sel = await page.evaluate(() => {
      const cands = ["[data-smoke=start]", "#sail", "[data-act=continue]", "[data-act=newgame]", "[data-act=ok]"];
      for (const s of cands) { const el = document.querySelector(s); if (el && el.offsetParent !== null && !el.disabled) return s; }
      return null;
    });
    if (!sel) break;
    await page.click(sel);
    await page.waitForTimeout(500 * SLOW);
  }
  await page.waitForTimeout(500 * SLOW);
  await page.screenshot({ path: join(out, `${name}-2-sea.png`) });

  // Play: steer in circles, fire often, for ~12 s.
  const keys = ["KeyW", "KeyD", "KeyW", "KeyA"];
  for (let i = 0; i < 24; i++) {
    const k = keys[i % keys.length];
    await page.keyboard.down(k); await page.waitForTimeout(450 * SLOW); await page.keyboard.up(k);
    await page.keyboard.press("Space");
  }
  // Force an engagement so combat code paths run: put the nearest enemy beside the player.
  await page.evaluate(() => {
    const e = enemies.find(x => x.alive && !x.merchant) || enemies.find(x => x.alive);
    if (e) { e.x = player.x + Math.cos(player.rot + Math.PI / 2) * 180; e.y = player.y + Math.sin(player.rot + Math.PI / 2) * 180; }
  });
  for (let i = 0; i < 10; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(400 * SLOW); }
  await page.screenshot({ path: join(out, `${name}-3-combat.png`) });
  const state = await page.evaluate(() => ({ alive: player.alive, hp: Math.round(player.hp), enemies: enemies.length, gold: save.gold }));
  console.log(`[${name}] ok`, JSON.stringify(state));
  await ctx.close();
}

try {
  await run("desktop", { width: 1280, height: 720 }, false);
  await run("mobile", { width: 390, height: 844 }, true);
} catch (e) {
  errors.push(`harness: ${e.message}`);
} finally {
  await browser.close();
}
if (errors.length) { console.error("FAIL\n" + errors.join("\n")); process.exit(1); }
console.log("PASS: no page errors. Screenshots in " + out);
