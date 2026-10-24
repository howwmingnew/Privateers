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
  dc_title: "Versus your friend", dr_best: "A new best for today!", dr_title: "Back to title", dr_again: "Sail again", dr_away: "{boss} got away.",
});
Object.assign(STR.zh, {
  dr_start: "每日海域 #{n}：{m} 分鐘內擊沉{boss}。{trait}。", dr_seed: "種子 {seed}：自由航程，這裡的一切都不會存檔。",
  dr_eyebrow: "每日海域 #{n}", dr_won: "{boss}已沉沒", dr_lost: "{boss}逃脫了", dr_timeup: "時間到", dr_fell: "你的船沉了",
  dr_time: "擊沉用時", dr_sunk: "擊沉艘數", dr_hull: "剩餘船體", dr_streak: "連續天數", dr_none: "—",
  dc_title: "和朋友比較", dr_best: "今日新紀錄！", dr_title: "回到標題", dr_again: "再航一次", dr_away: "{boss}逃走了。",
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

function startRun(kind, seed = 0, opts = {}) {
  if (!S || run) return;
  const n = dailyNumber(), sd = kind === "daily" ? dailySeed(n) : seed;
  closeAllPanels();
  realSave = save; saveLocked = true;
  run = { kind, seed: sd, n, t: 0, over: false, won: false, bossT: 0, tier: dailyTier(n),
    friend: kind === "daily" && opts.friend ? opts.friend : null, bounty: kind === "daily" ? dailySpec(sd, dailyTier(n)) : null, result: null };
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
  syncPorts();   // no harbor, stations or trade ports in the daily sea (js/ports.js)
  const b = run.bounty;
  toast(kind === "daily" ? t("dr_start", { n, boss: bossName(b), m: DAILY_SECONDS / 60, trait: t("dtrait_" + b.trait) }) + " " + dailyTierLabel(n) : t("dr_seed", { seed: sd }));
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
  syncPorts();   // and the harbor and stations
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
    <div class="eyebrow">${t("dr_eyebrow", { n: run.n })} · ${dailyTierLabel(run.n)}</div>
    <h1 id="rTitle">${t(r.won ? "dr_won" : "dr_lost", { boss })}</h1>
    <p class="hint-s" style="text-align:center">${t(r.why === "time" ? "dr_timeup" : r.why === "sunk" ? "dr_fell" : "dtrait_" + run.bounty.trait)}${r.best ? ` · <b>${t("dr_best")}</b>` : ""}</p>
    <section><dl class="logstats">${statRows(rows)}</dl></section>
    ${run.friend ? `<section class="vs"><h2>${t("dc_title")}</h2><p class="hint-s">${friendText(run.n, run.friend)}</p><ul class="vs-list">${compareFriend(r, run.friend).map(([k, v]) => `<li>${t(k, v)}</li>`).join("")}</ul></section>` : ""}
    <footer class="v-choices">${wordmarkHtml()}
      <button class="btn" type="button" data-run="title">${t("dr_title")}</button>
      <button class="sail" type="button" data-run="again">${t("dr_again")}</button>
    </footer>`;
  drawRose(endEl.querySelector(".v-rose"));
  endEl.querySelector(".v-choices").appendChild(shareButton(() => shareSpec("daily", { n: run.n, tier: run.tier, bossName: boss, ...run.result }), "btn v-card"));
}
endEl.addEventListener("click", ev => {
  const b = ev.target.closest("[data-run]");
  if (!b) return;
  sfx("uiClick");
  if (b.dataset.run === "title") { toTitle(); return; }   // runLeave() runs inside it
  const kind = run.kind, seed = run.seed, friend = run.friend;
  runLeave(); startRun(kind, seed, { friend });
});

// ---------- entry points: the title button and the link ----------
function renderDailyButton() {
  const el = document.getElementById("tDaily");
  if (!el) return;
  const n = dailyNumber(), k = liveStreak(loadDaily(), n);
  el.textContent = k > 1 ? t("m_dailyStreak", { n, k }) : t("m_daily", { n });
}
document.addEventListener("langchange", renderDailyButton);
// ---------- the challenge panel: a link opens this over the title, nothing starts until "Start" ----------
// "#daily", "#daily=57&t=102&hp=64&k=9" (a friend's result to beat) and "#seed=12345" (js/daily.js parseRunHash). A link to a day that
// is not today offers today's daily or that day's sea as a free voyage.
Object.assign(STR.en, {
  ch_eyebrow: "Challenge", ch_daily: "Challenge: Daily #{n}", ch_seed: "Challenge: seed {seed}", ch_seedNote: "A free voyage on this seed. Nothing here is saved.",
  ch_start: "Start", ch_close: "Not now", ch_stale: "This is the challenge for daily #{n}; today is #{m}.",
  ch_today: "Play today's daily (#{m})", ch_free: "Free voyage on that sea", ch_dailyNote: "Five minutes, a fixed ship, one captain. Same sea for everyone today.",
});
Object.assign(STR.zh, {
  ch_eyebrow: "挑戰", ch_daily: "挑戰：每日 #{n}", ch_seed: "挑戰：種子 {seed}", ch_seedNote: "在這個種子上自由航行，這裡的一切都不會存檔。",
  ch_start: "開始", ch_close: "先不要", ch_stale: "這是每日 #{n} 的挑戰，今天是 #{m}。",
  ch_today: "玩今天的每日（#{m}）", ch_free: "用那片海自由航行", ch_dailyNote: "五分鐘、固定的船、一位船長。今天所有人都是同一片海。",
});
const chEl = document.createElement("div");
chEl.id = "challenge"; chEl.hidden = true;
chEl.innerHTML = `<div class="sheet victory" role="dialog" aria-modal="true" aria-labelledby="chTitle" tabindex="-1"></div>`;
document.body.append(chEl);
let challenge = null;   // the parsed link on show
function renderChallenge() {
  if (!challenge) return;
  const c = challenge, today = dailyNumber(), stale = c.kind === "daily" && c.n > 0 && c.n !== today;
  const title = c.kind === "seed" ? t("ch_seed", { seed: c.seed }) : t("ch_daily", { n: c.n || today });
  const btn = (act, label, cls = "btn") => `<button class="${cls}" type="button" data-ch="${act}">${label}</button>`;
  chEl.firstElementChild.innerHTML = `
    <div class="eyebrow">${t("ch_eyebrow")}</div><h1 id="chTitle">${title}</h1>
    ${c.friend ? `<p class="hint-s" style="text-align:center"><b>${friendText(c.n || today, c.friend)}</b></p>` : ""}
    <p class="hint-s" style="text-align:center">${stale ? t("ch_stale", { n: c.n, m: today }) : t(c.kind === "seed" ? "ch_seedNote" : "ch_dailyNote")}</p>
    <footer class="v-choices">
      ${stale ? btn("today", t("ch_today", { m: today }), "sail") + btn("free", t("ch_free")) : btn("start", t("ch_start"), "sail")}
      ${btn("close", t("ch_close"))}
    </footer>`;
}
function showChallenge(link) {
  challenge = link; renderChallenge();
  chEl.hidden = false; chEl.firstElementChild.focus();
}
function closeChallenge() {
  chEl.hidden = true; challenge = null;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}   // a reload will not reopen it
  const b = document.getElementById("tNew"); if (b && titleOpen) focusFirst(document.getElementById("title"));
}
chEl.addEventListener("click", ev => {
  const b = ev.target.closest("[data-ch]");
  if (!b || !challenge) return;
  sfx("uiClick");
  const c = challenge, act = b.dataset.ch;
  closeChallenge();
  if (act === "start") startRun(c.kind, c.seed, { friend: c.friend });
  else if (act === "today") startRun("daily");
  else if (act === "free") startRun("seed", dailySeed(c.n));
});
onHook("lang", () => { if (!chEl.hidden) renderChallenge(); });
onHook("ready", () => {
  const link = parseRunHash(location.hash);
  if (link) showChallenge(link);
});
