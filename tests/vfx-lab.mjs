// VFX lab page (tools/vfx-lab.html): loads, every effect plays without an error, each makes particles, low-power halves the count,
// and the page fits a 390 px phone. Usage: node tests/vfx-lab.mjs [base-url]
import { chromium } from "playwright";
const base = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/index\.html$/, "").replace(/\/$/, "");
const SLOW = +process.env.TEST_SLOW || 1;
const errors = [], fails = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push("console: " + m.text()); });
await page.goto(base + "/tools/vfx-lab.html", { waitUntil: "load" });
await page.waitForFunction(() => window.vfxLab && window.vfxLab && window.vfxLab.ready(), null, { timeout: 20000 * SLOW });
const check = (ok, msg) => { if (!ok) fails.push(msg); };

check(await page.evaluate(() => JSON.parse(localStorage.getItem("privateers-settings") || "{}").muted === true), "settings muted flag not written");
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow at 390 px");
const ids = await page.evaluate(() => vfxLab.ids());
check(ids.length === 28, "expected 28 effects (7 categories x cur,A,B,C), got " + ids.length);
check((await page.$$(".play")).length === ids.length, "one play button per effect");

const peaks = {};
for (const bg of ["day", "night", "storm"]) {
  await page.evaluate(b => vfxLab.setBg(b), bg);
  for (const id of ids) {
    if (bg !== "day" && !id.endsWith("-A")) continue;   // the other backgrounds: one effect per category is enough
    await page.evaluate(i => vfxLab.play(i), id);
    await page.waitForTimeout(700 * SLOW);
    const s = await page.evaluate(() => vfxLab.stats());
    if (bg === "day") peaks[id] = s.peak;
    if (!/^[4-7]-cur$/.test(id)) check(s.peak > 0, `${id} (${bg}) made no particles`);   // the current spout, whirl, wave and bolt are drawn lines only
    check(Number.isFinite(s.ms), `${id} frame time is not a number`);
  }
}
// low-power mode: a new effect's peak is clearly smaller (loose bound: random counts)
await page.evaluate(() => vfxLab.setLow(true));
for (const id of ["1-A", "4-A"]) {
  await page.evaluate(i => vfxLab.play(i), id); await page.waitForTimeout(900 * SLOW);
  const lo = (await page.evaluate(() => vfxLab.stats())).peak;
  check(lo < peaks[id] * 0.8, `${id} low-power peak ${lo} not below 80% of ${peaks[id]}`);
}
await page.evaluate(() => vfxLab.setLow(false));
// the real buttons play too
await page.click('[data-id="2-B"]'); await page.waitForTimeout(500 * SLOW);
check((await page.evaluate(() => vfxLab.stats())).id === "2-B", "play button did not start 2-B");
await page.click("#stop");
check((await page.evaluate(() => vfxLab.stats())).n === 0, "clear left particles");
await page.waitForTimeout(300);
if (errors.length) fails.push(...errors);
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("vfx-lab: ok (" + ids.length + " effects)");
