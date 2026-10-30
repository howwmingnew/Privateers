"use strict";
// ---------- Hall of fame: the captain's local records, shown on the Captain's log (js/logbook.js) ----------
//   sunk   most ships sunk in one sortie (the plunder streak, js/plunder.js)
//   chain  longest kill chain: sinkings each within CHAIN_GAP seconds of the last
//   boss   { bountyId: fastest sinking, seconds from the first shot that landed on it }
//   win    fastest finish, play time to sink the Admiral (js/victory.js winTime), 0 = not yet
// save.hall belongs to the campaign save only: a daily or seeded run (js/run.js) never touches it.
Object.assign(STR.en, {
  hallTitle: "Hall of fame", hallSunk: "Most sunk in one sortie", hallChain: "Longest kill chain", hallWin: "Fastest to the Admiral", hallEmpty: "—",
  hallBoss: "{name}: fastest sinking", hallNew: "New record: {what}", hallShare: "Share records",
});
Object.assign(STR.zh, {
  hallTitle: "名人堂", hallSunk: "單趟最多擊沉", hallChain: "最高連勝", hallWin: "最快通關", hallEmpty: "—",
  hallBoss: "{name}：最快擊沉", hallNew: "新紀錄：{what}", hallShare: "分享紀錄",
});
const freshHall = () => ({ sunk: 0, chain: 0, boss: {}, win: 0 });
SAVE_DEFAULTS.push(() => ({ hall: freshHall() }));
const hallNum = (v, hi) => { const x = toNum(v); return Number.isFinite(x) && x > 0 ? Math.min(x, hi) : 0; };
function sanitizeHall(raw) {
  const h = isObj(raw) ? raw : {};
  const boss = Object.fromEntries(safeEntries(h.boss).filter(([k]) => /^[a-z]{1,12}$/.test(k))
    .map(([k, v]) => [k, Math.round(hallNum(v, 1e7) * 10) / 10]).filter(([, v]) => v > 0));
  return { sunk: Math.floor(hallNum(h.sunk, 1e6)), chain: Math.floor(hallNum(h.chain, 1e6)), boss, win: Math.round(hallNum(h.win, 1e8) * 10) / 10 };
}
SAVE_SANITIZERS.push(s => ({ ...s, hall: sanitizeHall(s.hall) }));

// One record event in, { hall, broke } out; never mutates. ev: { type: "sunk" | "chain", n } · { type: "boss", id, sec } · { type: "win", sec }
function hallApply(hall, ev) {
  const h = sanitizeHall(hall);
  switch (ev.type) {
    case "sunk": case "chain": return ev.n > h[ev.type] ? { hall: { ...h, [ev.type]: Math.floor(ev.n) }, broke: true } : { hall: h, broke: false };
    case "boss": {
      const sec = Math.round(ev.sec * 10) / 10, was = h.boss[ev.id];
      return sec > 0 && (!was || sec < was) ? { hall: { ...h, boss: { ...h.boss, [ev.id]: sec } }, broke: true } : { hall: h, broke: false };
    }
    case "win": {
      const sec = Math.round(ev.sec * 10) / 10;
      return sec > 0 && (!h.win || sec < h.win) ? { hall: { ...h, win: sec }, broke: true } : { hall: h, broke: false };
    }
    default: return { hall: h, broke: false };
  }
}
// A new best is worth a line only once there was an old one to beat (the first number is not a record) and the chain is more than a pair.
const HALL_MIN_CHAIN = 3;

// ---------- tracking ----------
let gameClock = 0, lastKillAt = -1e9, chain = 0, boutAt = {}, lastSortieSecs = 0;   // boutAt: { bountyId: when the player first hit that captain }
const recordable = () => !runActive();   // a daily or seeded run keeps its own books
function hallBump(ev, line) {
  if (!recordable()) return;
  const { hall, broke } = hallApply(save.hall, ev);
  if (!broke) return;
  const first = ev.type === "boss" ? !save.hall.boss[ev.id] : save.hall[ev.type] === 0;
  save = { ...save, hall }; persist();
  if (line && !first) toast(t("hallNew", { what: line }));
}
onHook("frame", dt => { if (!paused && !docked) gameClock += dt; });
// Capture the sortie's length before the log's own "dock" hook closes it (this file loads first): the share card wants it.
onHook("dock", () => { lastSortieSecs = typeof sortie !== "undefined" && sortie ? sortie.t : 0; });
const sortieSecs = () => (typeof sortie !== "undefined" && sortie ? sortie.t : lastSortieSecs);
onHook("sail", () => { chain = 0; lastKillAt = -1e9; boutAt = {}; });
onHook("hurt", (s, dmg, src) => { if (s.boss && src === player && boutAt[s.boss] === undefined) boutAt = { ...boutAt, [s.boss]: gameClock }; });
onHook("sunk", (s, killer) => {
  if (s.isPlayer) { chain = 0; boutAt = {}; return; }
  if (killer !== player) return;
  chain = gameClock - lastKillAt <= CHAIN_GAP ? chain + 1 : 1; lastKillAt = gameClock;
  hallBump({ type: "sunk", n: streak }, null);
  if (chain >= HALL_MIN_CHAIN) hallBump({ type: "chain", n: chain }, `${t("hallChain")} ${chain}`);
  if (s.boss && recordable() && boutAt[s.boss] !== undefined) {
    const sec = Math.max(1, gameClock - boutAt[s.boss]);
    hallBump({ type: "boss", id: s.boss, sec }, `${t("hallBoss", { name: bossName(findBounty(s.boss)) })} ${fmtDur(sec)}`);
    boutAt = { ...boutAt, [s.boss]: undefined };
  }
});
onHook("victory", w => hallBump({ type: "win", sec: w }, `${t("hallWin")} ${fmtDur(w)}`));

// ---------- the log's section ----------
const hallOr = (n, f) => (n > 0 ? f(n) : t("hallEmpty"));
function hallRows(h = save.hall) {
  return [...(typeof shipDisplayName === "function" ? [[t("flShip"), shipDisplayName()]] : []),
    ...(typeof rewardBadgeNames === "function" && rewardBadgeNames().length ? [[t("rwBadges"), rewardBadgeNames().join(" · ")]] : []),   // daily badges (js/daily-rewards.js)
    [t("hallSunk"), hallOr(h.sunk, fmt)], [t("hallChain"), hallOr(h.chain, fmt)], [t("hallWin"), hallOr(h.win, fmtDur)],
    ...BOUNTIES.filter(b => h.boss[b.id]).map(b => [t("hallBoss", { name: bossName(b) }), fmtDur(h.boss[b.id])])];
}
// Called at the end of renderLog: the section before the wordmark, with a share button.
function hallMount(sheet) {
  const sec = document.createElement("section");
  sec.className = "hall";
  sec.innerHTML = `<h2>${t("hallTitle")}</h2><dl class="logstats">${hallRows().map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  if (typeof shareButton === "function") {
    const p = document.createElement("p");
    p.appendChild(shareButton(() => shareSpec("log", { hall: save.hall, total: save.sunk }), "btn"));
    sec.appendChild(p);
  }
  const mark = sheet.querySelector(".wordmark");
  sheet.insertBefore(sec, mark);
}
