// Renders tools/og.html (the game's own art code) in Chrome and saves og.png (1200x630) at the repo root: the picture
// Discord, LINE, X and Facebook show when the game's address is shared. Crawlers do not run JavaScript, so it has to be a file.
// Usage: node tools/og-build.mjs [out.png]      (needs network: Phaser and the fonts load from CDNs)
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const page_ = fileURLToPath(new URL("./og.html", import.meta.url));
const out = process.argv[2] || fileURLToPath(new URL("../og.png", import.meta.url));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(pathToFileURL(page_).href, { waitUntil: "load" });
  await page.waitForFunction(() => window.ogReady === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  console.log("wrote " + out);
} finally { await browser.close(); }
