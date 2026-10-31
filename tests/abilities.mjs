// The captain's abilities (#16, js/abilities.js) in headless Chrome: F on a sloop drops a keg that blows up under a pirate (an escort and a boss
// beside it: the escort untouched, the boss only scratched), a fast-line ship's smoke makes a real enemy volley miss far more, a heavy-line ship's
// next broadside does ~2x and the one after 1x, the HUD button shows the recharge and comes back ready, the clock stops while paused, the
// button hides when docked / paused, and on a phone (both orientations) the button sits clear of the sail buttons and the HUD and works by tap.
// 0 page errors. The pure rules are in tests/unit-abilities.mjs.
// Usage: node tests/abilities.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/abilities";
mkdirSync(out, { recursive: true });
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(what); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));
const G = (g, n = 1) => Array.from({ length: n }, () => ({ g, lv: 1 }));
const SAVE = o => JSON.stringify({ v: 2, gold: 1000, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: G("six"), left: G("six"), right: G("six"),
  stern: [], store: [], sunk: 30, wrecks: [], salvage: [], seed: 424242, tutorialDone: true, escortGift: "had", ...o });
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function open(save, { viewport = { width: 1280, height: 720 }, mobile = false, settings = {} } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await ctx.addInitScript(([s, set]) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en"); localStorage.setItem("privateers-save-v2", s);
    localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false, ...set }));
  }, [save, settings]);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive() && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  return { ctx, page };
}
// Out to sea, on a quiet patch of open water: no AI, no spawns, the flagship stopped and pointing east.
async function sea(page) {
  await page.evaluate(() => setSail());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
  return page.evaluate(() => {
    window.think = () => {}; window.spawnEnemy = () => null; managePopulation = () => {};
    wx.on = false; dis.live = []; dis.plan = [];   // fair weather, no disasters: a storm's wind bends the balls
    if (!window.__pinHook) { window.__pinHook = true; onHook("frame", () => { for (const e of window.__foes || []) if (e.pin) Object.assign(e, { x: e.pin.x, y: e.pin.y, rot: 0, speed: 0 }); }); }   // test ships stay exactly where they are put
    for (const s of enemies.slice()) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); }
    let at = null;
    for (let y = 1200; y < 7000 && !at; y += 250) for (let x = 1200; x < 7000 && !at; x += 250) {
      const d = Math.hypot(x - PORT.x, y - PORT.y);
      if (d > SAFE_R + 900 && islands.every(i => Math.hypot(i.x - x, i.y - y) > i.r + 450)) at = { x, y };
    }
    Object.assign(player, { x: at.x, y: at.y, rot: 0, speed: 0, vx: 0, vy: 0, cvx: 0, cvy: 0, hp: player.maxHp });
    setSailLevel(0);
    S.cameras.main.centerOn(player.x, player.y);   // a broadside only fires at what is on screen
    return at;
  });
}
// A still enemy at (dx, dy) from the flagship, hull parallel to it (a broadside never rakes it, so no magazine crit).
const foe = (page, dx, dy, o = {}) => page.evaluate(([dx, dy, o]) => {
  const e = makeEnemy(S, player.x + dx, player.y + dy, o.L || 4, o.faction || "pirate", o.cls || "brig");
  Object.assign(e, { rot: 0, speed: 0, maxSpeed: 0, vx: 0, vy: 0, cvx: 0, cvy: 0, campaignFit: true, pin: { x: e.x, y: e.y } });
  if (o.hp) { e.maxHp = e.hp = o.hp; }
  if (o.ally) Object.assign(e, { ally: true, allyName: "Test escort" });   // an escort plate shows its name (js/ships.js)
  if (o.boss) e.boss = o.boss;
  window.__foes = window.__foes || []; window.__foes.push(e);
  return window.__foes.length - 1;
}, [dx, dy, o]);
const shot = (page, name) => page.screenshot({ path: join(out, name) });
const btn = page => page.evaluate(() => { const b = document.getElementById("abilityBtn"), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  return { shown: !b.hidden && cs.display !== "none" && r.width > 0, kind: b.dataset.kind, state: b.dataset.state, cd: b.querySelector(".ab-cd").textContent,
    key: b.querySelector(".ab-key").hidden ? "" : b.querySelector(".ab-key").textContent, label: b.getAttribute("aria-label"), r: { l: r.left, t: r.top, r: r.right, b: r.bottom } }; });

// 1. The sloop's powder keg: F drops it astern; a pirate sailing onto it sets it off; an escort beside it is untouched, a boss only scratched.
{
  const { ctx, page } = await open(SAVE());
  await sea(page);
  // the button is shown by the next frame hook: wait for it rather than reading the very first frame (a busy machine is slow to tick)
  await page.waitForFunction(() => { const el = document.getElementById("abilityBtn"); return !!el && !el.hidden; }, null, { timeout: 3000 * SLOW }).catch(() => {});
  let b = await btn(page);
  check(b.shown && b.kind === "keg" && b.state === "ready" && b.key === "F", "desktop at sea: the HUD button shows the sloop's keg, ready, key F", b);
  check(/Powder keg/.test(b.label), "the button names its ability", b.label);
  await shot(page, "desktop-ready.png");
  await page.keyboard.press("KeyF"); await sleep(150);
  const k = await page.evaluate(() => ({ n: kegs.length, x: kegs[0] && kegs[0].x - player.x, y: kegs[0] && kegs[0].y - player.y, cd: abil.cd }));
  check(k.n === 1 && k.x < -20 && Math.abs(k.y) < 5, "F drops one keg astern of the flagship", k);
  check(k.cd > 20 && k.cd <= 22, "the keg's recharge started", k.cd);
  await page.keyboard.press("KeyF"); await sleep(120);
  check(await page.evaluate(() => kegs.length) === 1, "a second F while recharging drops nothing");
  b = await btn(page);
  check(b.state === "cool" && +b.cd >= 20, "the button shows the recharge seconds", b);
  await shot(page, "desktop-cooling-keg.png");
  // the flagship sails off; a pirate, an escort (ally) and a boss come up behind the keg (the escort and boss outside the trigger, inside the blast)
  const kx = k.x;
  await page.evaluate(() => { player.x += 400; });
  const ally = await foe(page, kx - 400, 75, { hp: 500, ally: true });
  const boss = await foe(page, kx - 400, -75, { hp: 5000, boss: "test" });
  const pir = await foe(page, kx - 400 - 160, 0, { hp: 500 });
  await sleep(250);
  check(await page.evaluate(() => kegs.length) === 1, "ships outside the trigger ring leave the keg alone (escort and boss at 75 px)");
  await page.evaluate(i => { const e = window.__foes[i]; e.pin.x = kegs[0].x - 30; }, pir);   // the pirate sails onto it
  await sleep(120); await shot(page, "keg-blast.png"); await sleep(300);
  const r = await page.evaluate(([a, bo, p]) => [a, bo, p].map(i => { const e = window.__foes[i]; return { hp: e.hp, max: e.maxHp, alive: e.alive }; }).concat([{ kegs: kegs.length }]), [ally, boss, pir]);
  const [ra, rb, rp] = r;
  check(r[3].kegs === 0, "the pirate set the keg off");
  check(rp.max - rp.hp > 0.2 * rp.max, "the pirate took a heavy blow (~30% of its hull at the centre)", rp);
  check(ra.hp === ra.max, "the escort beside it took nothing", ra);
  const bossShare = (rb.max - rb.hp) / rb.max;
  check(bossShare > 0 && bossShare <= 0.061, "the boss took only a scratch (<= 6% of its hull)", { share: +bossShare.toFixed(4) });
  check(await page.evaluate(() => player.hp === player.maxHp), "the flagship is never hurt by its own keg");
  // a keg nobody touches blows on its fuse (the clock is sped up for the test)
  await page.evaluate(() => { abil.cd = 0; });
  await page.keyboard.press("KeyF"); await sleep(100);
  await page.evaluate(() => { kegs[0].t = KEG_FUSE - 0.2; });
  await sleep(500);
  check(await page.evaluate(() => kegs.length) === 0, "an untouched keg blows on its fuse");
  // the clock comes back to ready, and stops while paused
  await page.evaluate(() => { abil.cd = 0.4; });
  await sleep(700);
  b = await btn(page);
  check(b.state === "ready" && b.cd === "", "the recharge ends and the button is ready again", b);
  await page.evaluate(() => { abil.cd = 10; pauseGame(); });
  await sleep(800);
  const p = await page.evaluate(() => ({ cd: abil.cd, paused }));
  b = await btn(page);
  check(p.paused && Math.abs(p.cd - 10) < 1e-6, "the recharge stands still while paused", p);
  check(!b.shown, "the button is hidden under the pause sheet", b);
  await page.keyboard.press("KeyF");
  check(await page.evaluate(() => kegs.length === 0 && abil.cd === 10), "F does nothing while paused");
  await page.evaluate(() => resumeGame()); await sleep(300);
  await page.evaluate(() => { cargo = 0; dock("return"); }); await page.waitForFunction(() => docked); await sleep(200);
  b = await btn(page);
  check(!b.shown, "docked: no button", b);
  await page.keyboard.press("KeyF");
  check(await page.evaluate(() => kegs.length === 0), "F does nothing docked");
  await page.evaluate(() => setSail()); await page.waitForFunction(() => !docked && !paused); await sleep(200);
  check(await page.evaluate(() => abilityReady(abil)), "a new sortie starts with the ability ready");
  // the first voyage's lesson: no button and no ability until it is over (owner, #158)
  await page.evaluate(() => { tut.active = true; tut.doneT = 0; }); await sleep(300);
  b = await btn(page);
  check(!b.shown, "during the lesson the button is hidden", b);
  await page.keyboard.press("KeyF"); await sleep(150);
  check(await page.evaluate(() => kegs.length === 0 && abilityReady(abil)), "F does nothing during the lesson");
  await page.evaluate(() => { tut.active = false; }); await sleep(300);
  b = await btn(page);
  check(b.shown && b.state === "ready", "after the lesson the button shows, ready", b);
  await ctx.close();
}

// 2. A fast-line ship's smoke screen: the same enemy crew, laying real volleys on a still flagship, lands far less while it is lit.
{
  const { ctx, page } = await open(SAVE({ ship: "schooner", left: G("six", 2), right: G("six", 2) }));
  await sea(page);
  const b0 = await btn(page);
  check(b0.kind === "smoke", "a schooner has the smoke screen", b0);
  const e = await foe(page, 0, -260, { L: 8, cls: "brig", hp: 1e6 });   // its starboard side bears on us (hull parallel, it lies to the north)
  await page.evaluate(i => {
    const e = window.__foes[i]; e.target = player; e.attacker = player; e.angry = 1e9;
    for (const k in e.guns) for (const g of e.guns[k]) g.interval = 0.2;
    player.maxHp = player.hp = 1e9;
    window.__fired = 0; window.__hits = 0;
    const rel = releaseVolley; window.releaseVolley = (s, key, v, guns) => { if (s === e && v.tgt === player) window.__fired += guns.length; return rel(s, key, v, guns); };
    onHook("hurt", (s, d, src) => { if (s === player && src === e) window.__hits++; });
  }, e);
  const phase = async (smoke, secs) => {
    await page.evaluate(() => { window.__fired = 0; window.__hits = 0; });
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000 * SLOW) {
      await page.evaluate(on => { player.hp = player.maxHp; if (on) { abil.on = SMOKE_T; abil.cd = SMOKE_CD; } else abil.on = 0; }, smoke);
      await sleep(250);
    }
    await sleep(900);   // the last balls land
    return page.evaluate(() => ({ fired: window.__fired, hits: window.__hits }));
  };
  const clear = await phase(false, 12);
  await page.evaluate(() => { abil = abilityFresh(); });
  await page.keyboard.press("KeyF"); await sleep(150);
  const lit = await page.evaluate(() => ({ on: abil.on, cd: abil.cd, err: Array.from({ length: 400 }, () => Math.abs(abilityAimErr(player))).reduce((a, b) => Math.max(a, b), 0) }));
  check(lit.on > 4 && lit.cd > 29, "F lights the smoke: 5 s on, 30 s recharge", lit);
  check(lit.err > 0.3 && lit.err <= 0.35 + 1e-9, "while lit, every gun laid on the flagship gets up to +/-0.35 rad more error", lit);
  await sleep(1200); await shot(page, "smoke-screen.png");   // the cloud has built up
  const b1 = await btn(page);
  check(b1.state === "on", "the button shows the smoke burning", b1);
  const smoke = await phase(true, 12);
  const rc = clear.hits / Math.max(1, clear.fired), rs = smoke.hits / Math.max(1, smoke.fired);
  check(clear.fired >= 12 && smoke.fired >= 12, "both phases saw real volleys", { clear, smoke });
  check(rc > 0.6, "without smoke an elite crew mostly hits a still ship", { clear, rate: +rc.toFixed(2) });
  check(rs < rc * 0.75 && rs > 0, "with smoke it lands clearly less, but not nothing", { smoke, rate: +rs.toFixed(2), clear: +rc.toFixed(2) });
  check(await page.evaluate(() => { abil = abilityFresh(); return abilityAimErr(player) === 0 && abilityAimErr({}) === 0; }), "no smoke, no extra error (and never for AI targets)");
  await ctx.close();
}

// 3. A heavy-line ship's double shot: the next broadside does ~2x per hit, the one after 1x.
{
  const { ctx, page } = await open(SAVE({ ship: "brig", left: G("six", 3), right: G("six", 3) }));
  await sea(page);
  const b0 = await btn(page);
  check(b0.kind === "double", "a brig has the double shot", b0);
  const e = await foe(page, 0, 150, { L: 3, cls: "brig", hp: 1e6 });   // on the starboard beam (rot 0: starboard is +y)
  await sleep(400);
  await page.evaluate(i => { const e = window.__foes[i]; window.__dmg = []; onHook("hurt", (s, d, src) => { if (s === e && src === player) window.__dmg.push(d); }); }, e);
  const volley = async () => {
    await page.waitForFunction(() => player.guns.right.every(g => g.cd <= 0), null, { timeout: 8000 * SLOW });
    await page.evaluate(() => { window.__dmg = []; });
    await page.keyboard.press("KeyE"); await sleep(1300);
    return page.evaluate(() => window.__dmg.slice());
  };
  const per = d => d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  const plain = await volley();
  await page.keyboard.press("KeyF"); await sleep(150);
  const armed = await page.evaluate(() => ({ armed: abil.armed, cd: abil.cd }));
  let b = await btn(page);
  check(armed.armed && armed.cd === 0 && b.state === "armed", "F loads the double shot (no recharge yet)", { armed, b });
  await shot(page, "double-loaded.png");
  await page.keyboard.press("KeyF"); await sleep(100);
  check(await page.evaluate(() => abil.armed && abil.cd === 0), "F again while loaded changes nothing");
  // auto-fire (playerFire with a `pick`, js/combat.js autoFire) neither spends the loaded charge nor doubles (owner, #158)
  await page.waitForFunction(() => player.guns.right.every(g => g.cd <= 0), null, { timeout: 8000 * SLOW });
  await page.evaluate(() => { window.__dmg = []; playerFire(null, () => true); }); await sleep(1300);
  const auto = await page.evaluate(() => window.__dmg.slice());
  check(await page.evaluate(() => abil.armed && abil.cd === 0), "auto-fire does not spend a loaded double shot");
  check(auto.length >= 3 && Math.abs(per(auto) / per(plain) - 1) < 0.05, "...and the auto-fired broadside is 1x", { auto: auto.length, k: +(per(auto) / per(plain)).toFixed(3) });
  const dbl = await volley();
  b = await btn(page);
  const after = await page.evaluate(() => ({ armed: abil.armed, cd: abil.cd }));
  await shot(page, "double-fired.png");
  const next = await volley();
  check(plain.length >= 3 && dbl.length >= 3 && next.length >= 3, "every broadside hit the target", { plain: plain.length, dbl: dbl.length, next: next.length });
  const k = per(dbl) / per(plain), k2 = per(next) / per(plain);
  check(Math.abs(k - 2) < 0.1, "the loaded broadside does ~2x per hit", { plain: +per(plain).toFixed(2), dbl: +per(dbl).toFixed(2), k: +k.toFixed(3) });
  check(Math.abs(k2 - 1) < 0.05, "the broadside after it is back to 1x", { next: +per(next).toFixed(2), k: +k2.toFixed(3) });
  check(!after.armed && after.cd > 20 && b.state === "cool", "firing it spent the charge and started the recharge", { after, b });
  await ctx.close();
}

// 4. Phones: the button sits clear of the sail buttons and the HUD in both orientations, and a tap uses it.
const PHONES = [["390x844", { width: 390, height: 844 }, {}], ["844x390", { width: 844, height: 390 }, {}],
  ["844x390-chart250", { width: 844, height: 390 }, { miniPct: 250 }], ["667x375-ui250", { width: 667, height: 375 }, { uiPct: 250 }], ["360x640-all250", { width: 360, height: 640 }, { uiPct: 250, miniPct: 250, markPct: 250 }],
  ["932x430", { width: 932, height: 430 }, {}], ["932x430-ui250", { width: 932, height: 430 }, { uiPct: 250 }]];   // a large phone in landscape: wider than the old 900-px stack limit (#160)
for (const [name, viewport, settings] of PHONES) {
  const { ctx, page } = await open(SAVE(), { viewport, mobile: true, settings });
  await sea(page);
  await sleep(500);
  const lay = await page.evaluate(() => {
    const vis = el => { if (!el) return null; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== "none" && !el.hidden && r.width > 0 ? r : null; };
    const me = vis(document.getElementById("abilityBtn")), out = { me: me && { l: me.left, t: me.top, r: me.right, b: me.bottom }, hits: [], dev: device, ts: !!vis(document.getElementById("touchSail")) };
    for (const sel of ["#touchSail", "#hint", "#hud .bars", "#hud .side", "#mini", "#lv", "#coach", "#pauseBtn", "#bossBar", "#homeChip"]) {   // not the passing toasts (they draw over it, and take no input)
      const r = vis(document.querySelector(sel)); if (!r || !me) continue;
      const w = Math.min(r.right, me.right) - Math.max(r.left, me.left), h = Math.min(r.bottom, me.bottom) - Math.max(r.top, me.top);
      if (w > 1 && h > 1) out.hits.push(sel);
    }
    out.inside = !!me && me.left >= 0 && me.top >= 0 && me.right <= innerWidth && me.bottom <= innerHeight;
    return out;
  });
  check(lay.dev === "touch" && lay.ts, `${name}: a touch screen, the sail buttons are up`, lay);
  check(!!lay.me && lay.inside, `${name}: the ability button is on the screen`, lay.me);
  check(lay.hits.length === 0, `${name}: it overlaps nothing (sail buttons, hint, bars, chart column)`, lay.hits);
  // a bounty captain close by: the boss bar stacks clear of the button and the sail pad (js/hud-stack.js, #160); the button stays where it was
  const i = await foe(page, 260, -60, { boss: await page.evaluate(() => BOUNTIES[0].id) });
  await page.evaluate(i => { bossShip = window.__foes[i]; }, i);
  await sleep(600);
  const bb = await page.evaluate(() => {
    const r = sel => { const el = document.querySelector(sel); return el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null; };
    const me = r("#abilityBtn"), bar = r("#bossBar"), pad = r("#touchSail"), hit = (a, b) => !!a && !!b && stackHit(a, b);   // the game's own overlap test (js/hud-stack.js)
    return { bar: !!bar, me: me && [me.left, me.top], hitMe: hit(bar, me), hitPad: hit(bar, pad), onScreen: !!bar && bar.top >= 0 };
  });
  check(bb.bar && !bb.hitMe && !bb.hitPad && bb.onScreen, `${name}: the boss bar shows clear of the ability button and the sail pad`, bb);
  check(bb.me && Math.abs(bb.me[0] - lay.me.l) < 1 && Math.abs(bb.me[1] - lay.me.t) < 1, `${name}: the button keeps its spot (the bar gives way, not the button)`, { before: lay.me, now: bb.me });
  await shot(page, `phone-${name}-boss.png`);
  await page.evaluate(i => { const e = window.__foes[i]; bossShip = null; e.alive = false; e.spr.destroy(); e.badge && e.badge.destroy(); enemies.splice(enemies.indexOf(e), 1); }, i);
  await sleep(300);
  const b = await btn(page);
  check(b.key === "", `${name}: no key badge on a touch screen`, b);
  await shot(page, `phone-${name}-ready.png`);
  const c = await page.evaluate(() => { const r = document.getElementById("abilityBtn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(c.x, c.y); await sleep(200);
  const k = await page.evaluate(() => ({ kegs: kegs.length, joy: joyVec.m }));
  check(k.kegs === 1 && k.joy === 0, `${name}: a tap on the button drops a keg (and never moves the stick)`, k);
  await shot(page, `phone-${name}-cooling.png`);
  await ctx.close();
}

await browser.close();
check(errors.length === 0, "0 page errors", errors.slice(0, 5));
console.log(fails.length ? `\n${fails.length} check(s) FAILED` : "\nAll ability checks passed.");
process.exit(fails.length ? 1 : 0);
