// The bow ram (#149, js/ram.js) in headless Chrome: the ledger row (price, two-tap confirm, gold spent, saved, both languages), an old save has none, the
// ram is drawn on the bow, and the crash damage moves by the coefficients (+50% to the ship the flagship rams, -30% to the flagship from a ship or an island).
// The pure formulas are in tests/unit-ram.mjs.
// Usage: node tests/ram.mjs [url]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [], errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const G = g => ({ g, lv: 1 });
const SAVE = o => JSON.stringify({ v: 2, gold: 1000, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: [G("six")], left: [G("six")], right: [G("six")],
  stern: [], store: [], sunk: 30, wrecks: [], salvage: [], seed: 424242, tutorialDone: true, escortGift: "had", ...o });

const ready = async page => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 20000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(500 * SLOW);   // shop buttons ignore clicks for a moment after the ledger opens (js/menu.js)
};
async function open(save, lang = "en") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); localStorage.setItem("privateers-save-v2", s); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true, shake: false })); }, [lang, save]);
  await page.reload({ waitUntil: "load" });
  await ready(page);
  return { ctx, page };
}
const openHull = page => page.evaluate(() => { if (!hullOpen) { resetLedgerPick(); hullOpen = true; } renderPort(); });
const row = page => page.evaluate(() => { const b = document.querySelector('#ram .btn'), r = document.querySelector("#ramRow");
  return { row: !!r, btn: b ? b.textContent : null, disabled: b ? b.disabled : null, armed: b ? b.hasAttribute("data-armed") : null, text: r ? r.textContent : "",
    gold: save.gold, ram: save.ram, stored: JSON.parse(localStorage.getItem("privateers-save-v2") || "{}").ram, owned: !!document.querySelector("#ram .btn.max") }; });

// 1. buying: the row shows the price and the effect, the first tap only arms, the second buys
{
  const { ctx, page } = await open(SAVE({ gold: 1000 }));
  check(await page.evaluate(() => save.ram === false), "a save without the field loads as having no ram");
  await openHull(page);
  let r = await row(page);
  check(r.row && /Bow ram/.test(r.text) && /\+50%/.test(r.text) && /30%/.test(r.text), `the hull panel has the ram row with its effect: "${r.text.slice(0, 90)}"`);
  check(/450/.test(r.btn) && r.disabled === false, `the button shows the price and is enabled with 1000 gold ("${r.btn}")`);
  check(await page.evaluate(() => RAM_PRICE >= CONFIRM_GOLD), "the price is over the confirm line, so it takes two taps");
  await page.click('#ram [data-act="ram"]'); await page.waitForTimeout(150 * SLOW);
  r = await row(page);
  check(r.gold === 1000 && r.ram === false && r.armed && /Tap again/.test(r.btn), `the first tap only arms it, nothing is spent ("${r.btn}")`);
  await page.click("#pGold"); await page.waitForTimeout(100 * SLOW);   // a tap elsewhere puts the purchase down (and a blank spot also closes the panel)
  check(await page.evaluate(() => armedTap("ramBuy") === false && save.ram === false && save.gold === 1000), "a tap elsewhere disarms it");
  await openHull(page);
  r = await row(page);
  check(!r.armed && /Fit ram/.test(r.btn), "the button is back to its price");
  await page.click('#ram [data-act="ram"]'); await page.waitForTimeout(500 * SLOW);
  await page.click('#ram [data-act="ram"]'); await page.waitForTimeout(250 * SLOW);
  r = await row(page);
  check(r.ram === true && r.gold === 550 && r.owned && r.disabled, `the second tap buys it for 450 (gold ${r.gold}, ram ${r.ram}, button "${r.btn}")`);
  check(r.stored === true, "the purchase is saved");
  check(/bronze ram/.test(await page.evaluate(() => document.getElementById("pMsg").textContent)), "the harbor message says it was fitted");
  await page.reload({ waitUntil: "load" }); await ready(page);
  check(await page.evaluate(() => save.ram === true && save.gold === 550), "a reload keeps the ram and the gold");
  // Ship Lv does not count the ram
  const lv = await page.evaluate(() => { const a = lvProgress(); save.ram = false; const b = lvProgress(); save.ram = true; return [a.lv + ":" + a.pct, b.lv + ":" + b.pct]; });
  check(lv[0] === lv[1], `Ship Lv is the same with and without the ram (${lv[0]})`);
  // the escort tabs have no ram row: it is the flagship's
  await ctx.close();
}

// 2. not enough gold: the button is disabled and says how much is missing
{
  const { ctx, page } = await open(SAVE({ gold: 100 }));
  await openHull(page);
  const r = await row(page);
  check(r.disabled === true && /need 350 more/.test(r.btn), `with 100 gold the button is disabled and names the shortfall ("${r.btn}")`);
  await page.evaluate(() => document.querySelector('#ram [data-act="ram"]').click());
  check(await page.evaluate(() => save.ram === false && save.gold === 100), "a disabled button buys nothing");
  await ctx.close();
}

// 3. Traditional Chinese
{
  const { ctx, page } = await open(SAVE({ gold: 1000 }), "zh");
  await openHull(page);
  const r = await row(page);
  check(/船首撞角/.test(r.text) && /裝上撞角/.test(r.btn) && /450/.test(r.btn), `zh row: "${r.btn}"`);
  await ctx.close();
}

// 4. at sea: the ram is drawn on the bow, the crash damage follows the coefficients
{
  const { ctx, page } = await open(SAVE({ gold: 1000 }));
  await page.evaluate(() => setSail());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 10000 * SLOW });
  await page.evaluate(() => {
    window.think = () => {}; window.spawnEnemy = () => null;
    for (const s of enemies.slice()) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); }
    window.__land = []; const land = crashLand; window.crashLand = (s, dmg, src, ...r) => { window.__land.push({ s, dmg, src }); return land(s, dmg, src, ...r); };
  });
  // Direct blows, so the speed is exact: the flagship at 150 px/s into a still sloop, and into a rock.
  const blow = ram => page.evaluate(ram => {
    save.ram = ram; paused = true;
    const e = makeEnemy(S, 1650, 1500, 5, "pirate", "sloop");
    Object.assign(e, { vx: 0, vy: 0, cvx: 0, cvy: 0, speed: 0, hp: e.maxHp }); e.crashBook = new Map();
    Object.assign(player, { x: 1500, y: 1500, vx: 150, vy: 0, cvx: 150, cvy: 0, hp: player.maxHp, alive: true }); player.crashBook = new Map();
    window.__land.length = 0;
    crashShips(player, e, 1, 0);
    const f = o => { const l = window.__land.find(x => x.s === o); return l ? l.dmg : 0; };
    const ship = { pl: f(player), en: f(e), plMax: player.maxHp, enMax: e.maxHp };
    e.alive = false; e.spr.destroy(); e.badge && e.badge.destroy(); enemies.splice(enemies.indexOf(e), 1);
    const isl = islands.find(i => !i.harbor && !i.outpost);
    player.crashBook = new Map(); player.hp = player.maxHp; window.__land.length = 0;
    player.x = isl.x - isl.r - 5; player.y = isl.y; player.cvx = 150; player.cvy = 0; player.vx = 150; player.vy = 0;
    const was = typeof inSafe === "function" ? inSafe(player) : false;
    crashIsland(player, isl, 1, 0);
    return { ship, rock: f(player), safe: was };
  }, ram);
  const off = await blow(false), on = await blow(true);
  const near = (a, b) => Math.abs(a - b) <= 0.02 * Math.abs(b) + 0.01;
  check(!off.safe, "the test rock is outside the safe waters");
  check(off.ship.pl > 0 && off.ship.en > 0 && off.rock > 0, `without the ram every blow lands (ship: player ${off.ship.pl.toFixed(2)}, enemy ${off.ship.en.toFixed(2)}; rock ${off.rock.toFixed(2)})`);
  check(near(on.ship.en, off.ship.en * 1.5), `the ship the flagship rams takes +50% (${off.ship.en.toFixed(2)} -> ${on.ship.en.toFixed(2)})`);
  check(near(on.ship.pl, off.ship.pl * 0.7), `the flagship takes -30% from ramming a ship (${off.ship.pl.toFixed(2)} -> ${on.ship.pl.toFixed(2)})`);
  check(near(on.rock, off.rock * 0.7), `the flagship takes -30% from an island (${off.rock.toFixed(2)} -> ${on.rock.toFixed(2)})`);
  // the same blow struck the other way round (an AI rams the flagship) also costs the flagship 30% less and the AI 50% more: the ram is the flagship's, whoever moves
  const rev = await page.evaluate(() => {
    const out = [];
    for (const ram of [false, true]) {
      save.ram = ram;
      const e = makeEnemy(S, 1500, 1500, 5, "pirate", "sloop");
      Object.assign(e, { vx: 150, vy: 0, cvx: 150, cvy: 0, hp: e.maxHp }); e.crashBook = new Map();
      Object.assign(player, { x: 1650, y: 1500, vx: 0, vy: 0, cvx: 0, cvy: 0, hp: player.maxHp, alive: true }); player.crashBook = new Map();
      window.__land.length = 0; crashShips(e, player, 1, 0);
      const f = o => { const l = window.__land.find(x => x.s === o); return l ? l.dmg : 0; };
      out.push({ pl: f(player), en: f(e) });
      e.alive = false; e.spr.destroy(); e.badge && e.badge.destroy(); enemies.splice(enemies.indexOf(e), 1);
    }
    return out;
  });
  check(near(rev[1].pl, rev[0].pl * 0.7) && near(rev[1].en, rev[0].en * 1.5), `an AI ramming the flagship: the flagship -30%, the AI +50% (player ${rev[0].pl.toFixed(2)} -> ${rev[1].pl.toFixed(2)}, enemy ${rev[0].en.toFixed(2)} -> ${rev[1].en.toFixed(2)})`);
  // two AI hulls never use it
  const ai = await page.evaluate(() => {
    const out = [];
    for (const ram of [false, true]) {
      save.ram = ram;
      const a = makeEnemy(S, 1500, 1800, 5, "pirate", "sloop"), b = makeEnemy(S, 1650, 1800, 5, "navy", "sloop");
      Object.assign(a, { vx: 150, vy: 0, cvx: 150, cvy: 0, hp: a.maxHp }); Object.assign(b, { vx: 0, vy: 0, cvx: 0, cvy: 0, hp: b.maxHp }); a.crashBook = new Map();
      window.__land.length = 0; crashShips(a, b, 1, 0);
      const f = o => { const l = window.__land.find(x => x.s === o); return l ? l.dmg : 0; };
      out.push([f(a), f(b)]);
      for (const s of [a, b]) { s.alive = false; s.spr.destroy(); s.badge && s.badge.destroy(); enemies.splice(enemies.indexOf(s), 1); }
    }
    return out;
  });
  check(ai[0][0] > 0 && ai[0][0] === ai[1][0] && ai[0][1] === ai[1][1], "two AI hulls take the same blow with or without the flagship's ram");

  // the drawing: a sprite over the flagship's bow, with its own texture, only while the ram is fitted
  await page.evaluate(() => { save.ram = true; paused = false; });
  await page.waitForTimeout(400 * SLOW);
  const art = await page.evaluate(() => ({ tex: S.textures.getTextureKeys().filter(k => k.startsWith("ram:")), on: ramSpr && ramSpr.visible, near: ramSpr && Math.hypot(ramSpr.x - player.spr.x, ramSpr.y - player.spr.y) < 1 && ramSpr.rotation === player.spr.rotation }));
  check(art.tex.length === 1 && art.on && art.near, `the ram is drawn over the flagship's bow (${art.tex.join(",")}, visible ${art.on}, follows the hull ${art.near})`);
  await page.evaluate(() => { save.ram = false; });
  await page.waitForTimeout(200 * SLOW);
  check(await page.evaluate(() => !ramSpr.visible), "without a ram nothing is drawn");
  await ctx.close();
}

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
