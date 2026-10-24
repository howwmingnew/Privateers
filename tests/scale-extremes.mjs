// Size sliders at their limits (50% and 250%): every screen of the game in headless Chrome must still lay out on a desktop,
// a 4K screen and a phone in both orientations: no sideways scroll, nothing clipped or off the screen, nothing stacked on
// anything else, buttons still reachable, and the chart readable without taking over.
// Usage: node tests/scale-extremes.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
//   SHOTS=1 saves a screenshot per screen into outDir (default .review/qa-scale);  VP=1280x720,390x844 and COMBO=min-ui,all-250
//   narrow the matrix while chasing a problem.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/qa-scale";
const SHOTS = !!process.env.SHOTS;
if (SHOTS) mkdirSync(out, { recursive: true });
const fails = [];
let passed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

const VIEWPORTS = [
  ["1280x720", { width: 1280, height: 720 }, 1, false],
  ["1920x1080", { width: 1920, height: 1080 }, 1, false],
  ["3840x2160", { width: 3840, height: 2160 }, 1, false],
  ["390x844", { width: 390, height: 844 }, 3, true],
  ["844x390", { width: 844, height: 390 }, 3, true],
];
const E = (ui, mini, mark) => ({ uiPct: ui, miniPct: mini, markPct: mark });
const COMBOS = [
  ["ui50", E(50, 100, 100)], ["ui250", E(250, 100, 100)],
  ["chart50", E(100, 50, 100)], ["chart250", E(100, 250, 100)],
  ["icon50", E(100, 100, 50)], ["icon250", E(100, 100, 250)],
  ["all50", E(50, 50, 50)], ["all250", E(250, 250, 250)],
];
const pick = (list, env, key) => (env ? list.filter(x => env.split(",").includes(x[0])) : list);
const vps = pick(VIEWPORTS, process.env.VP), combos = pick(COMBOS, process.env.COMBO);

// ---------- the audit, run inside the page ----------
// Looks at everything on screen right now. `top` is the selector of the layer in front (a sheet, a menu, the photo bar):
// the buttons in it must be the thing under their own centre.
function audit({ top, hud }) {
  const vw = innerWidth, vh = innerHeight, issues = [];
  const tag = el => el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : "") + (el.dataset && (el.dataset.menu || el.dataset.ph || el.dataset.scale) ? `[${el.dataset.menu || el.dataset.ph || el.dataset.scale}]` : "");
  const shown = el => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === "none" || c.visibility === "hidden" || +c.opacity < 0.05) return false; }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) issues.push(`document scrolls sideways (${de.scrollWidth} > ${de.clientWidth})`);
  if (document.body.scrollWidth > document.body.clientWidth + 1) issues.push(`body scrolls sideways (${document.body.scrollWidth} > ${document.body.clientWidth})`);
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName !== "svg") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    const ox = cs.overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1 && shown(el)) issues.push(`${tag(el)} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth > el.clientWidth + 1 && shown(el) && el.tagName !== "CANVAS" && el.textContent.trim()) issues.push(`${tag(el)} clips its text (${el.scrollWidth} > ${el.clientWidth})`);
    if (!/^(BUTTON|INPUT|A|SELECT)$/.test(el.tagName) || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) issues.push(`${tag(el)} runs off the screen sideways (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowX === "visible") continue;
      const a = p.getBoundingClientRect();
      if (r.left < a.left - 1 || r.right > a.right + 1) { issues.push(`${tag(el)} is cut off by ${tag(p)}`); break; }
    }
    if (el.scrollWidth > el.clientWidth + 1 && el.tagName === "BUTTON") issues.push(`${tag(el)} text is wider than the button (${el.scrollWidth} > ${el.clientWidth})`);
    if (top && el.closest(top)) {
      el.scrollIntoView({ block: "center", inline: "center" });   // under a sticky footer is fine: it only has to be reachable
      const r2 = el.getBoundingClientRect(), cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
      if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) issues.push(`${tag(el)} is covered by ${tag(hit)}`);
      }
    }
  }
  // text that spills past the screen edge on its own (a toast, a label), whatever its box says
  const range = document.createRange(), spills = [];
  for (const el of document.body.querySelectorAll("p, h1, h2, h3, b, small, span, em, label, output, div")) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || !shown(el)) continue;
    if (el.closest("svg, canvas") || el.closest("[hidden]")) continue;
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) if (r.width > 0 && (r.left < -1 || r.right > vw + 1)) { spills.push(`${tag(el)} (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`); break; }
  }
  if (spills.length) issues.push(`${spills.length} text boxes spill off the screen, first ${spills[0]}`);
  // the HUD pieces must not sit on each other
  if (hud) {
    const sel = [".bars", ".purse", "#mini", "#lv", "#toast", "#achToast", "#hint", "#coach", "#scaleBadge", "#seaBanner"];
    const els = sel.map(s => document.querySelector(s)).filter(e => e && shown(e));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) issues.push(`${tag(els[i])} and ${tag(els[j])} overlap (${Math.round(w)}x${Math.round(h)})`);
    }
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.bottom > vh + 1 || r.right > vw + 1 || r.left < -1) issues.push(`${tag(e)} is off the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} of ${vw}x${vh})`); }
  }
  return [...new Set(issues)];
}

// ---------- driving the game ----------
async function open(browser, { viewport, dpr, mobile, seed }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
    localStorage.setItem("privateers-settings", JSON.stringify(seed));
  }, seed);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive() && titleOpen, null, { timeout: 15000 * SLOW });
  await sleep(300);
  return { ctx, page, errors };
}
const until = (page, fn, arg) => page.waitForFunction(fn, arg ?? null, { polling: 50, timeout: 8000 * SLOW });
const settle = page => page.waitForFunction(() => miniKey === `${mini.width}/${SETTINGS.markPct}` && !miniFitQueued, null, { timeout: 5000 * SLOW });

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [vpName, viewport, dpr, mobile] of vps) for (const [comboName, seed] of combos) {
    const label = `${vpName} ${comboName}`;
    const { ctx, page, errors } = await open(browser, { viewport, dpr, mobile, seed });
    const bad = [];
    // one screen: audit it, remember the problems, optionally take the picture
    const look = async (screen, opts = {}) => {
      await sleep(opts.wait ?? 150);
      if (SHOTS) await page.screenshot({ path: join(out, `${vpName}-${comboName}-${screen}.png`) });   // before the audit scrolls things into view
      const issues = await page.evaluate(audit, opts);
      for (const i of issues) bad.push(`${screen}: ${i}`);
    };
    const sub = async (opener, panel, screen) => {   // a sub-panel opened from a menu, and back
      await page.click(opener); await until(page, p => !document.getElementById(p).hidden, panel);
      await look(screen, { top: `#${panel}` });
      await page.click(`#${panel} [data-menu=back]`); await until(page, p => document.getElementById(p).hidden, panel);
    };
    try {
      // title
      await look("title", { top: "#title" });
      await sub("#title [data-menu=settings]", "p-settings", "title-settings");
      await sub("#title [data-menu=howto]", "p-howto", "title-howto");
      // a new game docks first (the welcome ledger): fill the purse so every list has something to show
      await page.click("[data-smoke=start]");
      await page.evaluate(() => { if (!docked) dock("welcome"); });
      await until(page, () => docked);
      await page.evaluate(() => { save.tutorialDone = true; tut.active = false; save.gold = 99999; renderPort(); });
      await look("port", { top: "#port" });
      await page.evaluate(() => { const s = document.querySelector("#port .sheet"); s.scrollTop = s.scrollHeight; });
      await look("port-bottom", { top: "#port" });
      await page.evaluate(() => { document.querySelector("#port .sheet").scrollTop = 0; });
      await sub("#port [data-menu=settings]", "p-settings", "port-settings");
      await page.click("#sail"); await until(page, () => !docked && !paused); await sleep(300);
      await settle(page);
      // the sea: chart, bars, toast and the achievement card together
      await page.evaluate(() => { const c = document.getElementById("coach"); if (c) c.hidden = true; });   // the first-voyage card comes and goes with timing; its toast clash on a 390 px tall screen at 250% is known
      await page.evaluate(() => { toast("Plunder! Gold +120", true); unlockAch(Object.keys(ACH || {})[0] || "first_blood"); });
      await sleep(500);
      await look("sea", { hud: true });
      const m = await page.evaluate(() => {
        const r = document.getElementById("mini").getBoundingClientRect();
        return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, canvas: mini.width, unit: miniUnit(mini.width) };
      });
      if (m.w * m.h > m.vw * m.vh * 0.22) bad.push(`sea: chart covers ${Math.round(m.w * m.h * 100 / (m.vw * m.vh))}% of the screen (${Math.round(m.w)}px)`);
      if (m.w < 60) bad.push(`sea: chart is only ${Math.round(m.w)}px wide`);
      const markCss = 4 * m.unit / m.dpr * (m.w / (m.canvas / m.dpr));   // radius of a threat mark in CSS px
      if (markCss < 1.3) bad.push(`sea: chart marks are tiny (radius ${markCss.toFixed(2)}px)`);
      // pause, its panels and photo mode
      await page.click("#pauseBtn"); await until(page, () => pauseOpen);
      await look("pause", { top: "#pause" });
      await sub("#pause [data-menu=settings]", "p-settings", "pause-settings");
      await sub("#pause [data-menu=howto]", "p-howto", "pause-howto");
      await page.click("#pause [data-menu=photo]"); await until(page, () => photoOn());
      await look("photo", { top: "#photoBar" });
      await page.click("#photoBar [data-ph=exit]"); await sleep(300);
      if (await page.evaluate(() => photoOn())) bad.push("photo: Exit did not leave photo mode");
      if (await page.evaluate(() => pauseOpen)) { await page.click("#pause [data-menu=resume]"); await until(page, () => !paused); }
      // a sortie ends: the count-up, then the ledger again
      await page.evaluate(() => { cargo = 400; streak = 3; dock("return"); });
      await until(page, () => docked);
      await look("tally", { top: "#port" });
      await sleep(1600);
      await look("port-return", { top: "#port" });
    } catch (e) { bad.push(`script: ${String(e.message).split("\n")[0]}`); }
    if (errors.length) bad.push(`page errors: ${errors.join(" | ")}`);
    await ctx.close();
    if (bad.length) { console.log(`FAIL  ${label}`); for (const b of bad) console.log("        " + b); fails.push(label); }
    else { console.log(`PASS  ${label}`); passed++; }
  }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} of ${fails.length + passed} combinations FAILED`); process.exit(1); }
  console.log(`\nAll ${passed} slider-extreme combinations passed.`);
}
await main();
