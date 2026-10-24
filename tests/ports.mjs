// Supply stations and trade ports in a real browser (#13): placement, the paid repair, selling at the trade port, the slim
// ledger (desktop and phone), AI ships near a station, chart marks, edge markers, the zh strings, 0 page errors.
// The pure logic is in tests/unit-ports.mjs.
// Usage: node tests/ports.mjs [url]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
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

// A fresh game at sea (English, tutorial done, muted), every ship the sea spawns parked in a corner unless a test marks it `mine`.
async function openSea(viewport, { mobile = false } = {}) {
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
  await page.waitForTimeout(500 * SLOW);
  await page.evaluate(() => { if (docked) setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 8000 * SLOW });
  await ev(page, () => {
    save.tutorialDone = true; tutorialReset(); SETTINGS.muted = true;
    player.x = PORT.x + 1500; player.y = PORT.y; player.speed = 0; moved = true;
    for (const e of enemies) { e.x = W - 200; e.y = H - 200; }
    window.managePopulation = () => {};   // the sea spawns nothing new
    window.__calm = setInterval(() => { for (const e of enemies) if (!e.mine && !(e.angry > 5)) { e.x = W - 200; e.y = H - 200; } }, 40);
  });
  await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 * SLOW });
  return { ctx, page };
}
// Park the player a little inside a station's ring, hurt, with a hold and some gold; armed to dock.
const moorAt = (page, id, { hp = 0.4, hold = 120, gold = 500 } = {}) => ev(page, ({ id, hp, hold, gold }) => {
  const st = STATIONS.find(s => s.id === id);
  player.x = st.x + 60; player.y = st.y; player.speed = 0; player.hp = player.maxHp * hp;
  cargo = hold; save.gold = gold; canDock = true; moor = { inside: false, t: 0, sold: 0, bonus: 0 };
  return { hp0: player.hp, max: player.maxHp, gold0: save.gold, ring: st.ring };
}, { id, hp, hold, gold });

// ---------- 1. the stations exist, in the world and on the sea ----------
const { ctx: ctxA, page } = await openSea({ width: 1280, height: 720 });
{
  const r = await ev(page, () => ({
    n: STATIONS.length, kinds: STATIONS.map(s => s.kind), objs: stationObjs.length, labels: stationLabels.map(l => l.text),
    tex: ["station-supply", "station-trade"].every(k => S.textures.exists(k)),
    onIsland: STATIONS.filter(s => islands.some(i => Math.hypot(i.x - s.x, i.y - s.y) < i.r + DOCK_R)).length,
  }));
  ok("5 stations: 3 supply + 2 trade, art and labels built", r.n === 5 && r.kinds.filter(k => k === "supply").length === 3 && r.objs === 15 && r.labels.length === 5 && r.tex, r);
  ok("no island sits on a station's dock ring", r.onIsland === 0, r.onIsland);
  const nearest = await ev(page, () => { player.x = STATIONS[0].x + 90; player.y = STATIONS[0].y; return nearestHarbor().id; });
  ok("nearestHarbor picks the station when the player is at it", nearest === "supply-2", nearest);
  const home = await ev(page, () => { player.x = PORT.x + 300; player.y = PORT.y; const hb = nearestHarbor(); return { outpost: hb.outpost, kind: hb.kind || null }; });
  ok("...and Safe Harbor when the player is at home", home.outpost === false && home.kind === null, home);
}

// ---------- 2. supply station: mends for a fee, buys and sells nothing ----------
{
  const s0 = await moorAt(page, "supply-4");
  await sleep(1500);
  const s1 = await ev(page, () => ({ hp: player.hp, gold: save.gold, cargo, docked }));
  const fee = (s1.hp - s0.hp0) / s0.max * 25 * s0.ring;
  ok("supply: hull mends while inside the ring", s1.hp > s0.hp0 + s0.max * 0.1, { from: s0.hp0, to: s1.hp });
  ok("supply: it costs gold, about the hull's share of 25 x ring (the sea's own slow repair is free)", s0.gold0 - s1.gold > 0 && s0.gold0 - s1.gold <= fee + 1, { paid: s0.gold0 - s1.gold, upper: Math.round(fee) });
  ok("supply: the hold is NOT sold", s1.cargo === 120, s1.cargo);
  // out of gold: no mending
  const b0 = await moorAt(page, "supply-4", { gold: 0 });
  await ev(page, () => { moor = { inside: false, t: 0, sold: 0, bonus: 0 }; });
  await sleep(1200);
  const b1 = await ev(page, () => ({ hp: player.hp, gold: save.gold }));
  ok("supply: with no gold the station mends nothing (only the sea's slow repair, under 4% of the hull)", b1.hp - b0.hp0 < b0.max * 0.04 && b1.gold === 0, { gain: b1.hp - b0.hp0 });
}

// ---------- 3. trade port: sells the hold, mends nothing ----------
{
  const s0 = await moorAt(page, "trade-2");
  await sleep(1500);
  const s1 = await ev(page, () => ({ hp: player.hp, gold: save.gold, cargo }));
  ok("trade port: the hold sells for gold", s1.cargo === 0 && s1.gold - s0.gold0 >= 120, { gold: s1.gold - s0.gold0 });
  ok("trade port: the hull is not mended by the port (only the sea's slow repair, under 8%)", s1.hp - s0.hp0 < s0.max * 0.08, { gain: s1.hp - s0.hp0 });
}

// ---------- 4. the slim ledger: stop in the ring, desktop ----------
async function ledgerCheck(pg, id, expect) {
  const s0 = await moorAt(pg, id, expect.setup);
  await pg.waitForFunction(() => docked, null, { timeout: 9000 * SLOW });
  await pg.waitForTimeout(450 * SLOW);
  const r = await ev(pg, () => ({
    kind: dockKind, title: document.getElementById("portTitle").textContent, msg: document.getElementById("pMsg").textContent,
    note: document.querySelector("#wanted .hint-s")?.textContent || "", gold: save.gold, cargo,
    hidden: ["deck", "armory", "yard", "ships"].map(i => document.getElementById(i).closest("section").hidden),
    sailVisible: (() => { const b = document.getElementById("sail"), r = b.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight + 4000; })(),
    hp: player.hp, max: player.maxHp,
  }));
  return { s0, r };
}
{
  const { r } = await ledgerCheck(page, "supply-2", { setup: { hold: 80, gold: 400 } });
  ok("supply ledger opens after holding still, titled Supply Station, shipyard/armory/guns hidden", r.kind === "supply" && r.title === "Supply Station" && r.hidden.every(Boolean), r);
  ok("supply ledger keeps the hold aboard and says so", r.cargo === 80 && /still aboard/.test(r.msg) && /hold stays aboard/.test(r.note), { cargo: r.cargo, msg: r.msg });
  await ev(page, () => document.getElementById("sail").click());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 5000 * SLOW });
  const after = await ev(page, () => ({ cargo, docked }));
  ok("setting sail from a supply station works and the hold is still there", after.cargo === 80 && !after.docked, after);
}
{
  const { r } = await ledgerCheck(page, "trade-2", { setup: { hold: 90, gold: 100 } });
  ok("trade ledger: titled Trade Port, hold sold, slim sheet (no yard, armory, ships, guns)", r.kind === "trade" && r.title === "Trade Port" && r.cargo === 0 && r.gold >= 190 && r.hidden.every(Boolean), r);
  ok("trade ledger message is the port's own (no 'hull repaired')", /Sold the hold for/.test(r.msg) && !/repaired/i.test(r.msg), r.msg);
  await ev(page, () => document.getElementById("sail").click());
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 5000 * SLOW });
}

// ---------- 5. AI ships near a station keep moving and leave the truce circle ----------
{
  const runs = await ev(page, async scale => {
    const res = [];
    for (const [id, cls, faction] of [["supply-4", "brig", "pirate"], ["trade-5", "manowar", "navy"], ["supply-7", "fluyt", "merchant"]])
      for (const [dx, dy] of [[-120, 0], [0, 150]]) {
        const st = STATIONS.find(s => s.id === id), e = makeEnemy(S, st.x + dx, st.y + dy, 6, faction, cls); e.mine = true;
        e.rot = Math.atan2(-dy, -dx); e.wander = { x: st.x, y: st.y }; e.thinkT = 8;
        const tr = [];
        for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250 * scale)); tr.push({ d: Math.hypot(e.x - st.x, e.y - st.y), v: e.speed / e.maxSpeed, alive: e.alive }); }
        res.push({ id, cls, dx, dy, startD: Math.hypot(dx, dy), alive: tr.every(p => p.alive), meanV: tr.reduce((a, p) => a + p.v, 0) / tr.length, endD: tr.at(-1).d, truce: inTruce(e) });
        e.alive = false; e.spr.setVisible(false); e.x = e.y = 200;
      }
    return res;
  }, SLOW);
  const TR = await ev(page, () => STATION_TRUCE_R);
  const stuck = runs.filter(r => r.alive && (r.meanV < 0.3 || r.endD < r.startD + 40 || r.endD < TR * 0.85));
  ok(`${runs.length} AI ships dropped inside a station's circle keep sailing (mean speed >= 30%), draw 40+ px away from the station and end near or beyond the 280 px truce edge within 15 s`, stuck.length === 0, stuck.length ? stuck : undefined);
  const safe = await ev(page, () => { const st = STATIONS[0]; return { truce: inTruce({ x: st.x + 100, y: st.y }), far: inTruce({ x: st.x + 900, y: st.y }), safeShip: inSafe({ x: st.x + 100, y: st.y }) }; });
  ok("a station's circle is a truce for the player and not 900 px out", safe.truce && safe.safeShip && !safe.far, safe);
}

// ---------- 6. chart marks (minimap), the legend, edge markers ----------
{
  const px = await ev(page, () => {
    player.x = PORT.x + 400; player.y = PORT.y; player.hp = player.maxHp;
    for (const e of enemies) { e.x = W - 200; e.y = H - 200; }
    drawMini();
    const M = mini.width, k = M / W, u = miniUnit(M), out = {};
    // the mark is a few pixels wide: count the pixels near each colour in a box round the station
    const near = (c, t) => c[3] > 200 && [0, 1, 2].every(i => Math.abs(c[i] - t[i]) <= 30);
    for (const st of STATIONS) {
      const R = Math.ceil(8 * u), x0 = Math.round(st.x * k) - R, y0 = Math.round(st.y * k) - R, d = mctx.getImageData(x0, y0, 2 * R + 1, 2 * R + 1).data;
      let g = 0, l = 0;
      for (let i = 0; i < d.length; i += 4) { const c = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (near(c, [240, 199, 102])) g++; if (near(c, [111, 207, 122])) l++; }
      out[st.id] = { gold: g, leaf: l };
    }
    return out;
  });
  const trades = Object.entries(px).filter(([id]) => id.startsWith("trade")), supplies = Object.entries(px).filter(([id]) => id.startsWith("supply"));
  ok("minimap draws every trade port as a gold diamond and every supply station as a green cask",
    trades.every(([, c]) => c.gold >= 3 && c.leaf === 0) && supplies.every(([, c]) => c.leaf >= 3 && c.gold === 0), px);
  const leg = await ev(page, () => {
    const out = {};
    for (const m of ["supply", "tradeport"]) {
      const cv = document.createElement("canvas"); cv.dataset.mark = m; paintLegendMark(cv);
      out[m] = [...cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data].filter((v, i) => i % 4 === 3 && v > 200).length;
    }
    out.howto = /Supply Station/.test(document.documentElement.innerHTML) && document.querySelectorAll('canvas.sw-mark[data-mark="supply"]').length >= 1;
    return out;
  });
  ok("the chart legend paints both new swatches, and the how-to lists them", leg.supply > 20 && leg.tradeport > 20 && leg.howto, leg);
  // edge marker: a station 1.2 screen widths away is off-screen, near enough for a box
  await ev(page, () => { const st = STATIONS.find(s => s.id === "trade-2"), w = S.cameras.main.worldView.width; player.x = st.x - 1.2 * w; player.y = st.y; player.speed = 0; });
  await sleep(900);
  const edge = await ev(page, () => [...document.querySelectorAll("#edgeMarks .em")].map(e => e.dataset.kind + ":" + e.textContent.trim()));
  ok("an off-screen trade port gets an edge box, with its distance", edge.some(e => e.startsWith("trade:") && /m/.test(e)), edge);
  await ev(page, () => { const st = STATIONS.find(s => s.id === "trade-2"); player.x = 300; player.y = 300; });
  await sleep(500);
  const edge2 = await ev(page, () => [...document.querySelectorAll("#edgeMarks .em")].map(e => e.dataset.kind));
  ok("...and none when it is too far away", !edge2.includes("trade"), edge2);
}

// ---------- 7. strings: every station string has both languages ----------
{
  const r = await ev(page, () => {
    const keys = Object.keys(STR.en).filter(k => /^(station|supply|trade|fSupply)/.test(k));
    return { keys: keys.length, missing: keys.filter(k => !(k in STR.zh) || !STR.zh[k]), same: keys.filter(k => STR.zh[k] === STR.en[k]) };
  });
  ok("every station string exists in zh-Hant and differs from the English", r.keys >= 12 && r.missing.length === 0 && r.same.length === 0, r);
  const zh = await ev(page, () => { lang = "zh"; applyLang(); return { title: t("stationName_supply"), label: stationLabels[0].text, trade: t("stationName_trade") }; });
  ok("switching to zh relabels the stations on the sea", zh.title === "補給站" && zh.label === "補給站" && zh.trade === "交易港", zh);
  await ev(page, () => { lang = "en"; applyLang(); });
}
await ctxA.close();

// ---------- 8. phone: the same stop-in-the-ring flow opens the ledger ----------
{
  const { ctx, page: ph } = await openSea({ width: 390, height: 844 }, { mobile: true });
  const { r } = await ledgerCheck(ph, "trade-5", { setup: { hold: 60, gold: 50 } });
  ok("phone: the trade port's ledger opens with the hold sold, slim sheet", r.kind === "trade" && r.cargo === 0 && r.gold >= 110 && r.hidden.every(Boolean), r);
  const fits = await ev(ph, () => { const sh = document.querySelector("#port .sheet"); return { sw: sh.scrollWidth, cw: sh.clientWidth }; });
  ok("phone: the ledger does not scroll sideways", fits.sw <= fits.cw + 1, fits);
  await ev(ph, () => document.getElementById("sail").click());
  await ph.waitForFunction(() => !docked && !paused, null, { timeout: 5000 * SLOW });
  await ctx.close();
}

ok("0 page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(failed || errors.length ? `\n${failed} check(s) failed, ${errors.length} page error(s)` : "\nall ports checks passed");
process.exit(failed || errors.length ? 1 : 0);
