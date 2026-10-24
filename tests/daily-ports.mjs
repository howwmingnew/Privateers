// The daily sea has no harbor, supply stations or trade ports (art, chart, screen-edge marks, truce circles, the harbor island's
// collision) and its sinkings pay nothing; leaving it brings all back, and a #seed= voyage keeps them. On the ordinary sea, a supply
// station or trade port greets the ship with its name and use, a sound hull says so, and holding still opens the ledger.
// Usage: node tests/daily-ports.mjs [url]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const SLOW = +process.env.TEST_SLOW || 1;
const OUT = ".review/daily-ports";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let failed = 0;
const ok = (name, pass, info) => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms * SLOW));

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => {
  save.tutorialDone = true; tutorialReset(); SETTINGS.muted = true; moved = true;
  window.__toasts = []; const t0 = window.toast; window.toast = (m, n) => { window.__toasts.push(m); return t0(m, n); };
  window.__calm = setInterval(() => { for (const e of enemies) if (!e.mine && !(e.angry > 5)) { e.x = W - 200; e.y = H - 200; } }, 40);
});
await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 * SLOW });

// What the harbor and stations look like right now: art, chart marks drawn, edge boxes, truce, the island under the keel.
const probe = () => ev(() => {
  const marks = { harbor: 0, station: 0 };
  const h0 = window.miniHarbor, a0 = window.miniSupply, b0 = window.miniTrade;
  window.miniHarbor = (...a) => { marks.harbor++; return h0(...a); };
  window.miniSupply = (...a) => { marks.station++; return a0(...a); };
  window.miniTrade = (...a) => { marks.station++; return b0(...a); };
  drawMini();
  window.miniHarbor = h0; window.miniSupply = a0; window.miniTrade = b0;
  const v = S.cameras.main.worldView, cands = edgeCandidates(v, VIEW.cssW / v.width, VIEW.cssH / v.height).filter(i => i.kind === "place").length;
  const st = STATIONS[0], keep = { x: player.x, y: player.y, speed: player.speed, rot: player.rot };
  Object.assign(player, { x: PORT.x + 20, y: PORT.y, speed: 120, rot: 0 }); move(player, 0.016);
  const pushedOut = Math.hypot(player.x - PORT.x, player.y - PORT.y) > PORT_ISLAND_R;   // the harbor island shoves a hull out of its disc
  Object.assign(player, keep);
  const c = clearOfTruces({ x: st.x, y: st.y });
  return {
    art: [...harborObjs, ...harborBeams, ...stationObjs].filter(o => o.visible).length, label: harborLabel.visible,
    marks, cands, truce: inTruce({ x: st.x, y: st.y }), pushedWander: Math.hypot(c.x - st.x, c.y - st.y) > 1, pushedOut,
  };
});

// ---------- 1. the ordinary sea: all there ----------
{
  await ev(() => { player.x = PORT.x + 2500; player.y = PORT.y; });
  await sleep(200);
  const r = await probe();
  ok("ordinary sea: harbor town, beams, station art and the label are drawn", r.art > 15 && r.label, r);
  ok("ordinary sea: chart marks the harbor and the 5 stations", r.marks.harbor === 1 && r.marks.station === 5, r.marks);
  ok("ordinary sea: edge candidates include places; a station's circle is a truce; the island is solid", r.cands > 0 && r.truce && r.pushedWander && r.pushedOut, r);
}

// ---------- 2. the daily sea: none of it ----------
await ev(() => { startRun("daily"); });
await sleep(400);
{
  const r = await probe();
  ok("daily: no harbor art, beams, station art or label", r.art === 0 && r.label === false, r);
  ok("daily: the chart draws no harbor and no station", r.marks.harbor === 0 && r.marks.station === 0, r.marks);
  ok("daily: no edge candidate for a place", r.cands === 0, r);
  ok("daily: station truce circles do nothing (no truce, wander points not pushed out)", r.truce === false && r.pushedWander === false, r);
  ok("daily: the harbor island is not solid (a hull sails over its old spot)", r.pushedOut === false, r);
  const start = await ev(() => ({ d: Math.hypot(player.x - PORT.x, player.y - PORT.y), alive: player.alive, onRock: islands.some(i => Math.hypot(i.x - player.x, i.y - player.y) < i.r + 40) }));
  ok("daily: the start (140 px from the old harbor) is open water", start.alive && !start.onRock && Math.abs(start.d - 140) < 60, start);
  await page.screenshot({ path: `${OUT}/daily-start.png` });
  // ride the start for a while: the ship keeps moving, it is never stuck
  const w = await ev(() => { player.rot = 0; player.speed = player.maxSpeed; return player.x; });
  await sleep(1200);
  const x1 = await ev(() => player.x);
  ok("daily: sailing off from the start is not blocked", x1 > w + 60, { from: w, to: x1 });
  const dom = await ev(() => document.querySelectorAll('#edgeMarks .em[data-kind="harbor"], #edgeMarks .em[data-kind="supply"], #edgeMarks .em[data-kind="trade"]').length);
  ok("daily: no harbor or station box on the screen edge", dom === 0, dom);
  // stopping where a station was does nothing: no float text, no ledger
  const st = await ev(() => { const s = STATIONS[0]; player.x = s.x + 40; player.y = s.y; player.speed = 0; return s.id; });
  await sleep(3800);
  const d = await ev(() => ({ docked, texts: S.children.list.filter(o => o.type === "Text" && /Supply Station|Repairs|Buys/.test(o.text)).length }));
  ok("daily: stopping where a station was opens no ledger and floats nothing", !d.docked && d.texts === 0, { st, ...d });

  // sinkings pay nothing, but they count
  const k = await ev(() => {
    const e = enemies.find(o => o.alive && !o.boss && !o.fixed && (o.faction === "pirate" || o.faction === "navy")) || enemies.find(o => o.alive && !o.boss);
    e.loot = 200; e.stolen = 50; e.x = player.x + 300; e.y = player.y;
    const gold0 = save.gold, sunk0 = save.sunk, crates0 = crates.length;
    sink(e, player);
    return { gold: save.gold - gold0, sunk: save.sunk - sunk0, crates: crates.length - crates0, payGold: e.pay && e.pay.gold, faction: e.faction };
  });
  ok("daily: a sunk ship drops no crate and pays no bounty, yet counts as sunk", k.gold === 0 && k.crates === 0 && !k.payGold && k.sunk === 1, k);
  const f = await ev(() => { const n = crates.length; addCrate(player.x, player.y, 50, null); return { made: crates.length - n }; });
  ok("daily: addCrate makes no cargo crate at all (forts, surrenders)", f.made === 0, f);
}

// ---------- 3. a seed voyage can dock, so it keeps ports and loot ----------
await ev(() => { runLeave(); startRun("seed", 4242); });
await sleep(400);
{
  const r = await probe();
  ok("seed voyage: harbor, stations, chart marks and island are all there", r.art > 15 && r.label && r.marks.harbor === 1 && r.marks.station === 5 && r.pushedOut, r);
  const k = await ev(() => {
    const e = enemies.find(o => o.alive && !o.boss && !o.fixed && (o.faction === "pirate" || o.faction === "navy"));
    e.loot = 200; const gold0 = save.gold, crates0 = crates.length;
    sink(e, player);
    return { gold: save.gold - gold0, crates: crates.length - crates0 };
  });
  ok("seed voyage: sinking still pays bounty gold and drops cargo", k.gold > 0 && k.crates === 1, k);
}

// ---------- 4. back to the real sea: everything restored ----------
await ev(() => { runLeave(); startRun("daily"); runLeave(); });
await sleep(400);
{
  await ev(() => { player.x = PORT.x + 2500; player.y = PORT.y; });
  const r = await probe();
  ok("after the daily: art, label, chart marks, edge places, truce and island are back", r.art > 15 && r.label && r.marks.harbor === 1 && r.marks.station === 5 && r.cands > 0 && r.truce && r.pushedOut, r);
  const k = await ev(() => {
    const e = enemies.find(o => o.alive && !o.boss && !o.fixed && (o.faction === "pirate" || o.faction === "navy"));
    e.loot = 200; const gold0 = save.gold; sink(e, player); return { gold: save.gold - gold0 };
  });
  ok("after the daily: bounty gold pays again", k.gold > 0, k);
}

// ---------- 5. ordinary sailing: the greeting at a station ----------
const moorAt = (id, { hp, hold, gold }) => ev(({ id, hp, hold, gold }) => {
  const st = STATIONS.find(s => s.id === id);
  for (const o of S.children.list.filter(o => o.type === "Text")) if (/Supply Station|Trade Port|Repairs|Buys|sound/.test(o.text)) o.destroy();
  player.x = st.x + 60; player.y = st.y; player.speed = 0; player.hp = player.maxHp * hp;
  cargo = hold; save.gold = gold; canDock = true; moor = { inside: false, t: 0, sold: 0, bonus: 0 };
}, { id, hp, hold, gold });
const texts = () => ev(() => S.children.list.filter(o => o.type === "Text").map(o => o.text));
{
  await moorAt("supply-2", { hp: 0.5, hold: 0, gold: 500 });
  await sleep(350);
  let t = await texts();
  ok("supply station, hurt: floats its name and the fee for a full hull", t.includes("Supply Station") && t.some(s => /^Repairs: \d+ gold for a full hull$/.test(s)), t.filter(s => /Station|Repairs/.test(s)));
  await page.screenshot({ path: `${OUT}/supply-greeting.png` });
  await moorAt("supply-2", { hp: 1, hold: 0, gold: 500 });
  await sleep(350);
  t = await texts();
  ok("supply station, full hull: says no repair is needed", t.includes("Supply Station") && t.includes("Hull is sound, no repairs needed"), t.filter(s => /Station|sound/.test(s)));
  const hint = await ev(() => { const el = document.getElementById("moor"); return { hidden: el.hidden, text: el.textContent }; });
  ok("supply station: the hold-still hint shows under the ship", !hint.hidden && /ledger/i.test(hint.text), hint);
  await page.waitForFunction(() => docked, null, { timeout: 9000 * SLOW });
  ok("supply station: holding still 3 s opens the ledger", await ev(() => dockKind === "supply"));
  await ev(() => { setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 5000 * SLOW });

  await moorAt("trade-2", { hp: 1, hold: 0, gold: 100 });
  await sleep(350);
  t = await texts();
  const body = (await ev(() => window.__toasts)).join(" | ");
  ok("trade port, empty hold: floats its name and use, and says the hold is empty", t.includes("Trade Port") && t.includes("Buys your whole hold") && /Your hold is empty/.test(body), t.filter(s => /Trade|Buys/.test(s)));
  const hint2 = await ev(() => { const el = document.getElementById("moor"); return { hidden: el.hidden, text: el.textContent }; });
  ok("trade port: the hold-still hint shows", !hint2.hidden && /ledger/i.test(hint2.text), hint2);
  await page.waitForFunction(() => docked, null, { timeout: 9000 * SLOW });
  ok("trade port: holding still 3 s opens the ledger", await ev(() => dockKind === "trade"));
  await ev(() => { setSail(); });
  await page.waitForFunction(() => !docked && !paused, null, { timeout: 5000 * SLOW });

  await moorAt("trade-2", { hp: 1, hold: 90, gold: 100 });
  await sleep(350);
  t = await texts();
  ok("trade port, with cargo: greets and sells the hold", t.includes("Buys your whole hold") && (await ev(() => cargo)) === 0);
  await ev(() => { setSail(); });
}

// ---------- 6. the Chinese strings ----------
{
  await ev(() => { lang = "zh"; applyLang(); });
  const z = await ev(() => [t("fSupplyFull"), t("fTradeIn"), t("fSupplyIn", { n: 50 })]);
  ok("zh strings: 船體完好，不需修理 / 收購貨物 / 修船：整個船體 50 金幣", z[0] === "船體完好，不需修理" && z[1] === "收購貨物" && z[2] === "修船：整個船體 50 金幣", z);
}

ok("0 page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
process.exit(failed ? 1 : 0);
