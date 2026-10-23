// Platform checks in headless Chrome: HiDPI canvas and world scale, pointer -> world mapping, corrupt saves,
// engine (CDN) failure and crash messages, Canvas-renderer fallback.
// Usage: node tests/platform.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/platform";
mkdirSync(out, { recursive: true });
const fails = [], report = {};
const check = (ok, what, detail) => { if (!ok) fails.push(`${what}: ${JSON.stringify(detail)}`); return ok; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, { dpr = 1, viewport = { width: 1280, height: 720 }, seed = null, route = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.addInitScript(([seed]) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
    if (seed) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, [seed]);
  if (route) await route(page);
  await page.goto(url, { waitUntil: "load" });
  return { ctx, page, errors };
}
const ready = page => page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 15000 });
// textContent, not innerText: the error details sit in a collapsed <details>
const failPanel = page => page.evaluate(() => { const el = document.querySelector("#bootFail .sheet"); return el ? el.textContent : null; });
// Canvas, camera and text state; *Css values are CSS pixels on the page.
const view = page => page.evaluate(() => {
  const c = S.game.canvas, r = c.getBoundingClientRect(), cam = S.cameras.main, k = c.width / r.width;
  const css = (x, y) => ({ x: (x - cam.worldView.x) * cam.zoom / k, y: (y - cam.worldView.y) * cam.zoom / k });
  return { dpr: devicePixelRatio, canvasW: c.width, canvasH: c.height, cssW: r.width, cssH: r.height, zoom: cam.zoom,
    worldPerCss: cam.worldView.width / r.width, viewW: cam.worldView.width, viewH: cam.worldView.height,
    playerCss: css(player.x, player.y), harborCss: css(PORT.x, PORT.y), renderType: S.game.config.renderType,
    textRes: [harborLabel, ...enemies.map(e => e.badge).filter(Boolean)].map(o => o.style.resolution) };
});
// Largest on-screen (CSS px) shake offset over ~300 ms of camera.shake(400, intensity).
const shakeCss = (page, intensity) => page.evaluate(i => new Promise(done => {
  const cam = S.cameras.main, k = S.game.canvas.width / S.game.canvas.getBoundingClientRect().width;
  let max = 0; const t0 = performance.now(); cam.shake(400, i, true);
  const tick = () => { max = Math.max(max, Math.abs(cam.shakeEffect._offsetX * cam.zoom / k));
    performance.now() - t0 < 300 ? requestAnimationFrame(tick) : done(max); };
  requestAnimationFrame(tick);
}), intensity);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // ---- 1. HiDPI: backing store = CSS size x dpr (capped at 2), world the same size on screen ----
  const views = {};
  for (const dpr of [1, 1.25, 1.5, 2, 3]) {
    const { ctx, page, errors } = await open(browser, { dpr });
    await ready(page);
    await page.evaluate(() => { setSail(); paused = true; });   // ledger closed so the harbor label shows; world frozen
    await sleep(400);
    const v = views[dpr] = await view(page);
    const r = Math.min(dpr, 2);
    check(near(v.cssW, 1280, 1) && near(v.cssH, 720, 1), `dpr ${dpr}: canvas stays CSS-sized`, v);
    check(near(v.canvasW, 1280 * r, 1) && near(v.canvasH, 720 * r, 1), `dpr ${dpr}: backing store is CSS x ${r}`, v);
    check(v.textRes.every(x => x >= v.zoom - 1e-9), `dpr ${dpr}: in-world text rendered at >= device scale`, v.textRes);
    check(!errors.length, `dpr ${dpr}: no page errors`, errors);
    if (dpr === 1 || dpr === 2) {
      await page.screenshot({ path: join(out, `hidpi-${dpr}x.png`) });
      const h = v.harborCss;   // crop around the harbor label, in CSS px (the image is dpr x larger)
      await page.screenshot({ path: join(out, `hidpi-${dpr}x-label.png`), clip: { x: h.x - 90, y: h.y + 95, width: 180, height: 50 } });
      report[`shake${dpr}x`] = await shakeCss(page, 0.01);
    }
    await ctx.close();
  }
  const [a, b] = [views[1], views[2]];
  check(near(a.worldPerCss, b.worldPerCss, 0.005) && near(a.viewW, b.viewW, 2) && near(a.viewH, b.viewH, 2), "world shows at the same size at 1x and 2x", { a, b });
  check(near(a.playerCss.x, b.playerCss.x, 1.5) && near(a.playerCss.y, b.playerCss.y, 1.5), "player at the same CSS spot at 1x and 2x", [a.playerCss, b.playerCss]);
  // expected max shake: intensity x CSS width x css zoom^2 (Phaser's formula at 1x); random, so allow a wide floor
  const shakeMax = 0.01 * 1280 * 1;
  check(report.shake1x <= shakeMax * 1.05 && report.shake2x <= shakeMax * 1.05 && report.shake2x > shakeMax * 0.3, "screen shake keeps its on-screen size", [report.shake1x, report.shake2x, shakeMax]);
  report.views = views;

  // ---- 2. Window resize and a live pixel-ratio change (dragging to another monitor) ----
  {
    const { ctx, page, errors } = await open(browser, { dpr: 1 });
    await ready(page);
    await page.setViewportSize({ width: 900, height: 600 }); await sleep(300);
    const r1 = await view(page);
    check(near(r1.canvasW, 900, 1) && near(r1.canvasH, 600, 1) && near(r1.zoom, 600 / 720, 1e-6), "resize at 1x refits canvas and zoom", r1);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 600, deviceScaleFactor: 2, mobile: false }); await sleep(400);
    const r2 = await view(page);
    check(near(r2.canvasW, 1800, 1) && near(r2.cssW, 900, 1) && near(r2.zoom, 2 * 600 / 720, 1e-6) && near(r2.worldPerCss, r1.worldPerCss, 0.005),
      "dpr change 1 -> 2 re-renders at 2x with the same world size", { r1, r2 });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false }); await sleep(400);
    const r3 = await view(page);
    check(near(r3.canvasW, 1100, 1) && near(r3.cssW, 1100, 1) && near(r3.cssH, 700, 1), "dpr 2 -> 1 with a new size: canvas restyled to CSS size", r3);
    check(!errors.length, "resize / dpr change: no page errors", errors);
    report.resize = { r1, r2, r3 };
    await ctx.close();
  }

  // ---- 3. Pointer -> world coordinates at 1x and 2x ----
  for (const dpr of [1, 2]) {
    const { ctx, page, errors } = await open(browser, { dpr });
    await ready(page);
    await page.evaluate(() => { setSail(); paused = true; });   // at sea (no ledger over the canvas), camera still
    await sleep(500);
    const hits = [];
    for (const [x, y] of [[200, 300], [1080, 570], [677, 307]]) {
      await page.evaluate(() => { window.__pd = null; S.input.once("pointerdown", p => { window.__pd = { wx: p.worldX, wy: p.worldY }; }); });
      await page.mouse.click(x, y);
      const got = await page.evaluate(() => window.__pd);
      // expected from the camera's view rectangle alone, independent of Phaser's input pipeline
      const want = await page.evaluate(([x, y]) => { const v = S.cameras.main.worldView, r = S.game.canvas.getBoundingClientRect();
        return { wx: v.x + x * v.width / r.width, wy: v.y + y * v.height / r.height }; }, [x, y]);
      hits.push({ x, y, got, want });
      check(got && near(got.wx, want.wx, 1.5) && near(got.wy, want.wy, 1.5), `dpr ${dpr}: click (${x},${y}) lands on the right world point`, { got, want });
    }
    check(!errors.length, `pointer dpr ${dpr}: no page errors`, errors);
    report[`pointer${dpr}x`] = hits;
    await ctx.close();
  }

  // ---- 4. Corrupt saves boot to a playable game ----
  const v2 = o => JSON.stringify({ v: 2, gold: 0, ship: "sloop", hull: 1, sails: 1, hold: 1, unlocked: { six: true }, gunLv: { six: 1, long12: 1, carronade: 1, fire: 1 },
    bow: ["six"], left: ["six"], right: ["six"], stern: [], sunk: 0, wrecks: [], ...o });
  const saves = {
    wrecksNull: { "privateers-save-v2": v2({ wrecks: null, gold: 777 }) },
    truncated: { "privateers-save-v2": '{"v":2,"gold":5000,"ship":"brig"' },
    goldString: { "privateers-save-v2": v2({ gold: "500" }) },
    xss: { "privateers-save-v2": v2({ gunLv: { six: '1<img src=x onerror="window.__xss=1">' }, ship: "<img src=x onerror=\"window.__xss=2\">" }) },
    badShip: { "privateers-save-v2": v2({ ship: "galleon", hull: 99, sails: -3, left: ["nuke", "six"], unlocked: { nuke: true }, wrecks: [{ x: -1, y: 5, value: 9 }, { x: 3000, y: 3000, value: 40 }] }) },
    notJson: { "privateers-save-v2": "<<garbage>>" },
  };
  for (const [name, seed] of Object.entries(saves)) {
    const { ctx, page, errors } = await open(browser, { seed });
    let booted = true;
    try { await ready(page); } catch (e) { booted = false; }
    await sleep(300);
    const st = booted ? await page.evaluate(() => ({ docked, port: !document.getElementById("port").hidden, gold: save.gold, goldType: typeof save.gold,
      maxHp: player.maxHp, ship: save.ship, wrecks: save.wrecks.length, crates: crates.filter(c => c.wreck).length, xss: window.__xss || 0,
      corrupt: localStorage.getItem("privateers-save-corrupt") })) : null;
    if (booted) {   // and it plays: sail, steer, fire, dock and sell
      await page.click("#sail");
      for (const k of ["KeyW", "KeyD", "KeyW"]) { await page.keyboard.down(k); await sleep(300); await page.keyboard.up(k); await page.keyboard.press("Space"); }
      await page.evaluate(() => { cargo = 10; dock("return"); });
      st.afterDock = await page.evaluate(() => ({ gold: save.gold, stored: JSON.parse(localStorage.getItem("privateers-save-v2")).gold }));
    }
    const panel = await failPanel(page);
    check(booted && st.port && st.goldType === "number" && st.xss === 0 && !panel && !errors.length, `corrupt save "${name}" boots to a playable game`, { st, errors, panel });
    report[`save_${name}`] = st;
    if (name === "truncated" || name === "notJson") check(st && st.corrupt === seed["privateers-save-v2"], `"${name}": raw save kept under privateers-save-corrupt`, st && st.corrupt);
    if (name === "goldString") check(st && st.gold === 500 && st.afterDock.gold === 510, "gold string coerced to a number", st);
    if (name === "badShip") check(st && st.ship === "sloop" && st.maxHp === Math.round(100 * 1.28 ** 14) && st.wrecks === 1 && st.crates === 1, "bad ship, levels and wrecks sanitised", st);
    await page.screenshot({ path: join(out, `save-${name}.png`) });
    await ctx.close();
  }

  // ---- 5. Engine blocked (offline / CDN down): readable message, Retry works once it is reachable ----
  {
    let blocked = true;
    const { ctx, page } = await open(browser, { route: p => p.route(/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/, r => blocked ? r.abort() : r.continue()) });
    await page.waitForSelector("#bootFail", { timeout: 5000 }).catch(() => {});
    const text = await failPanel(page);
    check(text && /game engine/i.test(text) && /遊戲引擎/.test(text) && /Try again/.test(text), "blocked CDN shows the bilingual engine message", text);
    await page.screenshot({ path: join(out, "engine-blocked.png") });
    blocked = false;
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#bootFail button")]);
    let ok = true; try { await ready(page); } catch (e) { ok = false; }
    check(ok && !(await failPanel(page)), "Retry boots the game once the CDN is reachable", { ok });
    report.engine = { text };
    await ctx.close();
  }

  // ---- 6. create() throws: "couldn't start" instead of a black sea ----
  {
    const { ctx, page } = await open(browser, { route: p => p.route(/js\/world\.js$/, async r => {
      const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + "\nfunction drawWorld() { throw new Error('test: create() failed'); }\n" });
    }) });
    await page.waitForSelector("#bootFail", { timeout: 8000 }).catch(() => {});
    const text = await failPanel(page);
    check(text && /couldn't start/i.test(text) && /無法啟動/.test(text) && /create\(\) failed/.test(text), "a boot crash shows the start message with details", text);
    await page.screenshot({ path: join(out, "boot-crash.png") });
    report.bootCrash = { text };
    await ctx.close();
  }

  // ---- 7. A stray error leaves the game alone; an error that kills the frame loop shows a message ----
  {
    const { ctx, page } = await open(browser);
    await ready(page);
    await page.click("#sail");
    await page.evaluate(() => setTimeout(() => { throw new Error("test: stray error"); }, 0));
    await sleep(3500);
    check(!(await failPanel(page)), "a non-fatal error does not cover the game", await failPanel(page));
    await page.evaluate(() => { player.spr.setPosition = () => { throw new Error("test: frame crashed"); }; });
    await page.waitForSelector("#bootFail", { timeout: 5000 }).catch(() => {});
    const text = await failPanel(page);
    check(text && /stopped unexpectedly/i.test(text) && /意外停止/.test(text), "a frame-loop crash shows the stopped message", text);
    await page.screenshot({ path: join(out, "frame-crash.png") });
    await ctx.close();
  }

  // ---- 8. Canvas renderer (no WebGL) at 2x: text keeps its size, everything still sized right ----
  {
    const b2 = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-webgl", "--disable-3d-apis"] });
    const ctx = await b2.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(url, { waitUntil: "load" }); await ready(page);
    await page.evaluate(() => { setSail(); paused = true; }); await sleep(400);
    const v = await view(page);
    check(v.renderType === 1 && near(v.canvasW, 2560, 1) && !errors.length, "Canvas renderer at 2x boots with a 2x backing store", { v, errors });
    const h = v.harborCss;
    await page.screenshot({ path: join(out, "canvas-2x-label.png"), clip: { x: h.x - 90, y: h.y + 95, width: 180, height: 50 } });
    report.canvas = v;
    await b2.close();
  }
} catch (e) {
  fails.push("harness: " + (e.stack || e.message));
} finally {
  await browser.close();
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("PASS: platform checks. Report and screenshots in " + out);
