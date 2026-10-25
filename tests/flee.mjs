// Fleeing enemies in headless Chrome (js/flee.js): a much weaker ship runs on sight, a half-hull ship at a disadvantage retreats,
// bosses and struck ships never do, a fleet's wingmen go with a fleeing lead, a hurt merchant tips cargo, runners clear off
// the sea or settle back to cruising, the "Fleeing" mark shows, and no page errors. Fixed seed; every wait steps frames until
// its condition holds (no fixed sleeps).
// Usage: node tests/flee.mjs [url]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
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

// Test rig, in the page: open water at a ring, fixed-step frames, the player parked and unkillable, a settable ship rating.
await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); } };
  window.until = (cond, max = 60, n = 10) => { for (let i = 0; i < max; i++) { stepN(n); if (cond()) return i + 1; } return -1; };   // frames in steps of n until cond holds; -1 = never
  window.openAt = (ring, near = 420) => { for (let a = 0; a < 200; a++) { const p = polarPt(a * 0.37, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near)) return p; } return polarPt(0, ringMid(ring)); };
  window.pin = e => { e.angry = 1e6; return e; };   // the sea may not retire it (js/world-seas.js managePopulation)
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; spawnT = 1e9; };
  window.park = p => { Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1e9, hp: 1e9 }); player.spr.setPosition(p.x, p.y); };
  window.depart = () => { spawnT = 0; document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  window.rate = n => { window.shipRating = () => n; };   // the captain's rating, as the threat badges read it
  // a clean stage: empty open sea, the player parked at a ring-5 point, one enemy `off` px east of it
  window.stage = (L, faction, cls, off = 600, ring = 5) => {
    const p = openAt(ring, 700); park(p); depart(); clearSea();
    const e = makeEnemy(S, p.x + off, p.y, L, faction, cls); e.rot = 0; pin(e); e.speed = 0;
    return e;
  };
  window.away = e => dist(e, player);
  depart();
});

console.log("Much weaker ship runs on sight (gap)");
const gap = await ev(() => {
  rate(12);
  const e = stage(3, "pirate", "brig", 650);
  const n = until(() => e.flee, 12, 5), d0 = away(e);
  const mode = e.flee && e.flee.mode, tagged = e.badge.text.includes("Fleeing");
  stepN(120);
  const targeted = e.target === player;
  return { n, mode, tagged, grew: Math.round(away(e) - d0), targeted, rot: e.rot, alive: e.alive };
});
check(gap.n > 0 && gap.mode === "gap", `a level-3 pirate against a rating-12 captain turns tail at 650 px (mode ${gap.mode})`);
check(gap.grew > 150 && !gap.targeted, `it opens the range (+${gap.grew} px in 2 s) and picks no fight`);
check(gap.tagged, "its badge reads \"Fleeing\"");

console.log("An even match stays and fights");
const even = await ev(() => { rate(3); const e = stage(3, "pirate", "brig", 650); const n = until(() => e.flee, 12, 5); return { n, flee: !!e.flee }; });
check(even.n === -1 && !even.flee, "a level-3 pirate against a rating-3 captain does not run");

console.log("Courage by faction");
const fac = await ev(() => {
  const out = {};
  rate(5);   // 2 levels above a level-3 ship: enough for a merchant, not for a pirate or the Navy
  for (const [k, f, c] of [["merchant", "merchant", "fluyt"], ["pirate", "pirate", "brig"], ["navy", "navy", "brig"]]) {
    const e = stage(3, f, c, 600); out[k] = until(() => e.flee, 10, 5) > 0;
  }
  rate(8);   // 5 above: pirate runs, the Navy still holds
  for (const [k, f, c] of [["pirate8", "pirate", "brig"], ["navy8", "navy", "brig"]]) {
    const e = stage(3, f, c, 600); out[k] = until(() => e.flee, 10, 5) > 0;
  }
  return out;
});
check(fac.merchant && !fac.pirate && !fac.navy, `at +2 only the merchant runs (${JSON.stringify(fac)})`);
check(fac.pirate8 && !fac.navy8, "at +5 the pirate runs and the Navy ship still stands");

console.log("Half hull at a disadvantage retreats");
const hurt = await ev(() => {
  rate(6);
  const e = stage(5, "pirate", "brig", 450);
  e.attacker = player; e.angry = 20; e.target = player;
  const full = until(() => e.flee, 8, 5) > 0;   // at full hull, rating one above: stands
  e.hp = e.maxHp * 0.4;
  const n = until(() => e.flee, 12, 5), d0 = away(e);
  const mode = e.flee && e.flee.mode;
  stepN(150);
  return { full, n, mode, grew: Math.round(away(e) - d0) };
});
check(!hurt.full, "a full-hull pirate one level below the captain still fights");
check(hurt.n > 0 && hurt.mode === "hurt" && hurt.grew > 100, `at 40% hull it breaks off (mode ${hurt.mode}, +${hurt.grew} px)`);

console.log("Hurt merchant tips cargo and runs");
const merch = await ev(() => {
  rate(1);
  const e = stage(4, "merchant", "fluyt", 400);
  const loot0 = e.loot, crates0 = crates.length, spd0 = e.maxSpeed;
  e.attacker = player; e.angry = 20; e.hp = e.maxHp * 0.6;
  const n = until(() => e.flee, 8, 5);
  return { n, loot0, loot: e.loot, crates: crates.length - crates0, boost: +(e.maxSpeed / spd0).toFixed(2) };
});
check(merch.n > 0 && merch.crates === 1 && merch.loot === merch.loot0 - Math.round(merch.loot0 * 0.5), `a merchant at 60% hull tips half its hold (${merch.loot0} -> ${merch.loot}, ${merch.crates} crate)`);
check(merch.boost === 1.1, `...and sails ${merch.boost}x faster`);

console.log("Never run: bosses, guards, struck ships");
const never = await ev(() => {
  rate(30);
  const out = {};
  let e = stage(3, "pirate", "brig", 500); e.boss = "testboss"; out.boss = until(() => e.flee, 10, 5) > 0;
  e = stage(3, "pirate", "brig", 500); e.escortOf = "testboss"; out.guard = until(() => e.flee, 10, 5) > 0;
  e = stage(3, "pirate", "brig", 500); e.boss = "testboss"; e.attacker = player; e.angry = 20; e.hp = e.maxHp * 0.2; out.bossHurt = until(() => e.flee, 10, 5) > 0;
  e = stage(3, "merchant", "fluyt", 500); strikeColors(e, player); out.struck = until(() => e.flee, 10, 5) > 0;
  e = stage(3, "pirate", "brig", 500); until(() => e.flee, 12, 5); const was = !!e.flee; strikeColors(e, player); stepN(10); out.struckStops = was && !e.flee;
  return out;
});
check(!never.boss && !never.guard && !never.bossHurt, `a boss, its guard and a half-dead boss hold their ground against a rating-30 captain (${JSON.stringify(never)})`);
check(!never.struck, "a ship with colours struck does not run");
check(never.struckStops, "a runner that strikes her colours stops running");

console.log("A fleet goes with its lead");
const fl = await ev(() => {
  rate(7);
  const p = openAt(5, 900); park(p); depart(); clearSea();
  const mk = (c, x, y) => { const e = makeEnemy(S, x, y, 5, "pirate", c); e.rot = 0; return pin(e); };
  const lead = mk("brig", p.x + 450, p.y), w1 = mk("brig", p.x + 520, p.y + 70), w2 = mk("brig", p.x + 520, p.y - 70);
  const f = makeFleet("wolfpack", [lead, w1, w2]);
  const early = until(() => [lead, w1, w2].some(s => s.flee), 6, 5) > 0;   // all at full hull and only 2 levels behind: nobody runs
  lead.attacker = player; lead.angry = 20; lead.target = player; lead.hp = lead.maxHp * 0.3;
  const n = until(() => lead.flee && w1.flee && w2.flee, 20, 5);
  return { early, n, lead: lead.flee && lead.flee.mode, w1: w1.flee && w1.flee.mode, w2: w2.flee && w2.flee.mode, d: [lead, w1, w2].map(s => Math.round(away(s))) };
});
check(!fl.early, "an unhurt wolfpack two levels beneath the captain holds together");
check(fl.n > 0 && fl.lead === "hurt" && fl.w1 === "hurt" && fl.w2 === "hurt", `the lead breaks off and both wingmen retreat with it (${fl.lead}/${fl.w1}/${fl.w2})`);

console.log("Clear of the threat");
const clear = await ev(() => {
  rate(12);
  let e = stage(3, "pirate", "brig", 600); until(() => e.flee, 10, 5);
  park({ x: player.x - 1500, y: player.y });   // the captain is left far behind
  const calm = until(() => !e.flee, 20, 5) > 0, alive = e.alive && enemies.includes(e);
  rate(6);
  const h = stage(5, "pirate", "brig", 450); h.attacker = player; h.angry = 20; h.target = player; h.hp = h.maxHp * 0.3;
  until(() => h.flee, 10, 5);
  const was = !!h.flee;
  park({ x: h.x - 1500, y: h.y });
  const gone = until(() => !enemies.includes(h) && !h.alive, 30, 5) > 0;
  return { calm, alive, was, gone };
});
check(clear.calm && clear.alive, "a gap-runner settles back to cruising once the captain is 1250 px off, still afloat");
check(clear.was && clear.gone, "a beaten ship that gets clear sails off the sea for good");

console.log("Fair wind");
const wind = await ev(() => {
  const e = { x: 4000, y: 4000 }, a0 = fleeAway(e, { x: 3000, y: 4000 });
  const w0 = wx.on, wind0 = wx.wind;
  wx.on = true; wx.wind = { dir: a0 + 0.7, strength: 1 };
  const bent = fleeHeading(a0, fleeWind), gain = fleeWind(bent) * (1 - FLEE.windBend * (1 - Math.cos(bent - a0))) - fleeWind(a0);
  wx.on = false; const calm = fleeHeading(a0, fleeWind);
  wx.on = w0; wx.wind = wind0;
  return { off: +(bent - a0).toFixed(2), gain: +gain.toFixed(3), calmOff: +(calm - a0).toFixed(2) };
});
check(wind.off !== 0 && Math.abs(wind.off) <= 1 && wind.gain > 0, `a strong wind off the escape line bends the course ${wind.off} rad for ${wind.gain} more speed made good`);
check(wind.calmOff === 0, "no wind: straight away");

console.log("Chart");
const chart = await ev(() => { rate(12); stage(3, "pirate", "brig", 600); until(() => enemies.some(e => e.flee), 10, 5); let ok = true; try { hud(true); } catch (e) { ok = false; } return ok; });
check(chart, "the chart draws with a runner at sea");

check(errors.length === 0, `no page errors${errors.length ? " -> " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
console.log("\nflee: all checks passed");
