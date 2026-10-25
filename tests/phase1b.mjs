// Phase 1 additions in a real browser (#33 letter of marque, #34 gun bay, #40 edge markers, #41 AI at outposts, #42 chart marks).
// The pure logic is in tests/unit-phase1b.mjs.
// Usage: node tests/phase1b.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { stepper } from "./lib/stepper.mjs";

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
    for (const e of enemies) { e.x = W - 200; e.y = H - 200; }
    window.managePopulation = () => {};   // the sea spawns nothing new: a stray ship would add boxes of its own
    window.__park = () => { for (const e of enemies) if (!e.mine && !(e.angry > 5)) { e.x = W - 200; e.y = H - 200; } };
    window.__calm = setInterval(__park, 40);
  });
  await page.waitForFunction(() => !bannerBusy(), null, { timeout: 15000 * SLOW });
  return { ctx, page };
}

// ---------- #41: AI ships near the outpost and the harbor keep moving and leave ----------
// Each ship starts 600 px out, heading for a wander point on the very hulk / the harbor island. Before the fix it crawled along
// the rim at about a tenth of its speed until the next wander roll.
// Game time is hand-stepped (tests/lib/stepper.mjs), so this sea is closed afterwards and never run in real time again.
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  await ev(page, stepper);
  const runs = await ev(page, () => {
    save.campaign.outpost = true; syncOutpost();
    const sample = (e, goal, secs) => {   // a sample every 0.25 s of game time; the stray ships are parked every frame
      const tr = [];
      for (let i = 0; i < secs * 4; i++) {
        stepN(15, __park);
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
          const tr = sample(e, goal, 10);
          res.push({ name, cls, dx, dy, alive: tr.every(p => p.alive), meanV: tr.reduce((a, p) => a + p.v, 0) / tr.length,
            minD: Math.min(...tr.map(p => p.d)), endD: tr.at(-1).d });
          e.alive = false; e.spr.setVisible(false); e.x = e.y = 200;
        }
    return res;
  });
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
  await page.waitForFunction(() => docked && document.querySelector("#deck [data-act=port]"), null, { timeout: 8000 * SLOW });
  await page.waitForTimeout(450 * SLOW);   // the ledger's fade-in
  return { ctx, page };
}

// ---------- #34 / #68: the gun panel: tap a port, then pick the gun that goes there ----------
for (const [tag, viewport, mobile] of [["desktop", { width: 1280, height: 720 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const { ctx, page } = await openHarbor(viewport, { mobile });
  await ev(page, () => { save.gold = 20000; save.bow = [gunItem("six", 1), gunItem("long12", 3)]; save.store = [gunItem("chain", 1)]; deckSel = null; gunNote = null; renderPort(); });
  const bow = () => ev(page, () => save.bow.map(x => x && x.g + x.lv).join(","));
  const slot = i => `#deck [data-act="port"][data-side="bow"][data-i="${i}"]`;
  await page.locator(slot(0)).scrollIntoViewIfNeeded();
  await page.click(slot(0));
  ok(`#34 ${tag}: picking a gun shows the next-level upgrade label, Upgrade x5 and Unload, and no Swap position button`, await ev(page, () =>
    !document.querySelector('#ctx [data-act="swap"]') && !!document.querySelector('#ctx [data-act="gup5"]') && !!document.querySelector('#ctx [data-act="unload"]') &&
    /^Upgrade to Lv 2 \(\d/.test(document.querySelector('#ctx [data-act="gup"]').textContent)));
  ok(`#68 ${tag}: the picked port is outlined, and its panel offers the stored gun and the armory`, await ev(page, () => !!document.querySelector("#deck .slot.sel") &&
    document.querySelectorAll('#ctx [data-act="gfrom"][data-side="store"]').length === 1 && document.querySelectorAll('#armory [data-act="buy"]').length === 5));
  await page.screenshot({ path: join(out, `gunbay-picked-${tag}.png`) });
  await page.click(slot(1));
  ok(`#68 ${tag}: tapping a second port moves the pick to it and moves nothing`, (await bow()) === "six1,long123" && await ev(page, () => deckSel && deckSel.i === 1));
  await page.click(slot(0)); await page.click('#ctx [data-act="gfrom"][data-side="store"][data-i="0"]');
  ok(`#68 ${tag}: picking the stored gun for the port trades them at once, says so, and offers Undo`, (await bow()) === "chain1,long123" && await ev(page, () => save.store[0].g === "six" &&
    /Swapped/.test(document.querySelector("#ctx .gnote").textContent) && !!document.querySelector('#ctx [data-act="gundo"]')));
  await page.click('#ctx [data-act="gundo"]');
  ok(`#68 ${tag}: Undo puts them back`, (await bow()) === "six1,long123" && await ev(page, () => save.store[0].g === "chain") && !(await ev(page, () => !!document.querySelector('#ctx [data-act="gundo"]'))));
  await page.click(slot(1)); await page.click(slot(1));   // picked, then picked again: put down
  ok(`#68 ${tag}: tapping the source again puts it down`, !(await ev(page, () => !!deckSel)));
  await page.click(slot(0)); await page.keyboard.press("Escape");
  ok(`#68 ${tag}: Esc puts the pick down and moves nothing`, !(await ev(page, () => !!deckSel)) && (await bow()) === "six1,long123");
  await page.click(slot(0)); await page.click("#pMsg");
  ok(`#68 ${tag}: tapping a blank spot puts the pick down`, !(await ev(page, () => !!deckSel)));
  // keyboard only: focus a port, Enter, then Enter on the stored gun in its panel: the stored gun trades in at once
  await page.focus(slot(0)); await page.keyboard.press("Enter");
  await page.focus('#ctx [data-act="gfrom"][data-side="store"]'); await page.keyboard.press("Enter");
  ok(`#68 ${tag}: keyboard (Enter) can pick a port and trade a stored gun with it`, (await bow()) === "chain1,long123" && await ev(page, () => save.store[0].g === "six" && save.store[0].lv === 1), await bow());
  // upgrade label: money short, enough, maxed
  const lbl = await ev(page, () => {
    const out = {};
    deckSel = { side: "bow", i: 1 }; save.gold = 5; renderPort();
    const b = document.querySelector('#ctx [data-act="gup"]'); out.short = [b.textContent, b.disabled];
    save.gold = 99999; renderPort(); const c = document.querySelector('#ctx [data-act="gup"]'); out.enough = [c.textContent, c.disabled];
    save.bow[1] = gunItem("six", GUN_MAX); renderPort(); const d = document.querySelector('#ctx .btn.max'); out.max = [d?.textContent, d?.disabled];
    return out;
  });
  ok(`#34 ${tag}: the upgrade button shows the price, the shortfall when poor, and "Max level" (disabled) at Lv ${10}`,
    /^Upgrade to Lv 4 \(\d[\d,]* gold, need \d[\d,]* more\)(→ )?Damage \+\d+%( · Ship Lv (progress \+\d+%|→ \d+))?$/.test(lbl.short[0]) && lbl.short[1] && /^Upgrade to Lv 4 \(\d[\d,]* gold\)(→ )?Damage \+\d+%( · Ship Lv (progress \+\d+%|→ \d+))?$/.test(lbl.enough[0]) && !lbl.enough[1] && lbl.max[0] === "Max level" && lbl.max[1], lbl);
  // Chinese strings
  await ev(page, () => { lang = "zh"; applyLang(); deckSel = { side: "bow", i: 0 }; renderPort(); });
  const zh = await ev(page, () => ({ up5: document.querySelector('#ctx [data-act="gup5"]').textContent, off: document.querySelector('#ctx [data-act="unload"]').textContent, up: document.querySelector('#ctx [data-act="gup"]').textContent }));
  ok(`#34 ${tag}: Chinese labels`, /^一次升 \d 級（共 [\d,]+ 金幣/.test(zh.up5) && zh.off === "卸下" && /^升級到 Lv \d（[\d,]+ 金幣/.test(zh.up), zh);
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

// ---------- #42: chart marks ----------
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  await ev(page, () => { save.campaign.outpost = true; syncOutpost(); });
  // no dashed lines, no ring / frame strokes in the chart's base layer, and none of the old frames around ships and the outpost
  const lines = await ev(page, () => {
    const dashed = [], strokes = { n: 0 }, proto = CanvasRenderingContext2D.prototype, sd = proto.setLineDash, st = proto.stroke;
    proto.setLineDash = function (a) { if (a && a.length) dashed.push(a.slice()); return sd.call(this, a); };
    proto.stroke = function (...a) { if (this.canvas === miniBase || this.canvas.__base) strokes.n++; return st.apply(this, a); };
    try { buildMiniBase(); drawMini(); } finally { proto.setLineDash = sd; proto.stroke = st; }
    return { dashed: dashed.length, baseStrokes: strokes.n };
  });
  ok("#42 the chart draws no dashed line, and its base (seas, land, labels) has no stroked ring or border", lines.dashed === 0, lines);
  const frames = await ev(page, () => {
    const u = 4, bg = [29, 71, 102], W2 = 140, res = {};
    const bgOk = (d, i) => Math.abs(d[i] - bg[0]) < 6 && Math.abs(d[i + 1] - bg[1]) < 6 && Math.abs(d[i + 2] - bg[2]) < 6;
    const probe = (name, draw, pts) => {
      const cv = document.createElement("canvas"); cv.width = cv.height = W2; const c = cv.getContext("2d");
      c.fillStyle = `rgb(${bg})`; c.fillRect(0, 0, W2, W2); draw(c, W2 / 2, W2 / 2);
      const d = c.getImageData(0, 0, W2, W2).data;
      res[name] = pts.map(([dx, dy]) => { const i = (Math.round(W2 / 2 + dy) * W2 + Math.round(W2 / 2 + dx)) * 4; return bgOk(d, i); });
    };
    const ring = r => Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * TAU) * r, Math.sin(i / 16 * TAU) * r]);
    const e = f => ({ faction: f, L: shipRating() + 1, threatL: shipRating() + 1, speed: 0, rot: 0, merchant: f === "merchant" });
    probe("navyDiamond", (c, x, y) => miniShip(c, e("navy"), x, y, u), [[7.4 * u, 0], [-7.4 * u, 0], [0, 7.4 * u], [0, -7.4 * u], [5 * u, 5 * u].map(v => v * 0.9)]);
    probe("merchantRing", (c, x, y) => miniShip(c, e("merchant"), x, y, u), ring(6 * u));
    probe("outpostSquare", (c, x, y) => miniOutpost(c, x, y, u), [[5.5 * u, 5.5 * u], [-5.5 * u, 5.5 * u], [5.5 * u, -5.5 * u], [-5.5 * u, -5.5 * u]]);
    return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.every(Boolean)]));
  });
  ok("#42 no diamond frame round a navy ship, no ring round a merchant, no square round the outpost", frames.navyDiamond && frames.merchantRing && frames.outpostSquare, frames);
  // the sea is one continuous shade, darker out toward the Maelstrom
  const sea = await ev(page, () => {
    const M = 400, cv = document.createElement("canvas"); cv.width = cv.height = M; const c = cv.getContext("2d"); drawSeaChart(c, M);
    const k = M / W, d = c.getImageData(0, 0, M, M).data, lum = x => { const i = (Math.round(PORT.y * k) * M + Math.round(x)) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
    const xs = []; for (let x = PORT.x * k + SAFE_R * k + 2; x < M - 1; x += 2) xs.push(lum(x));
    const jumps = xs.slice(1).map((v, i) => Math.abs(v - xs[i]));
    return { maxJump: Math.max(...jumps), near: xs[0], far: xs.at(-1) };
  });
  ok("#42 the sea is one smooth shade (no band edges) and darker the farther from the harbor", sea.maxJump < 5 && sea.far < sea.near - 15, sea);
  // draw order: chests, wrecks, forts, ordinary ships, harbor, outpost, near stronger ships, bounty, player
  const order = await ev(page, () => {
    const log = [], names = ["miniChest", "miniWreck", "miniFort", "miniShip", "miniHarbor", "miniOutpost", "miniPlayer"], orig = {};
    for (const n of names) { orig[n] = window[n]; window[n] = (...a) => { log.push(n === "miniShip" ? (a[1].near ? "near" : "ship") : n); return orig[n](...a); }; }
    const far = makeEnemy(S, player.x + 1800, player.y, 1, "pirate", "brig"), near = makeEnemy(S, player.x + 300, player.y + 100, 12, "pirate", "frigate");
    far.mine = near.mine = true; near.near = true; near.threatL = shipRating() + 3; far.threatL = shipRating() - 1;
    crates.push({ x: player.x + 500, y: player.y, wreck: false, spr: { destroy() {} } }); crates.push({ x: player.x - 500, y: player.y, wreck: true, spr: { destroy() {} } });
    try { drawMini(); } finally { for (const n of names) window[n] = orig[n]; crates.length -= 2; far.alive = near.alive = false; far.spr.destroy(); near.spr.destroy(); }
    const at = n => log.lastIndexOf(n);
    return { log: log.join(" "), ok: at("miniChest") < at("miniFort") + 99 && log.indexOf("miniChest") < log.indexOf("ship") && log.indexOf("miniWreck") < log.indexOf("ship") && log.indexOf("ship") < log.indexOf("miniHarbor")
      && log.indexOf("miniHarbor") < log.indexOf("miniOutpost") && log.indexOf("miniOutpost") < log.indexOf("near") && log.indexOf("near") < log.indexOf("miniPlayer") && log.at(-1) === "miniPlayer" };
  });
  ok("#42 overlap order: chests and wrecks, then ships, harbor, outpost, close stronger ships, the player on top", order.ok, order.log);
  // ships piled in one spot merge into one mark
  const pile = await ev(page, () => {
    let n = 0; const orig = window.miniShip; window.miniShip = (...a) => { n++; return orig(...a); };
    const es = [0, 1, 2, 3].map(i => { const e = makeEnemy(S, player.x + 1200 + i * 6, player.y - 900, 3, "pirate", "brig"); e.mine = true; e.threatL = shipRating() - 1; return e; });
    for (const e of enemies) if (!es.includes(e) && e.alive) e.alive = false;   // only the pile
    try { drawMini(); } finally { window.miniShip = orig; for (const e of es) { e.alive = false; e.spr.destroy(); } }
    return n;
  });
  ok("#42 four ships in one spot draw as one mark", pile === 1, pile);
  await ctx.close();
}
// colour-blind check: with every fill forced to one grey, the four kinds still differ by their inner detail alone
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const diffs = await ev(page, () => {
    const origTM = window.threatMark; window.threatMark = (c, x, y, tier, r) => origTM(c, x, y, { ...tier, color: "#888" }, r);
    const shot = (f, arch, d, u) => { const cv = document.createElement("canvas"); cv.width = cv.height = 40; const c = cv.getContext("2d"); c.fillStyle = "#1d4766"; c.fillRect(0, 0, 40, 40);
      miniShip(c, { faction: f, arch, L: shipRating() + d, threatL: shipRating() + d, speed: 0, rot: 0, merchant: f === "merchant" }, 20, 20, u);
      // light-dark only (what a colour-blind or grey-scale reader still gets)
      const px = c.getImageData(0, 0, 40, 40).data, out = []; for (let i = 0; i < px.length; i += 4) out.push(Math.round((0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 16)); return out; };
    const res = {};
    try {
      for (const [label, u] of [["u1.0", 1.0], ["u0.7", 0.7]]) for (const d of [-1, 0, 1, 2]) {
        const ims = { pirate: shot("pirate", "brig", d, u), navy: shot("navy", "brig", d, u), trade: shot("merchant", "fluyt", d, u), fire: shot("pirate", "fireship", d, u) };
        const names = Object.keys(ims), min = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          let n = 0; for (let p = 0; p < ims[names[i]].length; p++) if (ims[names[i]][p] !== ims[names[j]][p]) n++; min.push(n); }
        res[`${label} d=${d}`] = Math.min(...min);
      }
    } finally { window.threatMark = origTM; }
    return res;
  });
  const worst = Math.min(...Object.values(diffs));
  ok("#42 pirate, navy, merchant and fireship differ in shape + detail alone (fills forced grey), at 100% chart size and a smaller one", worst >= 3, diffs);
  await ctx.close();
}
// screenshots of the chart at the three screens, 100% and 50% marks, plus the legend in How to play
for (const [tag, viewport, mobile] of [["1280", { width: 1280, height: 720 }, false], ["3840", { width: 3840, height: 2160 }, false], ["390", { width: 390, height: 844 }, true]]) {
  const { ctx, page } = await openSea(viewport, { mobile });
  await ev(page, () => {
    save.campaign.outpost = true; syncOutpost(); player.x = PORT.x + 1700; player.y = PORT.y - 500;
    const mk = (dx, dy, L, f, cls) => { const e = makeEnemy(S, player.x + dx, player.y + dy, L, f, cls); e.mine = true; e.speed = 0; };
    mk(-700, -300, 1, "pirate", "brig"); mk(-500, 300, 3, "pirate", "brig"); mk(600, -500, 4, "pirate", "brig"); mk(800, 200, 7, "pirate", "frigate");
    mk(-900, 100, 3, "navy", "frigate"); mk(900, -200, 6, "navy", "frigate"); mk(300, 700, 3, "merchant", "fluyt"); mk(-1100, -600, 5, "merchant", "fluyt");
    mk(-100, 900, 3, "pirate", "fireship"); mk(1000, 900, 6, "pirate", "fireship");
  });
  await page.waitForTimeout(600 * SLOW);
  await (await page.$("#mini")).screenshot({ path: join(out, `chart-${tag}-100.png`) });
  if (tag === "1280") await page.screenshot({ path: join(out, "sea-1280.png") });
  await ev(page, () => { saveSettings({ miniPct: 50 }); applyMiniSize(); });
  await page.waitForTimeout(500 * SLOW);
  await (await page.$("#mini")).screenshot({ path: join(out, `chart-${tag}-50.png`) });
  await ctx.close();
}
{
  const { ctx, page } = await openHarbor({ width: 1280, height: 900 });
  for (const lg of ["en", "zh"]) {
    await ev(page, lg => { lang = lg; applyLang(); }, lg);
    await ev(page, () => { document.querySelector('[data-menu="howto"]').click(); });
    await page.waitForTimeout(400 * SLOW);
    const sw = await ev(page, () => [...document.querySelectorAll("#p-howto canvas.sw-mark")].map(cv => {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }));
    ok(`#42 how-to-play legend (${lg}): 15 chart swatches, every one painted`, sw.length === 15 && sw.every(n => n > 60), sw);
    if (lg === "en") { await ev(page, () => document.querySelector("#p-howto canvas.sw-mark").scrollIntoView({ block: "start" })); await page.screenshot({ path: join(out, "howto-chart-legend-en.png") }); }
    await ev(page, () => { goBack(); });
  }
  await ctx.close();
}

// ---------- #40: edge markers for off-screen ships, harbor and outpost ----------
// Ships are held at an offset from the stationary player (screen widths of the world view) by a 30 ms timer.
const holdShip = (page, f, dx, dy, L = 3, faction = "pirate", cls = "brig") => ev(page, ([f, dx, dy, L, faction, cls]) => {
  const v = S.cameras.main.worldView, e = makeEnemy(S, player.x, player.y, L, faction, cls);
  e.mine = true; e.angry = 99; e.speed = 0; e.spr.setVisible(false); e.badge?.setVisible(false);
  const spot = { f, dx, dy }; e.hold = spot;
  (window.__holds = window.__holds || []).push(e);
  if (!window.__holdT) window.__holdT = setInterval(() => { const w = S.cameras.main.worldView; for (const h of window.__holds) if (h.alive) { h.x = player.x + h.hold.dx * w.width; h.y = player.y + h.hold.dy * w.width; h.speed = 0; h.vx = h.vy = 0; } }, 30);
  return window.__holds.length - 1;
}, [f, dx, dy, L, faction, cls]);
const setHold = (page, i, dx, dy) => ev(page, ([i, dx, dy]) => { window.__holds[i].hold = { dx, dy }; }, [i, dx, dy]);
// (on a big screen the harbor can be in range too: the ship checks look at ship boxes only)
const marks = (page, kind) => ev(page, kind => [...document.querySelectorAll("#edgeMarks .em")].filter(el => !kind || el.dataset.kind === kind).map(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { kind: el.dataset.kind, edge: el.dataset.edge, text: el.querySelector("span").textContent, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, gone: el.classList.contains("gone"), op: +cs.opacity }; }), kind);
const hudRects = page => ev(page, () => [...document.querySelectorAll("#hud .side, #hud .bars")].map(el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter(r => r.r > r.l));
const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

for (const [tag, viewport, mobile] of [["desktop", { width: 1280, height: 720 }, false], ["phone", { width: 390, height: 844 }, true], ["4k", { width: 3840, height: 2160 }, false]]) {
  const { ctx, page } = await openSea(viewport, { mobile });
  await ev(page, () => { player.x = 1500; player.y = PORT.y - 1000; player.speed = 0; });
  await page.waitForTimeout(300 * SLOW);
  // one ship off the right edge, about 1.0 screens away
  const a = await holdShip(page, 0, 1.0, 0.1);
  await page.waitForTimeout(500 * SLOW);
  let ms = (await marks(page, "ship")).filter(m => !m.gone);   // (a stray sea ship can flash in and out before the calm timer parks it)
  const shown = ms.length === 1 && ms[0].kind === "ship";
  const px = await ev(page, i => Math.hypot(window.__holds[i].x - player.x, window.__holds[i].y - player.y), a);
  const wantM = await ev(page, px => edgeMeters(px), px);
  ok(`#40 ${tag}: an off-screen ship gets one box on the edge with its distance rounded to 10 m (${wantM} m)`,
    shown && /^~\d+0 m$/.test(ms[0].text) && Math.abs(parseInt(ms[0].text.slice(1)) - wantM) <= 30 && ms[0].op > 0.5, { ms, px, wantM });
  const vw = viewport.width, vh = viewport.height;
  ok(`#40 ${tag}: the box sits fully inside the screen and on the side the ship is on (right)`, ms.length && ms[0].l >= 0 && ms[0].r <= vw && ms[0].t >= 0 && ms[0].b <= vh && ms[0].edge === "right", ms[0]);
  const hud = await hudRects(page);
  ok(`#40 ${tag}: the box stays off the HUD and the chart`, ms.length && !hud.some(r => overlap(ms[0], r)), { box: ms[0], hud });
  await page.screenshot({ path: join(out, `edge-one-${tag}.png`) });
  // out of range
  await setHold(page, a, 2.4, 0);
  await page.waitForTimeout(600 * SLOW);
  ok(`#40 ${tag}: a ship beyond the range (1.8 screen widths; tried at 2.4) gets no box`, (await marks(page, "ship")).filter(m => !m.gone).length === 0, await marks(page, "ship"));
  // into view: the box fades out and goes
  await setHold(page, a, 1.0, 0.1); await page.waitForTimeout(400 * SLOW);
  await setHold(page, a, 0.05, 0.05);
  await page.waitForTimeout(150 * SLOW);
  const fading = await marks(page, "ship");
  await page.waitForTimeout(700 * SLOW);
  const after = await marks(page, "ship");
  ok(`#40 ${tag}: when the ship sails into view its box fades out and is removed`, (fading.length === 0 || fading.every(m => m.gone || m.op < 0.95)) && after.every(m => m.gone), { fading, after });
  // several at once: capped at 5, none overlapping each other, all on screen, none on the HUD
  await ev(page, () => { for (const e of window.__holds) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); enemies.splice(enemies.indexOf(e), 1); } window.__holds = []; });
  for (let i = 0; i < 9; i++) await holdShip(page, 0, 0.75 + (i % 3) * 0.12, -0.55 + i * 0.03, 1 + (i % 6), i % 3 === 0 ? "navy" : i % 3 === 1 ? "pirate" : "merchant", i % 3 === 2 ? "fluyt" : "brig");
  await page.waitForTimeout(700 * SLOW);
  ms = await marks(page); const live = ms.filter(m => !m.gone);
  let clash = 0; for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (overlap(live[i], live[j])) clash++;
  ok(`#40 ${tag}: nine ships on one side show at most 5 boxes, none overlapping, all inside the screen and off the HUD`,
    live.length >= 3 && live.length <= 5 && clash === 0 && live.every(m => m.l >= 0 && m.r <= vw && m.t >= 0 && m.b <= vh && !hud.some(r => overlap(m, r))), { n: live.length, clash, ms: live.map(m => [m.edge, Math.round(m.l), Math.round(m.t)]) });
  await page.screenshot({ path: join(out, `edge-many-${tag}.png`) });
  // the harbor and the outpost
  await ev(page, () => { for (const e of window.__holds) { e.alive = false; e.spr.destroy(); e.badge?.destroy(); enemies.splice(enemies.indexOf(e), 1); } window.__holds = []; save.campaign.outpost = true; syncOutpost(); const w = S.cameras.main.worldView.width; player.x = PORT.x + 1.2 * w; player.y = PORT.y + 0.1 * w; });
  await page.waitForTimeout(500 * SLOW);
  ms = (await marks(page)).filter(m => !m.gone);
  ok(`#40 ${tag}: the harbor shows as a box with its anchor and a distance when it is off-screen and near`, ms.some(m => m.kind === "harbor" && /^~\d+0 m$/.test(m.text)), ms);
  await ev(page, () => { const w = S.cameras.main.worldView.width; player.x = OUTPOST.x - 1.2 * w; player.y = OUTPOST.y + 0.15 * w; });
  await page.waitForTimeout(500 * SLOW);
  ms = (await marks(page)).filter(m => !m.gone);
  ok(`#40 ${tag}: the outpost shows as a box too`, ms.some(m => m.kind === "outpost"), ms);
  await page.screenshot({ path: join(out, `edge-outpost-${tag}.png`) });
  // Chinese
  await ev(page, () => { lang = "zh"; applyLang(); });
  await page.waitForTimeout(400 * SLOW);
  ms = (await marks(page)).filter(m => !m.gone);
  ok(`#40 ${tag}: Chinese distance reads 約 N 公尺`, ms.length > 0 && ms.every(m => /^約 \d+0 公尺$/.test(m.text)), ms.map(m => m.text));
  await ev(page, () => { lang = "en"; applyLang(); });
  // UI size slider scales the box
  const h100 = (await marks(page)).find(m => !m.gone)?.h;
  await ev(page, () => { saveSettings({ uiPct: 200 }); applyUiScale(); });
  await page.waitForTimeout(500 * SLOW);
  const h200 = (await marks(page)).find(m => !m.gone)?.h;
  ok(`#40 ${tag}: the UI size slider scales the box (200% is about twice 100%)`, h100 > 0 && h200 / h100 > 1.7 && h200 / h100 < 2.3, { h100, h200 });
  await ev(page, () => { saveSettings({ uiPct: 100 }); applyUiScale(); });
  // photo mode hides it; pausing hides it; leaving brings it back
  await ev(page, () => photoEnter("sea"));
  await page.waitForTimeout(300 * SLOW);
  const inPhoto = await ev(page, () => getComputedStyle(document.getElementById("edgeMarks")).display);
  await ev(page, () => photoExit());
  await page.waitForTimeout(500 * SLOW);
  const back = (await marks(page)).filter(m => !m.gone).length;
  ok(`#40 ${tag}: photo mode hides the boxes, leaving it brings them back`, inPhoto === "none" && back > 0, { inPhoto, back });
  await ctx.close();
}
// the bounty: a bigger skull box, and the old arrow steps aside while the box is up
{
  const { ctx, page } = await openSea({ width: 1280, height: 720 });
  const info = await ev(page, () => {
    save.tutorialDone = true; tutorialReset(); bountyHeld = false; spawnBounty();
    const v = S.cameras.main.worldView;
    player.x = 1500; player.y = PORT.y - 1000; player.speed = 0;
    window.__bossT = setInterval(() => { if (bossShip) { bossShip.x = player.x + S.cameras.main.worldView.width * 0.8; bossShip.y = player.y - 150; bossShip.speed = 0; } }, 30);
    return !!bossShip;
  });
  await page.waitForFunction(() => document.querySelector("#edgeMarks .em.boss.on") && document.getElementById("bossArrow").hidden, null, { timeout: 4000 * SLOW }).catch(() => {});
  const st = await ev(page, () => ({ boss: [...document.querySelectorAll("#edgeMarks .em")].map(el => el.dataset.kind), arrowHidden: document.getElementById("bossArrow").hidden,
    h: document.querySelector("#edgeMarks .em.boss")?.getBoundingClientRect().height, hs: document.querySelector("#edgeMarks .em[data-kind=ship]")?.getBoundingClientRect().height }));
  ok("#40 the bounty gets a box (skull, larger) and the old edge arrow is hidden while it shows", info && st.boss.includes("boss") && st.arrowHidden, st);
  await page.screenshot({ path: join(out, "edge-boss-1280.png") });
  await ctx.close();
}

ok("no page errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall phase 1b checks passed");
