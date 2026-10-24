// Navy heat and the Admiral's fleet in headless Chrome (js/heat.js): heat rises with Navy sinkings only, pays more per star,
// the third star brings hunting fleets that hold formation and grow with the stars, heat cools by itself and any harbor
// clears it (hunters give up), the Admiral's fleet patrols only after the fourth bounty, the daily sea and a first voyage
// switch it all off, the HUD scales with the UI size slider, and no page errors. Saves pictures to <outDir>
// (default .review/heat, not committed).
// Usage: node tests/heat.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/heat";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const SAVE = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 2 } });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
const ready = async () => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
};
await page.goto(url, { waitUntil: "load" }); await ready();
await page.evaluate(s => { localStorage.clear(); localStorage.setItem("privateers-lang", "en"); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); }, SAVE);
await page.reload({ waitUntil: "load" }); await ready();
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { await page.screenshot({ path: join(out, name + ".png") }); };

// Test rig, in the page (the same as tests/fleet.mjs): fixed-step frames, open water at a ring, player parked and unkillable.
await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.openAt = (ring, near = 420, skip = 0) => {
    for (let a = 0, n = 0; a < 200; a++) { const p = polarPt(a * 0.37, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near) && !inSafe(p) && n++ >= skip) return p; }
    return polarPt(0, ringMid(ring));
  };
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; spawnT = 1e9; };
  window.park = p => { Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 }); player.spr.setPosition(p.x, p.y); };
  window.depart = () => { spawnT = 0; document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  window.navy = (dx = 600, dy = 0, L = 4) => { const e = makeEnemy(S, player.x + dx, player.y + dy, L, "navy", "brig"); e.angry = 1e6; return e; };
  window.sunkBy = e => { sink(e, player); return e; };
  window.hudState = () => { const el = document.getElementById("heatInd"); return { hidden: el.hidden, on: el.querySelectorAll(".stars i.on").length, txt: document.getElementById("heatTxt").textContent, aria: el.getAttribute("aria-label") }; };
  window.setL = l => { lang = l; applyLang(); };
  window.fresh = ring => { depart(); park(openAt(ring, 600)); clearSea(); heatReset(); stepN(2); };
  depart();
});

console.log("Heat rises with Navy sinkings only");
const r1 = await ev(() => {
  fresh(5);
  const cold = { ...hudState(), heat };
  const pirate = makeEnemy(S, player.x + 500, player.y, 4, "pirate", "brig"); sunkBy(pirate);
  const merch = makeEnemy(S, player.x - 500, player.y, 4, "merchant", "fluyt"); sunkBy(merch);
  const afterOthers = heat;
  const n1 = navy(); const g0 = save.gold, expect = Math.round(Math.round(n1.loot * BOUNTY_K) * 1); sunkBy(n1);
  const one = { heat, stars: heatStars(heat), paid: save.gold - g0, expect, hud: hudState() };
  const two = (sunkBy(navy(600, 100)), sunkBy(navy(-600, 100)), { heat, stars: heatStars(heat), hud: hudState() });
  return { cold, afterOthers, one, two };
});
check(r1.cold.hidden && r1.cold.heat === 0, "a cold captain sees no heat on the HUD");
check(r1.afterOthers === 0, "sinking pirates and merchants adds no heat");
check(r1.one.heat === 14 && r1.one.stars === 0 && !r1.one.hud.hidden && r1.one.hud.on === 0, `one Navy ship: heat ${r1.one.heat}, no star yet, HUD shows the gauge`);
check(r1.one.paid === r1.one.expect && r1.one.expect > 0, `with no star the bounty is the plain ${r1.one.expect} gold (paid ${r1.one.paid})`);
check(r1.two.stars === 2 && r1.two.hud.on === 2 && r1.two.hud.txt === "x1.4", `three Navy ships: heat ${r1.two.heat}, two stars lit, bounty ${r1.two.hud.txt}`);
check(/2 of 5 stars/.test(r1.two.hud.aria), `the HUD reads out the heat (${r1.two.hud.aria})`);
await shot("hud-2-stars");

console.log("Stars pay warship bounties more, up to double");
const r2 = await ev(() => {
  fresh(5);
  const pay = stars => {
    heat = stars * HEAT_STAR_SIZE; heatQuiet = 0;
    const e = navy(); const g0 = save.gold, base = Math.round(e.loot * BOUNTY_K);
    sink(e, player); heat = stars * HEAT_STAR_SIZE;   // the sinking itself adds heat; the pay was set at the old level
    return { base, paid: save.gold - g0 };
  };
  return [0, 1, 3, 5].map(pay);
});
check(r2.every((r, i) => r.paid === Math.round(r.base * [1, 1.2, 1.6, 2][i])), `bounty x1 / 1.2 / 1.6 / 2.0 at 0 / 1 / 3 / 5 stars (${r2.map(r => r.paid + "/" + r.base)})`);

console.log("Hunters: from two stars, in formation, stronger with the stars");
const hunt = {};
for (const stars of [1, 2, 5]) {
  hunt[stars] = await ev(stars => {
    fresh(6); heat = stars * HEAT_STAR_SIZE; heatQuiet = 0; heatPaint();
    if (stars >= 2) huntT = HEAT_HUNT_FIRST;
    let t0 = 0; while (huntFleets().length === 0 && t0 < 30) { stepN(30); t0 += 0.5; }
    const fs = huntFleets();
    const f = fs[0];
    const info = { n: fs.length, secs: t0 };
    if (f) {
      const slots = formationSlots(f.formation, wingmen(f).length);
      Object.assign(info, { type: f.type, size: f.ships.length, wing: wingmen(f).length, allHunters: f.ships.every(s => s.hunter && s.faction === "navy"),
        dist: Math.round(dist(f.lead, player)), slotErr: Math.max(...wingmen(f).map((m, i) => { const q = slotWorld(f.lead, slots[i]); return Math.hypot(q.x - m.x, q.y - m.y); })),
        lvAbove: f.lead.L - levelAt(ringEdge(f.lead.ring) + 1), targeting: f.ships.some(s => s.target === player) });
    }
    return info;
  }, stars);
}
check(hunt[1].n === 0, "one star only pays more: no hunters in 30 s");
check(hunt[2].n === 1 && hunt[2].type === "patrol" && hunt[2].secs <= 12, `two stars: a Navy patrol comes within ${hunt[2].secs} s`);
check(hunt[2].dist >= 700 && hunt[2].dist <= 1400, `...over the horizon, ${hunt[2].dist} px away`);
check(hunt[2].allHunters && hunt[2].wing >= 1 && hunt[2].wing <= 1, `...of ${hunt[2].size} Navy ships (stars - 1 wingmen), all marked as hunters`);
check(hunt[2].slotErr < 260, `...in formation (wingmen ${Math.round(hunt[2].slotErr)} px from their slots)`);
check(hunt[2].lvAbove === 0 && hunt[5].lvAbove === 2, `...level +${hunt[2].lvAbove} at two stars, +${hunt[5].lvAbove} at five`);
check(hunt[5].wing > hunt[2].wing && hunt[5].wing <= 4, `five stars: a bigger fleet (${hunt[5].size} ships vs ${hunt[2].size})`);
check(hunt[2].targeting || hunt[5].targeting, "the hunters turn on the player");

console.log("Hunters keep coming, but only up to the cap");
const r3b = await ev(() => {
  fresh(6); let peak = 0, total = 0, seen = new Set();
  for (let i = 0; i < 200; i++) { heat = 100; heatQuiet = 0; stepN(60); const fs = huntFleets(); fs.forEach(f => seen.add(f)); peak = Math.max(peak, fs.length); }
  return { peak, spawned: seen.size, hunters: hunters().length };
});
check(r3b.peak <= 2 && r3b.spawned >= 2, `at five stars up to ${r3b.peak} fleets at once, ${r3b.spawned} met in 200 s (none sunk)`);
await ev(() => { fresh(6); heat = 100; heatQuiet = 0; huntT = 0; stepN(20 * 60); const fs = huntFleets(); fs.forEach(f => f.ships.forEach(s => { s.angry = 1e6; })); player.rot = 0; });
await shot("hunters-5-stars");

console.log("Escape: cooling, giving up, harbor");
const r4 = await ev(() => {
  fresh(6); heat = 60; heatQuiet = 0; stepN(10 * 60);
  const held = heat;   // 10 s of peace is inside the calm period
  heat = 100; heatQuiet = 0; huntT = 0; stepN(15 * 60);
  const hot = huntFleets().length, heat1 = heat;
  heat = 100; heatQuiet = HEAT_CALM_S; const t0 = heat;
  stepN(30 * 60);   // 30 s of drain at 1.5/s
  const cooled = t0 - heat;
  const still = { hunters: hunters().length };
  stepN(40 * 60);   // the rest
  return { held, hot, heat1, cooled, still, end: heat, hunters: hunters().length, hud: hudState(), hunting: huntFleets().length };
});
check(r4.held === 60, `no cooling in the first 15 quiet seconds (heat ${r4.held})`);
check(r4.hot >= 1, `a wanted captain is hunted (${r4.hot} fleet)`);
check(Math.abs(r4.cooled - 45) < 3, `after the calm period heat falls 1.5 a second (${r4.cooled.toFixed(1)} in 30 s)`);
check(r4.end === 0 && r4.hud.hidden, "left alone, heat falls to nothing and the HUD gauge hides");
check(r4.hunters === 0 && r4.hunting === 0, "...and the hunters have given up the chase");
const r5 = await ev(() => {
  fresh(6); heat = 100; heatQuiet = 0; huntT = 0; stepN(14 * 60);
  const before = { heat, hunters: hunters().length };
  dock("return");
  const after = { heat, hunters: hunters().length, hud: hudState() };
  depart();
  return { before, after };
});
check(r5.before.heat === 100 && r5.before.hunters >= 2, `at five stars with ${r5.before.hunters} hunters on the wake...`);
check(r5.after.heat === 0 && r5.after.hunters === 0 && r5.after.hud.hidden, "...docking clears the heat at once and the hunters give up");
const r5b = await ev(() => { fresh(6); heat = 50; dock("outpost"); const h = heat; depart(); return h; });
check(r5b === 0, "the Hulk Outpost clears heat too");

console.log("The Admiral's fleet");
const adm = await ev(() => {
  const res = {};
  fresh(5); save.campaign = { ...save.campaign, bounty: 3 };
  admT = 0; stepN(60 * 40); res.early = fleetsLive().filter(f => f.admiral).length;
  clearSea(); save.campaign = { ...save.campaign, bounty: 4 };
  fresh(2); save.campaign = { ...save.campaign, bounty: 4 };
  admT = 0; stepN(60 * 40); res.shallow = fleetsLive().filter(f => f.admiral).length;
  fresh(5); save.campaign = { ...save.campaign, bounty: 4 };
  admT = 0; stepN(30);
  const fs = fleetsLive().filter(f => f.admiral), f = fs[0];
  res.n = fs.length;
  if (f) {
    const slots = formationSlots(f.formation, wingmen(f).length), plain = makeEnemy(S, 0, 0, f.lead.L, "navy", "manowar");
    res.info = { type: f.type, size: f.ships.length, formation: f.formation, arch: f.lead.arch, boss: !!f.lead.boss, navy: f.ships.every(s => s.faction === "navy"),
      lvAbove: f.lead.L - levelAt(ringEdge(f.lead.ring) + 1), hull: f.lead.maxHp / plain.maxHp, lootX: f.lead.loot / plain.loot, wingFire: wingmen(f).every(m => m.fireMul === 0.8),
      slotErr: Math.max(...wingmen(f).map((m, i) => { const q = slotWorld(f.lead, slots[i]); return Math.hypot(q.x - m.x, q.y - m.y); })),
      far: Math.round(dist(f.lead, player)), hunter: f.lead.hunter === true };
    plain.alive = false; plain.spr.destroy(); plain.badge?.destroy(); enemies.splice(enemies.indexOf(plain), 1);
    admT = 0; stepN(60 * 30); res.again = fleetsLive().filter(x => x.admiral).length;   // never two at once
    res.live = f.lead.alive; res.later = f.ships.filter(s => s.alive).length;
    // he is announced when he comes within sight, and a wanted captain meets him sooner
    f.lead.x = player.x + 900; f.lead.y = player.y; f.lead.spr.setPosition(f.lead.x, f.lead.y); stepN(10); res.warned = f.warned === true;
    window.admFleet = f;
  }
  return res;
});
check(adm.early === 0, "after only three bounties no Admiral patrols");
check(adm.shallow === 0, "the shallows are never visited, even after four bounties");
check(adm.n === 1 && adm.info && adm.info.type === "admiral", "after the fourth bounty the Admiral's fleet appears in the deep");
const ai = adm.info || {};
check(ai.arch === "manowar" && ai.size >= 3 && ai.navy && !ai.boss, `a man-of-war flagship leads ${ai.size - 1} Navy ships (a fleet, not a bounty captain)`);
check(ai.formation === "wedge" && ai.slotErr < 260, `...in a wedge (wingmen ${Math.round(ai.slotErr)} px from their slots)`);
check(ai.lvAbove === 1 && ai.hull > 1.2 && ai.lootX > 2.2 && ai.wingFire, `...flagship +${ai.lvAbove} level, hull x${(ai.hull || 0).toFixed(2)}, plunder x${(ai.lootX || 0).toFixed(2)}, wingmen at 80% fire ${JSON.stringify(ai)}`);
check(ai.far >= 1100 && !ai.hunter, `...out of sight (${ai.far} px) and on his own patrol, not hunting`);
check(adm.later === ai.size && adm.live, `...and he stays: still ${adm.later} ships after 30 s more (the sea's population control leaves him alone)`);
check(adm.again === 1, "only one Admiral's fleet at sea at a time");
check(adm.warned, "his sighting is announced with a toast");
await ev(() => { const f = window.admFleet; park({ x: f.lead.x - 520, y: f.lead.y }); player.rot = 0; heat = 0; stepN(60); });
await shot("admiral");
const r6 = await ev(() => {
  const f = window.admFleet; heat = 0; heatQuiet = 0; const h0 = heat; sink(f.lead, player);
  return { h0, heat, lost: f.lost, charging: wingmen(f).some(w => w.rageT > S.time.now / 1000) };
});
check(r6.heat === 30, `sinking the flagship adds ${r6.heat} heat, and his escort charges: ${r6.charging}`);
await shot("admiral-sunk");

console.log("Off in a daily or seed run, and on a first voyage");
const r7 = await ev(() => {
  fresh(5);
  const res = {};
  const saved = run; run = { kind: "daily", over: false, bounty: null, seed: 1, n: 1, t: 0 };
  heatAdd(60); res.daily = { heat, mul: heatMulNow(), hud: hudState().hidden };
  const e = navy(); const g0 = save.gold; sink(e, player); res.dailyPay = (save.gold - g0) === 0;   // the daily sea pays no gold at all (portsOff, js/ports.js), so heat has no bonus to add
  run = saved;
  fresh(5); save.tutorialDone = false;
  heatAdd(60); res.first = heat; save.tutorialDone = true;
  fresh(5); heatAdd(60); res.live = heat;
  return res;
});
check(r7.daily.heat === 0 && r7.daily.mul === 1 && r7.daily.hud && r7.dailyPay, "a daily run: no heat, no bonus, no HUD, no gold in the daily sea");
check(r7.first === 0, "before the tutorial is done a Navy kill makes no heat");
check(r7.live === 60, "...and back to normal outside a run");

console.log("HUD scales with the UI size slider");
const hud = {};
for (const [name, pct, vw, vh] of [["ts100", 100, 1280, 720], ["ts250", 250, 1280, 720], ["phone", 100, 390, 740], ["phone-ts200", 200, 390, 740]]) {
  await page.setViewportSize({ width: vw, height: vh });
  hud[name] = await ev(pct => {
    saveSettings({ uiPct: pct }); applyUiScale(); applyMiniSize?.();
    fresh(5); heat = 100; heatQuiet = 0; stepN(3);
    const el = document.getElementById("heatInd"), r = el.getBoundingClientRect(), side = document.querySelector("#hud .side").getBoundingClientRect(), bars = document.querySelector("#hud .bars").getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(el).fontSize), star = el.querySelector(".stars i").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      overlapsChart: !(r.right <= side.left || r.left >= side.right || r.bottom <= side.top || r.top >= side.bottom),
      noScroll: document.documentElement.scrollWidth <= innerWidth, fs, star: Math.round(star.width * 10) / 10, within: r.right <= bars.right + 1 || r.left >= bars.left };
  }, pct);
  await shot("hud-" + name);
}
check(Object.values(hud).every(h => h.inView && !h.overlapsChart && h.noScroll), `the heat badge stays on screen, clear of the chart, with no sideways scroll at every size ${JSON.stringify(Object.fromEntries(Object.entries(hud).map(([k, h]) => [k, h.w + "x" + h.h])))}`);
check(hud.ts250.fs > hud.ts100.fs * 2.2 && hud.ts250.star > hud.ts100.star * 2.2, `it grows with the slider (font ${hud.ts100.fs} to ${hud.ts250.fs}px, stars ${hud.ts100.star} to ${hud.ts250.star}px)`);
await ev(() => { saveSettings({ uiPct: 100 }); applyUiScale(); applyMiniSize?.(); });
await page.setViewportSize({ width: 1280, height: 720 });

console.log("Chinese");
const zh = await ev(() => { setL("zh"); fresh(5); heat = 70; heatQuiet = 0; stepN(3); const h = hudState(); setL("en"); return h; });
check(/通緝/.test(await ev(() => { setL("zh"); const s = document.getElementById("heatInd").textContent; setL("en"); return s; })) && /海軍/.test(zh.aria || ""), `the badge and its read-out are translated (${zh.aria})`);
await ev(() => { setL("zh"); fresh(5); heat = 70; stepN(3); }); await shot("hud-zh"); await ev(() => setL("en"));

console.log("Old saves load");
const old = await ev(() => JSON.stringify(Object.keys(JSON.parse(localStorage.getItem("privateers-save-v2") || "{}")).filter(k => /heat|admiral/i.test(k))));
check(old === "[]", "heat is never written to the save (a sortie starts cold, old saves need no migration)");

check(errors.length === 0, `no page errors${errors.length ? " -> " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
console.log("\nheat: all checks passed");
