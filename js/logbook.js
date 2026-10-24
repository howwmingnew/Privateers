"use strict";
// ---------- Captain's log: lifetime stats (kept in save.stats) and the ledger page that shows them ----------
Object.assign(STR.en, {
  logEyebrow: "Kept by the captain", logTitle: "Captain's log", close: "Close", logEnding: "Read the ending again",
  logVoyage: "The voyage", logSunk: "Ships sunk", logAch: "Achievements {n} / {m}",
  st_time: "Time played", st_gold: "Gold earned", st_sorties: "Sorties", st_longest: "Longest sortie", st_deaths: "Ships lost",
  st_wrecks: "Wrecks recovered", st_bounties: "Bounties claimed", st_ng: "New Game+ cycles", st_total: "All ships sunk",
  f_pirate: "Pirates", f_navy: "Navy", f_merchant: "Merchants", byLevel: "By level",
  dur_h: "{h} h {m} min", dur_m: "{m} min {s} s", dur_s: "{s} s",
  achHidden: "Hidden achievement", achHiddenDs: "Keep sailing to find out.",
});
Object.assign(STR.zh, {
  logEyebrow: "船長親筆", logTitle: "航海日誌", close: "關閉", logEnding: "重看結局",
  logVoyage: "航程", logSunk: "擊沉紀錄", logAch: "成就 {n} / {m}",
  st_time: "遊戲時間", st_gold: "累計賺得金幣", st_sorties: "出航次數", st_longest: "最長一次出航", st_deaths: "沉船次數",
  st_wrecks: "撈回殘骸", st_bounties: "完成懸賞", st_ng: "新遊戲+ 次數", st_total: "總擊沉數",
  f_pirate: "海盜", f_navy: "海軍", f_merchant: "商船", byLevel: "依等級",
  dur_h: "{h} 小時 {m} 分", dur_m: "{m} 分 {s} 秒", dur_s: "{s} 秒",
  achHidden: "隱藏成就", achHiddenDs: "繼續航行就會知道。",
});
function fmtDur(sec) {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? t("dur_h", { h, m }) : s >= 60 ? t("dur_m", { m, s: s % 60 }) : t("dur_s", { s });
}

// ---------- Tracking ----------
// Time is summed locally each frame and folded into the save at quiet moments (dock, sail, the log, the victory screen).
let sortie = null, unsavedTime = 0;   // sortie: { t: seconds at sea, hurt: took a hit yet }
const addStats = patch => { save.stats = { ...save.stats, ...patch }; };
const bump = (o, k) => ({ ...o, [k]: (o[k] || 0) + 1 });
function flushTime() { if (unsavedTime > 0) { addStats({ time: save.stats.time + unsavedTime }); unsavedTime = 0; } }
function endSortie() { if (sortie) addStats({ longest: Math.max(save.stats.longest, sortie.t) }); sortie = null; }
onHook("sail", () => { flushTime(); sortie = { t: 0, hurt: false }; addStats({ sorties: save.stats.sorties + 1 }); });
onHook("dock", (kind, hold) => { flushTime(); endSortie(); if (hold > 0) addStats({ gold: save.stats.gold + hold }); });
onHook("hurt", s => { if (s.isPlayer && sortie) sortie.hurt = true; });
onHook("sunk", (s, killer) => {
  if (s.isPlayer) {
    endSortie(); addStats({ deaths: save.stats.deaths + 1 });
    save.campaign = { ...save.campaign, deaths: save.campaign.deaths + 1 };
  } else if (killer === player) addStats({ sunk: bump(save.stats.sunk, s.faction), byLevel: bump(save.stats.byLevel, String(s.L)) });
});
onHook("pickup", c => { if (c.wreck && c.value <= 0) addStats({ wrecks: save.stats.wrecks + 1 }); });
onHook("frame", dt => {
  const atSea = !paused && !docked, inPort = docked && !document.getElementById("port").hidden;
  if (atSea || inPort) unsavedTime += dt;   // a pause menu or a hidden tab doesn't count
  if (atSea && sortie) sortie.t += dt;
});
// No save on pagehide: a stale second tab closing would overwrite the progress made in the other one. Time at sea
// since the last dock is the only thing lost when the game is closed mid-sortie.

// ---------- The log page ----------
const logEl = document.createElement("div");
logEl.id = "logbook"; logEl.hidden = true;
logEl.innerHTML = `<div class="sheet log" role="dialog" aria-modal="true" aria-labelledby="logTitle"></div>`;
document.body.append(logEl);
function statRows(rows) { return rows.map(([k, v]) => `<div><dt>${t(k)}</dt><dd>${v}</dd></div>`).join(""); }
function renderLog() {
  const st = save.stats, c = save.campaign;
  const sunkTotal = st.sunk.pirate + st.sunk.navy + st.sunk.merchant;
  const factions = ["pirate", "navy", "merchant"].map(f => {
    const n = st.sunk[f], w = sunkTotal ? n / sunkTotal * 100 : 0;
    return `<div class="fbar f-${f}"><span>${t("f_" + f)}</span><i style="width:${w.toFixed(1)}%"></i><b>${fmt(n)}</b></div>`;
  }).join("");
  const top = Math.max(MAX_RING, ...Object.keys(st.byLevel).map(Number)), most = Math.max(1, ...Object.values(st.byLevel));
  const levels = Array.from({ length: top }, (_, i) => {
    const n = st.byLevel[i + 1] || 0;
    return `<div class="lv"><b>${n || ""}</b><i style="height:${(n / most * 100).toFixed(1)}%"></i><span>${i + 1}</span></div>`;
  }).join("");
  const got = ACH.filter(a => save.ach[a.id]).length;
  const achs = ACH.map(a => {
    const on = !!save.ach[a.id], secret = a.hidden && !on;
    return `<li class="${on ? "on" : "off"}"><b>${secret ? t("achHidden") : t("ach_" + a.id)}</b><span>${secret ? t("achHiddenDs") : t("achd_" + a.id)}</span></li>`;
  }).join("");
  logEl.firstElementChild.innerHTML = `
    <header><div><div class="eyebrow">${t("logEyebrow")}</div><h1 id="logTitle">${t("logTitle")}</h1></div>
      <button class="btn closebtn" type="button" data-log="close">${t("close")}</button></header>
    <p class="msg">${t("rankLbl")} <em>${t("rank_" + c.rank)}</em>${save.ngPlus ? ` · ${t("ngLbl", { n: save.ngPlus })}` : ""}</p>
    ${c.won ? `<p><button class="btn" type="button" data-log="ending">${t("logEnding")}</button></p>` : ""}
    <section><h2>${t("logVoyage")}</h2><dl class="logstats">${statRows([
      ["st_time", fmtDur(st.time)], ["st_gold", fmt(st.gold)], ["st_sorties", fmt(st.sorties)], ["st_longest", fmtDur(st.longest)],
      ["st_deaths", fmt(st.deaths)], ["st_wrecks", fmt(st.wrecks)], ["st_bounties", `${c.bounty} / ${BOUNTIES.length}` + (st.bounties > c.bounty ? ` (${st.bounties})` : "")],
      ...(save.ngPlus ? [["st_ng", save.ngPlus]] : [])])}</dl></section>
    <section><h2>${t("logSunk")}</h2><p class="hint-s">${t("st_total")} <b>${fmt(save.sunk)}</b></p>
      <div class="fbars">${factions}</div><h3>${t("byLevel")}</h3><div class="lvbars">${levels}</div></section>
    <section><h2>${t("logAch", { n: got, m: ACH.length })}</h2><ul class="achs">${achs}</ul></section>
    ${typeof wordmarkHtml === "function" ? wordmarkHtml() : ""}`;
}
function openLog() {
  flushTime(); renderLog();
  logEl.hidden = false; logEl.querySelector("[data-log=close]").focus();
  sfx("uiClick");
}
function closeLog() {
  logEl.hidden = true; sfx("uiClick");
  document.querySelector("[data-camp=log]")?.focus();
}
logEl.addEventListener("click", ev => {
  if (ev.target.closest("[data-log=ending]")) { logEl.hidden = true; showVictory(); return; }   // re-read the epilogue and credits
  if (ev.target === logEl || ev.target.closest("[data-log=close]")) closeLog();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !logEl.hidden) { ev.stopPropagation(); closeLog(); } }, true);
onHook("lang", () => { if (!logEl.hidden) renderLog(); });
