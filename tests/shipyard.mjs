// Shipyard checks in headless Chrome (js/shipyard.js): buy a second ship, switch back and find the first one's upgrades
// intact, buy the same model twice, the list in both languages, a reload keeps the yard.
// Usage: node tests/shipyard.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/shipyard";
mkdirSync(out, { recursive: true });
const fails = [], errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg);  };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const G = g => ({ g, lv: 1 });
const SAVE = JSON.stringify({ v: 2, gold: 99999, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: [G("six")], left: [G("six")], right: [G("six")],
  stern: [], store: [], sunk: 0, wrecks: [], salvage: [], seed: 424242, tutorialDone: true,
  campaign: { bounty: 4, ships: ["sloop", "schooner", "brig", "frigate", "line"], deaths: 0 } });

const ready = async page => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(500 * SLOW);   // shop buttons ignore clicks for a moment after the ledger opens (js/menu.js)
};
async function open(lang = "en") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await ready(page);
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); localStorage.setItem("privateers-save-v2", s); }, [lang, SAVE]);
  await page.reload({ waitUntil: "load" });
  await ready(page);
  return { ctx, page };
}
const snap = page => page.evaluate(() => ({ gold: save.gold, ship: save.ship, id: save.shipId, hull: save.hull, sails: save.sails, hold: save.hold, fleet: save.fleet,
  items: [...document.querySelectorAll("#ships .item")].map(el => ({ nm: el.querySelector(".nm").textContent, btn: el.querySelector(".btn").textContent, act: el.querySelector(".btn").dataset.act })),
  msg: document.getElementById("pMsg").textContent }));
const buy = async (page, id) => {   // two taps: arm, then confirm
  await page.click(`#ships [data-act="ship"][data-id="${id}"]`); await page.waitForTimeout(500 * SLOW);
  await page.click(`#ships [data-act="ship"][data-id="${id}"]`); await page.waitForTimeout(200 * SLOW);
};

{
  const { ctx, page } = await open();
  const heading = await page.evaluate(() => document.querySelector("#ships").closest("section").querySelector("h2").textContent);
  check(heading === "Switch ship", `ledger section is titled "${heading}"`);
  const hint = await page.evaluate(() => document.querySelector("#ships").closest("section").querySelector(".hint-s").textContent);
  check(!/60%|Lv 1 again|start again/i.test(hint), "the trade-in / reset text is gone from the hint");

  check(await page.evaluate(() => !document.querySelector('#ships [data-act="ship"][data-id="sloop"]')), "the free sloop is not for sale");
  await page.click('#yard [data-act="yard"][data-k="hull"]'); await page.waitForTimeout(200 * SLOW);   // sloop hull Lv 2
  let s = await snap(page);
  check(s.hull === 2 && s.fleet.length === 0, "sloop hull upgraded to Lv 2, yard has no parked ships");
  const goldBefore = s.gold;

  await buy(page, "schooner");
  s = await snap(page);
  check(s.ship === "schooner" && s.hull === 1 && s.id === "s2", `bought schooner, sails it at Lv 1 (${s.ship} hull ${s.hull})`);
  check(s.fleet.length === 1 && s.fleet[0].ship === "sloop" && s.fleet[0].hull === 2, "the sloop stays in the yard with its hull Lv 2");
  const cost = await page.evaluate(() => SHIPS.schooner.cost);
  check(goldBefore - s.gold === cost, `schooner cost its full price, no trade-in (${goldBefore - s.gold} of ${cost})`);
  check(!/yard paid|trade-in/i.test(s.msg) && /schooner/i.test(s.msg), `message: "${s.msg}"`);
  check(s.items.filter(i => i.act === "switch").length === 1, "one ship to switch to in the list");

  const gold2 = s.gold;
  await page.click('#ships [data-act="switch"]'); await page.waitForTimeout(200 * SLOW);
  s = await snap(page);
  check(s.ship === "sloop" && s.id === "s1" && s.hull === 2, `switched back to the sloop: hull still Lv ${s.hull}`);
  check(s.gold === gold2, "switching is free");
  check(s.fleet.length === 1 && s.fleet[0].ship === "schooner", "the schooner waits in the yard");
  check(/sloop/i.test(s.msg), `message: "${s.msg}"`);
  const hudHull = await page.evaluate(() => player.maxHp === yardVal("hull"));
  check(hudHull, "player stats follow the switched ship");

  // the same model twice
  await buy(page, "brig"); await buy(page, "brig");
  s = await snap(page);
  const brigs = s.fleet.filter(e => e.ship === "brig").length + (s.ship === "brig" ? 1 : 0);
  check(brigs === 2 && s.fleet.length === 3 && s.ship === "brig", `bought a second brig: ${brigs} brigs, ${s.fleet.length + 1} ships in all`);
  check(new Set([s.id, ...s.fleet.map(e => e.id)]).size === 4, "every ship has its own id");
  check(s.items.some(i => /Brig #\d/i.test(i.nm)), `same-model ships are told apart: ${s.items.slice(0, 4).map(i => i.nm).join(" | ")}`);
  await page.screenshot({ path: join(out, "desktop-en-ships.png") });

  await page.reload({ waitUntil: "load" }); await ready(page);
  const r = await snap(page);
  check(r.fleet.length === 3 && r.id === s.id, "a reload keeps the whole yard");
  await ctx.close();
}
{
  const { ctx, page } = await open("zh");
  const heading = await page.evaluate(() => document.querySelector("#ships").closest("section").querySelector("h2").textContent);
  check(heading === "換船", `zh heading "${heading}"`);
  await buy(page, "schooner");
  const s = await snap(page);
  check(/舊船留在船塢/.test(s.msg) && s.items.some(i => i.btn === "換上"), `zh message and switch button: "${s.msg.slice(0, 30)}"`);
  await ctx.close();
}
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
