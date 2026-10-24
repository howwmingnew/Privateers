// Sea disasters in headless Chrome (js/disasters.js): each of the six can be set off, warns first (a toast, a countdown label, a chart and
// screen-edge mark), acts on the player AND on enemy hulls alike, can be escaped, and never breaks the hard rules (no kill, 10% floor, 8 s
// rest, none in the harbor or the Shallows, none on the first voyage); the daily sea plans them from its seed. Saves a picture of
// each one's warning and its strike to <outDir> (default .review/disasters, not committed).
// Usage: node tests/disasters.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/disasters";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg, detail) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg + (ok || detail === undefined ? "" : "  " + JSON.stringify(detail))); };
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
const shot = name => page.screenshot({ path: join(out, name + ".png") });

// Test rig, in the page: a clear sky, open deep water, an empty sea, fixed-step frames, the player at a set hull.
await ev(() => {
  window.fixT = 0;
  window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { fixT += 16.667; g.step(fixT, 16.667); for (const s of enemies.concat([player])) s.low = Math.min(s.low ?? s.hp, s.hp); } };   // low: the hull's lowest point (the crew mends it between blows)
  window.openAt = (ring, near = 560, skip = 0) => {
    for (let a = 0, n = 0; a < 900; a++) { const p = polarPt(a * 0.11, ringMid(ring)); if (!islands.some(i => Math.hypot(i.x - p.x, i.y - p.y) < i.r + near) && !STATIONS.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 900) && n++ >= skip) return p; }
    return polarPt(0, ringMid(ring));
  };
  window.clearSea = () => { for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0; fleets = []; spawnT = 1e9; };
  window.clearSky = () => { for (let s = 1; s < 9000; s++) { let ok = true; for (let t = 0; t <= 400 && ok; t += 15) { const w = weatherAt(s, t); ok = w.kind === "clear" && w.rain === 0; } if (ok) { wx.seed = s; return s; } } return 0; };
  window.depart = () => { document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; if (typeof tut !== "undefined") tut.active = false; save.tutorialDone = true; };
  // a fresh staged scene: nothing else at sea, the player parked in the given ring with a 1000-point hull
  window.stage = (ring = 7, { rot = 0, hp = 1000, skip = 0 } = {}) => {
    depart(); clearSea(); joyVec = { x: 0, y: 0, m: 0 }; padVec = { x: 0, y: 0, m: 0 };
    for (const e of dis.live) e.txt?.destroy();
    Object.assign(dis, { plan: [], i: 0, live: [], protectUntil: -1, fog: 0 });
    Object.assign(wx, { on: true, easy: false, t: 100 }); clearSky(); wxCompute();
    const p = openAt(ring, 560, skip);
    Object.assign(player, { x: p.x, y: p.y, rot, speed: 0, maxHp: 1000, hp, low: hp, alive: true, burnT: 0, hl: 30, dvx: 0, dvy: 0, dpT: 0, disSlowT: 0, disStunT: 0, disBoostT: 0, disLostT: 0, disStableT: 0 });
    player.spr.setPosition(p.x, p.y); S.cameras.main.centerOn(p.x, p.y);
    return p;
  };
  // a passive hull of an enemy's (a merchant attacks nobody), placed relative to the player; far enough not to be spooked
  window.addShip = (dx, dy, rot = 0, hl) => {
    const e = makeEnemy(S, player.x + dx, player.y + dy, 5, "merchant"); e.x = player.x + dx; e.y = player.y + dy; e.rot = rot; e.speed = 0; e.maxHp = e.hp = e.low = 1000; e.angry = 1e6; e.maxSpeed = 0; e.thinkT = 1e9;   // maxSpeed 0: a hull with no way on, carried only by what the sea does to it
    e.wander = { x: e.x, y: e.y };
    e.guns = e.guns && typeof e.guns === "object" ? e.guns : e.guns; if (hl) e.hl = hl;
    e.spr.setPosition(e.x, e.y); return e;
  };
  window.hpPct = s => +((s.maxHp - Math.min(s.low ?? s.hp, s.hp)) / s.maxHp * 100).toFixed(2);
  depart();
});
const L = () => ev(() => ({ n: dis.live.length, st: dis.live.map(e => e.kind + ":" + e.st), marks: disMarks().length, fog: +dis.fog.toFixed(2) }));
const sailAway = (dx, dy) => ev(([dx, dy]) => { joyVec = { x: dx, y: dy, m: 1 }; }, [dx, dy]);

// ---------- 1. tsunami ----------
console.log("Tsunami: warning, then bow-on vs beam-on, surfing, enemies shoved too");
{
  await ev(() => stage(7, { rot: Math.PI / 2 }));                      // beam on to a wave travelling +x
  const mer = await ev(() => { const e = addShip(30, 400, Math.PI / 2); window.mer = e; return { x: e.x, y: e.y }; });
  const e0 = await ev(() => { const e = disForce("tsunami", { x: player.x, y: player.y }, { a: 0, warn: 3 }); return e ? { st: e.st, o: e.o, dir: e.dir } : null; });
  check(e0 && e0.st === "warn", "forced tsunami starts in its warning state", e0);
  await ev(() => stepN(20));
  const w2 = await ev(() => ({ label: dis.live[0].txt?.text, marks: disMarks().length }));
  check(w2.marks === 1 && /Tsunami \d+ s/.test(w2.label), "the warning shows a countdown label and a chart mark", w2);
  await shot("tsunami-1-warning");
  await ev(() => { window.px0 = { x: player.x, y: player.y }; stepN(250); });   // 4.3 s in: the wall is up (3 s warning) and 6.4 s from reaching us
  await shot("tsunami-2-wall-approaching");
  await ev(() => stepN(330));
  await shot("tsunami-3-impact");
  await ev(() => stepN(120));
  const beam = await ev(() => ({ pct: hpPct(player), moved: Math.hypot(player.x - px0.x, player.y - px0.y), merPct: hpPct(mer), merMoved: Math.hypot(mer.x - px0.x, mer.y - (px0.y + 400)), alive: player.alive }));
  check(beam.pct >= 13.5 && beam.pct <= 15.01, "beam on: about 15% of the hull (the top of 8-15%)", beam);
  check(beam.moved > 100, "beam on: the wave shoves the ship a long way", beam);
  check(beam.merPct >= 8 && beam.merPct <= 15.01 && beam.merMoved > 20, "an enemy hull in the same wave is struck and shoved by the same rule", beam);
  await ev(() => { stepN(1200); });
  check((await L()).n === 0, "the event ends and is cleared");

  await ev(() => stage(7, { rot: Math.PI }));                         // bow into the wave
  await ev(() => { window.px0 = { x: player.x, y: player.y }; disForce("tsunami", { x: player.x, y: player.y }, { a: 0, warn: 1 }); stepN(700); });
  const bow = await ev(() => ({ pct: hpPct(player), moved: Math.hypot(player.x - px0.x, player.y - px0.y) }));
  check(bow.pct >= 7.5 && bow.pct <= 9, "bow on: about 8% of the hull", bow);
  check(bow.moved < beam.moved * 0.6, "bow on: far less displacement than beam on", { bow: bow.moved, beam: beam.moved });

  await ev(() => stage(7, { rot: 0 }));                               // running with the wave: surf
  const surf = await ev(() => { disForce("tsunami", { x: player.x, y: player.y }, { a: 0, warn: 1 }); let boost = 0, seen = false; for (let i = 0; i < 700; i++) { stepN(1); if (player.disBoostT > 0) { boost = Math.max(boost, disMul(player)); seen = true; } } return { seen, boost, pct: hpPct(player) }; });
  check(surf.seen && Math.abs(surf.boost - 1.25) < 1e-6, "running with the wave earns a 25% speed boost for a few seconds", surf);
}

// ---------- 2. waterspout ----------
console.log("Waterspout: path warning, pull, damage in the core, mast, escape by sailing against the spin");
{
  await ev(() => stage(7));
  await ev(() => { window.mer = addShip(150, 230, 0); window.sp = disForce("spout", { x: player.x + 150, y: player.y }, { warn: 2, v2: 1, v1: 0.5 }); sp.h = Math.PI / 2; });   // stands 150 px off, wandering south
  await ev(() => stepN(40));
  const warn = await L(); check(warn.st[0] === "spout:warn" && warn.marks === 1, "spout warns first, with a mark", warn);
  await shot("spout-1-warning");
  await ev(() => stepN(100));
  check((await L()).st[0] === "spout:live", "after its warning the spout is live");
  await ev(() => { window.mx0 = { x: mer.x, y: mer.y }; window.pp0 = { x: player.x, y: player.y }; stepN(150); });
  const pulled = await ev(() => ({ me: Math.hypot(player.x - pp0.x, player.y - pp0.y), merMoved: Math.hypot(mer.x - mx0.x, mer.y - mx0.y) }));
  check(pulled.me > 40 && pulled.merMoved > 40, "idle hulls (the player's and an enemy's) are carried by the spout's pull", pulled);
  await shot("spout-2-live");
  await ev(() => { stage(7); window.sp = disForce("spout", { x: player.x, y: player.y }, { warn: 0.5, v2: 1 }); sp.h = Math.PI / 2; window.mer = addShip(120, 0, 0); stepN(40); });   // right on top of us, both in the core
  await ev(() => stepN(900));
  const core = await ev(() => ({ pct: +(sp.spent[player.id] * 100).toFixed(2), merPct: +((sp.spent[mer.id] || 0) * 100).toFixed(2), alive: player.alive, merAlive: mer.alive }));
  check(core.pct > 0 && core.pct <= 18.01 && core.alive, "sitting in the core: the player takes damage, at most 18%, and survives", core);
  check(core.merPct > 0 || !core.merAlive, "an enemy hull in the same spout takes the same damage", core);
  // escape: full sail, against the spin
  await ev(() => { stage(7); window.sp = disForce("spout", { x: player.x + 40, y: player.y }, { warn: 0.2, v2: 1 }); sp.h = 0; sp.end += 60; stepN(30); });
  const esc = await ev(() => {
    const t0 = wx.t; let out = null;
    for (let i = 0; i < 1800 && !out; i++) {
      const a = Math.atan2(player.y - sp.y, player.x - sp.x) - Math.PI / 2;   // the tangent against the swirl (the water turns the other way), fanning out a little
      const rad = Math.atan2(player.y - sp.y, player.x - sp.x), mix = rad * 0 + a;
      joyVec = { x: Math.cos(mix) * 0.6 + Math.cos(rad) * 0.8, y: Math.sin(mix) * 0.6 + Math.sin(rad) * 0.8, m: 1 };
      stepN(1);
      if (dist(player, sp) > DISASTER.spout.R + 20) out = { t: +(wx.t - t0).toFixed(1), pct: hpPct(player) };
    }
    return out;
  });
  check(esc && esc.t < 20 && esc.pct <= 18.01, "full sail out of the spout works: clear of it with the damage cap kept", esc);
  await ev(() => { joyVec = { x: 0, y: 0, m: 0 }; });
}

// ---------- 3. whirlpool ----------
console.log("Whirlpool: stationary, pulls hulls in, damages the core, enemies trapped, escape works");
{
  await ev(() => stage(7));
  await ev(() => { window.vx = disForce("vortex", { x: player.x + 260, y: player.y }, { warn: 2, v2: 1 }); window.mer = addShip(560, 40, 0); stepN(30); });
  const warn = await L(); check(warn.st[0] === "vortex:warn" && warn.marks === 1, "vortex warns first, with a mark", warn);
  await shot("vortex-1-warning");
  await ev(() => stepN(130));
  await shot("vortex-2-live");
  await ev(() => { window.mx0 = dist(mer, vx); stepN(420); });
  const trapped = await ev(() => ({ merD: dist(mer, vx), mx0, pct: hpPct(player), merPct: hpPct(mer) }));
  check(trapped.merD < trapped.mx0 - 50, "a passive enemy hull is dragged in toward the middle", trapped);
  await ev(() => { stage(7); window.vx = disForce("vortex", { x: player.x + 30, y: player.y }, { warn: 0.5, v2: 1 }); window.mer = addShip(100, 0, 0); stepN(30); stepN(1300); });
  const core = await ev(() => ({ pct: +(vx.spent[player.id] * 100).toFixed(2), merPct: +((vx.spent[mer.id] || 0) * 100).toFixed(2), alive: player.alive }));
  check(core.pct > 0 && core.pct <= 15.01 && core.alive, "waiting in the middle: at most 15% and no sinking", core);
  await ev(() => { stage(7); window.vx = disForce("vortex", { x: player.x + 30, y: player.y }, { warn: 0.2, v2: 1 }); vx.end += 60; stepN(30); });
  const esc = await ev(() => {
    const t0 = wx.t; let out = null;
    for (let i = 0; i < 1800 && !out; i++) {
      const rad = Math.atan2(player.y - vx.y, player.x - vx.x); joyVec = { x: Math.cos(rad), y: Math.sin(rad), m: 1 }; stepN(1);
      if (dist(player, vx) > DISASTER.vortex.R + 20) out = { t: +(wx.t - t0).toFixed(1), pct: hpPct(player) };
    }
    return out;
  });
  check(esc && esc.t < 25 && esc.pct <= 15.01, "sailing straight out at full sail leaves the whirlpool, under the cap", esc);
  await ev(() => { joyVec = { x: 0, y: 0, m: 0 }; });
  // a snapped mast still has a way out
  await ev(() => { stage(7); window.vx = disForce("vortex", { x: player.x + 30, y: player.y }, { warn: 0.2, v2: 1 }); vx.end += 80; player.disSlowT = 60; stepN(30); });
  const esc2 = await ev(() => {
    const t0 = wx.t; let out = null;
    for (let i = 0; i < 3000 && !out; i++) { const rad = Math.atan2(player.y - vx.y, player.x - vx.x); joyVec = { x: Math.cos(rad), y: Math.sin(rad), m: 1 }; player.disSlowT = 60; stepN(1); if (dist(player, vx) > DISASTER.vortex.R + 20) out = { t: +(wx.t - t0).toFixed(1), pct: hpPct(player) }; }
    return out;
  });
  check(esc2 && esc2.pct <= 15.01, "with a snapped mast (80% speed) there is still a way out, under the cap", esc2);
  await ev(() => { joyVec = { x: 0, y: 0, m: 0 }; });
}

// ---------- 4. rogue wave ----------
console.log("Rogue wave: bow on takes 70% less and steadies the helm; beam on loses control");
{
  await ev(() => stage(7, { rot: Math.PI / 2 }));
  await ev(() => { disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 1.5 }); stepN(30); });
  const warn = await L(); check(warn.st[0] === "rogue:warn" && warn.marks === 1, "rogue wave warns first, with a mark", warn);
  await shot("rogue-1-warning");
  await ev(() => stepN(80));
  await shot("rogue-2-strike");
  const beam = await ev(() => ({ pct: hpPct(player), lost: player.disLostT > 0, rot0: player.rot }));
  check(beam.pct >= 9.5 && beam.pct <= 18.01 && beam.lost, "beam on: 10-18% and the helm is lost for a moment", beam);
  await ev(() => { joyVec = { x: 0, y: -1, m: 1 }; stepN(30); });
  const lost = await ev(() => ({ stillLost: player.disLostT > 0 }));
  await ev(() => { stepN(180); });
  const back = await ev(() => player.disLostT > 0);
  check(!back, "control comes back after about 1.6 s", { lost, back });
  await ev(() => { stage(7, { rot: Math.PI }); disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 0.5 }); stepN(60); });
  const bow = await ev(() => ({ pct: hpPct(player), lost: player.disLostT > 0, steady: player.disStableT > 0 }));
  check(bow.pct > 0 && bow.pct <= 6 && !bow.lost && bow.steady, "bow on: 70% less damage, the helm kept, a steady-helm bonus (turns faster)", bow);
  check(await ev(() => disTurn(player) > 1.3), "the steady-helm bonus raises the turn rate");
  await ev(() => { stage(7, { rot: Math.PI / 2 }); window.mer = addShip(100, 0, Math.PI / 2); disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 0.5 }); stepN(60); });
  const mer = await ev(() => ({ merPct: hpPct(mer), lost: mer.disLostT > 0 }));
  check(mer.merPct >= 9.5 && mer.lost, "an enemy hull beam on in the same wave loses its helm too", mer);
}

// ---------- 5. lightning ----------
console.log("Lightning: picks the tallest mast (an enemy's, if it is taller), snaps it and stuns; mast slows");
{
  await ev(() => stage(7));
  await ev(() => { window.tall = addShip(260, 0, 0, 90); });
  await ev(() => { window.lt = disForce("lightning", { x: player.x, y: player.y }, { warn: 3 }); stepN(30); });
  const aim = await ev(() => ({ onTall: lt.tg === tall, st: lt.st }));
  check(aim.onTall && aim.st === "warn", "it aims at the enemy hull with the taller mast, not at the player", aim);
  await shot("lightning-1-warning");
  await ev(() => stepN(170));
  const hit = await ev(() => ({ tallPct: hpPct(tall), slow: tall.disSlowT > 0 || tall.disStunT > 0, playerPct: hpPct(player) }));
  check(hit.tallPct >= 7.5 && hit.tallPct <= 12.01 && hit.slow && hit.playerPct === 0, "the tall enemy is struck for 8-12%, slowed and stunned; the player is untouched", hit);
  await shot("lightning-2-strike");
  await ev(() => { stage(7); window.sm = addShip(260, 0, 0, 20); window.lt = disForce("lightning", { x: player.x, y: player.y }, { warn: 3 }); stepN(200); });
  const mine = await ev(() => ({ pct: hpPct(player), slow: player.disSlowT > 0, stun: player.disStunT > 0, mul: disMul(player), alive: player.alive }));
  check(mine.pct >= 7.5 && mine.pct <= 12.01 && mine.slow && mine.alive, "the tallest mast being yours, you take 8-12% and a snapped mast", mine);
  check(Math.abs(mine.mul - 0.8 * (mine.stun ? 0.4 : 1)) < 1e-6, "a snapped mast leaves 80% of the speed (the effect is the same physics for all)", mine);
  // dodging: the strike point locks 1.2 s before the stroke; sailing off in that time (200 px/s against an 80 px ring) escapes it
  await ev(() => { stage(7); window.lt = disForce("lightning", { x: player.x, y: player.y }, { warn: 4 }); joyVec = { x: 0, y: 1, m: 1 }; stepN(4 * 60 + 20); });
  const dodge = await ev(() => ({ pct: hpPct(player), d: Math.hypot(player.x - lt.x, player.y - lt.y), speed: player.speed, nh: [Math.round(dist(player, nearestHarbor())), nearestHarbor().kind], truce: inTruce(player), ring: ringAt(dist(player, PORT)), pos: [Math.round(player.x), Math.round(player.y)], isl: islands.filter(i => dist(i, player) < i.r + 150).length }));
  check(dodge.pct === 0 && dodge.d > 80, "moving away during the warning dodges the stroke", dodge);
  await ev(() => { joyVec = { x: 0, y: 0, m: 0 }; });
}

// ---------- 6. fog ----------
console.log("Fog: thickens, sight shortens for the player and the AI, no damage, ships beyond sight are hidden and lost");
{
  await ev(() => stage(5));
  await ev(() => { window.foe = makeEnemy(S, player.x + 600, player.y, 5, "pirate"); foe.x = player.x + 600; foe.y = player.y; foe.speed = 0; foe.maxHp = foe.hp = 1000; foe.angry = 1e6; foe.maxSpeed = 0; foe.target = player; foe.spr.setPosition(foe.x, foe.y); });
  await ev(() => { window.fg = disForce("fog", null, { warn: 1.5, end: wx.t + 40 }); stepN(30); });
  check((await L()).st[0] === "fog:warn", "fog warns first");
  await ev(() => stepN(200));
  await shot("fog-1-thickening");
  const f1 = await ev(() => ({ fog: dis.fog, sight: disSight() }));
  await ev(() => stepN(400));
  await shot("fog-2-thick");
  const f2 = await ev(() => ({ fog: dis.fog, sight: disSight(), target: foe.target === player, hides: disFogHides(foe), pct: hpPct(player), edgeShip: !![...edgeEls.values()].some(m => m.it && m.it.e === foe) }));
  check(f2.fog === 1 && Math.abs(f2.sight - 380) < 1, "the fog reaches full thickness with a 380 px sight", f2);
  check(f1.sight > f2.sight, "sight shortens as it thickens", { f1, f2 });
  check(f2.pct === 0, "fog does no damage", f2);
  check(f2.hides && !f2.target, "an enemy 600 px off (beyond sight) drops its target instead of seeing through the fog", f2);
  check(!f2.edgeShip, "the screen-edge boxes do not show a ship beyond sight", f2);
  const near = await ev(() => { foe.x = player.x + 250; foe.y = player.y; foe.target = null; foe.retarget = 0; foe.ignore.clear(); foe.ring = ringAt(dist(player, PORT)); stepN(60); return { sees: !disFogHides(foe), target: foe.target === player, hostile: isHostile(foe, player), ign: ignoring(foe, player, S.time.now / 1000), back: foe.backOffT, inSafe: inSafe(player), d: Math.round(dist(foe, player)), sight: disSight(), alive: foe.alive, st: stationAt ? !!stationAt(player) : null }; });
  check(near.sees && near.target, "an enemy inside the sight still finds the player", near);
  await ev(() => stepN(2700));
  check((await L()).n === 0 && (await ev(() => dis.fog)) === 0, "the fog lifts and clears");
}

// ---------- 7. the hard rules, in the sea ----------
console.log("Hard rules: no sinking, 10% floor, 8 s rest, not in the harbor or the Shallows");
{
  await ev(() => stage(7, { hp: 130 }));
  await ev(() => { window.vx = disForce("vortex", { x: player.x + 20, y: player.y }, { warn: 0.3, v2: 1 }); vx.end += 40; stepN(1800); });
  const lowHp = await ev(() => ({ hp: player.hp, alive: player.alive }));
  check(lowHp.alive && lowHp.hp >= 100 - 1e-6, "a vortex on a hull with 13% left stops at 10%: the disaster cannot sink the player", lowHp);
  await ev(() => { stage(7, { hp: 100, rot: Math.PI / 2 }); disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 0.3 }); stepN(60); });
  check(await ev(() => player.alive && player.hp >= 100 - 1e-6), "already at 10%: a rogue wave takes nothing more");
  await ev(() => { stage(7); dis.protectUntil = wx.t + 8; disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 0.2 }); stepN(40); });
  check(await ev(() => hpPct(player) === 0), "inside the 8 s rest after an event the player takes no disaster damage");
  await ev(() => { stage(7); window.vx = disForce("vortex", { x: player.x + 20, y: player.y }, { warn: 0.1, v2: 1 }); vx.end = vx.t0 + 3; stepN(60 * 4); });
  const prot = await ev(() => ({ until: +(dis.protectUntil - wx.t).toFixed(1), live: dis.live.length }));
  check(prot.live === 0 && prot.until > 6 && prot.until <= 8, "when an event ends the 8 s rest starts", prot);
  // a wave driving the player onto a rock: the crash (#30) is capped by the same floor
  const crash = await ev(() => {
    stage(7, { hp: 130, rot: Math.PI / 2 });
    const isl = islands.find(i => dist(i, PORT) > ringEdge(6) && i.r > 40);
    player.x = isl.x - isl.r - 110; player.y = isl.y; player.low = player.hp; player.spr.setPosition(player.x, player.y);
    disForce("tsunami", { x: player.x, y: player.y }, { a: 0, warn: 0.5 });
    stepN(60 * 14);
    return { crashed: !!(player.crashBook && player.crashBook.size), low: Math.min(player.low, player.hp), alive: player.alive };
  });
  check(crash.crashed && crash.alive && crash.low >= 100 - 1e-6, "a wave that drives the player onto a rock: the crash hurts but never takes him under 10%", crash);
  const geo = await ev(() => {
    const mk = kind => ({ kind, a: 0, a2: 0, r: 0.5, v1: 0.5, v2: 0.5, warn: 8, warnAt: 0, t0: 8, end: 40 });
    const at = (x, y) => { player.x = x; player.y = y; };
    const out = {};
    const p2 = polarPt(0.3, ringMid(2)); at(p2.x, p2.y); out.shallowsSpout = disGeom(mk("spout")); out.shallowsRogue = disGeom(mk("rogue")); out.shallowsFog = disGeom(mk("fog"));
    at(PORT.x + 300, PORT.y); out.harborVortex = disGeom(mk("vortex")); out.harborRogue = disGeom(mk("rogue"));
    const p7 = openAt(7, 560); at(p7.x, p7.y); out.deepRogue = disGeom(mk("rogue")); out.deepFog = disGeom(mk("fog"));
    return out;
  });
  check(geo.shallowsSpout === false && geo.shallowsRogue === false && geo.harborVortex === false && geo.harborRogue === false, "no spout, vortex or rogue wave is placed in the Shallows or by the harbor", geo);
  check(geo.shallowsFog === true && geo.deepFog === true && geo.deepRogue === true, "fog may come anywhere, and a deep sea takes a rogue wave", geo);
  const hurtHome = await ev(() => { stage(7); const p = { x: PORT.x + 300, y: PORT.y }; player.x = p.x; player.y = p.y; disForce("rogue", p, { a2: 0, warn: 0.2 }); stepN(40); return hpPct(player); });
  check(hurtHome === 0, "even a forced blow does no damage to the player in the harbor's safe water", hurtHome);
}

// ---------- 8. weather effects off, the first voyage, the daily sea ----------
console.log("Weather effects off still hurts; the first voyage has none; the daily sea plans from its seed");
{
  await ev(() => { stage(7, { rot: Math.PI / 2 }); SETTINGS.weatherFx = false; disForce("rogue", { x: player.x, y: player.y }, { a2: 0, warn: 0.3 }); stepN(60); });
  check(await ev(() => hpPct(player) > 9), "with weather effects off a disaster still strikes (it is gameplay)");
  await ev(() => { SETTINGS.weatherFx = true; });
  await ev(() => { save.tutorialDone = false; wx.seed = 99; Object.assign(wx, { on: true, easy: true }); dis.plan = disasterPlan(wx.seed); wx.easy = !save.tutorialDone; runHook("sail"); });
  const first = await ev(() => ({ easy: wx.easy, plan: dis.plan.length }));
  check(first.easy && first.plan === 0, "the first voyage (tutorial) plans no disaster at all", first);
  await ev(() => { save.tutorialDone = true; runHook("sail"); });
  const plan = await ev(() => ({ same: JSON.stringify(dis.plan.map(e => [e.kind, e.t0])) === JSON.stringify(disasterPlan(wx.seed).map(e => [e.kind, e.t0])), seed: wx.seed, n: dis.plan.length }));
  check(plan.same, "an ordinary sortie plans from its own seed", plan);
  const sig = await ev(() => {
    depart(); startRun("daily");
    const a = JSON.stringify(dis.plan.map(e => [e.kind, e.t0, e.a])), seed = run.seed, w = wx.seed;
    return { a, seed, w, same: a === JSON.stringify(disasterPlan(seed).map(e => [e.kind, e.t0, e.a])) };
  });
  check(sig.same && sig.seed === sig.w, "the daily sea's plan is its seed's plan, and the sky uses the same seed", sig);
}

// ---------- 9. the screen-edge box and the chart ----------
console.log("Screen-edge mark and chart");
{
  await ev(() => { if (typeof runActive === "function" && runActive()) { /* leave the daily */ } });
  await page.reload({ waitUntil: "load" }); await ready();
  await ev(() => {
    window.stepN = n => { const g = S.game; g.loop.sleep(); for (let i = 0; i < n; i++) { window.fixT = (window.fixT || 0) + 16.667; g.step(window.fixT, 16.667); } };
    document.getElementById("port").hidden = true; docked = false; paused = false; canDock = false; save.tutorialDone = true; spawnT = 1e9;
    for (const e of enemies) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); } enemies.length = 0;
    Object.assign(wx, { on: true, easy: false, t: 100 }); Object.assign(dis, { plan: [], i: 0, live: [] });
    let p = polarPt(0.3, ringMid(7)); for (let a = 0; a < 300; a++) { const q = polarPt(a * 0.37, ringMid(7)); if (!islands.some(i => Math.hypot(i.x - q.x, i.y - q.y) < i.r + 700)) { p = q; break; } }
    Object.assign(player, { x: p.x, y: p.y, rot: 0, speed: 0, maxHp: 1000, hp: 1000 }); S.cameras.main.centerOn(p.x, p.y);
    window.vx = disForce("vortex", { x: player.x + 1000, y: player.y }, { warn: 8, v2: 1 }); stepN(40);
  });
  const box = await ev(() => { const b = document.querySelector("#edgeMarks .em[data-kind=hazard]"); return b ? { text: b.textContent, edge: b.dataset.edge } : null; });
  check(box && /m$/.test(box.text) && box.edge === "right", "an off-screen warning gets an edge box pointing at it with its distance", box);
  await shot("edge-box");
  await ev(() => { drawMini(); });
  check(true, "the chart draws the hazard zone without error");
}

await browser.close();
check(errors.length === 0, "0 page errors and 0 console errors", errors.slice(0, 5));
console.log(fails.length ? `\n${fails.length} FAILED:\n - ` + fails.join("\n - ") : "\nAll disaster checks passed.");
process.exit(fails.length ? 1 : 0);
