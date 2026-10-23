// Screenshots of tools/art-test.html: the class x livery grid (1x and 0.55x) and the VFX sandbox mid-effect.
// Usage: node tests/art-page.mjs [base-url] [outDir] [dpr]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.argv[2] || "http://127.0.0.1:8774", out = process.argv[3] || ".review/art-page", dpr = +(process.argv[4] || 1);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: dpr });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(base + "/tools/art-test.html?hitbox=" + (process.argv[5] || "0"), { waitUntil: "load" });
await page.waitForFunction(() => window.sandbox && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/grid@${dpr}.png`, fullPage: true });
const at = async (name, fn, wait) => { await page.evaluate(fn); await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}@${dpr}.png`, fullPage: true }); };
await at("vfx-broadside", () => { sandbox.quarter(); sandbox.broadside(); }, 160);
await at("vfx-hit-miss", () => { sandbox.hit(); sandbox.miss(); }, 120);
await at("vfx-sink-0.4s", () => sandbox.sink(), 400);
await page.waitForTimeout(500); await page.screenshot({ path: `${out}/vfx-sink-0.9s@${dpr}.png`, fullPage: true });
await page.waitForTimeout(800); await page.screenshot({ path: `${out}/vfx-sink-1.7s@${dpr}.png`, fullPage: true });
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
await browser.close();
