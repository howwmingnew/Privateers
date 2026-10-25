// Shell checks: title, pause + auto-pause, desktop keyboard / mouse, touch stick, gamepad stub, tutorial,
// settings persistence, new game / quit / reset flows, and both languages for missing keys.
// Usage: node tests/shell.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
// CI runners render without a GPU (~10 fps, game time runs at half speed): TEST_SLOW stretches every wait.
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/shell";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const D = { width: 1280, height: 720 }, M = { width: 390, height: 844 };

async function open(viewport, { mobile = false, locale = "en-US", keep = false, tag = "", dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, locale, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load" });
  if (!keep) { await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "load" }); }
  await booted(page);
  return { ctx, page };
}
async function booted(page) {
  await until(page, () => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
// Interval polling (rAF polling stalled now and then in headless Chrome); on timeout, say what the game was doing.
async function until(page, fn, arg = null, { timeout = 8000 * SLOW } = {}) {
  try { await page.waitForFunction(fn, arg, { polling: 50, timeout }); }
  catch (e) {
    const s = await page.evaluate(() => typeof player === "undefined" || !player ? "not booted" : JSON.stringify({ paused, docked, pauseOpen, titleOpen, canDock,
      x: Math.round(player.x), y: Math.round(player.y), frame: S.game.loop.frame, tut: tut.step, run: S.game.loop.running, hid: document.hidden, focus: document.hasFocus(), sp: Math.round(player.speed), moor: JSON.stringify(moor) })).catch(() => "n/a");
    if (process.env.CI) { await page.waitForTimeout(1000); console.log("frame 1 s later:", await page.evaluate(() => S.game.loop.frame).catch(() => "n/a")); }
    throw new Error(`timed out waiting for ${fn.toString().slice(0, 90)} | state ${s}`);
  }
}
async function toSea(page) {
  await page.click("[data-smoke=start]");   // a fresh save sails straight out; one with progress docks first
  await until(page, () => docked || (!paused && !titleOpen));
  if (await ev(page, () => docked)) await page.click("#sail");
  await until(page, () => !docked && !paused);
  await page.waitForTimeout(150 * SLOW);
}
// Freeze the nearest enemy 180 px off the starboard side with loaded guns, so a broadside line is red.
const beside = page => ev(page, () => {
  const e = enemies.filter(x => x.alive).sort((a, b) => dist(a, player) - dist(b, player))[0];
  e.x = player.x + Math.cos(player.rot + Math.PI / 2) * 180; e.y = player.y + Math.sin(player.rot + Math.PI / 2) * 180;
  e.rot = player.rot; e.speed = 0; e.maxSpeed = 0.001; e.hp = e.maxHp = 1e6;
  for (const g of Object.values(player.guns).flat()) g.cd = 0;
  return e.L;
});
const spyFire = page => ev(page, () => {
  window.__fires = 0;
  if (!window.__origFire) window.__origFire = playerFire;
  playerFire = function () { window.__fires++; return window.__origFire.apply(this, arguments); };
});
const tank = page => ev(page, () => { player.maxHp = player.hp = 1e6; });

// ---------- 1. title, ledger focus + scroll, keyboard ----------
{
  const { ctx, page } = await open(D, { tag: "desk" });
  const st = await ev(page, () => ({
    title: !document.getElementById("title").hidden, hud: getComputedStyle(document.getElementById("hud")).display,
    cont: document.getElementById("tContinue").hidden, smoke: document.querySelector("[data-smoke=start]")?.id, paused, docked,
    focus: document.activeElement?.id }));
  ok("title shows on boot, HUD hidden, fresh save offers only New game", st.title && st.hud === "none" && st.cont && st.smoke === "tNew" && st.paused && !st.docked, st);
  const before = await ev(page, () => ({ cam: [S.cameras.main.midPoint.x, S.cameras.main.midPoint.y], e: enemies.map(e => e.x + e.y).join() }));
  await page.waitForTimeout(1200 * SLOW);
  const after = await ev(page, () => ({ cam: [S.cameras.main.midPoint.x, S.cameras.main.midPoint.y], e: enemies.map(e => e.x + e.y).join() }));
  ok("title: camera drifts, the player's ship is hidden", Math.hypot(after.cam[0] - before.cam[0], after.cam[1] - before.cam[1]) > 1 && await ev(page, () => !player.spr.visible));
  await page.screenshot({ path: join(out, "d-title-en.png") });
  // #94: the title carries an English | 中文 pair; a fresh en-US browser starts in English, the pair switches both ways and remembers it
  const lp = await ev(page, () => ({ lang, pressed: [...document.querySelectorAll("#title [data-lang-set]")].map(b => b.dataset.langSet + ":" + b.getAttribute("aria-pressed")).join(), vis: !!document.querySelector("#title [data-lang-set]").offsetParent }));
  ok("title: an English | 中文 pair is visible and starts on English for an en-US browser", lp.vis && lp.lang === "en" && lp.pressed === "en:true,zh:false", lp);
  await page.click('#title [data-lang-set="zh"]');
  const lz = await ev(page, () => ({ lang, saved: localStorage.getItem("privateers-lang"), neu: document.getElementById("tNew").textContent, pressed: document.querySelector('[data-lang-set="zh"]').getAttribute("aria-pressed") }));
  ok("title: tapping 中文 relabels the menu at once and the choice is kept", lz.lang === "zh" && lz.saved === "zh" && /啟航/.test(lz.neu) && lz.pressed === "true", lz);
  await page.click('#title [data-lang-set="en"]');
  ok("title: tapping English switches back", await ev(page, () => lang === "en" && /Set sail/i.test(document.getElementById("tNew").textContent)));
  {
    const z = await open(D, { locale: "zh-TW", tag: "title-zh" });
    ok("title: a zh-TW browser's first visit opens in Chinese with 中文 marked", await ev(z.page, () => lang === "zh" && document.querySelector('[data-lang-set="zh"]').getAttribute("aria-pressed") === "true" && /啟航/.test(document.getElementById("tNew").textContent)));
    await z.ctx.close();
  }

  await page.focus("#tNew");   // the language pair keeps focus after a tap; a keyboard player goes back to the menu
  await page.keyboard.down("Enter");                // a held Enter starts the game once and stops at the ledger
  await page.keyboard.down("Enter"); await page.keyboard.down("Enter");   // (Playwright sends these as auto-repeats)
  await page.keyboard.up("Enter");
  await until(page, () => !titleOpen);
  await page.waitForTimeout(100 * SLOW);
  ok("held Enter on the title starts once: a fresh captain is at sea, not paused", await ev(page, () => !docked && !paused && !pauseOpen));
  await ev(page, () => { tutorialReset(); dock("welcome"); });
  await until(page, () => docked);
  await page.waitForTimeout(100 * SLOW);
  ok("the ledger opens at the top with focus on the sheet, not Set sail", await ev(page, () =>
    docked && document.querySelector("#port .sheet").scrollTop === 0 && document.activeElement === document.querySelector("#port .sheet")));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(500 * SLOW);                     // keyboard scrolling is animated
  ok("arrow / PageDown keys scroll the ledger natively", await ev(page, () => document.querySelector("#port .sheet").scrollTop > 0));
  await ev(page, () => { document.querySelector("#port .sheet").scrollTop = 600; });
  await page.click("#sail");
  await until(page, () => !docked && !paused);
  await ev(page, () => { canDock = true; player.x = PORT.x + 150; player.y = PORT.y; });
  await until(page, () => docked);
  ok("ledger reopens scrolled to the top after a voyage", await ev(page, () => document.querySelector("#port .sheet").scrollTop === 0));
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(60 * SLOW); }   // still mashing fire
  const mash = await ev(page, () => ({ docked, top: document.querySelector("#port .sheet").scrollTop, act: document.activeElement.id || document.activeElement.className }));
  await page.keyboard.press("Enter");
  const first = await ev(page, () => ({ docked, act: document.activeElement.id }));
  await page.keyboard.press("Enter");
  await until(page, () => !docked && !paused);
  ok("fire keys mashed into the ledger press nothing; Enter goes to Set sail, Enter again sails", mash.docked && mash.top === 0 && first.docked && first.act === "sail", { mash, first });
  await tank(page);

  // keyboard: sail steps hold speed after release, turning keys never fire
  await spyFire(page);
  await ev(page, () => { player.rot = 0; });
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyW");
  const p0 = await ev(page, () => ({ x: player.x, y: player.y, lv: sailLevel, txt: document.getElementById("sailTxt").textContent, vis: !document.getElementById("sailInd").hidden, fr: S.game.loop.frame }));
  await page.waitForTimeout(1500 * SLOW);
  const p1 = await ev(page, () => ({ x: player.x, y: player.y, sp: player.speed, max: player.maxSpeed, paused, docked, pauseOpen, fr: S.game.loop.frame }));
  ok("W twice = half sail, shown in the HUD; ship keeps moving with no key held", p0.lv === 2 && p0.txt === "Half" && p0.vis && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 60 && p1.sp > p1.max * 0.5, { p0, p1 });
  const r0 = await ev(page, () => player.rot);
  await page.keyboard.down("KeyD"); await page.waitForTimeout(500 * SLOW); await page.keyboard.up("KeyD");
  const rD = await ev(page, () => player.rot);
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(150 * SLOW); await page.keyboard.up("ArrowLeft");
  const rL = await ev(page, () => player.rot);
  for (let i = 0; i < 6; i++) { await page.keyboard.down("KeyA"); await page.waitForTimeout(60 * SLOW); await page.keyboard.up("KeyA"); await page.waitForTimeout(60 * SLOW); }
  await page.waitForTimeout(500 * SLOW);
  const r1 = await ev(page, () => ({ rot: player.rot, sp: player.speed, fires: window.__fires }));
  ok("D / Left turn the bow, releasing turn keys never fires, speed holds", rD - r0 > 0.3 && rL < rD && r1.fires === 0 && r1.sp > 50, { r0, rD, rL, r1 });
  for (let i = 0; i < 3; i++) await page.keyboard.press("KeyS");
  await page.waitForFunction(() => sailLevel === 0 && player.speed < 5, null, { polling: 50, timeout: 6000 * SLOW }).catch(() => {});   // until at rest; the check says if it never got there
  ok("S back to stopped brings the ship to rest", await ev(page, () => sailLevel === 0 && player.speed < 5));

  // Space fires; clicking the HUD language button never lets Space toggle it again
  await beside(page);
  await page.waitForTimeout(100 * SLOW);
  await page.click("#langHud");
  const langA = await ev(page, () => lang);
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(250 * SLOW); }
  await page.keyboard.press("Enter");
  const sp = await ev(page, () => ({ lang, fires: window.__fires, balls: balls.filter(b => b.fromPlayer).length, act: document.activeElement.id || document.activeElement.tagName }));
  ok("after clicking the HUD language button, Space fires and the language stays", sp.lang === langA && langA === "zh" && sp.fires === 4 && sp.act !== "langHud", sp);
  await ev(page, () => document.querySelector("#langHud").click());   // back to English for the rest

  // Esc / P / pause button, frozen world
  await page.keyboard.press("Escape");
  const pz = await ev(page, () => ({ pauseOpen, paused, tp: S.time.paused, tw: S.tweens.paused, vis: !document.getElementById("pause").hidden, seaT: S.seaT, e: enemies.map(e => e.x).join(), focus: document.activeElement.dataset.menu }));
  await page.waitForTimeout(600 * SLOW);
  const pz2 = await ev(page, () => ({ seaT: S.seaT, e: enemies.map(e => e.x).join() }));
  ok("Esc pauses: overlay up, Resume focused, ships and sea frozen", pz.pauseOpen && pz.paused && pz.tp && pz.tw && pz.vis && pz.focus === "resume" && pz.seaT === pz2.seaT && pz.e === pz2.e, pz);
  await page.screenshot({ path: join(out, "d-pause-en.png") });
  await page.keyboard.press("Escape");
  ok("Esc again resumes", await ev(page, () => !pauseOpen && !paused && !S.time.paused && document.getElementById("pause").hidden));
  await page.keyboard.press("KeyP");
  const pp = await ev(page, () => pauseOpen);
  await page.keyboard.press("KeyP");
  await page.click("#pauseBtn");
  const pb = await ev(page, () => pauseOpen);
  await page.click("#pause [data-menu=resume]");
  ok("P toggles pause; HUD pause button pauses; Resume resumes", pp && pb && await ev(page, () => !pauseOpen && !paused));

  // auto-pause
  await ev(page, () => window.dispatchEvent(new Event("blur")));
  ok("window blur at sea pauses", await ev(page, () => pauseOpen));
  await page.keyboard.press("Escape");
  await ev(page, () => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  ok("hidden tab at sea pauses", await ev(page, () => pauseOpen));
  // become visible again, or Phaser keeps its own loop paused for the rest of this page (forced: a CI runner's headless page may report hidden natively)
  await ev(page, () => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.keyboard.press("Escape");
  await ev(page, () => { canDock = true; player.x = PORT.x + 150; player.y = PORT.y; });
  await until(page, () => docked);
  await ev(page, () => window.dispatchEvent(new Event("blur")));
  ok("blur while docked does not pause", await ev(page, () => !pauseOpen && !document.getElementById("port").hidden));
  await page.click("#sail");
  await until(page, () => !docked && !paused);
  await tank(page);

  // mouse: hold steers toward the cursor (no joystick), release fires, quick click fires, right button ignored
  await spyFire(page);
  await ev(page, () => { player.rot = 0; player.speed = 0; setSailLevel(0); });
  const target = await ev(page, () => { const c = S.cameras.main, wx = player.x, wy = player.y - 260; return { x: (wx - c.worldView.x) * c.zoom, y: (wy - c.worldView.y) * c.zoom }; });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(900 * SLOW);
  const ms = await ev(page, () => ({ rot: player.rot, lv: sailLevel, joy: document.getElementById("joy").hidden, hold: !!mouseHold && mouseHold.steer, fires: window.__fires }));
  await page.mouse.up();
  await page.waitForTimeout(50 * SLOW);
  const mf = await ev(page, () => window.__fires);
  ok("mouse hold steers toward the cursor (north), sets sail, no joystick; release fires", ms.hold && ms.rot < -0.5 && ms.lv >= 2 && ms.joy && ms.fires === 0 && mf === 1, ms);
  const lvBefore = await ev(page, () => sailLevel);
  await page.mouse.move(target.x + 200, target.y + 100);
  await page.mouse.down(); await page.waitForTimeout(60 * SLOW); await page.mouse.up();
  ok("quick click just fires, sail unchanged", await ev(page, l => window.__fires === 2 && sailLevel === l, lvBefore));
  await page.mouse.down({ button: "right" }); await page.waitForTimeout(250 * SLOW); await page.mouse.up({ button: "right" });
  const ctxm = await ev(page, () => { const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.querySelector("#game canvas").dispatchEvent(e); return e.defaultPrevented; });
  ok("right button neither steers nor fires; context menu suppressed", ctxm && await ev(page, () => window.__fires === 2 && !mouseHold));
  await page.mouse.down(); await page.mouse.down({ button: "right" }); await page.waitForTimeout(250 * SLOW);
  await page.mouse.up(); await page.waitForTimeout(50 * SLOW);   // left let go first, right still held
  const lr = await ev(page, () => ({ hold: !!mouseHold, fires: window.__fires }));
  await page.mouse.up({ button: "right" });
  ok("left released while right is held still ends the steer and fires", !lr.hold && lr.fires === 3, lr);
  // holding Esc pauses once; auto-repeats do not flip it back
  await page.keyboard.down("Escape"); await page.keyboard.down("Escape"); await page.keyboard.down("Escape"); await page.keyboard.up("Escape");
  const held = await ev(page, () => pauseOpen);
  await page.keyboard.press("Escape");
  ok("a held Esc pauses once (auto-repeat ignored)", held && await ev(page, () => !pauseOpen));

  // quit to title with cargo asks twice, then Continue docks at the harbor
  await ev(page, () => { cargo = 40; });
  await page.keyboard.press("Escape");
  await page.click("#pQuit");
  const armed = await ev(page, () => document.getElementById("pQuit").textContent);
  await page.waitForTimeout(500 * SLOW);
  await page.click("#pQuit");
  const q = await ev(page, () => ({ titleOpen, cargo, docked, paused, px: Math.round(player.x - PORT.x), sail: document.querySelector("[data-smoke=start]").id }));
  ok("Save & quit: second press needed with cargo aboard; title back, hold emptied, ship home", /40/.test(armed) && q.titleOpen && q.cargo === 0 && !q.docked && q.paused && q.px === 140, { armed, q });
  const fresh = await ev(page, () => !hasProgress(save) && !save.tutorialDone);
  await page.click("[data-smoke=start]");
  ok("from the title the start button docks at the harbor (a fresh captain sails straight out)", await ev(page, f => (f ? !docked && !paused : docked) && !titleOpen, fresh), { fresh });
  await ctx.close();
}

// ---------- 1b. HiDPI: the mouse's sail step follows CSS distance, so 2x screens behave like 1x ----------
for (const dpr of [1, 2]) {
  const { ctx, page } = await open(D, { tag: `dpr${dpr}`, dpr });
  await toSea(page); await tank(page);
  const lv = [];
  for (const cssDist of [80, 150, 260]) {
    await ev(page, () => { player.rot = 0; player.speed = 0; setSailLevel(0); });
    const at = await ev(page, d => { const c = S.game.canvas.getBoundingClientRect(), cam = S.cameras.main, k = S.game.canvas.width / c.width;
      return { x: (player.x - cam.worldView.x) * cam.zoom / k, y: (player.y - cam.worldView.y) * cam.zoom / k - d }; }, cssDist);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(260 * SLOW);
    lv.push(await ev(page, () => sailLevel)); await page.mouse.up(); await page.waitForTimeout(80 * SLOW);
  }
  ok(`dpr ${dpr}: mouse distance 80 / 150 / 260 CSS px gives slow / half / full sail`, lv.join() === "1,2,3", lv);
  await ctx.close();
}

// ---------- 2. touch stick unchanged (CDP touch on a phone viewport) ----------
{
  const { ctx, page } = await open(M, { mobile: true, tag: "touch" });
  await page.screenshot({ path: join(out, "m-title-en.png") });
  await toSea(page);
  await tank(page); await spyFire(page);
  const cdp = await ctx.newCDPSession(page);
  const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await tp("touchStart", 200, 600); await tp("touchMove", 230, 600); await tp("touchMove", 250, 600);
  await page.waitForTimeout(700 * SLOW);
  const t1 = await ev(page, () => ({ m: joyVec.m, joy: !document.getElementById("joy").hidden, sp: player.speed, dev: device, ind: document.getElementById("sailInd").hidden }));
  await tp("touchEnd");
  await page.waitForTimeout(1500 * SLOW);
  const t2 = await ev(page, () => ({ fires: window.__fires, sp: player.speed }));
  ok("touch: floating stick steers, letting go fires and the ship slows as before", t1.m > 0.5 && t1.joy && t1.sp > 30 && t1.dev === "touch" && t1.ind && t2.fires === 1 && t2.sp < t1.sp, { t1, t2 });
  await page.click("#pauseBtn");
  await page.screenshot({ path: join(out, "m-pause-en.png") });
  await page.click("#pause [data-menu=settings]");
  await page.screenshot({ path: join(out, "m-settings-en.png") });
  await page.click("#p-settings [data-menu=back]");
  await page.click("#pause [data-menu=howto]");
  await page.screenshot({ path: join(out, "m-howto-en.png") });
  await ctx.close();
}

// ---------- 3. gamepad (stubbed navigator.getGamepads, hot-plug) ----------
{
  const { ctx, page } = await open(D, { tag: "pad" });
  await ev(page, () => {
    const pad = { id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(pad, "timestamp", { get: () => performance.now() });
    window.__pad = pad;
    window.__btn = (i, v) => { pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; };
    window.__plug = on => { navigator.getGamepads = () => (on ? [pad, null, null, null] : [null, null, null, null]);
      const e = new Event(on ? "gamepadconnected" : "gamepaddisconnected"); e.gamepad = pad; window.dispatchEvent(e); };
    window.__plug(true);
  });
  const tap = async i => { await ev(page, j => __btn(j, 1), i); await page.waitForTimeout(120 * SLOW); await ev(page, j => __btn(j, 0), i); await page.waitForTimeout(120 * SLOW); };
  await page.waitForTimeout(200 * SLOW);
  await tap(13);                                    // D-pad down on the title
  const f1 = await ev(page, () => document.activeElement.dataset.menu);
  await tap(12);
  await tap(0);                                     // A on Set sail (a fresh save sails straight out)
  await until(page, () => !titleOpen && !paused);
  await ev(page, () => { tutorialReset(); dock("welcome"); });   // the ledger checks below
  await until(page, () => docked);
  await page.waitForTimeout(100 * SLOW);
  ok("pad on title: D-pad moves focus (Set sail, then the daily sea), A starts; pad focus ring class on", f1 === "daily" && await ev(page, () => device === "pad" && document.body.classList.contains("pad-nav")), { f1 });
  await tap(0);                                     // fire-mashing into the ledger: ignored while it appears
  const stillSheet = await ev(page, () => docked && document.activeElement === document.querySelector("#port .sheet"));
  await page.waitForTimeout(700 * SLOW);
  await tap(0);                                     // A on the sheet moves to Set sail...
  const onSail = await ev(page, () => docked && document.activeElement.id === "sail");
  await tap(0);                                     // ...and A again sails
  await until(page, () => !docked && !paused);
  ok("pad in the ledger: A ignored as it opens, then the first A goes to Set sail and the second sails", stillSheet && onSail, { stillSheet, onSail });
  await tank(page); await spyFire(page);
  await ev(page, () => { player.rot = Math.PI; __pad.axes = [1, 0, 0, 0]; });
  await page.waitForTimeout(2200 * SLOW);                   // a half turn from standstill takes about two seconds
  const st = await ev(page, () => ({ rot: Math.abs(angDiff(player.rot, 0)), sp: player.speed }));
  await ev(page, () => { __pad.axes = [0, 0, 0, 0]; });
  await tap(12); await tap(12);
  await beside(page);
  await tap(0);
  await ev(page, () => { for (const g of Object.values(player.guns).flat()) g.cd = 0; });
  await tap(7);
  const fr = await ev(page, () => ({ fires: window.__fires, lv: sailLevel }));
  ok("pad at sea: stick points the bow, D-pad up raises the sail, A and RT fire", st.rot < 0.6 && st.sp > 30 && fr.fires === 2 && fr.lv === 2, { st, fr });
  await tap(9);
  const p1 = await ev(page, () => ({ pauseOpen, f: document.activeElement.dataset.menu }));
  await tap(13);
  const p2 = await ev(page, () => document.activeElement.dataset.menu);
  await tap(1);
  ok("pad Start pauses, D-pad moves focus in the pause menu, B resumes", p1.pauseOpen && p1.f === "resume" && p2 === "howto" && await ev(page, () => !pauseOpen), { p1, p2 });
  await ev(page, () => __plug(false));
  await page.waitForTimeout(250 * SLOW);
  const un = await ev(page, () => ({ pauseOpen, toast: document.getElementById("toast").textContent }));
  await tap(1);   // unplugged: B must do nothing
  const still = await ev(page, () => pauseOpen);
  await ev(page, () => __plug(true));
  await page.waitForTimeout(250 * SLOW);
  await tap(1);
  ok("unplugging a pad at sea pauses; replugging works again", un.pauseOpen && /disconnected/i.test(un.toast) && still && await ev(page, () => !pauseOpen), un);
  await ctx.close();
}

// ---------- 4. tutorial driven through real state ----------
{
  const { ctx, page } = await open(D, { tag: "tut" });
  await toSea(page);
  await tank(page);
  const t0 = await ev(page, () => ({ active: tut.active, step: tut.step, coach: !document.getElementById("coach").hidden,
    easy: enemies.filter(e => e.alive && e.merchant && e.L === 1 && dist(e, PORT) < SAFE_R + 300).length, tgt: !!tut.target }));
  ok("brand-new save: tutorial starts on the first voyage with an easy Lv 1 merchant close by", t0.active && t0.step === 0 && t0.coach && t0.easy >= 1 && t0.tgt, t0);
  const step = () => ev(page, () => tut.step);
  await ev(page, () => { player.x = PORT.x + DOCK_R + 220; player.y = PORT.y; player.rot = 0; });
  await until(page, () => tut.step >= 1);
  await ev(page, () => { const e = tut.target; e.x = player.x + Math.cos(player.rot + Math.PI / 2) * 180; e.y = player.y + Math.sin(player.rot + Math.PI / 2) * 180;
    e.rot = player.rot; e.speed = 0; e.maxSpeed = 0.001; for (const g of Object.values(player.guns).flat()) g.cd = 0; });
  await until(page, () => tut.step >= 2);
  await page.screenshot({ path: join(out, "d-tutorial-fire.png") });
  await page.keyboard.press("Space");
  await until(page, () => tut.step >= 3);
  await ev(page, () => sink(tut.target, player));
  await until(page, () => tut.step >= 4);
  await ev(page, () => { const c = crates.find(k => !k.wreck); c.x = player.x; c.y = player.y; });
  await until(page, () => tut.step >= 5);
  await ev(page, () => { canDock = true; player.x = PORT.x + 150; player.y = PORT.y; });
  await until(page, () => docked && tut.step === 6);
  await page.click('#deck [data-act="port"]');   // too soon after the ledger opened: ignored
  const early = await ev(page, () => (deckSel ? 0 : 1));
  await page.waitForTimeout(400 * SLOW);
  const t6 = await ev(page, () => ({ gold: save.gold, inSheet: document.getElementById("coach").parentElement.classList.contains("sheet"), txt: document.getElementById("coachTxt").textContent }));
  ok("a shop click in the first moments after docking is ignored", early === 1, { early });
  await page.screenshot({ path: join(out, "d-tutorial-ledger.png") });
  await page.click('#deck [data-act="port"]');   // a gun port picked: the armory is in its panel
  await page.click('[data-act="buy"][data-id="six"]');
  await page.waitForTimeout(150 * SLOW);
  const t7 = await ev(page, () => ({ done: save.tutorialDone, txt: document.getElementById("coachTxt").textContent }));
  ok("tutorial advances out > aim (red) > fire > sink > scoop > sell > buy > done from game state", t6.gold > 0 && t6.inSheet && /12/.test(t6.txt) && t7.done && /loop/.test(t7.txt), { t6, t7 });
  await page.reload({ waitUntil: "load" }); await booted(page);
  await toSea(page);
  ok("finished tutorial stays finished after a reload", await ev(page, () => !tut.active && document.getElementById("coach").hidden && save.tutorialDone));
  await page.keyboard.press("Escape");
  await page.click("#pause [data-menu=howto]");
  await page.click("#p-howto [data-menu=replay-tut]");
  const rp = await ev(page, () => ({ active: tut.active, step: tut.step, done: save.tutorialDone, pauseOpen }));
  await page.keyboard.press("Escape");
  const skipVis = await ev(page, () => !document.getElementById("pSkipTut").hidden);
  await page.click("#pSkipTut");
  ok("replay from How to play restarts it; Skip in the pause menu ends it", rp.active && rp.step === 0 && !rp.done && !rp.pauseOpen && skipVis && await ev(page, () => !tut.active && save.tutorialDone), rp);
  await ctx.close();
}
{   // #86: the lesson's mark holds its course; a sinking at any step starts the chase over with a fresh mark; the lesson ends with a kill
  const { ctx, page } = await open(D, { tag: "tut-dead-end" });
  await toSea(page);
  const m0 = await ev(page, () => { const e = tut.target, p = { x: e.x, y: e.y }; player.x = e.x - 200; player.y = e.y; player.rot = 0; player.speed = 0; return { mark: !!e.tutMark, slow: e.maxSpeed < 100, p }; });
  await page.waitForTimeout(1500 * SLOW);
  const d1 = await ev(page, () => ({ d: dist(player, tut.target), run: tut.target.speed }));
  ok("tutorial mark: slow, flagged, and it does not run from a ship sailing up to it", m0.mark && m0.slow && d1.d < 320, { m0, d1 });
  await ev(page, () => { player.x = PORT.x + DOCK_R + 220; player.y = PORT.y; enterStep(3); });
  await ev(page, () => { sink(player, null); });
  await until(page, () => docked);
  await page.click("#sail");
  await until(page, () => !docked && !paused);
  const back = await ev(page, () => ({ step: tut.step, mark: !!(tut.target && tut.target.alive && tut.target.tutMark), txt: document.getElementById("coachTxt").textContent }));
  ok("tutorial: sunk on the 'keep firing' step, the next sortie starts at 'find the ship' with a fresh mark (no empty dead end)", back.step === 1 && back.mark, back);
  await ev(page, () => { sink(tut.target, player); });
  await until(page, () => tut.step >= 4);
  ok("tutorial: sinking the mark is a counted kill (the lesson never ends on 0 sunk)", await ev(page, () => save.sunk >= 1));
  await ctx.close();
}
{   // an old save with progress and no tutorial field never sees the tutorial
  const ctx = await browser.newContext({ viewport: D });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[legacy] pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "load" });
  await ev(page, () => { localStorage.clear(); const s = { v: 2, gold: 300, ship: "sloop", hull: 2, sails: 1, hold: 1, unlocked: { six: true }, gunLv: { six: 2, long12: 1, carronade: 1, fire: 1 }, bow: ["six"], left: ["six"], right: ["six"], stern: [], sunk: 9, wrecks: [] }; localStorage.setItem("privateers-save-v2", JSON.stringify(s)); });
  await page.reload({ waitUntil: "load" }); await booted(page);
  const lg = await ev(page, () => ({ done: save.tutorialDone, cont: !document.getElementById("tContinue").hidden, smoke: document.querySelector("[data-smoke=start]").id }));
  await page.click("[data-smoke=start]"); await page.click("#sail");
  await page.waitForTimeout(200 * SLOW);
  ok("legacy save with progress: Continue is primary, no tutorial", lg.done && lg.cont && lg.smoke === "tContinue" && await ev(page, () => !tut.active), lg);
  // New game confirm keeps settings
  await ev(page, () => saveSettings({ uiPct: 115 }));
  await page.keyboard.press("Escape"); await page.click("#pQuit");
  await page.click("#tNew");
  const cf = await ev(page, () => ({ vis: !document.getElementById("tConfirm").hidden, focus: document.activeElement.dataset.menu }));
  await page.click('[data-menu="new-no"]');
  const kept = await ev(page, () => save.gold);
  await page.click("#tNew"); await page.click('[data-menu="new-yes"]');
  const ng = await ev(page, () => ({ gold: save.gold, sunk: save.sunk, docked, ts: JSON.parse(localStorage.getItem("privateers-settings")).uiPct }));
  ok("New game with a save asks first (Cancel focused, Cancel keeps it), then wipes progress but not settings and sails out", cf.vis && cf.focus === "new-no" && kept === 300 && ng.gold === 0 && ng.sunk === 0 && !ng.docked && ng.ts === 115, { cf, ng });
  await ctx.close();
}

// ---------- 5. settings persist; reset is two-step; text size; shake ----------
{
  const { ctx, page } = await open(D, { tag: "set" });
  await page.click("#title [data-menu=settings]");
  const audioHidden = await ev(page, () => document.getElementById("setAudio").hidden === (typeof Snd === "undefined"));
  if (await ev(page, () => typeof Snd !== "undefined")) {     // the audio group drives the real Snd
    await page.click('[data-set="sound"][data-v="off"]');
    const mu = await ev(page, () => ({ muted: Snd.isMuted(), pressed: document.querySelector('[data-set="sound"][data-v="off"]').getAttribute("aria-pressed") }));
    await page.click('[data-set="sound"][data-v="on"]');
    await page.fill('[data-vol="music"]', "40");
    const mv = await ev(page, () => ({ muted: Snd.isMuted(), music: Snd.getVolume("music"), out: document.querySelector('[data-vol="music"]').nextElementSibling.textContent }));
    ok("settings: All sound off/on mutes Snd; the music slider sets Snd's music volume", mu.muted && mu.pressed === "true" && !mv.muted && Math.abs(mv.music - 0.4) < 1e-9 && mv.out === "40%", { mu, mv });
    await page.screenshot({ path: join(out, "d-settings-audio-en.png") });
  }
  await page.click('[data-set="shake"][data-v="off"]');
  await page.fill('[data-scale="uiPct"]', "130");
  await page.fill('[data-scale="miniPct"]', "125");
  await page.click('[data-set="lang"][data-v="zh"]');
  await page.screenshot({ path: join(out, "d-settings-zh.png") });
  await page.reload({ waitUntil: "load" }); await booted(page);
  const s = await ev(page, () => ({ shake: SETTINGS.shake, ts: SETTINGS.uiPct, css: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim(), lang, html: document.documentElement.lang,
    font: parseFloat(getComputedStyle(document.querySelector(".mbtn")).fontSize), mini: SETTINGS.miniPct,
    miniCss: getComputedStyle(document.documentElement).getPropertyValue("--mini-w").trim(), miniLbl: document.querySelector(".srow [data-i18n=set_mini]").textContent }));
  await ev(page, () => camShake(200, 0.01));
  ok("settings persist across reload (shake off, text 130%, zh) and text size scales the UI", audioHidden && s.shake === false && s.ts === 130 && s.css === "1.3" && s.lang === "zh" && s.html === "zh-Hant" && Math.abs(s.font - 22 * 1.3) < 0.6, s);
  ok("settings: chart size 125% persists (--mini-w px) and its label is translated", s.mini === 125 && /^[\d.]+px$/.test(s.miniCss) && s.miniLbl === "海圖大小", s);
  ok("screen shake off is honoured", await ev(page, () => !S.cameras.main.shakeEffect.isRunning));
  await page.screenshot({ path: join(out, "d-title-zh-130.png") });
  await page.click("#title [data-menu=settings]");
  await ev(page, () => { save.gold = 999; persist(); });
  await page.click("#setReset");
  const armed = await ev(page, () => ({ t: document.getElementById("setReset").textContent, g: save.gold }));
  await page.waitForTimeout(500 * SLOW);
  await page.click("#setReset");
  const rs = await ev(page, () => ({ gold: save.gold, titleOpen, panel: !document.getElementById("p-settings").hidden, ts: SETTINGS.uiPct }));
  ok("Reset progress: first press arms, second wipes and returns to the title, settings kept", armed.g === 999 && /再按一次/.test(armed.t) && rs.gold === 0 && rs.titleOpen && !rs.panel && rs.ts === 130, { armed, rs });
  await ctx.close();
}

// ---------- 6. both languages: no missing keys, no raw keys or {placeholders} on any screen ----------
for (const lg of ["en", "zh"]) {
  for (const vp of [D, M]) {
    const tag = `${lg}-${vp.width}`;
    const { ctx, page } = await open(vp, { tag, mobile: vp === M, locale: lg === "zh" ? "zh-TW" : "en-US" });
    const missing = await ev(page, () => {
      const used = new Set([...document.querySelectorAll("[data-i18n]")].map(e => e.dataset.i18n).concat([...document.querySelectorAll("[data-i18n-html]")].map(e => e.dataset.i18nHtml)));
      const all = new Set([...Object.keys(STR.en), ...Object.keys(STR.zh)]);
      return { used: [...used].filter(k => !(k in STR.en) || !(k in STR.zh)), table: [...all].filter(k => !(k in STR.en) || !(k in STR.zh)) };
    });
    const texts = [];
    const grab = async where => texts.push({ where, s: await ev(page, () => document.body.innerText) });
    await grab("title");
    for (const p of ["howto", "settings", "credits"]) { await page.click(`#title [data-menu=${p}]`); await grab(p); if (vp === D || p === "howto") await page.screenshot({ path: join(out, `${tag}-${p}.png`) }); await page.keyboard.press("Escape"); }
    await page.click("[data-smoke=start]"); await ev(page, () => { if (!docked) dock("welcome"); }); await until(page, () => docked); await grab("ledger");
    await page.screenshot({ path: join(out, `${tag}-ledger.png`) });
    await page.click("#sail"); await page.waitForTimeout(300 * SLOW); await grab("sea");
    await page.screenshot({ path: join(out, `${tag}-sea.png`) });
    await page.keyboard.press("Escape"); await grab("pause");
    const coach = await ev(page, () => {   // every coach text, for every step and device
      const outv = [], keep = { step: tut.step, dev: device, docked, doneT: tut.doneT };
      for (const d of ["desk", "keys", "mouse", "touch", "pad"]) for (let i = 0; i < TUT.length; i++) for (const dk of [false, true]) {
        device = d; tut.step = i; docked = dk; outv.push(coachText());
      }
      tut.doneT = 1; outv.push(coachText());
      device = keep.dev; tut.step = keep.step; docked = keep.docked; tut.doneT = keep.doneT;
      return outv.join("\n") + "\n" + ["hint_keys", "hint_mouse", "hint_pad", "hintDesk", "hintTouch"].map(k => t(k)).join("\n");
    });
    texts.push({ where: "coach", s: coach });
    const bad = texts.flatMap(({ where, s }) => (s.match(/\{[a-z]+\}|\b(?:m|set|ht|cr|tut|ctl|tip|sl|hint)_[A-Za-z]+\b|undefined|NaN/g) || []).map(m => `${where}: ${m}`));
    const wrongLang = lg === "zh" ? !/[設定玩法說明]/.test(texts[0].s) : /設定/.test(texts[0].s);
    ok(`${tag}: every key in both tables, no raw keys or placeholders on screen`, !missing.used.length && !missing.table.length && !bad.length && !wrongLang, { missing, bad: bad.slice(0, 8) });
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter(r => !r.pass);
if (errors.length) console.error("page errors:\n" + errors.join("\n"));
console.log(`${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors. Screenshots in ${out}`);
process.exit(failed.length || errors.length ? 1 : 0);
