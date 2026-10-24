"use strict";
// ---------- Runs: the daily sea and #seed= voyages, played on a throwaway copy of the save ----------
// A run swaps `save` for a sandbox (a fixed ship and guns for the daily sea, a fresh captain for a seed) and locks
// persist() (js/save.js), so privateers-save-v2 is untouched whatever happens; leaving puts the real save back. Every
// generation roll goes through the seeded RNG (setGenRng, js/util.js) and the islands come from the run's seed, so the same
// day or seed is the same sea on any device. The daily run's captain is a bounty entry made by dailySpec (js/daily.js).
//   daily  5 minutes, no harbor: sink today's captain; the result is kept in privateers-daily-v1 (js/daily.js)
//   seed   a free voyage (harbor, shop and campaign all work, none of it saved)
Object.assign(STR.en, {
  dr_start: "Daily sea #{n}: sink {boss} in {m} minutes. {trait}.", dr_seed: "Seed {seed}: a free voyage. Nothing here is saved.",
  dr_eyebrow: "Daily sea #{n}", dr_won: "{boss} sunk", dr_lost: "{boss} got away", dr_timeup: "Time's up", dr_fell: "Your ship went down",
  dr_time: "Time to sink", dr_sunk: "Ships sunk", dr_hull: "Hull left", dr_streak: "Daily streak", dr_none: "—",
  dr_best: "A new best for today!", dr_title: "Back to title", dr_again: "Sail again", dr_away: "{boss} got away.",
});
Object.assign(STR.zh, {
  dr_start: "每日海域 #{n}：{m} 分鐘內擊沉{boss}。{trait}。", dr_seed: "種子 {seed}：自由航程，這裡的一切都不會存檔。",
  dr_eyebrow: "每日海域 #{n}", dr_won: "{boss}已沉沒", dr_lost: "{boss}逃脫了", dr_timeup: "時間到", dr_fell: "你的船沉了",
  dr_time: "擊沉用時", dr_sunk: "擊沉艘數", dr_hull: "剩餘船體", dr_streak: "連續天數", dr_none: "—",
  dr_best: "今日新紀錄！", dr_title: "回到標題", dr_again: "再航一次", dr_away: "{boss}逃走了。",
});

let run = null, realSave = null;
const runActive = () => run !== null;
const runKind = () => (run ? run.kind : null);
const runBounty = () => (run ? run.bounty : null);
const runLink = () => (!run ? "" : run.kind === "daily" ? "#daily" : `#seed=${run.seed}`);   // what a friend opens to sail this sea

// ---------- the sandbox ----------
const gunsOf = (ids, lv) => ids.map(id => gunItem(id, lv));
function runSave(kind, seed) {
  const L = DAILY_LOADOUT, base = { ...defaultSave(), seed, tutorialDone: true };   // a returning captain needs no first-voyage coaching
  return sanitizeSave(kind === "daily" ? { ...base, ship: L.ship, hull: L.hull, sails: L.sails, hold: L.hold,
    bow: gunsOf(L.bow, L.gunLv), left: gunsOf(L.left, L.gunLv), right: gunsOf(L.right, L.gunLv), stern: [], store: [] } : base);
}
// The captain's wrecks belong to the real sea: take their crates down for the run, put them back after.
function clearCrates() { for (const c of crates) { c.spr.destroy(); c.label?.destroy(); } crates.length = 0; }
function restoreCrates() { clearCrates(); for (const w of save.wrecks) addCrate(w.x, w.y, w.value, w); }

function startRun(kind, seed = 0) {
  if (!S || run) return;
  const n = dailyNumber(), sd = kind === "daily" ? dailySeed(n) : seed;
  closeAllPanels();
  realSave = save; saveLocked = true;
  run = { kind, seed: sd, n, t: 0, over: false, won: false, bossT: 0, bounty: kind === "daily" ? dailySpec(sd) : null, result: null };
  save = runSave(kind, sd);
  setGenRng(mulberry32(sd));
  clearBoss(); clearCrates(); cargo = 0; streak = 0;
  if (titleOpen) closeTitle();
  syncWorld();   // this seed's islands (js/world-seas.js)
  Object.assign(player, { x: PORT.x + 140, y: PORT.y, rot: 0, speed: 0, alive: true, burnT: 0 });
  player.spr.setPosition(player.x, player.y).setRotation(0).clearTint();
  applyPlayerStats(true); hud(true);
  setSail();   // a fresh sea, the captain takes up his lair (js/harbor.js, js/campaign.js)
  wasDocked = false;
  const b = run.bounty;
  toast(kind === "daily" ? t("dr_start", { n, boss: bossName(b), m: DAILY_SECONDS / 60, trait: t("dtrait_" + b.trait) }) : t("dr_seed", { seed: sd }));
  renderClock();
}
// Hand the real save back. Idempotent; toTitle() calls it first (js/menu.js).
function runLeave() {
  if (!run) return;
  clearTimeout(runEndT); endEl.hidden = true;
  run = null; setGenRng(null);
  save = realSave; realSave = null; saveLocked = false;
  clearBoss(); restoreCrates(); cargo = 0; streak = 0;
  syncWorld();   // the real islands again
  applyPlayerStats(true); hud(true);
  renderClock();
}

// ---------- the daily clock and its end ----------
const clockEl = document.createElement("div");
clockEl.id = "runClock"; clockEl.hidden = true; clockEl.setAttribute("role", "timer");
document.body.append(clockEl);
let clockTxt = "";
function renderClock() {
  const daily = run && run.kind === "daily" && !run.over;
  if (clockEl.hidden === !!daily) clockEl.hidden = !daily;
  if (!daily) { clockTxt = ""; return; }
  const left = Math.max(0, Math.ceil(DAILY_SECONDS - run.t)), txt = `${fmtClock(left)} · ${bossName(run.bounty)}`;
  clockEl.classList.toggle("low", left <= 30);
  if (txt !== clockTxt) { clockTxt = txt; clockEl.textContent = txt; }
}
onHook("frame", dt => {
  if (!run || run.over || paused || docked) return;
  run = { ...run, t: run.t + dt };
  if (run.kind === "daily") { renderClock(); if (run.t >= DAILY_SECONDS) runEnd("time"); }
});
onHook("lang", () => { clockTxt = ""; renderClock(); if (!endEl.hidden) renderEnd(); });
let runEndT = 0;
// The captain went down: it counts if the player (or a recent assist) did it; the run closes after the name card.
function runBossSunk(paid) {
  if (!run || run.over || run.kind !== "daily") return;
  if (!paid) { toast(t("dr_away", { boss: bossName(run.bounty) })); return; }
  run = { ...run, won: true, bossT: run.t };
  runEndT = setTimeout(() => runEnd("won"), 2400);
}
function runPlayerSunk() { runEnd("sunk"); }
function runEnd(why) {
  if (!run || run.over || run.kind !== "daily") return;
  clearTimeout(runEndT);
  const hull = why === "sunk" ? 0 : (player.hp / player.maxHp) * 100;
  const res = dailyResult({ won: run.won, bossT: run.bossT, sunk: save.sunk, hull });
  const rec = dailyRecord(loadDaily(), run.n, res);
  saveDaily(rec.store);   // real storage: persist() is locked, this is its own key
  run = { ...run, over: true, result: { ...res, why, best: rec.best, streak: rec.streak } };
  paused = true; cancelPointerInput(); document.getElementById("joy").hidden = true; joyVec = { x: 0, y: 0, m: 0 };
  renderClock(); renderEnd(); endEl.hidden = false; sfx(res.won ? "victory" : "defeat");
  endEl.firstElementChild.focus();
}

// ---------- the result page ----------
const endEl = document.createElement("div");
endEl.id = "runEnd"; endEl.hidden = true;
endEl.innerHTML = `<div class="sheet victory" role="dialog" aria-modal="true" aria-labelledby="rTitle" tabindex="-1"></div>`;
document.body.append(endEl);
function renderEnd() {
  if (!run || !run.result) return;
  const r = run.result, boss = bossName(run.bounty);
  const rows = [["dr_time", r.won ? fmtClock(r.bossT) : t("dr_none")], ["dr_sunk", fmt(r.sunk)], ["dr_hull", r.hull + "%"], ["dr_streak", String(r.streak)]];
  endEl.firstElementChild.innerHTML = `
    <canvas class="v-rose" width="240" height="240" aria-hidden="true"></canvas>
    <div class="eyebrow">${t("dr_eyebrow", { n: run.n })}</div>
    <h1 id="rTitle">${t(r.won ? "dr_won" : "dr_lost", { boss })}</h1>
    <p class="hint-s" style="text-align:center">${t(r.why === "time" ? "dr_timeup" : r.why === "sunk" ? "dr_fell" : "dtrait_" + run.bounty.trait)}${r.best ? ` · <b>${t("dr_best")}</b>` : ""}</p>
    <section><dl class="logstats">${statRows(rows)}</dl></section>
    <footer class="v-choices">${wordmarkHtml()}
      <button class="btn" type="button" data-run="title">${t("dr_title")}</button>
      <button class="sail" type="button" data-run="again">${t("dr_again")}</button>
    </footer>`;
  drawRose(endEl.querySelector(".v-rose"));
  endEl.querySelector(".v-choices").appendChild(shareButton(() => shareSpec("daily", { n: run.n, bossName: boss, ...run.result }), "btn v-card"));
}
endEl.addEventListener("click", ev => {
  const b = ev.target.closest("[data-run]");
  if (!b) return;
  sfx("uiClick");
  if (b.dataset.run === "title") { toTitle(); return; }   // runLeave() runs inside it
  const kind = run.kind, seed = run.seed;
  runLeave(); startRun(kind, seed);
});

// ---------- entry points: the title button and the link ----------
function renderDailyButton() {
  const el = document.getElementById("tDaily");
  if (!el) return;
  const n = dailyNumber(), k = liveStreak(loadDaily(), n);
  el.textContent = k > 1 ? t("m_dailyStreak", { n, k }) : t("m_daily", { n });
}
document.addEventListener("langchange", renderDailyButton);
// #daily opens today's sea, #seed=12345 a free voyage on that seed (js/daily.js parseRunHash).
onHook("ready", () => {
  const link = parseRunHash(location.hash);
  if (link) startRun(link.kind, link.seed);
});
