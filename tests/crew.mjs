// The crew (#66, js/crew.js, js/crew-ui.js) in headless Chrome: hire from the ledger's Crew page with gold, send one ashore and back, the gunner's
// shorter reload and the navigator's speed measured on the live flagship at sea (the navigator by the speed the ship really reaches), sinking hurts
// the crew aboard (and only them) and they come back to their seats after three sorties, a smaller hull sends the extras ashore, and the page is usable
// on a phone in portrait and landscape (no sideways scroll, finger-sized buttons, a tap hires). Screenshots of the page in English and Chinese,
// desktop and phone, go to the out dir. 0 page errors. The pure rules are in tests/unit-crew.mjs.
// Usage: node tests/crew.mjs [url] [outDir]   (serve the repo first, e.g. `npm run serve`)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/crew";
mkdirSync(out, { recursive: true });
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`); if (!ok) fails.push(what); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));
const G = (g, n = 1) => Array.from({ length: n }, () => ({ g, lv: 1 }));
// A brig (3 seats) with 3000 gold, and a fixed pool: a gunner, a navigator, a carpenter (poolAt 0 = this sortie count, so it is not redrawn).
const POOL = [{ role: "gunner", n: 1 }, { role: "navigator", n: 2 }, { role: "carpenter", n: 3 }];
const SAVE = o => JSON.stringify({ v: 2, gold: 3000, ship: "brig", hull: 1, sails: 1, hold: 1, bow: G("six"), left: G("six", 3), right: G("six", 3),
  stern: [], store: [], sunk: 30, wrecks: [], salvage: [], seed: 424242, tutorialDone: true, escortGift: "had", crew: { list: [], pool: POOL, poolAt: 0, seq: 0 }, ...o });
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function open(save, { viewport = { width: 1280, height: 720 }, mobile = false, lang = "en" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await ctx.addInitScript(([s, lang]) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", lang); localStorage.setItem("privateers-save-v2", s);
    localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false }));
  }, [save, lang]);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && S.sys.isActive() && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked && document.querySelector("#crew .item"), null, { timeout: 15000 * SLOW });
  await sleep(700);   // a freshly opened ledger ignores shop clicks for a moment (js/menu.js)
  return { ctx, page };
}
const crew = page => page.evaluate(() => ({ gold: save.gold, list: save.crew.list.map(c => ({ id: c.id, role: c.role, on: c.on, rest: c.rest })), pool: save.crew.pool.length,
  aboard: crewAboard().map(c => c.role), interval: player.guns.left[0].interval, maxSpeed: player.maxSpeed }));
const click = (page, sel) => page.evaluate(sel => { const b = document.querySelector(sel); if (!b || b.disabled) return false; b.click(); return true; }, sel);
const hireBtn = (role) => `#crew .crew-p:nth-child(${POOL.findIndex(p => p.role === role) + 1}) [data-act="crewHire"]`;
// Hiring takes two taps (#161): the first only arms the button ("Confirm · N gold"), the second pays. twoTap ignores a second tap inside 400 ms.
async function hire(page, sel) {
  const before = await page.evaluate(() => save.gold);
  if (!(await click(page, sel))) return false;
  await sleep(500);
  const armed = await page.evaluate(sel => { const b = document.querySelector(sel); return { gold: save.gold, armed: !!b && b.hasAttribute("data-armed"), txt: b ? b.textContent : "" }; }, sel);
  check(armed.gold === before && armed.armed && /^Confirm · [\d,]+ gold$|^確認 [\d,]+ 金$/.test(armed.txt), "the first tap on Hire only arms it", armed);
  return click(page, sel);
}
const shoot = (page, name) => page.locator("#crewSec").screenshot({ path: join(out, name) });
// Out to sea on calm, open water: no AI, fair weather, the flagship stopped.
async function sea(page) {
  await page.evaluate(() => setSail());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
  await page.evaluate(() => {
    window.think = () => {}; window.spawnEnemy = () => null; managePopulation = () => {};
    wx.on = false; dis.live = []; dis.plan = [];
    for (const s of enemies.slice()) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); }
    let at = null;
    for (let y = 1200; y < 7000 && !at; y += 250) for (let x = 1200; x < 7000 && !at; x += 250) {
      const d = Math.hypot(x - PORT.x, y - PORT.y);
      if (d > SAFE_R + 900 && islands.every(i => Math.hypot(i.x - x, i.y - y) > i.r + 450)) at = { x, y };
    }
    Object.assign(player, { x: at.x, y: at.y, rot: 0, speed: 0, vx: 0, vy: 0, cvx: 0, cvy: 0, hp: player.maxHp });
    setSailLevel(0);
  });
}
// The speed the ship really reaches at full sail on a calm sea, sailing in a straight line (pinned back to the start so no island is reached).
async function topSpeed(page) {
  await page.evaluate(() => {
    window.__pinAt = { x: player.x, y: player.y };
    if (!window.__pinHook) { window.__pinHook = true; onHook("frame", () => { const at = window.__pinAt; if (at) { player.x = at.x; player.y = at.y; player.rot = 0; } }); }
    player.speed = 0; setSailLevel(3);
  });
  await sleep(7000);
  return page.evaluate(() => { const v = player.speed; setSailLevel(0); window.__pinAt = null; return v; });
}

// 1. Hire with gold, the bonus on the flagship, ashore and back, at sea: reload and speed.
{
  const { ctx, page } = await open(SAVE());
  let c = await crew(page);
  check(c.list.length === 0 && c.pool === 3, "the Crew page lists three recruits and no crew", c);
  await shoot(page, "desktop-en-recruits.png");
  const base = c;
  check(await hire(page, hireBtn("gunner")), "the gunner's Hire button is enabled");
  await sleep(150);
  c = await crew(page);
  check(c.gold === 2800 && c.list.length === 1 && c.list[0].role === "gunner" && c.list[0].on, "hired for 200 gold, aboard at once", c);
  check(Math.abs(base.interval / c.interval - 1.08) < 1e-6, "the gunner shortens the flagship's reload by 8% (interval / 1.08)", { before: base.interval, after: c.interval });
  // a tap anywhere else puts an armed Hire down
  await click(page, `#crew .crew-p:nth-child(1) [data-act="crewHire"]`); await sleep(500);
  await page.evaluate(() => document.querySelector("#crew .crew-seats").click()); await sleep(200);
  const down = await page.evaluate(() => ({ gold: save.gold, armed: !!document.querySelector('#crew [data-armed]') }));
  check(down.gold === 2800 && !down.armed, "a tap elsewhere puts the armed Hire down, nothing paid", down);
  check(await hire(page, hireBtn("navigator").replace(/nth-child\(\d\)/, "nth-child(1)")), "the navigator's Hire button (now first in the pool)");
  await sleep(150);
  c = await crew(page);
  check(c.gold === 2500 && c.list.length === 2, "the second hire costs 300", c);
  check(Math.abs(c.maxSpeed / base.maxSpeed - 1.03) < 1e-6, "the navigator adds 3% top speed", { before: base.maxSpeed, after: c.maxSpeed });
  const txt = await page.evaluate(() => document.getElementById("crew").innerText);
  check(/Aboard 2 \/ 3/.test(txt) && /Master gunner \(Reload \+8%\)/.test(txt) && /Speed \+3%/.test(txt), "the page says seats 2 / 3 and both bonuses", txt.slice(0, 200));
  await click(page, `#crew [data-crew="0"] [data-act="crewOn"]`); await sleep(150);
  c = await crew(page);
  check(!c.list[0].on && Math.abs(c.interval - base.interval) < 1e-9, "sent ashore: the reload is back to the plain gun's", c.list[0]);
  await click(page, `#crew [data-crew="0"] [data-act="crewOn"]`); await sleep(150);
  c = await crew(page);
  check(c.list[0].on && Math.abs(base.interval / c.interval - 1.08) < 1e-6, "taken aboard again: the bonus is back", c.list[0]);
  await shoot(page, "desktop-en-crew.png");
  // at sea: the live ship has the gunner's reload and reaches the navigator's speed
  await sea(page);
  const atSea = await crew(page);
  check(Math.abs(base.interval / atSea.interval - 1.08) < 1e-6, "at sea: the flagship's guns reload 8% faster", { interval: atSea.interval });
  const v1 = await topSpeed(page);
  await page.evaluate(() => { save = crewSetOn(save, 1, false); applyPlayerStats(false); });
  const v0 = await topSpeed(page);
  check(Math.abs(v1 / v0 - 1.03) < 0.01, "at sea: full sail with the navigator really goes ~3% faster", { with: v1, without: v0 });
  await page.evaluate(() => { save = crewSetOn(save, 1, true); applyPlayerStats(false); });
  // the surgeon (#161): a fire on the flagship burns BURN_T without one, 20% shorter with an able one aboard
  const burnT = await page.evaluate(() => {
    const out = [];
    for (const on of [false, true]) {
      save = { ...save, crew: { ...save.crew, list: on ? [...save.crew.list, { id: 8, role: "surgeon", gr: 1, n: 4, on: true, rest: 0 }] : save.crew.list } };
      player.burnT = 0; addBurn(player, 1, null); out.push(player.burns[0].t, player.burnT); player.burnT = 0; tickStatus(player, 0);
    }
    save = { ...save, crew: { ...save.crew, list: save.crew.list.filter(c => c.id !== 8) } };
    return out;
  });
  check(Math.abs(burnT[0] - 4) < 1e-9 && Math.abs(burnT[2] - 3.2) < 1e-9 && burnT[3] === burnT[2], "a surgeon aboard: a fire on the flagship burns 3.2 s, not 4", burnT);

  // 2. Sinking: the two aboard are hurt; a third member ashore is not; they come back after three sorties.
  await page.evaluate(() => { save = { ...save, crew: { ...save.crew, list: [...save.crew.list, { id: 9, role: "surgeon", gr: 1, n: 5, on: false, rest: 0 }], seq: 10 } }; });
  await page.evaluate(() => sink(player, null));
  await page.waitForFunction(() => docked, null, { timeout: 10000 * SLOW });
  await sleep(200);
  c = await crew(page);
  const hurt = c.list.filter(m => m.rest === 3 && !m.on).map(m => m.role);
  check(hurt.length === 2 && hurt.includes("gunner") && hurt.includes("navigator"), "sunk: the gunner and navigator aboard are hurt for 3 sorties", c.list);
  check(c.list.find(m => m.role === "surgeon").rest === 0 && c.list.length === 3, "the surgeon ashore is fine, nobody is lost", c.list);
  check(Math.abs(c.interval - base.interval) < 1e-9 && c.aboard.length === 0, "no bonus while they rest", c);
  const t2 = await page.evaluate(() => document.getElementById("crew").innerText);
  check(/Hurt when the ship went down/.test(t2) && /back after 3 more sortie/.test(t2), "the page says who was hurt and when they are back", t2.slice(0, 300));
  await sleep(700);
  check(!(await click(page, `#crew [data-crew="0"] [data-act="crewOn"]`)), "a hurt member's button is disabled");
  await shoot(page, "desktop-en-hurt.png");
  const rests = [];
  // out and straight back (under CREW_REST_SEA_S at sea): the rest doesn't go down (#161)
  await page.evaluate(() => setSail());
  await page.waitForFunction(() => !docked, null, { timeout: 10000 * SLOW });
  await page.evaluate(() => dock("return"));
  await page.waitForFunction(() => docked, null, { timeout: 10000 * SLOW });
  c = await crew(page);
  check(c.list.filter(m => m.role !== "surgeon").every(m => m.rest === 3), "a sortie straight back to port doesn't count toward the rest", c.list);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => setSail());
    await page.waitForFunction(() => !docked, null, { timeout: 10000 * SLOW });
    rests.push(await page.evaluate(() => crewAboard().map(c => c.role).join("+") || "-"));
    await page.evaluate(() => { crewSailAt = gameClock - CREW_REST_SEA_S; dock("return"); });   // a full minute at sea, without waiting one
    await page.waitForFunction(() => docked, null, { timeout: 10000 * SLOW });
  }
  c = await crew(page);
  check(rests.every(r => r === "-"), "the hurt sit out all three sorties", rests);
  check(c.list.filter(m => m.role !== "surgeon").every(m => m.rest === 0 && m.on) && Math.abs(base.interval / c.interval - 1.08) < 1e-6, "after three sorties they are back aboard and the bonus with them", c.list);
  const t3 = await page.evaluate(() => document.getElementById("crew").innerText);
  check(/Back on duty/.test(t3), "the page says they are back on duty", t3.slice(0, 300));
  check(c.pool === 3, "each return drew a new pool of three", c.pool);

  // 3. A smaller hull: a sloop seats two; the third goes ashore but stays on the roster.
  await page.evaluate(() => { save = crewSetOn(save, 9, true); applyPlayerStats(true); renderPort(); });
  await page.evaluate(() => { save = { ...save, ship: "sloop" }; renderPort(); });
  c = await crew(page);
  check(c.list.length === 3 && c.list.filter(m => m.on).length === 2 && !c.list[2].on, "on a sloop: two aboard, the last one ashore and still on the roster", c.list);
  await ctx.close();
}

// 4. Chinese and the phone: no sideways scroll, finger-sized buttons, a tap hires.
for (const [name, vp, lang] of [["desktop-zh", { width: 1280, height: 720 }, "zh"], ["phone-portrait-en", { width: 390, height: 844 }, "en"], ["phone-portrait-zh", { width: 390, height: 844 }, "zh"],
  ["phone-landscape-en", { width: 844, height: 390 }, "en"], ["phone-landscape-zh", { width: 844, height: 390 }, "zh"]]) {
  const mobile = name.startsWith("phone");
  const { ctx, page } = await open(SAVE({ crew: { list: [{ id: 0, role: "surgeon", gr: 2, n: 7, on: true, rest: 0 }, { id: 1, role: "carpenter", gr: 1, n: 8, on: false, rest: 2 }], pool: POOL, poolAt: 0, seq: 2 } }), { viewport: vp, mobile, lang });
  await page.evaluate(() => document.getElementById("crewSec").scrollIntoView({ block: "start" }));
  await sleep(200);
  const lay = await page.evaluate(() => {
    const sheet = document.querySelector("#port .sheet"), btns = [...document.querySelectorAll("#crew button")].map(b => b.getBoundingClientRect());
    return { over: sheet.scrollWidth - sheet.clientWidth, docOver: document.documentElement.scrollWidth - innerWidth, n: btns.length,
      small: btns.filter(r => r.height < 32).length, outside: btns.filter(r => r.left < 0 || r.right > innerWidth + 0.5).length, txt: document.getElementById("crew").innerText.slice(0, 80) };
  });
  check(lay.over <= 0 && lay.docOver <= 0, `${name}: no sideways scroll`, lay);
  check(lay.n >= 5 && lay.small === 0 && lay.outside === 0, `${name}: every crew button is finger-sized and on screen`, lay);
  if (lang === "zh") check(/船上 1 \/ 3/.test(lay.txt), `${name}: the page is in Chinese`, lay.txt);
  // what the player sees: the page's top, then scrolled on to the recruits (an element shot would be cut by the sheet's own scroll)
  await page.screenshot({ path: join(out, `${name}.png`) });
  await page.evaluate(() => document.querySelector("#crew .crew-pool").scrollIntoView({ block: "end" }));
  await sleep(150);
  await page.screenshot({ path: join(out, `${name}-recruits.png`) });
  if (mobile) {
    const b = await page.locator(`#crew [data-act="crewHire"]`).first();
    await b.scrollIntoViewIfNeeded();
    await b.tap();
    await sleep(500);
    const armed = await crew(page);
    await page.locator(`#crew [data-act="crewHire"][data-armed]`).tap();
    await sleep(200);
    const c = await crew(page);
    check(armed.list.length === 2 && armed.gold === 3000 && c.list.length === 3 && c.gold === 3000 - 400, `${name}: two taps hire (the third costs 400)`, { armed: armed.gold, n: c.list.length, gold: c.gold });
  }
  await ctx.close();
}

await browser.close();
check(errors.length === 0, "0 page errors", errors.slice(0, 5));
console.log(fails.length ? `\n${fails.length} check(s) FAILED` : "\nAll crew checks passed.");
process.exit(fails.length ? 1 : 0);
