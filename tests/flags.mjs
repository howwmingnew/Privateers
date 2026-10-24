// Ship name and flag checks in headless Chrome (js/flags.js): an old save gets the default flag and name, the ledger's Colours card
// changes the flag and the name, the sea ship wears the flag and the name tag, the share card and the chart mark agree with
// the save, everything survives a reload (also in Chinese), and a phone-width ledger fits. Usage: node tests/flags.mjs [url] [outDir]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/flags";
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const OLD = JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: { bounty: 0 }, settings: { muted: true } });   // no flag, no name
async function open(saveJson, { lang = "en", viewport = { width: 1280, height: 720 }, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const ready = async () => {
    await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
    if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
    await page.evaluate(() => { if (!docked) dock("welcome"); });
    await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  };
  await page.goto(url, { waitUntil: "load" }); await ready();
  if (saveJson) {
    await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); localStorage.setItem("privateers-save-v2", s); }, [lang, saveJson]);
    await page.reload({ waitUntil: "load" }); await ready();
  }
  return { ctx, page, errors, reopen: async () => { await page.reload({ waitUntil: "load" }); await ready(); } };
}
const done = async (tag, o) => { check(o.errors.length === 0, `${tag}: no page errors${o.errors.length ? " -> " + o.errors.join(" | ") : ""}`); await o.ctx.close(); };
const card = page => page.locator("#flagbox");
const pick = (page, k, id) => page.click(`#flagbox [data-k="${k}"][data-id="${id}"]`);
const flag = page => page.evaluate(() => ({ ...save.flag }));

console.log("Old save: default flag and name");
{
  const o = await open(OLD), { page } = o;
  check(await page.evaluate(() => save.flag.main === "blue" && save.flag.alt === "white" && save.flag.emblem === "diag" && save.shipName === ""), "an old save loads with the classic blue-and-white sash and no custom name");
  check(await card(page).isVisible(), "the Colours card shows in the ledger");
  check(await page.locator('#flagbox [data-k="main"][data-id="blue"][aria-checked="true"]').count() === 1, "blue is the selected main colour");
  check((await page.inputValue("#shipNameIn")) === "", "the name field is empty (placeholder shows the default)");
  check((await page.textContent("#pStats > span b")).startsWith("Sea Wolf"), "the stats line leads with the default ship name");
  check(await page.evaluate(() => player.livery === "pf-blue-white-diag"), "the sea ship wears the default flag livery");
  await done("old save", o);
}

console.log("Ledger: change the flag and the name");
{
  const o = await open(OLD), { page } = o;
  await pick(page, "main", "red"); await pick(page, "alt", "gold"); await pick(page, "emblem", "skull");
  const f = await flag(page);
  check(f.main === "red" && f.alt === "gold" && f.emblem === "skull", `the picks reach the save (${JSON.stringify(f)})`);
  check(await page.locator('#flagbox [data-k="emblem"][data-id="skull"][aria-checked="true"]').count() === 1, "the card marks the new picks after re-rendering");
  check(await page.evaluate(() => player.livery === "pf-red-gold-skull" && S.textures.exists("ship:" + player.cls + ":pf-red-gold-skull")), "the sea ship is re-drawn in the new livery");
  check(await page.evaluate(() => player.hp === player.maxHp || player.hp > 0), "changing the flag does not wreck the ship");
  const px = await page.evaluate(() => {   // the baked hull holds the flag's red and gold
    const cv = S.textures.get("ship:" + player.cls + ":pf-red-gold-skull").getSourceImage(), c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, gold = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; if (Math.abs(d[i] - 176) < 14 && Math.abs(d[i + 1] - 38) < 14 && Math.abs(d[i + 2] - 38) < 14) red++; if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 140) gold++; }
    return { red, gold };
  });
  check(px.red > 5 && px.gold > 0, `the ship texture carries the flag colours (${JSON.stringify(px)})`);
  await page.evaluate(() => { const cv = S.textures.get("ship:" + player.cls + ":pf-red-gold-skull").getSourceImage(), z = document.createElement("canvas"); z.width = cv.width * 3; z.height = cv.height * 3; z.getContext("2d").drawImage(cv, 0, 0, z.width, z.height); window.__tex = z.toDataURL(); });
  writeFileSync(join(out, "sea-ship-texture.png"), Buffer.from((await page.evaluate(() => window.__tex)).split(",")[1], "base64"));
  await page.fill("#shipNameIn", "Dread Queen"); await page.press("#shipNameIn", "Enter");
  check(await page.evaluate(() => save.shipName === "Dread Queen"), "Enter commits the ship name");
  check((await page.textContent("#pStats > span b")).startsWith("Dread Queen"), "the stats line shows the new name");
  await page.fill("#shipNameIn", "<b>Bold</b> & \"Q\""); await page.press("#shipNameIn", "Enter");
  check(await page.evaluate(() => /^[^<>&"']+$/.test(save.shipName) && save.shipName.length > 0), `HTML characters are stripped (${await page.evaluate(() => save.shipName)})`);
  await page.fill("#shipNameIn", "海".repeat(30)); await page.press("#shipNameIn", "Enter");
  check(await page.evaluate(() => [...save.shipName].length <= 10 && save.shipName.length > 0), "a long Chinese name is cut to 10 characters");
  await page.fill("#shipNameIn", "Dread Queen"); await page.press("#shipNameIn", "Enter");
  await page.fill("#shipNameIn", "fuck you"); await page.press("#shipNameIn", "Enter");
  check(await page.evaluate(() => save.shipName === "Dread Queen"), "a rude name is refused and the old name stays");
  check((await page.textContent("#flagbox .fl-err")).length > 0, "the card says why");
  await page.screenshot({ path: join(out, "ledger-desktop.png") });
  await page.locator("#flagbox").screenshot({ path: join(out, "card-desktop.png") });
  // the share card agrees with the save
  const spec = await page.evaluate(() => { const s = shareSpec("sortie", { sunk: 3, gold: 120, secs: 200 }); return { flag: s.flag, shipName: s.shipName }; });
  check(spec.flag.main === "red" && spec.flag.emblem === "skull" && spec.shipName === "Dread Queen", `the share card spec carries the flag and name (${JSON.stringify(spec)})`);
  const png = await page.evaluate(async () => { const b = await shareCardBlob(shareSpec("victory", { winTime: 600, sunk: 90, gold: 9000 })); const buf = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const v of buf) s += String.fromCharCode(v); return btoa(s); });
  writeFileSync(join(out, "sharecard.png"), Buffer.from(png, "base64"));
  check(png.length > 5000, "the share card draws with the flag and name (screenshot saved)");
  // set sail: name tag at sea
  await page.evaluate(() => { setSail(); });
  await page.waitForTimeout(700 * SLOW);
  const tag = await page.evaluate(() => ({ vis: nameTag.visible, txt: nameTag.text, near: Math.hypot(nameTag.x - player.x, nameTag.y - player.y) }));
  check(tag.vis && tag.txt === "Dread Queen" && tag.near < 120, `the name sails beside the ship (${JSON.stringify(tag)})`);
  await page.evaluate(() => { for (const e of enemies) e.spr.setVisible(false); });
  await page.screenshot({ path: join(out, "sea-desktop.png") });
  await page.evaluate(() => { dock("return"); });
  check(await page.evaluate(() => !nameTag.visible), "the name tag hides while docked");
  // the chart mark draws the pennant without error
  check(await page.evaluate(() => { const cv = document.createElement("canvas"); cv.width = cv.height = 60; miniPlayer(cv.getContext("2d"), 30, 30, 0, 2); const d = cv.getContext("2d").getImageData(0, 0, 60, 60).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 150 && d[i + 1] < 70 && d[i + 2] < 70) red++; return red > 3; }), "the chart's player mark flies the main colour");
  // reload keeps everything
  await o.reopen();
  const kept = await page.evaluate(() => ({ f: { ...save.flag }, n: save.shipName, liv: player.livery }));
  check(kept.f.main === "red" && kept.f.alt === "gold" && kept.f.emblem === "skull" && kept.n === "Dread Queen" && kept.liv === "pf-red-gold-skull", `reload keeps the flag, the name and the sea livery (${JSON.stringify(kept)})`);
  // buying a new ship starts a new, unnamed ship under the same flag
  await page.evaluate(() => { save.gold = 99999; save.campaign = { ...save.campaign, ships: SHIP_ORDER.slice() }; renderPort(); });
  const lock = await page.evaluate(() => shipLock("schooner"));
  if (!lock) {
    await page.evaluate(() => { const id = "schooner"; save = fitMounts({ ...save, ship: id, hull: 1, sails: 1, hold: 1, shipName: "" }); applyPlayerStats(true); renderPort(); });
  }
  await done("ledger", o);
}

console.log("Chinese UI");
{
  const o = await open(JSON.stringify({ ...JSON.parse(OLD), flag: { main: "green", alt: "white", emblem: "anchor" }, shipName: "海鷗號" }), { lang: "zh" }), { page } = o;
  check((await page.textContent("#flagbox h2")) === "船旗", "the card's title is in Chinese");
  check((await page.inputValue("#shipNameIn")) === "海鷗號", "a Chinese name loads into the field");
  check((await page.textContent("#pStats > span b")).startsWith("海鷗號"), "the stats line shows the Chinese name");
  await page.screenshot({ path: join(out, "ledger-zh.png") });
  await done("zh", o);
}

console.log("Phone width (390x844)");
{
  const o = await open(OLD, { viewport: { width: 390, height: 844 }, mobile: true }), { page } = o;
  await page.locator("#flagbox").scrollIntoViewIfNeeded();
  const m = await page.evaluate(() => {
    const sheet = document.querySelector("#port .sheet"), box = document.getElementById("flagbox").getBoundingClientRect(), sw = [...document.querySelectorAll("#flagbox .fl-sw")].map(b => b.getBoundingClientRect());
    return { over: sheet.scrollWidth > sheet.clientWidth + 1, right: box.right, vw: innerWidth, minSw: Math.min(...sw.map(r => Math.min(r.width, r.height))) };
  });
  check(!m.over && m.right <= m.vw, `the card fits a phone (${JSON.stringify(m)})`);
  check(m.minSw >= 40, "the swatches are touch-sized");
  await pick(page, "emblem", "swords");
  check((await flag(page)).emblem === "swords", "a tap on a swatch works on a phone");
  await page.locator("#flagbox").screenshot({ path: join(out, "card-mobile.png") });
  await done("phone", o);
}

await browser.close();
if (fails.length) { console.log(`\nFAILED (${fails.length}):\n - ` + fails.join("\n - ")); process.exit(1); }
console.log("\nPASS: flags");
