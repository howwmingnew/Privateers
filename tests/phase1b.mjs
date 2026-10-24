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

// ---------- #33: letter of marque poster: red level warning and the captain's ship ----------
for (const [tag, viewport, mobile] of [["desktop", { width: 1280, height: 720 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const { ctx, page } = await openHarbor(viewport, { mobile });
  const poster = () => ev(page, () => {
    const el = document.querySelector("#wanted .p-rec"), warn = el.querySelector(".warn"), cs = getComputedStyle(el.querySelector(".goal"));
    const lum = rgb => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bg = getComputedStyle(document.querySelector("#wanted .poster")).backgroundColor, a = lum(cs.color), b = lum(bg);
    return { low: el.classList.contains("low"), warn: warn ? warn.textContent : null, warnVisible: !!warn && warn.getBoundingClientRect().height > 0,
      color: cs.color, ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2), need: bountyRecLv(activeBounty()), me: shipRating() };
  });
  await ev(page, () => { renderPort(); });
  const low = await poster();
  ok(`#33 ${tag}: a captain under the asked ship level sees the red line and the "level up" sentence (contrast >= 4.5)`,
    low.me < low.need && low.low && low.warn === "Level up before you sail" && low.warnVisible && low.ratio >= 4.5, low);
  await page.locator("#wanted").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, `poster-low-${tag}.png`) });
  // level up: the same poster, reopened, is back to its normal colour with no warning
  const up = await ev(page, () => { const real = shipRating; shipRating = () => 99; try { renderPort(); } finally { shipRating = real; }
    const el = document.querySelector("#wanted .p-rec"); return { low: el.classList.contains("low"), warn: !!el.querySelector(".warn"), ok: el.querySelector(".goal").classList.contains("ok") }; });
  ok(`#33 ${tag}: at the asked level the warning is gone and the goal shows as ready`, !up.low && !up.warn && up.ok, up);
  // all five captains: their own hull and livery are painted (non-empty, all different) and each class is the bounty's own
  const all = await ev(page, () => BOUNTIES.map((b, i) => { save.campaign.bounty = i; renderPort();
    const cv = document.querySelector("#wanted .p-ship"), px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let k = 3; k < px.length; k += 4) if (px[k] > 0) lit++;
    return { id: b.id, art: artClass(b.cls), livery: bossLivery(b), lit, url: cv.toDataURL().length, sig: cv.toDataURL().slice(-60) }; }));
  ok(`#33 ${tag}: each captain's own hull class and livery is painted on the poster (Carey and St. Ant share a brig, so four different pictures)`,
    all.map(a => a.id).join() === "ned,carey,saint,hale,thorne" && all.every(a => a.lit > 3000) && new Set(all.map(a => a.sig + a.url)).size === 4
      && all.map(a => a.livery).join() === "boss,boss,boss,bossNavy,admiral" && all[4].art === "manowar" && all[0].art === "cutter", all.map(a => ({ ...a, sig: undefined })));
  for (const [i, a] of all.entries()) if (tag === "desktop" || i === 4) {
    await ev(page, i => { save.campaign.bounty = i; renderPort(); }, i);
    await page.locator("#wanted .poster").scrollIntoViewIfNeeded();
    await page.locator("#wanted .poster").screenshot({ path: join(out, `poster-${a.id}-${tag}.png`) });
  }
  // Chinese strings and no horizontal overflow on a phone
  const zh = await ev(page, () => { lang = "zh"; applyLang(); save.campaign.bounty = 0; renderPort(); return { warn: document.querySelector("#wanted .p-rec .warn")?.textContent,
    over: document.documentElement.scrollWidth > innerWidth || document.querySelector("#wanted .poster").scrollWidth > document.querySelector("#wanted").clientWidth + 2 }; });
  ok(`#33 ${tag}: Chinese sentence shown and the poster fits`, zh.warn === "建議先升級再出戰" && !zh.over, zh);
  await ctx.close();
}

ok("no page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall phase 1b checks passed");
