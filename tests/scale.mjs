// Size sliders (settings: UI size, chart size, chart icon size) in headless Chrome: the chart's size at 100% on common
// screens, live preview while a slider is held, persistence across a reload, the old text / chart settings, and the
// toast staying clear of the chart on a phone.
// Usage: node tests/scale.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/scale";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails.push(`${what}: ${JSON.stringify(detail)}`); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

async function open(browser, { viewport, dpr = 1, seed = {}, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 15000 * SLOW });
  return { ctx, page, errors };
}
// Past the title and into the sea, so the chart is drawn for real.
async function sail(page) {
  await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { polling: 50, timeout: 5000 * SLOW });
  await page.evaluate(() => { save.tutorialDone = true; tut.active = false; });
  await page.click("#sail");
  await sleep(400);
}
// Wait for the rAF-coalesced canvas refit to settle.
const settle = page => page.waitForFunction(() => miniKey === `${mini.width}/${SETTINGS.markPct}` && !miniFitQueued, null, { timeout: 5000 * SLOW });
const miniInfo = page => page.evaluate(() => {
  const r = document.getElementById("mini").getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), canvas: mini.width, vw: innerWidth, dpr: devicePixelRatio, ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim() };
});

const browser = await chromium.launch({ channel: "chrome", headless: true });

// ---------- 1. 100% on common screens ----------
console.log("Chart size at 100%");
for (const [name, vp, dpr, mobile, want] of [
  ["1280x720", { width: 1280, height: 720 }, 1, false, 130],
  ["1920x1080", { width: 1920, height: 1080 }, 1, false, 194],
  ["3840x2160", { width: 3840, height: 2160 }, 1, false, 389],
  ["3840x2160@2x", { width: 1920, height: 1080 }, 2, false, 194],
  ["390x844", { width: 390, height: 844 }, 3, true, 172],   // a touch screen starts at MINI_COARSE_PCT (150%), which the 44vw cap then holds to 172
]) {
  const { ctx, page, errors } = await open(browser, { viewport: vp, dpr, mobile });
  await sail(page); await settle(page);
  const m = await miniInfo(page);
  check(Math.abs(m.w - want) <= 1 && m.w === m.h, `${name}: chart is ${want}px square (got ${m.w}x${m.h})`, m);
  check(m.canvas === Math.min(1024, Math.max(160, Math.round(want * dpr))), `${name}: canvas drawn at css size x ${dpr} (got ${m.canvas})`, m);
  if (mobile) check(m.w <= m.vw * 0.44 + 1, `${name}: chart within 44vw (${m.w} of ${m.vw})`, m);
  check(errors.length === 0, `${name}: no page errors`, errors);
  await page.screenshot({ path: join(out, `sea-${name.replace("@", "-")}.png`) });
  await ctx.close();
}

// ---------- 2. Sliders: live preview, keys, persistence ----------
console.log("Sliders (title screen, 1280x720)");
{
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 720 } });
  const hudShown = () => page.evaluate(() => getComputedStyle(document.getElementById("hud")).display !== "none");
  await page.click("#title [data-menu=settings]");
  const cssW = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mini-w")));
  const before = await cssW();
  check(!(await hudShown()), "title: HUD is hidden before a slider is touched", null);
  // hold the chart slider with the mouse, drag right
  const box = await page.locator('[data-scale="miniPct"]').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
  await sleep(300);
  const mid = await page.evaluate(() => ({ previewing: document.getElementById("p-settings").classList.contains("previewing"),
    op: +getComputedStyle(document.querySelector("#p-settings .panel")).opacity, pct: SETTINGS.miniPct, out: document.querySelector('[data-scale="miniPct"]').nextElementSibling.textContent,
    title: +getComputedStyle(document.getElementById("title")).opacity,
    badge: document.getElementById("scaleBadge").hidden ? null : document.getElementById("scaleBadge").textContent }));
  await sleep(300);
  const during = await cssW();
  check(mid.previewing && await hudShown(), "dragging: the HUD shows through on the title", mid);
  check(mid.op === 0 && mid.title === 0, `dragging: the settings panel and the title menu are hidden (${mid.op}, ${mid.title})`, mid);
  check(!!mid.badge && mid.badge.endsWith(mid.pct + "%"), `dragging: a small badge shows the value (${mid.badge})`, mid);
  check(during > before * 1.5 && mid.out === mid.pct + "%", `dragging: chart grows live (${before} -> ${during}px) and the readout follows (${mid.out})`, { before, during, mid });
  await page.screenshot({ path: join(out, "preview-dragging-720.png") });
  await page.mouse.up();
  await sleep(600);
  const after = await page.evaluate(() => ({ previewing: document.getElementById("p-settings").classList.contains("previewing"), body: document.body.classList.contains("scale-preview"),
    saved: JSON.parse(localStorage.getItem("privateers-settings")).miniPct, pct: SETTINGS.miniPct, badge: !document.getElementById("scaleBadge").hidden }));
  check(!after.previewing && !after.body && !after.badge && after.saved === after.pct, "release: panel returns, the badge goes and the value is saved", after);
  // keyboard: arrow keys move 5 per press and also preview
  await page.focus('[data-scale="markPct"]');
  const m0 = await page.evaluate(() => SETTINGS.markPct);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  const key = await page.evaluate(() => ({ pct: SETTINGS.markPct, previewing: document.getElementById("p-settings").classList.contains("previewing") }));
  check(key.pct === m0 + 10 && key.previewing, `keyboard: two right-arrows raise icon size ${m0} -> ${key.pct} and preview`, key);
  await sleep(1100);
  check(await page.evaluate(() => !document.getElementById("p-settings").classList.contains("previewing")), "keyboard: panel returns shortly after the last key", null);
  // the UI slider reaches --ts and the HUD bars
  await page.evaluate(() => document.body.classList.add("scale-preview"));   // the HUD is hidden on the title, and so unmeasurable
  const bar0 =await page.evaluate(() => document.querySelector(".bars").getBoundingClientRect().width);
  await page.fill('[data-scale="uiPct"]', "150");
  const ui = await page.evaluate(() => ({ ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim(), bar: document.querySelector(".bars").getBoundingClientRect().width, pct: SETTINGS.uiPct }));
  check(ui.ts === "1.5" && ui.pct === 150 && ui.bar > bar0 * 1.3, `UI size 150%: --ts 1.5 and the HUD bars grow (${bar0} -> ${ui.bar})`, ui);
  // extremes snap into the range
  await page.fill('[data-scale="miniPct"]', "250");
  check(await page.evaluate(() => SETTINGS.miniPct) === 250, "range top is 250%", null);
  await page.fill('[data-scale="miniPct"]', "50");
  check(await page.evaluate(() => SETTINGS.miniPct) === 50, "range bottom is 50%", null);
  await page.fill('[data-scale="miniPct"]', "200"); await page.fill('[data-scale="markPct"]', "150");
  await settle(page);
  const saved = await page.evaluate(() => ({ mini: SETTINGS.miniPct, mark: SETTINGS.markPct, ui: SETTINGS.uiPct, w: getComputedStyle(document.documentElement).getPropertyValue("--mini-w").trim() }));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && S.sys.isActive(), null, { timeout: 15000 * SLOW });
  await settle(page);
  const re = await page.evaluate(() => ({ mini: SETTINGS.miniPct, mark: SETTINGS.markPct, ui: SETTINGS.uiPct, w: getComputedStyle(document.documentElement).getPropertyValue("--mini-w").trim(),
    ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim() }));
  check(re.mini === 200 && re.mark === 150 && re.ui === 150 && re.w === saved.w && re.ts === "1.5", "reload keeps all three sizes and the chart width", { saved, re });
  // sliders show the stored values, and Reset sizes puts all three back
  await page.click("#title [data-menu=settings]");
  const shown = await page.evaluate(() => [...document.querySelectorAll("[data-scale]")].map(i => i.value + "|" + i.nextElementSibling.textContent));
  check(shown.join() === "150|150%,200|200%,150|150%", "settings panel shows the stored values after reload", shown);
  await page.screenshot({ path: join(out, "settings-en-720.png") });
  await page.click('[data-set="scale-reset"]');
  const rst = await page.evaluate(() => [SETTINGS.uiPct, SETTINGS.miniPct, SETTINGS.markPct, ...[...document.querySelectorAll("[data-scale]")].map(i => +i.value)]);
  check(rst.join() === "100,100,100,100,100,100", "Reset sizes returns all three to 100%", rst);
  // zh strings exist for every new label
  const zh = await page.evaluate(() => ["set_ui", "set_mini", "set_marks", "set_scaleReset", "set_scaleNote"].map(k => [STR.en[k], STR.zh[k]]));
  check(zh.every(([e, z]) => e && z && e !== z), "all new labels exist in en and zh-Hant", zh);
  check(errors.length === 0, "no page errors", errors);
  await ctx.close();
}

// ---------- 3. Marks: icon size is separate from chart size and redraws the canvas ----------
console.log("Chart icon size");
{
  const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 } });
  await sail(page); await settle(page);
  const grab = () => page.evaluate(() => ({ w: mini.width, u: miniUnit(mini.width), css: Math.round(mini.getBoundingClientRect().width),
    px: mini.toDataURL().length }));
  const a = await grab();
  await page.evaluate(() => { saveSettings({ markPct: 200 }); applyMiniSize(); });
  await settle(page);
  const b = await grab();
  check(Math.abs(b.u / a.u - 2) < 1e-9 && b.css === a.css && b.w === a.w, `icon size 200% doubles the mark unit (${a.u.toFixed(2)} -> ${b.u.toFixed(2)}) without changing the chart size`, { a, b });
  check(b.px !== a.px, "the chart bitmap was redrawn", { a, b });
  await page.screenshot({ path: join(out, "sea-720-marks200.png") });
  await page.evaluate(() => { saveSettings({ markPct: 100, miniPct: 250 }); applyMiniSize(); });
  await settle(page);
  const c = await grab();
  check(c.css > a.css * 2 && c.u > a.u * 2 - 0.01, `chart size 250% scales the chart (${a.css} -> ${c.css}px) and its marks with it`, { a, c });
  await page.screenshot({ path: join(out, "sea-720-chart250.png") });
  await ctx.close();
}

// ---------- 4. 4K at 250% and a phone at 250% ----------
console.log("Largest sizes");
{
  const { ctx, page } = await open(browser, { viewport: { width: 3840, height: 2160 }, seed: { "privateers-settings": JSON.stringify({ miniPct: 250 }) } });
  await sail(page); await settle(page);
  const m = await miniInfo(page);
  check(m.w === 972 && m.canvas === 972, `4K at 250%: chart 972px and sharp (canvas ${m.canvas})`, m);
  await page.screenshot({ path: join(out, "sea-3840x2160-chart250.png") });
  await ctx.close();
}
{
  const { ctx, page } = await open(browser, { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true, seed: { "privateers-settings": JSON.stringify({ miniPct: 250, uiPct: 100 }) } });
  await sail(page); await settle(page);
  await page.evaluate(() => toast("Plunder!", true));
  await sleep(500);
  const m = await page.evaluate(() => {
    const mi = document.getElementById("mini").getBoundingClientRect(), t = document.getElementById("toast").getBoundingClientRect();
    return { miniW: Math.round(mi.width), miniBottom: Math.round(mi.bottom), toastTop: Math.round(t.top), ach: parseFloat(getComputedStyle(document.getElementById("achToast")).top), vw: innerWidth };
  });
  check(m.miniW <= m.vw * 0.44 + 1, `phone 250%: chart stays within 44vw (${m.miniW} of ${m.vw})`, m);
  check(m.toastTop >= m.miniBottom, `phone: toast sits below the chart (${m.toastTop} >= ${m.miniBottom})`, m);
  check(m.ach >= m.toastTop, `phone: achievement card sits below the toast (${m.ach} >= ${m.toastTop})`, m);
  await page.screenshot({ path: join(out, "sea-390x844-chart250-toast.png") });
  await ctx.close();
}

// ---------- 5. Old settings still load ----------
console.log("Old settings");
{
  const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 720 }, seed: { "privateers-settings": JSON.stringify({ textScale: 1.3, miniScale: 1.25, shake: false }) } });
  const s = await page.evaluate(() => ({ ui: SETTINGS.uiPct, mini: SETTINGS.miniPct, mark: SETTINGS.markPct, ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim(), shake: SETTINGS.shake }));
  check(s.ui === 130 && s.mini === 125 && s.mark === 100 && s.ts === "1.3" && s.shake === false, "textScale 1.3 / miniScale 1.25 load as 130% / 125%, other settings kept", s);
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAILED`); for (const f of fails) console.log("  - " + f); process.exit(1); }
console.log("\nAll size slider checks passed.");
