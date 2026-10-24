// Ship lines in headless Chrome (js/ship-lines.js, js/data.js SHIPS): the yard sells both lines with a comparison against your ship, every
// ship's real stats reach the sea (speed, turn, guns), the real steering code reproduces the chase times, the Wanted poster says who
// outruns whom, a fully refitted ship of each tier can meet its bounty, and screenshots of each hull go to .review/shiplines/.
// Usage: node tests/shiplines.mjs [url] [outDir]     (exit 1 on any failed check or page error)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const SLOW = +process.env.TEST_SLOW || 1;

const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = process.argv[3] || ".review/shiplines";
mkdirSync(out, { recursive: true });
const fails = [], errors = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

const G = g => ({ g, lv: 1 });
const SAVE = JSON.stringify({ v: 2, gold: 99999, ship: "sloop", hull: 1, sails: 1, hold: 1, bow: [G("six")], left: [G("six")], right: [G("six")],
  stern: [], store: [], sunk: 0, wrecks: [], salvage: [], seed: 424242, tutorialDone: true, campaign: { bounty: 4, deaths: 0 } });

const ready = async page => {
  await page.waitForFunction(() => typeof player !== "undefined" && player && typeof S !== "undefined" && S && typeof titleOpen !== "undefined", null, { timeout: 15000 * SLOW });
  if (await page.evaluate(() => titleOpen)) await page.click("[data-smoke=start]");
  await page.evaluate(() => { if (!docked) dock("welcome"); });
  await page.waitForFunction(() => docked, null, { timeout: 15000 * SLOW });
  await page.waitForTimeout(500 * SLOW);   // shop buttons ignore clicks for a moment after the ledger opens (js/menu.js)
};
async function open(lang = "en", view = { width: 1280, height: 720 }, save = SAVE) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await ready(page);
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); localStorage.setItem("privateers-save-v2", s); }, [lang, save]);
  await page.reload({ waitUntil: "load" });
  await ready(page);
  return { ctx, page };
}
const buy = async (page, id) => {   // two taps: arm, then confirm
  await page.click(`#ships [data-act="ship"][data-id="${id}"]`); await page.waitForTimeout(500 * SLOW);
  await page.click(`#ships [data-act="ship"][data-id="${id}"]`); await page.waitForTimeout(200 * SLOW);
};
const shot = (page, name, sel) => (sel ? page.locator(sel).first() : page).screenshot({ path: join(out, name + ".png") });

// ---------- the yard: two lines, each ship against yours ----------
{
  const { ctx, page } = await open();
  const rows = await page.evaluate(() => [...document.querySelectorAll("#ships > *")].map(el => el.matches(".hint-s") ? { head: el.textContent } : { id: el.querySelector(".btn")?.dataset.id, act: el.querySelector(".btn")?.dataset.act, nm: el.querySelector(".nm").textContent, cmp: el.querySelector(".cmp")?.textContent || "", ds: el.querySelector(".ds").textContent }));
  const heads = rows.filter(r => r.head).map(r => r.head);
  check(heads.length >= 3 && heads.some(h => /^Fast line/.test(h)) && heads.some(h => /^Heavy line/.test(h)), `the yard has a heading for each line: ${JSON.stringify(heads)}`);
  const sale = rows.filter(r => r.act === "ship").map(r => r.id);
  check(sale.join() === "schooner,brigantine,cruiser,corsair,gunboat,brig,frigate,line", `sale order, fast then heavy, by tier: ${sale}`);
  check(rows.filter(r => r.act === "ship").every(r => /^Against a new Sloop:/.test(r.cmp)), "every ship on sale is compared with the ship you sail");
  const c = rows.find(r => r.id === "corsair"), l = rows.find(r => r.id === "line");
  check(/Speed \+\d+%/.test(c.cmp) && /Turn \+\d+%/.test(c.cmp) && /Firepower \+/.test(c.cmp), `corsair vs sloop: ${c.cmp}`);
  check(/16 guns in all|14 guns in all/.test(c.ds) && /30 guns in all/.test(l.ds), `guns in all: corsair "${c.ds.match(/\d+ guns in all/)}", line "${l.ds.match(/\d+ guns in all/)}"`);
  check(/turns ×1\.4/.test(c.ds) && !/turns/.test(l.ds), "turn factor shown for hulls that differ from 1");
  await page.evaluate(() => { save = { ...save, ship: "line", hull: 3, sails: 2, hold: 2 }; save = fitMounts(save); applyPlayerStats(true); renderPort(); });
  const vs = await page.evaluate(() => document.querySelector('#ships [data-id="corsair"]').closest(".item").querySelector(".cmp").textContent);
  check(/^Against a new Ship of the Line:/.test(vs) && /Speed \+6\d%/.test(vs) && /Hull −2\d%/.test(vs) && /Hold −3\d%/.test(vs), `after switching to the line, the corsair reads: ${vs}`);
  await page.evaluate(() => { save = { ...save, ship: "sloop", hull: 1, sails: 1, hold: 1 }; save = fitMounts(save); applyPlayerStats(true); renderPort(); });
  await page.waitForTimeout(150 * SLOW);
  await shot(page, "yard-en-desktop", "#ships");
  await ctx.close();
}
{
  const { ctx, page } = await open("zh");
  const heads = await page.evaluate(() => [...document.querySelectorAll("#ships .hint-s")].map(e => e.textContent));
  check(heads.some(h => /^快速線/.test(h)) && heads.some(h => /^重砲線/.test(h)), `繁中 line headings: ${JSON.stringify(heads)}`);
  const cmp = await page.evaluate(() => document.querySelector('#ships [data-id="corsair"]').closest(".item").querySelector(".cmp").textContent);
  check(/與全新的單桅帆船相比/.test(cmp) && /速度 \+/.test(cmp), `繁中 compare: ${cmp}`);
  const names = await page.evaluate(() => ["gunboat", "brigantine", "cruiser", "corsair"].map(id => document.querySelector(`#ships [data-id="${id}"]`).closest(".item").querySelector(".nm").textContent));
  check(names.join() === "砲艇,雙桅快帆船,巡航艦,私掠快艦", `繁中 names: ${names}`);
  await shot(page, "yard-zh-desktop", "#ships");
  await ctx.close();
}
{
  const { ctx, page } = await open("en", { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `no sideways scroll at 390 px (${overflow})`);
  await page.locator("#ships").scrollIntoViewIfNeeded();
  await shot(page, "yard-en-mobile", "#ships");
  await ctx.close();
}

// ---------- the sea: every ship's real numbers, and the real steering code ----------
{
  const { ctx, page } = await open();
  const res = await page.evaluate(() => {
    const out = {};
    const merchant = L => { const e = { L, faction: "merchant", x: 0, y: 0 }; outfitEnemy(e, "fluyt"); return e; };
    // the real steer() on bare bodies: the chaser at full throttle for the prey, the prey running straight from it (a merchant wobbles)
    const chase = (c, p, d0, done, wobble) => {
      const a = { x: 0, y: 0, rot: 0, speed: c.maxSpeed, maxSpeed: c.maxSpeed, turnRate: c.turnRate }, b = { x: d0, y: 0, rot: 0, speed: p.maxSpeed, maxSpeed: p.maxSpeed, turnRate: p.turnRate };
      const dt = 0.05;
      for (let t = 0; t < 240; t += dt) {
        if (done(Math.hypot(b.x - a.x, b.y - a.y))) return t;
        const to = Math.atan2(b.y - a.y, b.x - a.x);
        steer(a, to, 1, dt); steer(b, to + (wobble ? Math.sin(t * 1.1) * 0.5 : 0), 1, dt);
        for (const s of [a, b]) { s.x += Math.cos(s.rot) * s.speed * dt; s.y += Math.sin(s.rot) * s.speed * dt; }
      }
      return 1e9;
    };
    for (const id of SHIP_ORDER) {
      save = fitMounts({ ...defaultSave(), ship: id, hull: 1, hold: 1, sails: 1 });
      for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six"));
      applyPlayerStats(true);
      const guns = Object.values(player.guns).flat().length, me = { maxSpeed: player.maxSpeed, turnRate: player.turnRate };
      out[id] = { speed: player.maxSpeed, turn: player.turnRate, hp: player.maxHp, cap: player.cap, guns, art: player.cls, rating: shipRating(),
        m6: chase(me, merchant(6), 600, d => d <= 270, true), m9: chase(me, merchant(9), 600, d => d <= 270, true),
        away: chase({ maxSpeed: enemyStats(8, false).speed * ARCH.brig.speed, turnRate: 1.7 }, me, 150, d => d >= 900, false) };
    }
    return out;
  });
  console.log("  ship        kn   turn  hp    hold  guns art         lv  merchant L6 / L9 (s)   brig L8 loses you after (s)");
  for (const [id, r] of Object.entries(res)) console.log(`  ${id.padEnd(11)} ${String(Math.round(r.speed)).padStart(3)}  ${r.turn.toFixed(2)}  ${String(r.hp).padStart(4)}  ${String(r.cap).padStart(4)}  ${String(r.guns).padStart(3)}  ${r.art.padEnd(10)}  ${String(r.rating).padStart(2)}  ${r.m6.toFixed(1).padStart(6)} / ${r.m9 > 1e8 ? "never" : r.m9.toFixed(1).padStart(6)}   ${r.away > 1e8 ? "never" : r.away.toFixed(1)}`);
  const slots = { sloop: 3, schooner: 5, gunboat: 7, brigantine: 6, brig: 7, cruiser: 10, frigate: 17, corsair: 14, line: 30 };
  check(Object.entries(slots).every(([id, n]) => res[id].guns === n), `every ship's guns reach the sea: ${Object.entries(res).map(([k, v]) => k + v.guns)}`);
  check(Object.keys(res).every(id => res[id].art === id), "each ship is drawn as its own hull");
  check(Math.abs(res.corsair.turn - 2.5 * 1.4) < 1e-9 && Math.abs(res.line.turn - 2.5) < 1e-9 && Math.abs(res.gunboat.turn - 2.25) < 1e-9, "turn rate = 2.5 x the hull's factor");
  check(res.corsair.speed === 235 && res.line.speed === 140 && res.corsair.speed / res.line.speed > 1.6, "corsair 235 against line 140 px/s (x1.68)");
  check(res.corsair.m9 < 6 && res.cruiser.m9 < 6 && res.brigantine.m9 < 10, `the fast line catches a Lv 9 merchant in seconds: ${res.brigantine.m9.toFixed(1)} / ${res.cruiser.m9.toFixed(1)} / ${res.corsair.m9.toFixed(1)} s`);
  check(res.line.m9 > 100 && res.line.m9 >= 20 * res.corsair.m9 && res.frigate.m9 >= 5 * res.cruiser.m9, `the heavy line needs far longer: frigate ${res.frigate.m9.toFixed(1)} s, line ${res.line.m9.toFixed(1)} s`);
  check(["brig", "frigate", "line"].every(id => res[id].away > 1e8) && ["cruiser", "corsair"].every(id => res[id].away < 25), "a Lv 8 brig outruns the heavy line for good and loses the cruiser and the corsair");
  await ctx.close();
}

// ---------- a fully refitted ship of each tier can meet its bounty (both lines) ----------
{
  const { ctx, page } = await open();
  const res = await page.evaluate(() => {
    const rec = BOUNTIES.map(b => bountyRecLv(b)), rows = [];
    const rate = (id, hull, g, gl) => { save = fitMounts({ ...defaultSave(), ship: id, hull, hold: 4, sails: 1 }); for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem(g, gl)); return shipRating(); };
    const tiers = [["sloop"], ["schooner", "gunboat"], ["brigantine", "brig"], ["cruiser", "frigate"], ["corsair", "line"]];
    tiers.forEach((ids, i) => { for (const id of ids) rows.push({ id, bounty: BOUNTIES[i].id, rec: rec[i], six5: rate(id, 5, "six", 3), carr8: rate(id, 8, "carronade", 6), max: rate(id, 15, "carronade", 10) }); });
    return rows;
  });
  console.log("  ship        faces    goal  hull5+six3  hull8+carr6  hull15+carr10");
  for (const r of res) console.log(`  ${r.id.padEnd(11)} ${r.bounty.padEnd(8)} ${String(r.rec).padStart(3)}   ${String(r.six5).padStart(6)}      ${String(r.carr8).padStart(6)}      ${String(r.max).padStart(6)}`);
  check(res.every(r => r.max >= r.rec), `at the yard's ceiling every ship meets the goal of the bounty its tier faces: ${res.filter(r => r.max < r.rec).map(r => r.id) || "all"}`);
  const top = id => res.find(r => r.id === id);
  check(top("corsair").max >= top("corsair").rec && top("line").max >= top("line").rec, `both top ships can take the Admiral (goal ${top("line").rec}): corsair ${top("corsair").max}, line ${top("line").max}`);
  check(res.filter(r => r.id !== "sloop").every(r => r.max - r.carr8 >= 1), "every ship still has levels to gain from the yard past a mid refit");
  await ctx.close();
}

// ---------- the Wanted poster ----------
{
  const { ctx, page } = await open();
  const poster = async (ship, bounty) => {
    await page.evaluate(([id, b]) => { save = { ...save, ship: id, hull: 1, sails: 1, hold: 1, campaign: { ...save.campaign, bounty: b } }; save = fitMounts(save); applyPlayerStats(true); renderPort(); }, [ship, bounty]);
    return page.evaluate(() => ({ rec: document.querySelector(".p-rec")?.textContent || "", speed: document.querySelector(".p-rec .speed")?.textContent || "", prize: [...document.querySelectorAll(".p-facts div")].pop()?.textContent || "" }));
  };
  const open0 = await poster("sloop", 0), c3 = await poster("corsair", 3), l3 = await poster("line", 3), s3 = await poster("frigate", 2);
  check(/unlocks the Schooner \/ Gunboat/.test(open0.prize), `poster 1 names both hulls it opens: ${open0.prize}`);
  check(/unlocks the Cruiser \/ Frigate and the Hulk Outpost/.test((await poster("sloop", 2)).prize), "poster 3 names tier 4 on both lines, and the outpost");
  check(/You outrun it by \d+%/.test(c3.speed), `fast ship vs Hale: ${c3.speed}`);
  check(/It outruns you by \d+%/.test(l3.speed), `heavy ship vs Hale: ${l3.speed}`);
  check(s3.speed === "" || /outrun/.test(s3.speed), `a boss near your speed adds no line: "${s3.speed}"`);
  const rec = (await page.evaluate(() => { save = { ...save, ship: "corsair" }; save = fitMounts(save); return bountyRecLv(activeBounty()); }));
  await shot(page, "poster-line-en", "#wanted");
  await page.evaluate(() => { lang = "zh"; renderPort(); });
  await page.waitForTimeout(200 * SLOW);
  const zh = await page.evaluate(() => document.querySelector(".p-rec .speed")?.textContent || "");
  check(rec > 0 && (/你比它快|它比你快|^$/.test(zh)), `繁中 poster hint: ${zh}`);
  await ctx.close();
}

// ---------- buy, sail and look at every hull ----------
{
  const { ctx, page } = await open();
  await buy(page, "corsair");
  let s = await page.evaluate(() => ({ ship: save.ship, gold: save.gold, fleet: save.fleet.map(e => e.ship), turn: player.turnRate, speed: player.maxSpeed, guns: Object.values(player.guns).flat().length, msg: document.getElementById("pMsg").textContent }));
  check(s.ship === "corsair" && s.gold === 99999 - 14500 && s.fleet.join() === "sloop", `bought a corsair at 14,500: gold ${s.gold}`);
  check(s.turn === 3.5 && s.speed === 235, `aboard: turn ${s.turn}, speed ${s.speed}`);
  await buy(page, "gunboat");
  s = await page.evaluate(() => ({ ship: save.ship, fleet: save.fleet.map(e => e.ship).sort(), turn: player.turnRate }));
  check(s.ship === "gunboat" && s.fleet.join() === "corsair,sloop" && s.turn === 2.25, `a gunboat too, the corsair waits in the yard: ${s.fleet}`);
  const mine = await page.evaluate(() => [...document.querySelectorAll("#ships .item")].filter(e => e.querySelector('[data-act="switch"], .max')).map(e => e.querySelector(".nm").textContent));
  check(mine.some(n => /Corsair/.test(n) && /Fast/.test(n)) && mine.some(n => /Gunboat/.test(n) && /Heavy/.test(n)), `owned ships carry their line: ${JSON.stringify(mine)}`);
  await page.click('#ships [data-act="switch"]'); await page.waitForTimeout(300 * SLOW);
  // every hull on the gun deck
  for (const id of ["sloop", "schooner", "gunboat", "brigantine", "brig", "cruiser", "frigate", "corsair", "line"]) {
    await page.evaluate(i => { save = fitMounts({ ...save, ship: i }); for (const { key } of MOUNTS) save[key] = save[key].map(() => gunItem("six")); applyPlayerStats(true); renderPort(); }, id);
    await page.waitForTimeout(150 * SLOW);
    await shot(page, "deck-" + id, "#deck");
  }
  await page.evaluate(() => { save = fitMounts({ ...save, ship: "corsair" }); applyPlayerStats(true); renderPort(); });
  await shot(page, "harbor-corsair-en");
  await page.evaluate(() => { document.getElementById("sail").click(); });
  await page.waitForTimeout(900 * SLOW);
  const sailing = await page.evaluate(() => ({ docked, alive: player.alive, cls: player.cls }));
  check(!sailing.docked && sailing.alive && sailing.cls === "corsair", "the corsair sails out");
  await shot(page, "sea-corsair");
  await page.evaluate(() => { sendHome(); dock("return"); save = fitMounts({ ...save, ship: "line" }); applyPlayerStats(true); setSail(); });
  await page.waitForTimeout(900 * SLOW);
  await shot(page, "sea-line");
  await ctx.close();
}

// ---------- an old save: same ship, upgrades and guns; the new hulls open with the bounties already claimed ----------
{
  const old = JSON.stringify({ v: 2, gold: 1234, ship: "frigate", hull: 6, sails: 3, hold: 4, bow: [G("long12"), G("six")], left: new Array(7).fill(0).map((_, i) => ({ g: "carronade", lv: 1 + i })), right: [], stern: [G("six")],
    store: [{ g: "chain", lv: 3 }], sunk: 40, wrecks: [], salvage: [], seed: 99, tutorialDone: true, campaign: { bounty: 3, ships: ["sloop", "schooner", "brig", "frigate"], deaths: 0 } });
  const { ctx, page } = await open("en", { width: 1280, height: 720 }, old);
  const s = await page.evaluate(() => ({ ship: save.ship, hull: save.hull, sails: save.sails, hold: save.hold, gold: save.gold, maxHp: player.maxHp, speed: player.maxSpeed, turn: player.turnRate, rating: shipRating(),
    carr: save.left.filter(g => g && g.g === "carronade").length, store: save.store.length, ships: save.campaign.ships, buy: [...document.querySelectorAll('#ships .item:not(.locked) [data-act="ship"]')].map(b => b.dataset.id) }));
  check(s.ship === "frigate" && s.hull === 6 && s.sails === 3 && s.hold === 4 && s.gold === 1234, "an old frigate save keeps its ship, upgrades and gold");
  check(s.maxHp === Math.round(585 * 1.15 ** 5) && s.speed === Math.round(150 * 1.09) && s.turn === 2.5, `and its real numbers: ${s.maxHp} HP, ${s.speed} px/s, turn ${s.turn}`);
  check(s.carr === 7 && s.store === 1, "its guns and store are all there");
  check(["sloop", "schooner", "gunboat", "brigantine", "brig", "cruiser", "frigate"].every(id => s.ships.includes(id)) && !s.ships.includes("corsair"), `bounty 3 has opened tiers 2-4 on both lines: ${s.ships}`);
  check(s.buy.includes("cruiser") && s.buy.includes("gunboat") && !s.buy.includes("corsair"), `the yard offers the new tier-2 to tier-4 hulls: ${s.buy}`);
  await ctx.close();
}

await browser.close();
for (const e of errors) { console.log("  ERROR " + e); fails.push(e); }
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall ship-line checks passed");
process.exit(fails.length ? 1 : 0);
