// Wind, weather and the hour of day in headless Chrome: the wind dial (present, follows the wind, scales with the UI size, hidden in
// photo mode), tailwind vs headwind speed for the player and for an enemy, the storm's yaw and leeway (steady under the helm, never
// into a coast), the weather-effects switch (the sky goes, the wind stays), a daily sea's seeded sky, screenshots, 0 page errors.
// Usage: node tests/weather.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/weather";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(`${what}: ${JSON.stringify(detail)}`); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

async function open(browser, { viewport = { width: 1280, height: 720 }, dpr = 1, mobile = false, seed = {}, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
    localStorage.setItem("privateers-settings", JSON.stringify({ muted: true }));   // test pages are silent
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive(), null, { timeout: 15000 * SLOW });
  await page.evaluate(() => Snd.setMuted(true));
  return { ctx, page, errors };
}
async function sail(page, tutorialDone = true) {
  await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { polling: 50, timeout: 5000 * SLOW });
  await page.evaluate(td => { save.tutorialDone = td; tut.active = false; }, tutorialDone);
  await page.click("#sail");
  await sleep(400);
}
// Open water: park the player there with no enemy near.
const openWater = page => page.evaluate(() => {
  for (let a = 0; a < 80; a++) {
    const x = PORT.x + Math.cos(a) * 2300, y = PORT.y + Math.sin(a) * 2300;
    if (!islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 900)) { Object.assign(player, { x, y, speed: 0, rot: 0, maxHp: 1e9, hp: 1e9 }); break; }
  }
  for (const e of enemies) if (dist(e, player) < 1500) { e.x = player.x + 3000 * (player.x < W / 2 ? 1 : -1); e.y = player.y; }
  S.cameras.main.centerOn(player.x, player.y);
});
// A sky from a seed: find one whose first spell matches kind and hour, and set it.
const sky = (page, kind, hour) => page.evaluate(([kind, hour]) => {
  for (let s = 1; s < 5000; s++) { const w = weatherAt(s, 1); if (w.kind === kind && w.hour === hour && w.spell === 0) { Object.assign(wx, { seed: s, t: 1, easy: false }); return s; } }
  return 0;
}, [kind, hour]);

const browser = await chromium.launch({ channel: "chrome", headless: true });

// ---------- 1. the dial ----------
console.log("Wind dial");
{
  const { ctx, page, errors } = await open(browser);
  await sail(page); await openWater(page);
  const s1 = await sky(page, "clear", "day"); check(s1 > 0, "found a clear-day seed", s1);
  await sleep(500);
  const info = () => page.evaluate(() => {
    const d = document.getElementById("windDial"), r = d && d.getBoundingClientRect(), cs = d && getComputedStyle(d);
    return d ? { w: Math.round(r.width), h: Math.round(r.height), shown: cs.display !== "none", kn: d.querySelector(".wd-kn").textContent, fx: d.querySelector(".wd-fx").textContent,
      wx: d.querySelector(".wd-wx").textContent, aria: d.getAttribute("aria-label"), arrow: d.querySelector(".wd-arrow").getAttribute("transform"), cls: d.className, inHud: !!d.closest("#hud") } : null;
  });
  const a = await info();
  check(a && a.inHud && a.shown, "the dial is in the HUD and visible at sea", a);
  check(a && /^\d+ kn$/.test(a.kn) && /^[+−]?\d+%$/.test(a.fx) && a.wx === "Clear · Day", "it shows knots, the speed effect and the weather", a);
  check(a && a.aria && a.aria.includes("Wind"), "it has an accessible label", a && a.aria);
  await page.evaluate(() => { paused = true; });   // hold the sea, then move the clock by hand
  const seen = new Set([a.arrow]), strengths = [];
  for (const t of [20, 60, 140, 260]) {
    await page.evaluate(t => { wx.t = t; wxCompute(); wxDial(); }, t);
    seen.add((await info()).arrow); strengths.push(await page.evaluate(() => +wx.wind.strength.toFixed(3)));
  }
  check(seen.size >= 4, "the arrow turns as the wind changes with time", [...seen]);
  check(new Set(strengths).size >= 3, "the wind strength drifts too", strengths);

  // tail / head colour and signed text, for the player's heading
  await page.evaluate(() => {
    weatherAt = () => ({ kind: "clear", rain: 0, storm: 0, hour: "day", spell: 0 }); windAt = () => ({ dir: 0, strength: 1 });
    wx.t = 100; player.rot = 0; wxCompute(); wxDial();
  });
  const tail = await info();
  await page.evaluate(() => { player.rot = Math.PI; wxDial(); });
  const head = await info();
  check(tail.cls === "tail" && tail.fx === "+20%", "tailwind: green class and +20%", tail);
  check(head.cls === "head" && head.fx === "−25%", "headwind: red class and −25%", head);
  await page.screenshot({ path: `${out}/dial-desktop.png`, clip: { x: 0, y: 0, width: 420, height: 200 } });

  // UI size slider: the dial follows --ts
  const w100 = (await info()).w;
  await page.evaluate(() => { saveSettings({ uiPct: 200 }); applyUiScale(); wxDial(); });
  await sleep(100);
  const w200 = (await info()).w;
  check(w200 > w100 * 1.5, "the dial grows with the UI size slider", { w100, w200 });
  await page.evaluate(() => { saveSettings({ uiPct: 50 }); applyUiScale(); });
  await sleep(100);
  const w50 = (await info()).w;
  check(w50 < w100 * 0.8, "and shrinks with it", { w50, w100 });
  await page.evaluate(() => { saveSettings({ uiPct: 100 }); applyUiScale(); paused = false; });

  // photo mode hides it
  await page.keyboard.press("h"); await sleep(300);
  const inPhoto = await page.evaluate(() => ({ on: photoOn(), shown: getComputedStyle(document.getElementById("windDial")).display !== "none" && getComputedStyle(document.getElementById("hud")).display !== "none" }));
  check(inPhoto.on && !inPhoto.shown, "photo mode hides the dial", inPhoto);
  await page.keyboard.press("h"); await sleep(300);
  check(!(await page.evaluate(() => photoOn())), "photo mode closes again");
  check(errors.length === 0, "0 page errors (dial)", errors);
  await ctx.close();
}

// ---------- 1b. the dial on a phone ----------
console.log("Wind dial on a phone");
for (const [name, vp, ui] of [["390x844", { width: 390, height: 844 }, 100], ["390x844 at 250%", { width: 390, height: 844 }, 250], ["844x390", { width: 844, height: 390 }, 100]]) {
  const { ctx, page, errors } = await open(browser, { viewport: vp, dpr: 3, mobile: true, seed: { "privateers-settings": JSON.stringify({ uiPct: ui }) } });
  await sail(page); await openWater(page);
  await sky(page, "clear", "day"); await sleep(400);
  const r = await page.evaluate(() => {
    const d = document.getElementById("windDial").getBoundingClientRect(), m = document.getElementById("mini").getBoundingClientRect(), hp = document.querySelector(".bar.hp").getBoundingClientRect();
    return { l: Math.round(d.left), r: Math.round(d.right), t: Math.round(d.top), b: Math.round(d.bottom), w: Math.round(d.width), h: Math.round(d.height), vw: innerWidth, vh: innerHeight,
      overMini: d.left < m.right && d.right > m.left && d.top < m.bottom && d.bottom > m.top, overBar: d.top < hp.bottom && d.bottom > hp.top };
  });
  check(r.l >= 0 && r.r <= r.vw && r.b <= r.vh && !r.overMini && !r.overBar, `${name}: the dial is on screen and clear of the chart and bars`, r);
  check(r.h >= 36, `${name}: the dial is big enough to read (${r.h}px)`, r);
  await page.screenshot({ path: `${out}/dial-phone-${name.replace(/[^0-9a-z]/gi, "_")}.png` });
  check(errors.length === 0, `${name}: 0 page errors`, errors);
  await ctx.close();
}

// ---------- 2. tailwind, crosswind, headwind; storm yaw and leeway ----------
console.log("Sailing in the wind");
{
  const { ctx, page, errors } = await open(browser);
  await sail(page); await openWater(page);
  await page.evaluate(() => {
    paused = true; wx.easy = false;
    // a stretch of open water at least 500 px from any rock, so no island scrapes the hull during a test
    for (let x = 800; x < W - 800; x += 150) for (let y = 800; y < H - 800; y += 150) if (!window.__spot && !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r + 500) && Math.hypot(x - PORT.x, y - PORT.y) > 1200) window.__spot = { x, y };
  });
  const run = ([rel, strength]) => page.evaluate(([rel, strength]) => {
    wx.wind = { dir: rel, strength }; wx.w = { kind: "clear", rain: 0, storm: 0, hour: "day", spell: 0 };
    const mk = s => { Object.assign(s, { rot: 0, speed: s.maxSpeed, x: __spot.x, y: __spot.y }); const x0 = s.x, y0 = s.y; for (let i = 0; i < 60; i++) move(s, 1 / 60); return Math.hypot(s.x - x0, s.y - y0); };
    const e = enemies.find(e => e.alive && !e.fixed);
    return { p: mk(player), e: mk(e) };
  }, [rel, strength]);
  const tail = await run([0, 1]), beam = await run([Math.PI / 2, 1]), head = await run([Math.PI, 1]), calm = await run([0, 0.05]);
  check(tail.p > beam.p && beam.p > head.p, "player: before the wind is faster than across it, which is faster than into it", { tail: tail.p, beam: beam.p, head: head.p });
  check(Math.abs(tail.p / beam.p - 1.2) < 0.02 && Math.abs(head.p / beam.p - 0.75) < 0.02, "player: +20% before a full wind and −25% into it", { t: tail.p / beam.p, h: head.p / beam.p });
  check(Math.abs(tail.e / beam.e - 1.2) < 0.02 && Math.abs(head.e / beam.e - 0.75) < 0.02, "an enemy ship obeys the same rule", { t: tail.e / beam.e, h: head.e / beam.e });
  check(Math.abs(calm.p / beam.p - 1) < 0.1, "a dead calm barely changes anything", calm.p / beam.p);

  // storm: a ship left to itself broaches; held on course it stays steady; coasts are safe
  const yaw = await page.evaluate(() => {
    wx.w = { kind: "storm", rain: 1, storm: 1, hour: "day", spell: 0 }; wx.wind = { dir: 0, strength: 1 }; wx.sway = 0;
    const park = rot => { Object.assign(player, { rot, speed: 0, x: __spot.x, y: __spot.y }); wx.calm = false; };
    park(0.4); for (let i = 0; i < 120; i++) steer(player, null, 0, 1 / 60);
    const free = player.rot - 0.4;   // 2 s with the helm let go
    park(0.4); let worst = 0;
    for (let i = 0; i < 600; i++) { steer(player, 0.4, 0.6, 1 / 60); worst = Math.max(worst, Math.abs(angDiff(player.rot, 0.4))); }   // 10 s with a hand on the helm
    return { free, worst };
  });
  check(Math.abs(yaw.free) > 0.15, "storm: a ship with the helm let go is slewed off its heading", yaw);
  check(yaw.worst < 0.03, "storm: with the helm held the course stays steady", yaw);
  const lee = await page.evaluate(() => {
    wx.calm = false; Object.assign(player, { x: __spot.x, y: __spot.y, rot: 0, speed: 0 }); const x0 = player.x;
    for (let i = 0; i < 120; i++) move(player, 1 / 60);
    return player.x - x0;
  });
  check(lee > 40 && lee < 70, "storm: a ship at rest is pushed downwind (26 px/s)", lee);
  const coast = await page.evaluate(() => {   // the gale blows at an island, the ship drifts at it with no helm: the push must stop at the calm radius
    const isl = islands.find(i => i.x > 1500 && i.x < W - 1500 && i.y > 1500 && i.y < H - 1500 && Math.hypot(i.x - PORT.x, i.y - PORT.y) > 1200);
    Object.assign(player, { x: isl.x - isl.r - 400, y: isl.y, rot: 0, speed: 0 }); wx.wind = { dir: 0, strength: 1 };
    let minGap = 1e9, yawedInCalm = 0;
    for (let i = 0; i < 60 * 40; i++) {
      wxCalmCheck(); const r0 = player.rot; steer(player, null, 0, 1 / 60);
      if (wx.calm && Math.abs(player.rot - r0) > 1e-9) yawedInCalm++;
      move(player, 1 / 60); minGap = Math.min(minGap, Math.hypot(isl.x - player.x, isl.y - player.y) - isl.r);
    }
    return { minGap: Math.round(minGap), calm: wx.calm, yawedInCalm, wyaw: wxYaw(player), wlee: wxLee(player).x };
  });
  check(coast.minGap > 150 && coast.calm && coast.yawedInCalm === 0 && coast.wyaw === 0 && coast.wlee === 0, "storm: near a coast the push and the yaw switch off, so a ship is never driven onto the rocks", coast);
  const drift = await page.evaluate(() => { wx.on = true; wx.wind = { dir: Math.PI / 2, strength: 1 }; wx.w = { kind: "storm", rain: 1, storm: 1, hour: "day", spell: 0 }; return wxDrift().y; });
  check(drift > 30 && drift < 60, "storm: cannonballs are blown downwind a little", drift);
  await page.evaluate(() => { wx.w = { kind: "clear", rain: 0, storm: 0, hour: "day", spell: 0 }; wx.calm = false; });
  check((await page.evaluate(() => wxDrift().y)) === 0 && (await page.evaluate(() => wxYaw(player))) === 0, "fair weather: no yaw, no drift");
  check(errors.length === 0, "0 page errors (sailing)", errors);
  await ctx.close();
}

// ---------- 3. the sky, the switch, screenshots ----------
console.log("Sky and the weather-effects switch");
{
  const { ctx, page, errors } = await open(browser);
  await sail(page); await openWater(page);
  const state = () => page.evaluate(() => ({ tint: wxTintHour.visible, tintWx: wxTintWx.visible, drops: wxDrops.filter(d => d.img.visible).length, kind: wx.w.kind, hour: wx.w.hour,
    ta: +wxTintHour.alpha.toFixed(2), wind: +wx.wind.strength.toFixed(2) }));
  for (const [kind, hour] of [["clear", "day"], ["rain", "dusk"], ["storm", "night"], ["clear", "night"]]) {
    const seed = await sky(page, kind, hour);
    check(seed > 0, `found a ${kind} / ${hour} seed`, seed);
    await sleep(900);
    const s = await state();
    check(s.kind === kind && s.hour === hour, `${kind} / ${hour}: the sky is what the seed says`, s);
    if (hour === "day") check(!s.tint, "daylight: no hour tint", s); else check(s.tint && s.ta > 0.2, `${hour}: a tint is drawn`, s);
    if (kind === "clear") check(s.drops === 0 && !s.tintWx, "clear: no rain, no weather tint", s); else check(s.drops > 30 && s.tintWx, `${kind}: rain falls and the sky greys`, s);
    if (kind === "storm") check(s.drops >= (await page.evaluate(() => WX_DROPS)) * 0.9, "storm: the rain is at full count", s);
    if (kind === "storm") await page.evaluate(() => { wx.bolt = 0.03; });
    await page.screenshot({ path: `${out}/${kind}-${hour}.png` });
  }
  // readability: the tint sits under ships, balls and aim lines
  const depths = await page.evaluate(() => ({ tint: wxTintHour.depth, wxT: wxTintWx.depth, aim: S.arcG.depth, ship: player.spr.depth, enemy: enemies[0].spr.depth }));
  check(depths.tint < depths.aim && depths.wxT < depths.aim && depths.wxT < depths.enemy && depths.tint < depths.ship, "the tint is drawn under ships, balls and aim lines, so night and storm never dim what you read", depths);

  // a fight in a night storm, for the screenshot: an enemy on the beam with the aim lines up
  await sky(page, "storm", "night");
  await page.evaluate(() => {
    paused = false; const e = enemies.find(e => e.alive && !e.fixed); Object.assign(e, { x: player.x + 240, y: player.y - 30, rot: Math.PI }); player.rot = 0; wx.bolt = -1;
  });
  await sleep(500);
  await page.screenshot({ path: `${out}/fight-storm-night.png` });

  // the switch: off removes the sky and the sounds, not the wind
  await sky(page, "storm", "night"); await sleep(500);
  const feel = () => page.evaluate(() => { wx.calm = false; return { mul: wxMul({ rot: 0 }), yaw: wxYaw({ rot: 0.4 }), lee: wxLee({ x: 0 }).x }; });
  await page.evaluate(() => { paused = true; });   // hold the clock so the two readings are of the same wind
  const before = await feel();
  await page.evaluate(() => document.querySelector('[data-set="weatherfx"][data-v="off"]').click());
  await sleep(500);
  const off = await state();
  const pressed = await page.evaluate(() => [...document.querySelectorAll('[data-set="weatherfx"]')].map(b => b.dataset.v + ":" + b.getAttribute("aria-pressed")).join(","));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("privateers-settings")).weatherFx);
  check(!off.tint && off.drops === 0, "effects off: no tint, no rain", off);
  check(stored === false && pressed.includes("off:true") && pressed.includes("on:false"), "the switch is remembered and shows its state", { stored, pressed });
  const after = await feel();
  await page.evaluate(() => { paused = false; });
  check(JSON.stringify(before) === JSON.stringify(after) && after.yaw !== 0 && after.lee > 0, "effects off: the wind and the storm's push still act (the same for everyone)", { before, after });
  check((await page.evaluate(() => document.getElementById("windDial").hidden)) === false, "effects off: the wind dial stays");
  await page.screenshot({ path: `${out}/storm-night-fx-off.png` });
  await page.evaluate(() => document.querySelector('[data-set="weatherfx"][data-v="on"]').click());
  await sleep(500);
  check((await state()).drops > 30, "effects back on: the rain returns");

  // docking turns it all off
  await page.evaluate(() => dock("test"));
  await sleep(300);
  const d = await page.evaluate(() => ({ dial: document.getElementById("windDial").hidden, tint: wxTintHour.visible, drops: wxDrops.filter(x => x.img.visible).length, on: wx.on }));
  check(d.dial && !d.tint && d.drops === 0 && !d.on, "in harbor: no wind, no sky", d);
  check(errors.length === 0, "0 page errors (sky)", errors);
  await ctx.close();
}


// ---------- 3b. swell and roll ----------
console.log("Swell and roll");
{
  const probe = (page, frames = 90) => page.evaluate(async frames => {   // the largest roll and heave of the player and the first enemy over some frames
    const e = enemies.find(e => e.alive && !e.fixed), out = { rollP: 0, rollE: 0, heaveP: 0, heaveE: 0 };
    for (let i = 0; i < frames; i++) {
      await new Promise(r => requestAnimationFrame(r));
      out.rollP = Math.max(out.rollP, Math.abs(angDiff(player.spr.rotation, player.rot))); out.rollE = Math.max(out.rollE, Math.abs(angDiff(e.spr.rotation, e.rot)));
      out.heaveP = Math.max(out.heaveP, Math.abs(player.spr.scaleX / player.artScale - 1)); out.heaveE = Math.max(out.heaveE, Math.abs(e.spr.scaleX / e.artScale - 1));
    }
    return out;
  }, frames);
  const waves = page => page.evaluate(() => ({ n: wxWaves.filter(w => w.img.visible).length, max: Math.max(0, ...wxWaves.filter(w => w.img.visible).map(w => w.img.alpha)), depth: wxWaves[0].img.depth, ship: player.spr.depth, aim: S.arcG.depth }));
  const { ctx, page, errors } = await open(browser);
  await sail(page); await openWater(page);
  await page.evaluate(() => { for (const e of enemies) if (e.alive && !e.fixed) { e.x = player.x + 400; e.y = player.y - 100; break; } });
  await sky(page, "clear", "day"); await sleep(600);
  const clearR = await probe(page), clearW = await waves(page);
  check(clearR.rollP < 0.002 && clearR.rollE < 0.002 && clearR.heaveP < 0.002, "clear: ships do not roll", clearR);
  check(clearW.n === 0, "clear: no swell bands", clearW);
  await sky(page, "rain", "day"); await sleep(900);
  const rainW = await waves(page), rainR = await probe(page);
  check(rainW.n >= 1 && rainW.n <= 4 && rainR.rollP > 0 && rainR.rollP < 0.03, "rain: a light swell and a slight roll", { rainW, rainR });
  await sky(page, "storm", "day"); await page.evaluate(() => { wx.t = 3; }); await sleep(2500);
  const stormR = await probe(page, 360), stormW = await waves(page);
  check(stormR.rollP > 0.03 && stormR.rollE > 0.03 && stormR.heaveP > 0.01 && stormR.heaveE > 0.01, "storm: the player and an AI ship both roll and heave", stormR);
  check(stormR.rollP < 0.12 && stormR.heaveP < 0.06, "storm: the roll stays modest (under 7 degrees, 6% heave)", stormR);
  check(stormW.n >= 10 && stormW.max > 0.5, "storm: a crowd of swell bands, clearly visible", stormW);
  check(stormW.depth < stormW.ship && stormW.depth < stormW.aim, "swell is drawn under ships, balls and aim lines", stormW);
  await page.screenshot({ path: `${out}/wave-storm-day.png` });
  // hits and muzzles belong to the hull, not the picture: identical with the roll on or off
  const hit = () => page.evaluate(() => {
    paused = true; const e = enemies.find(e => e.alive && !e.fixed), c = Math.cos(e.rot), sn = Math.sin(e.rot);
    const pts = [[0, 0], [e.hl * 0.9, 0], [e.hl + 25, 0], [0, e.hw + 14], [0, 0.6 * e.hw]].map(([a, b]) => hitShip(e, e.x + c * a - sn * b, e.y + sn * a + c * b));
    const m = MOUNTS.map(mt => { const g = player.guns[mt.key][0]; return g ? Object.values(muzzle(player, mt, g.pi, g.pn)).map(v => +v.toFixed(6)) : null; });
    return { pts, m, body: [player.x, player.y, player.rot, player.hl, player.hw].join(), eBody: [e.x, e.y, e.rot, e.hl, e.hw].join() };
  });
  await page.evaluate(() => { paused = true; }); await sleep(200);
  const hitOn = await hit();
  await page.evaluate(() => document.querySelector('[data-set="weatherfx"][data-v="off"]').click()); await sleep(300);
  const hitOff = await hit(), offR = await page.evaluate(() => { const e = enemies.find(e => e.alive && !e.fixed); return { p: Math.abs(angDiff(player.spr.rotation, player.rot)), k: player.spr.scaleX / player.artScale, e: Math.abs(angDiff(e.spr.rotation, e.rot)) }; });
  check(JSON.stringify(hitOn) === JSON.stringify(hitOff) && hitOn.pts[0] && hitOn.pts[4] && !hitOn.pts[2] && !hitOn.pts[3], "hit tests, muzzles and hit capsules are the same with the roll on and off", { hitOn, hitOff });
  check(offR.p < 1e-9 && Math.abs(offR.k - 1) < 1e-9 && offR.e < 1e-9, "effects off: hulls sit level again", offR);
  await page.evaluate(() => { paused = false; }); await sleep(800);
  const offProbe = await probe(page, 60), offW = await waves(page);
  check(offProbe.rollP < 1e-6 && offProbe.rollE < 1e-6 && offProbe.heaveP < 1e-6, "effects off: no roll while sailing in a storm", offProbe);
  check(offW.n === 0, "effects off: no swell bands", offW);
  await page.evaluate(() => document.querySelector('[data-set="weatherfx"][data-v="on"]').click());
  await sky(page, "storm", "night"); await page.evaluate(() => { wx.t = 3; }); await sleep(2500);
  await page.screenshot({ path: `${out}/wave-storm-night.png` });
  check(errors.length === 0, "0 page errors (swell and roll)", errors);
  await ctx.close();

  const q = await open(browser, { reduced: true });
  await sail(q.page); await openWater(q.page);
  await q.page.evaluate(() => { for (const e of enemies) if (e.alive && !e.fixed) { e.x = player.x + 400; e.y = player.y - 100; break; } });
  await sky(q.page, "storm", "day"); await q.page.evaluate(() => { wx.t = 3; }); await sleep(2500);
  const quiet = await probe(q.page, 360);
  check(quiet.rollP > 0.003 && quiet.rollP < stormR.rollP * 0.5 && quiet.heaveP < stormR.heaveP * 0.5, "reduced motion: the roll is much smaller", { quiet, stormR });
  check(q.errors.length === 0, "0 page errors (reduced motion)", q.errors);
  await q.ctx.close();
}

// ---------- 4. the first voyage, the daily sea, ordinary sorties ----------
console.log("First voyage, daily sea, sorties");
{
  const { ctx, page } = await open(browser);
  await sail(page, false);
  const first = await page.evaluate(() => ({ easy: wx.easy, kind: wx.w.kind, hour: wx.w.hour }));
  check(first.easy && first.kind === "clear" && first.hour === "day", "the first voyage is a fair day", first);
  await ctx.close();
}
{
  const read = async () => {
    const { ctx, page, errors } = await open(browser);
    await page.waitForFunction(() => typeof startRun === "function");
    await page.evaluate(() => { if (titleOpen) closeTitle(); startRun("daily"); });
    await sleep(500);
    const r = await page.evaluate(() => ({
      seed: wx.seed, runSeed: run.seed, daily: dailySeed(dailyNumber()), easy: wx.easy,
      sky: JSON.stringify([0, 13, 61, 130, 240].map(t => ({ w: weatherAt(wx.seed, t), v: windAt(wx.seed, t) }))),
    }));
    await page.evaluate(() => { run.t = 100; });
    await sleep(300);
    const clock = await page.evaluate(() => ({ t: Math.round(wx.t), runT: Math.round(run.t), same: JSON.stringify(wx.w) === JSON.stringify(weatherAt(wx.seed, wx.t)) }));
    check(errors.length === 0, "0 page errors (daily)", errors);
    await ctx.close();
    return { ...r, clock };
  };
  const A = await read(), B = await read();
  check(A.seed === A.daily && A.seed === A.runSeed && !A.easy, "a daily sea uses the day's seed", A);
  check(A.sky === B.sky && A.seed === B.seed, "two players on the same day get the same weather and wind", { a: A.sky.slice(0, 100), b: B.sky.slice(0, 100) });
  check(A.clock.t === A.clock.runT && A.clock.t >= 100 && A.clock.same, "the weather follows the daily run's clock", A.clock);
}
{
  const { ctx, page, errors } = await open(browser);
  await sail(page);
  const s1 = await page.evaluate(() => wx.seed);
  await page.evaluate(() => dock("x")); await page.waitForFunction(() => docked, null, { timeout: 5000 * SLOW });
  await page.click("#sail"); await sleep(300);
  const s2 = await page.evaluate(() => wx.seed);
  check(s1 > 0 && s2 > 0 && s1 !== s2, "each ordinary sortie draws a fresh seed", [s1, s2]);
  check(errors.length === 0, "0 page errors (sorties)", errors);
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nAll weather checks passed.");
process.exit(fails.length ? 1 : 0);
