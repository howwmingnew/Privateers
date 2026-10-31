// Rematch checks in headless Chrome (js/rematch.js): a beaten captain sails again from his lair each departure, at most two at once,
// a rematch sinking pays a quarter of the chest and leaves the campaign alone, the hall records it, a daily run has none,
// and an old save (no hall field) loads. Usage: node tests/rematch.mjs [url]
import { chromium } from "playwright";
const SLOW = +process.env.TEST_SLOW || 1;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? "  ok    " : "  FAIL  ") + msg); };
const browser = await chromium.launch({ channel: "chrome", headless: true });

// no hall: an old save. No campaign.order: an order-1 campaign (5 bounties), whose count past Mother Carey moves up one on load (#140); cv 2: the six-bounty order
const save = (bounty, cv) => JSON.stringify({ v: 2, gold: 500, sunk: 30, tutorialDone: true, seed: 424242, wrecks: [], campaign: cv ? { order: cv, bounty } : { bounty } });
async function open(saveJson, lang = "en") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
  await page.evaluate(([l, s]) => { localStorage.clear(); localStorage.setItem("privateers-lang", l); localStorage.setItem("privateers-save-v2", s); }, [lang, saveJson]);
  await page.reload({ waitUntil: "load" }); await ready();
  return { ctx, page, errors };
}
const done = async (tag, o) => { check(o.errors.length === 0, `${tag}: no page errors${o.errors.length ? " -> " + o.errors.join(" | ") : ""}`); await o.ctx.close(); };
const sail = page => page.evaluate(() => { if (!docked) { sendHome(); dock("return"); } setSail(); });
const bosses = page => page.evaluate(() => enemies.filter(e => e.boss && e.alive).map(e => ({ id: e.boss, rematch: !!e.rematch, escorts: enemies.filter(x => x.escortOf === e.boss && x.alive).length })));

console.log("Old (v1) save past Ned and Carey");
{
  const o = await open(save(2)), { page } = o;
  check(await page.evaluate(() => save.campaign.bounty === 3 && save.campaign.order === 2 && !!save.hall && save.hall.sunk === 0), "an old save with no hall loads; past Carey it counts the smuggler too (2 of 5 -> 3 of 6)");
  await sail(page);
  const b = await bosses(page);
  const re = b.filter(x => x.rematch).map(x => x.id).sort();
  check(re.join() === "carey,smuggler", `the two farthest beaten lairs sail again: Carey and the smuggler (${re})`);
  check(b.filter(x => !x.rematch).map(x => x.id).join() === "saint", "the hunted captain is still the Ashen Saint");
  check(b.find(x => x.id === "carey").escorts === 1, "a rematch captain brings his escorts");
  await done("old save", o);
}

console.log("Two captains beaten");
{
  const o = await open(save(2, 2)), { page } = o;
  check(await page.evaluate(() => save.campaign.bounty === 2), "a v2 save keeps its count (Ned and the smuggler)");
  await sail(page);
  const b = await bosses(page);
  const re = b.filter(x => x.rematch).map(x => x.id).sort();
  check(re.join() === "ned,smuggler", `Ned and the smuggler sail again (${re})`);
  check(b.filter(x => !x.rematch).map(x => x.id).join() === "carey", "the hunted captain is Mother Carey");
  check(await page.evaluate(() => rematches.length === 2 && rematches.every(r => /Rematch/.test(r.tag.txt.text))), "rematch name tags read “Rematch”");

  // sink Ned: pays 25% of 400, no campaign progress, hall records the time
  const r = await page.evaluate(() => {
    const ned = enemies.find(e => e.boss === "ned"), c0 = JSON.stringify(save.campaign), g0 = save.gold, k0 = save.stats.bounties;
    player.x = ned.x - 260; player.y = ned.y; player.maxHp = 1e6; player.hp = 1e6;
    hurt(ned, 5, 0, player);   // the first landed hit starts the clock
    hurt(ned, ned.hp + 1, 0, player);
    return { gain: save.gold - g0, want: rematchReward(BOUNTIES[0], lootMul()), c0, c1: JSON.stringify(save.campaign), k0, k1: save.stats.bounties,
      hall: save.hall.boss.ned, tags: rematches.length, bossStill: !!bossShip && bossShip.boss === "carey" };
  });
  check(r.gain === r.want && r.want === 100, `rematch pays a quarter of the chest (+${r.gain})`);
  check(r.c0 === r.c1 && r.k0 === r.k1, "campaign progress, rank and bounty count unchanged");
  check(r.hall > 0, `hall records Ned's fastest sinking (${r.hall}s)`);
  check(r.tags === 1 && r.bossStill, "only that tag goes; the hunt for Mother Carey carries on");

  // back to port and out again: Ned is back at his lair
  await page.evaluate(() => { sendHome(); dock("return"); });
  await sail(page);
  const b2 = await bosses(page);
  check(b2.filter(x => x.rematch).map(x => x.id).sort().join() === "ned,smuggler", "next sailing both sail again");
  const lair = await page.evaluate(() => { const n = enemies.find(e => e.boss === "ned"); return dist(n, lairOf(BOUNTIES[0])) < 400; });
  check(lair, "Ned is back at his lair");
  await page.evaluate(() => { lang = "zh"; applyLang(); });
  check(await page.evaluate(() => rematches.every(r => r.tag.txt.text.includes("再戰"))), "zh tag reads 再戰");
  await done("two beaten", o);
}

console.log("Four beaten (v1; five since the smuggler): the cap");
{
  const o = await open(save(4)), { page } = o;
  await sail(page);
  const b = await bosses(page);
  const re = b.filter(x => x.rematch).map(x => x.id).sort();
  check(re.join() === "hale,saint", `only two sail again, the farthest lairs (${re})`);
  check(b.filter(x => !x.rematch).map(x => x.id).join() === "thorne", "the hunted captain is the Admiral");
  await done("four beaten", o);
}

console.log("Fresh game and a daily run");
{
  const o = await open(save(0)), { page } = o;
  await sail(page);
  check((await bosses(page)).every(x => !x.rematch), "nobody beaten yet: no rematch");
  await done("fresh", o);
  const o2 = await open(save(3)), p2 = o2.page;
  await sail(p2);
  check((await bosses(p2)).filter(x => x.rematch).length === 2, "a save past the Saint: two rematches in the campaign");
  await p2.evaluate(() => startRun("daily"));
  await p2.waitForTimeout(300 * SLOW);
  check((await bosses(p2)).every(x => !x.rematch) && await p2.evaluate(() => rematches.length === 0), "the daily sea spawns no rematch captain");
  await done("daily", o2);
}

await browser.close();
if (fails.length) { console.error(`FAIL (${fails.length})\n` + fails.map(f => "  - " + f).join("\n")); process.exit(1); }
console.log("PASS: rematch checks.");
