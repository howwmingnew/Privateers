// Highlight replay (#20) in a real browser: a clip can be cut and saved, the switch works, a browser without MediaRecorder
// degrades quietly, a phone starts with it off, and recording costs little frame time. The pure logic is in tests/unit-replay.mjs.
// Usage: node tests/replay.mjs [url] [frames]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { statSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const FRAMES = +(process.argv[3] || 300);
const SLOW = +process.env.TEST_SLOW || 1;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let failed = 0;
const ok = (name, pass, info) => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

async function openSea(viewport, { mobile = false, noRecorder = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await ctx.addInitScript(noRecorder => {
    if (noRecorder) delete window.MediaRecorder;
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
  }, noRecorder);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.click("[data-smoke=start]");
  await page.waitForTimeout(500 * SLOW);
  await page.evaluate(() => { if (docked) setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await ev(page, () => {
    save.tutorialDone = true; tutorialReset();
    player.x = PORT.x + 1500; player.y = PORT.y; player.speed = 0; moved = true;
    for (const e of enemies) { e.x = W - 200; e.y = H - 200; }
    window.managePopulation = () => {};
  });
  return { ctx, page };
}

// ---------- desktop: record, mark a moment, get a clip, save it ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  await page.waitForFunction(() => RP.running, null, { timeout: 5000 * SLOW });
  ok("desktop: recording starts by itself while sailing", await ev(page, () => replayWanted() && RP.running && !!RP.slots[0]));
  ok("desktop: no clip and no chip yet", await ev(page, () => !RP.pending && (!RP.chip || RP.chip.hidden)));
  await sleep(4500);
  ok("desktop: a second recorder joins, staggered", await ev(page, () => !!RP.slots[1] && Math.abs(slotAge(RP.slots[0]) - slotAge(RP.slots[1])) > 2));
  ok("desktop: a moment is accepted, a second one inside the cool-down is not", await ev(page, () => { const a = replayMoment("test"), b = replayMoment("test"); return a && !b; }));
  await page.waitForFunction(() => !!RP.pending, null, { timeout: 8000 * SLOW });
  const clip = await ev(page, async () => {
    const c = RP.pending, v = document.createElement("video");
    const dims = await new Promise(res => { v.onloadedmetadata = () => res([v.videoWidth, v.videoHeight]); v.onerror = () => res(null); v.src = URL.createObjectURL(c.blob); });
    return { type: c.blob.type, size: c.blob.size, secs: c.secs, kind: c.kind, dims, cv: [S.game.canvas.width, S.game.canvas.height], chip: !!RP.chip && !RP.chip.hidden };
  });
  ok("clip: a WebM blob", /^video\/webm/.test(clip.type), clip.type);
  ok("clip: real footage (over 20 kB) of 3 to 11 seconds", clip.size > 20000 && clip.secs >= 3 && clip.secs <= 11, { size: clip.size, secs: clip.secs });
  ok("clip: the browser decodes it, at most 960 wide, the canvas's aspect", !!clip.dims && clip.dims[0] <= 960 && Math.abs(clip.dims[0] / clip.dims[1] - clip.cv[0] / clip.cv[1]) < 0.02, clip);
  ok("clip: the chip offers it", clip.chip);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 * SLOW }), page.click("#replayChip")]);
  const path = await dl.path();
  ok("save: downloads privateers-<time>.webm with the clip's bytes", /^privateers-\d{8}-\d{6}\.webm$/.test(dl.suggestedFilename()) && statSync(path).size === clip.size, { name: dl.suggestedFilename(), bytes: statSync(path).size });
  await sleep(300);
  ok("save: the chip says Saved!", await ev(page, () => RP.chip.textContent === t("rp_saved")));
  await ev(page, () => replayOffer());
  await ev(page, () => { pauseGame(); });
  await sleep(200);
  ok("pause: hides the chip", await ev(page, () => RP.chip.hidden));
  await ev(page, () => resumeGame());
  await ev(page, () => saveSettings({ replay: false }));
  await sleep(300);
  ok("setting off: recording stops at once and frees the recorders", await ev(page, () => !RP.running && !RP.slots[0] && !RP.slots[1] && !RP.stream));
  ok("setting off: a moment is ignored", await ev(page, () => replayMoment("test") === false));
  await ev(page, () => saveSettings({ replay: true }));
  await sleep(300);
  ok("setting on again: recording resumes", await ev(page, () => RP.running));
  await ev(page, () => { docked = true; });
  await sleep(300);
  ok("docked: nothing records in the ledger", await ev(page, () => !RP.running));
  await ev(page, () => { docked = false; });
  await sleep(300);
  ok("sailing again: recording resumes", await ev(page, () => RP.running));
  await ctx.close();
}

// ---------- the settings row ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  await ev(page, () => { pauseGame(); document.querySelector('[data-menu="settings"]').click(); });
  await sleep(300);
  const row = await ev(page, () => { const r = document.getElementById("setReplayRow"); return { shown: !r.hidden && r.offsetParent !== null, on: r.querySelector('[data-v="on"]').getAttribute("aria-pressed") }; });
  ok("settings: a Highlight replay row shows, On pressed by default", row.shown && row.on === "true", row);
  await page.click('#setReplayRow [data-v="off"]');
  ok("settings: Off is stored", await ev(page, () => SETTINGS.replay === false && JSON.parse(localStorage.getItem("privateers-settings")).replay === false));
  await ctx.close();
}

// ---------- no MediaRecorder: nothing offered, nothing breaks ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 }, { noRecorder: true });
  await sleep(800);
  const r = await ev(page, () => {
    const out = { supported: replaySupported(), running: RP.running, moment: replayMoment("test"), chip: !!document.getElementById("replayChip") };
    pauseGame(); document.querySelector('[data-menu="settings"]').click(); renderSettings();
    out.rowHidden = document.getElementById("setReplayRow").hidden && document.getElementById("setReplayNote").hidden;
    out.reason = RP.sup.reason;
    return out;
  });
  ok("no MediaRecorder: unsupported, not recording, a moment does nothing, no chip", !r.supported && !r.running && r.moment === false && !r.chip, r);
  ok("no MediaRecorder: the settings row is hidden", r.rowHidden, r.reason);
  await ctx.close();
}

// ---------- a phone starts with it off ----------
{
  const { ctx, page } = await openSea({ width: 390, height: 780 }, { mobile: true });
  await sleep(800);
  ok("phone: recording is off until the player turns it on", await ev(page, () => device === "touch" && !replayWanted() && !RP.running && !RP.slots[0]));
  await ev(page, () => saveSettings({ replay: true }));
  await sleep(500);
  ok("phone: the switch turns it on", await ev(page, () => RP.running));
  await ctx.close();
}

// ---------- frame cost: a 34-ship brawl with recording off and on (tests/art-perf.mjs's method) ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const res = await ev(page, async N => {
    document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; resetEnemies(S);
    let ax = PORT.x + 1700, ay = PORT.y + 300;
    for (let a = 0; a < 64; a++) {
      const x = PORT.x + Math.cos(a) * 1700, y = PORT.y + Math.sin(a) * 1700;
      if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 650)) { ax = x; ay = y; break; }
    }
    Object.assign(player, { x: ax, y: ay, maxHp: 1e9, hp: 1e9 });
    const pack = () => {
      for (let i = 0; i < 6 && enemies.filter(e => e.alive).length < 34; i++) spawnEnemy(S);
      for (const e of enemies) if (e.alive && dist(e, player) > 800) {
        const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 450;
        e.x = player.x + Math.cos(a) * r; e.y = player.y + Math.sin(a) * r; e.rot = a + Math.PI / 2;
      }
    };
    for (let i = 0; i < 40; i++) pack();
    const game = S.game, gl = game.renderer.gl, q = (s, k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
    // manual stepping: the frame's own cost, including the 2D copy the recorder takes
    const stepped = async on => {
      saveSettings({ replay: on });
      game.loop.sleep();
      let t = performance.now(); const times = [];
      for (let i = 0; i < 80 + N; i++) {
        if (i % 30 === 0) pack();
        if (i % 45 === 0) playerFire();
        joyVec = { x: Math.cos(i / 90), y: Math.sin(i / 90), m: 0.6 };
        const t0 = performance.now(); t += 16.667;
        game.step(t, 16.667); if (gl) gl.finish();
        if (i >= 80) times.push(performance.now() - t0);
        if (i % 4 === 0) await new Promise(r => setTimeout(r, 12));   // real time passes, so the 30 fps copy and the encoder have work
      }
      game.loop.wake();
      const s = [...times].sort((a, b) => a - b);
      return { mean: times.reduce((a, b) => a + b, 0) / N, p50: q(s, 0.5), p95: q(s, 0.95), recording: RP.running };
    };
    // live rAF: the real loop, intervals between frames over 4 s
    const live = async on => {
      saveSettings({ replay: on });
      await new Promise(r => setTimeout(r, 600));
      const iv = []; let last = performance.now();
      await new Promise(res => { const end = last + 4000; const f = n => { iv.push(n - last); last = n; n < end ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
      const s = [...iv].sort((a, b) => a - b);
      return { mean: iv.reduce((a, b) => a + b, 0) / iv.length, p95: q(s, 0.95), frames: iv.length, recording: RP.running };
    };
    const out = { stepped: [], live: [] };
    for (const on of [false, true, false, true]) out.stepped.push({ on, ...(await stepped(on)) });
    for (const on of [false, true, false, true]) out.live.push({ on, ...(await live(on)) });
    saveSettings({ replay: true });
    return out;
  }, FRAMES);
  const avg = (rows, on, k) => { const r = rows.filter(x => x.on === on); return r.reduce((a, b) => a + b[k], 0) / r.length; };
  const f = x => +x.toFixed(2);
  const sOff = avg(res.stepped, false, "mean"), sOn = avg(res.stepped, true, "mean");
  const lOff = avg(res.live, false, "mean"), lOn = avg(res.live, true, "mean");
  console.log(JSON.stringify({ stepped: res.stepped.map(r => ({ on: r.on, mean: f(r.mean), p95: f(r.p95), rec: r.recording })), live: res.live.map(r => ({ on: r.on, mean: f(r.mean), p95: f(r.p95), frames: r.frames, rec: r.recording })) }));
  ok("perf: update+render per frame, recording on vs off (+10% allowed, 0.5 ms slack)", sOn <= sOff * 1.1 + 0.5, { off: f(sOff), on: f(sOn), pct: f((sOn / sOff - 1) * 100) });
  ok("perf: live frame interval, recording on vs off (+10% allowed)", lOn <= lOff * 1.1 + 0.3, { off: f(lOff), on: f(lOn), pct: f((lOn / lOff - 1) * 100) });
  await ctx.close();
}

ok("0 page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
process.exit(failed ? 1 : 0);
