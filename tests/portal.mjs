// Portal build (#19): builds portal/ and loads it in Chrome with every request that leaves localhost blocked and counted.
// Checks that the game boots and is playable with no external request, and that the SDK shim drives a stand-in Poki SDK
// (gameplayStart / gameplayStop / commercialBreak with the sound held) and a stand-in CrazyGames SDK, and is a no-op with neither.
// Usage: node tests/portal.mjs     (ignores the page URL the runner passes: it serves portal/ itself; needs network the first time, see tools/build-portal.mjs)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../tools/build-portal.mjs";

const SLOW = +process.env.TEST_SLOW || 1;
const OUT = join(fileURLToPath(new URL("../", import.meta.url)), "node_modules", ".cache", "privateers-portal-test");
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

await build({ out: OUT });   // throws (and fails the test) when a rewrite no longer matches or an external URL is left in the output

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(OUT, p));
  try {
    if (!file.startsWith(OUT) || !statSync(file).isFile()) throw new Error("no");
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(file));
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

// Stand-ins for the platform SDKs: they only record what the shim calls.
const FAKE = {
  poki: `window.__sdk = []; window.PokiSDK = {
    init: () => { __sdk.push("init"); return Promise.resolve(); },
    gameLoadingFinished: () => __sdk.push("gameLoadingFinished"),
    gameplayStart: () => __sdk.push("gameplayStart"),
    gameplayStop: () => __sdk.push("gameplayStop"),
    commercialBreak: before => { __sdk.push("commercialBreak"); before(); window.__adSound = Snd.debug().paused.slice(); return new Promise(r => { window.__endAd = r; }); } };`,
  crazygames: `window.__sdk = []; window.CrazyGames = { SDK: {
    init: () => { __sdk.push("init"); return Promise.resolve(); },
    game: { gameplayStart: () => __sdk.push("gameplayStart"), gameplayStop: () => __sdk.push("gameplayStop") },
    ad: { requestAd: (type, cb) => { __sdk.push("requestAd:" + type); cb.adStarted(); window.__adSound = Snd.debug().paused.slice(); window.__endAd = cb.adFinished; } } } };`,
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
async function open(name, fake) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const external = [], errors = [];
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:" || u.hostname === "127.0.0.1") return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  if (fake) await page.addInitScript(FAKE[fake]);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof save !== "undefined", null, { timeout: 20000 * SLOW });
  await page.waitForTimeout(800 * SLOW);
  return { ctx, page, external, errors, name };
}
const sdk = page => page.evaluate(() => (window.__sdk || []).slice());
const live = page => page.evaluate(() => !paused && !docked && !titleOpen);
// Walk the front-end screens (title, tutorial) until the sea is live, like tests/smoke.mjs.
async function sail(page) {
  for (let i = 0; i < 8 && !(await live(page)); i++) {
    const sel = await page.evaluate(() => {
      for (const s of ["[data-smoke=start]", "#sail", "[data-act=continue]", "[data-act=newgame]", "[data-act=ok]"]) { const el = document.querySelector(s); if (el && el.offsetParent !== null && !el.disabled) return s; }
      return null;
    });
    if (!sel) break;
    await page.click(sel); await page.waitForTimeout(500 * SLOW);
  }
}

try {
  // 1. No SDK: boots offline, plays, shim is a no-op, nothing left localhost.
  {
    const t = await open("no sdk");
    check(await t.page.evaluate(() => typeof Phaser === "object" && Phaser.VERSION === "3.80.1"), "Phaser 3.80.1 loaded from portal/vendor");
    check(await t.page.evaluate(() => !!document.querySelector('link#fonts[href="fonts/fonts.css"]')), "index.html links fonts/fonts.css");
    await sail(t.page);
    check(await live(t.page), "the sea is live offline");
    for (const k of ["KeyW", "KeyD", "KeyW"]) { await t.page.keyboard.down(k); await t.page.waitForTimeout(400 * SLOW); await t.page.keyboard.up(k); await t.page.keyboard.press("Space"); }
    check(await t.page.evaluate(() => PortalSdk.platform() === "none" && PortalSdk.state().calls.length === 0), "no SDK present: the shim does nothing");
    check(await t.page.evaluate(() => document.fonts.size > 0 && [...document.fonts].some(f => f.status === "loaded")), "a local font file was loaded");
    check(t.external.length === 0, `no request left localhost (${t.external.length ? t.external.slice(0, 5).join(", ") : "none"})`);
    check(t.errors.length === 0, `no page errors${t.errors.length ? ": " + t.errors.join(" | ") : ""}`);
    await t.ctx.close();
  }
  // 2. Poki: start on the first input, stop on pause and dock (the ad), sound held while it runs.
  for (const name of ["poki", "crazygames"]) {
    const t = await open(name, name), { page } = t;
    check((await sdk(page)).includes("init"), `${name}: SDK initialised on load`);
    check(!(await sdk(page)).includes("gameplayStart"), `${name}: no gameplayStart before any input`);
    await sail(page);
    await page.keyboard.press("KeyW"); await page.waitForTimeout(300 * SLOW);
    const s1 = await sdk(page);
    check(s1.filter(c => c === "gameplayStart").length === 1, `${name}: gameplayStart on the first input once the sea is live (${s1.join(",")})`);
    if (name === "poki") check(s1.includes("gameLoadingFinished"), "poki: gameLoadingFinished after init");
    await page.evaluate(() => pauseGame()); await page.waitForTimeout(300 * SLOW);
    check((await sdk(page)).at(-1) === "gameplayStop", `${name}: gameplayStop on pause`);
    await page.evaluate(() => resumeGame()); await page.waitForTimeout(300 * SLOW);
    check((await sdk(page)).at(-1) === "gameplayStart", `${name}: gameplayStart again on resume`);
    await page.evaluate(() => { performance.now = (n => () => n() + 600000)(performance.now.bind(performance)); dock("return"); });   // past the shim's own 2-minute ad gap
    await page.waitForTimeout(400 * SLOW);
    const s2 = await sdk(page);
    check(s2.at(-1) === "gameplayStop" || s2.includes(name === "poki" ? "commercialBreak" : "requestAd:midgame"), `${name}: dock asks for an ad (${s2.join(",")})`);
    check(s2.lastIndexOf("gameplayStop") > s2.lastIndexOf("gameplayStart"), `${name}: gameplayStop is the last gameplay call while docked / in the ad`);
    check(await page.evaluate(() => window.__adSound && window.__adSound.includes("ad")), `${name}: sound held (Snd paused "ad") while the ad runs`);
    check(await page.evaluate(() => PortalSdk.state().adActive), `${name}: ad active`);
    await page.evaluate(() => window.__endAd()); await page.waitForTimeout(300 * SLOW);
    check(await page.evaluate(() => !PortalSdk.state().adActive && !Snd.debug().paused.includes("ad")), `${name}: ad over, sound released`);
    check(t.external.length === 0, `${name}: no request left localhost`);
    check(t.errors.length === 0, `${name}: no page errors${t.errors.length ? ": " + t.errors.join(" | ") : ""}`);
    await t.ctx.close();
  }
} catch (e) {
  failures.push(`harness: ${e.stack || e.message}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS: portal build boots with no external request; SDK shim behaves");
