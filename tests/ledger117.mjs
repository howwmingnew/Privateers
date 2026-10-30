// Ledger safety and order (#117, #124), in the browser at 1280x720 and on a phone: a gun upgrade and a purchase take a second tap, a bought gun never replaces one,
// the message box and the open panel hold still through an action, an empty port's panel opens on screen, the Wanted poster leads, the sortie card has a title,
// the bulk break-down is apart and armed.
// Usage: node tests/ledger117.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/ledger117";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [], results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`); };
const D = { width: 1280, height: 720 }, M = { width: 390, height: 844 };

async function open(viewport, mobile, tag, lang = "en-US") {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: lang, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "load", timeout: 30000 * SLOW });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("privateers-settings", JSON.stringify({ muted: true })); });   // every test page starts muted
  await page.reload({ waitUntil: "load", timeout: 30000 * SLOW });
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof titleOpen !== "undefined" && titleOpen, null, { timeout: 20000 * SLOW });
  await page.waitForTimeout(300 * SLOW);
  return { ctx, page };
}
// A brigantine (bow 1, larboard 2, starboard 2, stern 1): an epic Long 12 on the bow, one empty larboard port, the rest filled.
async function toLedger(page, full = false) {
  await page.evaluate(full => {
    save = fitMounts({ ...save, ship: "brigantine", gold: 5000 });
    save.bow = [{ ...gunItem("long12", 5), r: 3 }]; save.left = [gunItem("six", 2), full ? gunItem("six", 1) : null]; save.right = [gunItem("six", 1), gunItem("six", 1)]; save.stern = [gunItem("carronade", 1)];
    save.store = [];
    applyPlayerStats(true); titleOpen = false; const ti = document.getElementById("title"); if (ti) ti.hidden = true;
    paused = true; dock("return"); document.getElementById("port").hidden = false;
  }, full);
  await page.waitForTimeout(500 * SLOW);
}
// A real mouse click on the element's centre (scrolled to the middle first when it is out of view, like a thumb would).
async function tap(page, sel) {
  const pt = await page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null;
    const sheet = document.querySelector("#port .sheet").getBoundingClientRect(), r0 = el.getBoundingClientRect();
    if (el.closest("#ctx") || r0.top < sheet.top + 90 || r0.bottom > sheet.bottom - 70) el.scrollIntoView({ block: "center" });   // (a phone's panel scrolls inside itself)
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!pt) throw new Error("no element for " + sel);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(450 * SLOW);   // longer than the 400 ms double-click guard of the two-tap confirm (js/escort-ui.js twoTap): a quick second click is not a confirming tap
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const gold = page => ev(page, () => save.gold);
const deckY = page => ev(page, () => Math.round(document.querySelector("#deck .slot").getBoundingClientRect().top));
const ctxTop = page => ev(page, () => Math.round(document.getElementById("ctx").getBoundingClientRect().top));

for (const [name, vp, mobile] of [["desktop", D, false], ["phone", M, true]]) {
  const { ctx, page } = await open(vp, mobile, name);
  await toLedger(page);
  const sheetOverflow = await ev(page, () => { const s = document.querySelector("#port .sheet"); return s.scrollWidth - s.clientWidth; });
  ok(`${name}: the ledger has no sideways overflow`, sheetOverflow <= 1, sheetOverflow);

  // ---- #124: the Wanted poster leads (above the fleet in one column; in the first screen on a desktop) ----
  const pos = await ev(page, () => ({ w: document.getElementById("wanted").getBoundingClientRect().top, f: document.getElementById("fleet").getBoundingClientRect().top, vh: innerHeight, hasPoster: !!document.querySelector("#wanted .poster") }));
  ok(`${name}: the Wanted poster is on the first screen`, pos.hasPoster && pos.w < pos.vh * 0.75, pos);
  if (mobile) ok(`${name}: the poster comes before the fleet's deck`, pos.w < pos.f, pos);
  await page.screenshot({ path: `${out}/${name}-open.png` });

  // ---- #117: an empty port's panel opens on screen ----
  await tap(page, '#deck [data-act="port"][data-side="left"][data-i="1"]');
  await page.waitForTimeout(300 * SLOW);
  const view = await ev(page, () => { const r = document.getElementById("ctx").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, open: document.getElementById("ctx").classList.contains("open") }; });
  ok(`${name}: tapping an empty port opens its panel in view`, view.open && view.top < view.vh - 150 && view.bottom > 150, view);
  await page.screenshot({ path: `${out}/${name}-empty-port.png` });

  // ---- #117: buying with an epic picked: the epic stays, the gun goes to the empty port, a second tap confirms ----
  await tap(page, '#deck [data-act="port"][data-side="bow"]');
  const g0 = await gold(page);
  await tap(page, '#armory [data-act="buy"][data-id="six"]');
  const y0 = await deckY(page);   // measured once the first tap has scrolled the armory into view: the second tap must not move anything
  const armed = await ev(page, () => ({ gold: save.gold, label: document.querySelector('#armory [data-act="buy"][data-id="six"]').textContent, armed: document.querySelector('#armory [data-act="buy"][data-id="six"]').hasAttribute("data-armed"), left1: save.left[1] }));
  ok(`${name}: the first tap on Buy only arms it`, armed.gold === g0 && armed.armed && /Tap again to confirm/.test(armed.label) && armed.left1 === null, armed);
  await page.screenshot({ path: `${out}/${name}-buy-armed.png` });
  await tap(page, '#armory [data-act="buy"][data-id="six"]');
  const bought = await ev(page, () => ({ gold: save.gold, bow: save.bow[0].g + save.bow[0].lv + save.bow[0].r, left1: save.left[1] && save.left[1].g, store: save.store.length, note: (document.querySelector("#ctx .gnote") || {}).textContent || "" }));
  ok(`${name}: the second tap buys; the epic stays on the bow, the new gun is in the empty port`, bought.gold === g0 - 30 && bought.bow === "long1253" && bought.left1 === "six" && bought.store === 0, bought);
  ok(`${name}: a note says where the gun went`, /larboard port 2/i.test(bought.note), bought.note);
  const y1 = await deckY(page);
  ok(`${name}: the deck did not move through the purchase`, Math.abs(y1 - y0) <= 1 || mobile, { y0, y1 });
  await page.screenshot({ path: `${out}/${name}-bought.png` });

  // ---- every port full: the next purchase waits in the store, still replacing nothing ----
  await tap(page, '#armory [data-act="buy"][data-id="carronade"]'); await tap(page, '#armory [data-act="buy"][data-id="carronade"]');
  const full = await ev(page, () => ({ bow: save.bow[0].g + save.bow[0].r, store: save.store.map(g => g.g).join(), note: (document.querySelector("#ctx .gnote") || {}).textContent || "" }));
  ok(`${name}: with every port full a bought gun goes to the store and replaces nothing`, full.bow === "long123" && full.store === "carronade" && /store/i.test(full.note), full);

  // ---- an upgrade takes a second tap; the panel holds still ----
  const lvBefore = await ev(page, () => save.bow[0].lv), gU = await gold(page);
  await tap(page, '#ctx .gcard [data-act="gup"]');
  const cTop = await ctxTop(page);
  const up1 = await ev(page, () => ({ lv: save.bow[0].lv, label: document.querySelector('#ctx .gcard [data-act="gup"]').textContent }));
  ok(`${name}: the first tap on Upgrade only arms it`, up1.lv === lvBefore && (await gold(page)) === gU && /Tap again to confirm: Lv 6/.test(up1.label), up1);
  await tap(page, '#ctx .gcard [data-act="gup"]');
  const up2 = await ev(page, () => ({ lv: save.bow[0].lv }));
  ok(`${name}: the second tap upgrades`, up2.lv === lvBefore + 1 && (await gold(page)) < gU, up2);
  const cAfter = await ctxTop(page);
  ok(`${name}: the open panel stays where it was through the upgrade (no re-scroll)`, Math.abs(cAfter - cTop) <= 2 || mobile, { cTop, cAfter });

  // ---- tapping elsewhere puts an armed button down ----
  await tap(page, '#ctx .gcard [data-act="gup"]');
  await tap(page, '#ctx .gcard [data-act="lock"], #ctx .gcard [data-act="glock"]');
  const down = await ev(page, () => !document.querySelector("#ctx [data-armed]"));
  ok(`${name}: another tap puts the armed Upgrade down`, down);

  // ---- the message box never gets shorter in a visit: the deck holds still when the text does ----
  await ev(page, () => { resetLedgerPick(); portMsg = ["tradeSoldStreak", { n: "12,345", p: 50 }]; renderPort(); });
  const long = await ev(page, () => ({ h: document.getElementById("pMsg").offsetHeight, y: Math.round(document.querySelector("#deck .slot").getBoundingClientRect().top) }));
  await ev(page, () => { portMsg = ["empty"]; renderPort(); });
  const short = await ev(page, () => ({ h: document.getElementById("pMsg").offsetHeight, y: Math.round(document.querySelector("#deck .slot").getBoundingClientRect().top) }));
  ok(`${name}: a shorter message leaves the message box and the deck where they were`, short.h >= long.h && Math.abs(short.y - long.y) <= 1, { long, short });

  // ---- #124: the sortie card has a title; "Ships sunk" is a labelled count ----
  await ev(page, () => { sortieTally({ sunk: 3, cargo: 420, bonus: 0.2, gold: 500 }); });
  await page.waitForTimeout(400 * SLOW);
  const card = await ev(page, () => ({ title: (document.querySelector("#tally .t-title") || {}).textContent, sunk: (document.querySelector("#tally .t-sunk span") || {}).textContent, n: (document.querySelector("#tally .t-n") || {}).textContent, cargo: (document.querySelector("#tally .t-math") || {}).textContent }));
  ok(`${name}: the settlement card has a title, then "Ships sunk" with its count, then the cargo sold`, card.title === "Sortie settlement" && card.sunk === "Ships sunk" && card.n === "×3" && /Cargo sold/.test(card.cargo), card);
  await page.screenshot({ path: `${out}/${name}-tally.png` });
  await page.waitForTimeout(2200 * SLOW);

  // ---- #124: gear words and the bulk break-down ----
  await ev(page, () => { save.gear = { ...save.gear, bag: [{ p: "prow", lv: 1, il: 1 }, { p: "sail", lv: 1, il: 1, r: 1, af: [["spd", 0.05]] }], mats: 4 }; save.store = [gunItem("six", 1)]; renderPort(); });
  await page.waitForTimeout(200 * SLOW);
  const bulk = await ev(page, () => { const b = document.querySelector("#gear .gbulk"), tiles = document.querySelector("#gear .gbag .slots"); if (!b) return null;
    const rb = b.getBoundingClientRect(), rt = tiles.getBoundingClientRect(), btns = [...b.querySelectorAll("button")].map(x => x.getBoundingClientRect());
    return { n: btns.length, gap: Math.round(rb.top - rt.bottom), stacked: btns.every((r, i) => i === 0 || r.top >= btns[i - 1].bottom - 1), text: b.textContent }; });
  ok(`${name}: the three bulk break-down buttons sit in a block of their own, one to a row, apart from the spares`, bulk && bulk.n === 3 && bulk.gap >= 12 && bulk.stacked && /cannot be undone/.test(bulk.text), bulk);
  const mats0 = await ev(page, () => save.gear.mats);
  await tap(page, '#gear [data-act="gbatch"][data-r="0"]');
  const first = await ev(page, () => ({ mats: save.gear.mats, label: document.querySelector('#gear [data-act="gbatch"][data-r="0"]').textContent, bag: save.gear.bag.length }));
  ok(`${name}: a bulk button's first tap only arms it`, first.mats === mats0 && first.bag === 2 && /Tap again to confirm/.test(first.label), first);
  await page.screenshot({ path: `${out}/${name}-bulk-armed.png` });
  await tap(page, '#gear [data-act="gbatch"][data-r="0"]');
  const second = await ev(page, () => ({ mats: save.gear.mats, bag: save.gear.bag.length }));
  ok(`${name}: the second tap breaks them down`, second.mats > mats0 && second.bag === 1, second);
  const words = await ev(page, () => document.getElementById("gear").textContent + " " + document.querySelector("#gear").closest("section").querySelector(".hint-s").textContent);
  ok(`${name}: Fittings, affix and Break down are explained in plain words`, /Fittings are scrap/.test(words) && /affix is an extra bonus line/i.test(words) && /Affix = an extra bonus line/.test(words), words.slice(0, 120));
  await ctx.close();
}

// ---- Chinese: the same words ----
{
  const { ctx, page } = await open(D, false, "zh", "zh-TW");
  await toLedger(page);
  await ev(page, () => { save.gear = { ...save.gear, bag: [{ p: "prow", lv: 1, il: 1 }], mats: 2 }; renderPort(); });
  const zh = await ev(page, () => ({ bulk: (document.querySelector("#gear .gbulk") || {}).textContent || "", hint: document.getElementById("gear").textContent }));
  ok("zh: the bulk block and the fittings hint speak plainly", /批次拆解/.test(zh.bulk) && /拆了就回不來/.test(zh.bulk) && /詞綴是裝備上額外多出來的加成/.test(zh.hint), zh.bulk.slice(0, 60));
  await page.screenshot({ path: `${out}/zh-gear.png` });
  await tap(page, '#deck [data-act="port"][data-side="bow"]');
  await tap(page, '#armory [data-act="buy"][data-id="six"]');
  const label = await ev(page, () => document.querySelector('#armory [data-act="buy"][data-id="six"]').textContent);
  ok("zh: the armed Buy button says what the second tap does", /再點一次確認/.test(label), label);
  await ctx.close();
}

await browser.close();
for (const e of errors) console.log("ERR", e);
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed, ${errors.length} page errors`);
process.exit(failed || errors.length ? 1 : 0);
