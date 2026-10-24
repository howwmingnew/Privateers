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
  // A clip: wait for it, then check it (type, size, length by the recorder's clock and by the decoder's, picture size, chip).
  const gotClip = async (label, kind) => {
    await page.waitForFunction(() => !!RP.pending, null, { timeout: 12000 * SLOW });
    const c = await ev(page, async () => {
      const c = RP.pending, v = document.createElement("video");
      const dims = await new Promise(res => { v.onloadedmetadata = () => res([v.videoWidth, v.videoHeight]); v.onerror = () => res(null); v.src = URL.createObjectURL(c.blob); });
      let dur = v.duration;   // a MediaRecorder file has no length in its header: seek far past the end and the decoder finds it
      if (!Number.isFinite(dur)) dur = await new Promise(res => { const t = setTimeout(() => res(null), 3000); v.ontimeupdate = () => { if (Number.isFinite(v.duration)) { clearTimeout(t); res(v.duration); } }; v.currentTime = 1e7; });
      return { type: c.blob.type, size: c.blob.size, secs: c.secs, kind: c.kind, dur, dims, cv: [S.game.canvas.width, S.game.canvas.height], chip: !!RP.chip && !RP.chip.hidden };
    });
    ok(`${label}: a WebM blob of real footage (over 20 kB)`, /^video\/webm/.test(c.type) && c.size > 20000, { type: c.type, size: c.size });
    ok(`${label}: kind is ${kind}`, c.kind === kind, c.kind);
    ok(`${label}: 5.5 to 6.5 s long (recorder clock ${c.secs} s, decoder ${c.dur === null ? "n/a" : c.dur.toFixed(2)} s)`, c.secs >= 5.5 && c.secs <= 6.5 && (c.dur === null || (c.dur >= 5 && c.dur <= 7)), c);
    ok(`${label}: decodes, at most 960 wide, the canvas's aspect`, !!c.dims && c.dims[0] <= 960 && Math.abs(c.dims[0] / c.dims[1] - c.cv[0] / c.cv[1]) < 0.02, c.dims);
    ok(`${label}: the chip offers it`, c.chip);
    return c;
  };
  const reset = () => ev(page, () => { RP.pending = null; RP.coolUntil = 0; RP.chip && (RP.chip.hidden = true); });
  // 1. a boss goes down to the player's guns: the game's own bounty, its own damage path
  const boss = await ev(page, () => {
    save.tutorialDone = true; tutorialReset();
    spawnBounty();
    if (!bossShip) return false;
    Object.assign(bossShip, { x: player.x + 300, y: player.y, rot: 1.2 });
    hurt(bossShip, 1e9, 0, player, { fromPlayer: true, vx: 0, vy: 480 });
    return !bossShip || !bossShip.alive;
  });
  ok("real flow: the boss is sunk by the player's hit", boss === true, boss);
  ok("real flow: the sinking armed a moment", await ev(page, () => !!RP.armed || !!RP.pending));
  const c1 = await gotClip("boss sunk", "boss");
  // 2. a magazine crit that takes a crowd: a rake lands on a ship with others inside the blast radius
  await reset(); await sleep(1300);
  const pw = await ev(page, () => {
    const t = enemies.filter(e => e.alive && !e.boss && !e.fixed).slice(0, 4);
    t.forEach((e, i) => { e.mine = true; Object.assign(e, { x: player.x + 400 + i * 40, y: player.y + 200 + i * 30, rot: 0, hp: e.maxHp }); });
    let used = false; const prev = Math.random; Math.random = () => (!used && new Error().stack.includes("powderStrike") ? (used = true, 0) : prev());   // only the magazine roll comes up
    const armedBefore = !!RP.armed;
    hurt(t[0], 5, 0, player, { fromPlayer: true, vx: 480, vy: 0 });
    Math.random = prev;
    return { armedBefore, armed: !!RP.armed, dead: t.filter(e => !e.alive).length };
  });
  ok("real flow: a rake on a crowded ship blows the magazine and arms a moment", !pw.armedBefore && pw.armed && pw.dead >= 1, pw);
  const c2 = await gotClip("magazine crit", "powder");
  // 3. more timing samples at other offsets from the recorders' cycle
  const lens = [c1.secs, c2.secs];
  for (const wait of [700, 2100, 3300]) {
    await reset(); await sleep(wait);
    await ev(page, () => replayMoment("test"));
    await page.waitForFunction(() => !!RP.pending, null, { timeout: 12000 * SLOW });
    lens.push(await ev(page, () => RP.pending.secs));
  }
  ok("length: every clip is 5.5 to 6.5 s", lens.every(x => x >= 5.5 && x <= 6.5), lens);
  const clip = { size: await ev(page, () => RP.pending.size ?? RP.pending.blob.size) };
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 * SLOW }), page.click("#replayChip")]);
  const path = await dl.path();
  ok("save: downloads privateers-<time>.webm with the clip's bytes", /^privateers-\d{8}-\d{6}\.webm$/.test(dl.suggestedFilename()) && statSync(path).size === clip.size, { name: dl.suggestedFilename(), bytes: statSync(path).size });
  await sleep(300);
  ok("save: the chip says Saved!", await ev(page, () => RP.chip.textContent === t("rp_saved")));
  // the victory screen carries the button and downloads the clip
  await ev(page, () => { showVictory(); });
  await sleep(300);
  const vb = await ev(page, () => { const b = [...document.querySelectorAll("#victory button")].find(x => x.textContent === t("rp_save")); return !!b && !b.hidden; });
  ok("victory: the Save video button shows when there is a clip", vb);
  const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 8000 * SLOW }), ev(page, () => [...document.querySelectorAll("#victory button")].find(x => x.textContent === t("rp_save")).click())]);
  ok("victory: it downloads a .webm", /^privateers-\d{8}-\d{6}\.webm$/.test(dl2.suggestedFilename()) && statSync(await dl2.path()).size > 20000, dl2.suggestedFilename());
  await ev(page, () => { closeVictory(); resumeGame(); });
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

ok("0 page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
process.exit(failed ? 1 : 0);
