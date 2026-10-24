// Phase 1 additions in a real browser (#33 letter of marque, #34 gun bay, #40 edge markers, #41 AI at outposts, #42 chart marks).
// The pure logic is in tests/unit-phase1b.mjs.
// Usage: node tests/phase1b.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/phase1b";
mkdirSync(out, { recursive: true });
const SLOW = +process.env.TEST_SLOW || 1;   // CI runners render without a GPU: stretch every wait
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let failed = 0;
const ok = (name, pass, info) => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

// A fresh game at sea (English, tutorial done), every ship the sea spawns parked in a corner unless a test marks it `mine`.
async function openSea(viewport, { mobile = false, seed = {} } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.click("[data-smoke=start]");
  await page.waitForTimeout(500 * SLOW);
  await page.evaluate(() => { if (docked) setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await ev(page, () => {
    save.tutorialDone = true; tutorialReset();
    player.x = PORT.x + 1500; player.y = PORT.y; player.speed = 0; moved = true;
    for (const e of enemies) { e.x = 200; e.y = 200; }
    window.__calm = setInterval(() => { for (const e of enemies) if (!e.mine && !(e.angry > 5)) { e.x = 200; e.y = 200; } }, 40);
  });
  await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 * SLOW });
  return { ctx, page };
}

// ---------- #41: AI ships near the outpost and the harbor keep moving and leave ----------
// Each ship starts 600 px out, heading for a wander point on the very hulk / the harbor island. Before the fix it crawled along
// the rim at about a tenth of its speed until the next wander roll.
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const runs = await ev(page, async scale => {
    save.campaign.outpost = true; syncOutpost();
    const sample = async (e, goal, secs) => {
      const tr = [];
      for (let i = 0; i < secs * 4; i++) {
        await new Promise(r => setTimeout(r, 250 * scale));
        tr.push({ d: Math.hypot(e.x - goal.x, e.y - goal.y), v: e.speed / e.maxSpeed, alive: e.alive });
      }
      return tr;
    };
    const res = [];
    for (const [name, goal, offs] of [["outpost", OUTPOST, [[-600, 0], [0, -600], [0, 600], [600, 0]]], ["port", PORT, [[700, 0], [0, 700]]]])
      for (const [cls, faction] of [["brig", "pirate"], ["manowar", "navy"], ["fluyt", "merchant"]])
        for (const [dx, dy] of offs) {
          const e = makeEnemy(S, goal.x + dx, goal.y + dy, 6, faction, cls); e.mine = true;
          e.rot = Math.atan2(-dy, -dx); e.wander = { x: goal.x, y: goal.y }; e.thinkT = 8;
          // the sea must not hand it a target: the player is far away and the other ships are parked
          const tr = await sample(e, goal, 10);
          res.push({ name, cls, dx, dy, alive: tr.every(p => p.alive), meanV: tr.reduce((a, p) => a + p.v, 0) / tr.length,
            minD: Math.min(...tr.map(p => p.d)), endD: tr.at(-1).d });
          e.alive = false; e.spr.setVisible(false); e.x = e.y = 200;
        }
    return res;
  }, SLOW);
  const bad = runs.filter(r => r.alive && (r.meanV < 0.4 || r.minD < (r.name === "outpost" ? 62 : 110)));
  ok(`#41 ${runs.length} AI ships sent at the outpost / harbor keep sailing (mean speed >= 40%) and never sit on the hulk`, bad.length === 0, bad);
  const stay = runs.filter(r => r.alive && r.name === "outpost" && r.endD < 130);
  ok("#41 every ship near the outpost is clear of the hulk after 10 s", stay.length === 0, stay);
  const sea = await ev(page, () => ({ truce: inTruce({ x: OUTPOST.x + 100, y: OUTPOST.y }), safe: inSafe({ x: PORT.x + 100, y: PORT.y }) }));
  ok("#41 truce and harbor zones are still safe for the player", sea.truce && sea.safe, sea);
  await ctx.close();
}

// A fresh game left in the harbor ledger (English), with gold to spend.
async function openHarbor(viewport, { mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear(); localStorage.setItem("privateers-lang", "en");
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 15000 * SLOW });
  await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) { tutorialReset(); dock("welcome"); } });
  await page.waitForFunction(() => docked && document.querySelector("#deck [data-act=slot]"), null, { timeout: 8000 * SLOW });
  await page.waitForTimeout(450 * SLOW);   // the ledger's fade-in
  return { ctx, page };
}

// ---------- #34: gun bay, Swap position ----------
for (const [tag, viewport, mobile] of [["desktop", { width: 1280, height: 720 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const { ctx, page } = await openHarbor(viewport, { mobile });
  await ev(page, () => { save.gold = 20000; save.bow = [gunItem("six", 1), gunItem("long12", 3)]; save.store = [gunItem("chain", 1)]; deckSel = null; swapping = false; renderPort(); });
  const bow = () => ev(page, () => save.bow.map(x => x && x.g + x.lv).join(","));
  const slot = i => `#deck [data-act="slot"][data-side="bow"][data-i="${i}"]`;
  await page.locator(slot(0)).scrollIntoViewIfNeeded();
  await page.click(slot(0));
  ok(`#34 ${tag}: picking a gun shows a Swap position button and the next-level upgrade label`, await ev(page, () =>
    !!document.querySelector('#gunSel [data-act="swap"]') && /^Upgrade to Lv 2 \(\d/.test(document.querySelector('#gunSel [data-act="gup"]').textContent)));
  await page.click(slot(1));
  ok(`#34 ${tag}: tapping a second port without Swap position moves the pick and swaps nothing`, (await bow()) === "six1,long123" && await ev(page, () => deckSel.i === 1));
  await page.click(slot(1));   // picked again: drops the pick
  await page.click(slot(0));
  await page.click('#gunSel [data-act="swap"]');
  const mid = await ev(page, () => ({ on: swapping, cls: document.getElementById("port").classList.contains("swapping"),
    pressed: document.querySelector('#gunSel [data-act="swap"]').getAttribute("aria-pressed"), focus: document.activeElement.dataset.act,
    hint: document.querySelector("#gunSel .hint-s").textContent }));
  ok(`#34 ${tag}: Swap position lights the other places, shows a hint and keeps focus on the button`, mid.on && mid.cls && mid.pressed === "true" && mid.focus === "swap" && /Esc cancels/.test(mid.hint), mid);
  await page.screenshot({ path: join(out, `gunbay-swapping-${tag}.png`) });
  await page.keyboard.press("Escape");
  const esc = await ev(page, () => ({ on: swapping, sel: !!deckSel, focus: document.activeElement.dataset.act }));
  ok(`#34 ${tag}: Esc calls the swap off, the gun stays picked and nothing moves`, !esc.on && esc.sel && esc.focus === "swap" && (await bow()) === "six1,long123", esc);
  await page.click('#gunSel [data-act="swap"]'); await page.click('#gunSel [data-act="swap"]');
  ok(`#34 ${tag}: pressing Swap position twice also cancels`, !(await ev(page, () => swapping)));
  await page.click('#gunSel [data-act="swap"]');
  await page.click(slot(1));
  ok(`#34 ${tag}: Swap position then another port swaps the two guns, and the swap ends`, (await bow()) === "long123,six1" && !(await ev(page, () => swapping || !!deckSel)));
  // keyboard only: focus the stored gun, Enter, Tab to Swap position, Enter, then Enter on a port
  await page.focus('#bay [data-act="store"]'); await page.keyboard.press("Enter");
  await page.focus('#gunSel [data-act="swap"]'); await page.keyboard.press("Enter");
  await page.focus(slot(0)); await page.keyboard.press("Enter");
  ok(`#34 ${tag}: keyboard (Enter) can pick, press Swap position and swap with the store`, (await bow()) === "chain1,six1" && await ev(page, () => save.store[0].g === "long12" && save.store[0].lv === 3), await bow());
  // upgrade label: money short, enough, maxed
  const lbl = await ev(page, () => {
    const out = {};
    deckSel = { side: "bow", i: 1 }; save.gold = 5; renderPort();
    const b = document.querySelector('#gunSel [data-act="gup"]'); out.short = [b.textContent, b.disabled];
    save.gold = 99999; renderPort(); const c = document.querySelector('#gunSel [data-act="gup"]'); out.enough = [c.textContent, c.disabled];
    save.bow[1] = gunItem("six", GUN_MAX); renderPort(); const d = document.querySelector('#gunSel .btn.max'); out.max = [d?.textContent, d?.disabled];
    return out;
  });
  ok(`#34 ${tag}: the upgrade button shows the price, the shortfall when poor, and "Max level" (disabled) at Lv ${10}`,
    /^Upgrade to Lv 2 \(\d[\d,]* gold, \d[\d,]* short\)$/.test(lbl.short[0]) && lbl.short[1] && /^Upgrade to Lv 2 \(\d[\d,]* gold\)$/.test(lbl.enough[0]) && !lbl.enough[1] && lbl.max[0] === "Max level" && lbl.max[1], lbl);
  // Chinese strings
  await ev(page, () => { lang = "zh"; applyLang(); deckSel = { side: "bow", i: 0 }; swapping = false; renderPort(); });
  const zh = await ev(page, () => ({ swap: document.querySelector('#gunSel [data-act="swap"]').textContent, up: document.querySelector('#gunSel [data-act="gup"]').textContent }));
  ok(`#34 ${tag}: Chinese labels`, zh.swap === "切換砲位" && /^升級到 Lv \d（[\d,]+ 金幣/.test(zh.up), zh);
  await page.screenshot({ path: join(out, `gunbay-card-${tag}-zh.png`) });
  await ctx.close();
}

ok("no page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall phase 1b checks passed");
