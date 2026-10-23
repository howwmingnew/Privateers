"use strict";
// ---------- Victory: sinking Admiral Thorne ends the war. Epilogue, the captain's account, credits, then a choice ----------
Object.assign(STR.en, {
  vEyebrow: "The last Letter of Marque is fulfilled", vTitle: "The Free Port Stands",
  vEpilogue: "HMS Sovereign settles into the Maelstrom, and the Navy's last flag goes down with her. Back at Safe Harbor they ring every bell on the waterfront. The Harbourmaster tears down the final poster and nails your name above the tavern door in its place. Past the edge of the chart lie richer waters, and worse captains. Where you sail now is up to you.",
  vAccount: "The captain's account", vSunkOf: "{n} ({p} pirates · {v} navy · {m} merchants)", vRank: "Rank",
  vCredits: "Credits",
  vCreditsTxt: "<b>Privateers</b> · design, code, art and music, all made in code · built with Phaser 3 · type: IM Fell English SC by Igino Marini, Barlow Semi Condensed by Jeremy Tribby, Noto Serif TC and Noto Sans TC by Google. Thank you for sailing.",
  vKeep: "Keep sailing", vKeepDs: "Free play on these seas",
  vNg: "New Game+", vNgDs: "New map · enemies +3 levels · loot ×1.5 · keep your guns", vNgArm: "Press again to begin",
});
Object.assign(STR.zh, {
  vEyebrow: "最後一張私掠許可狀已經完成", vTitle: "自由港屹立不搖",
  vEpilogue: "君權號沉入大漩渦，海軍的最後一面旗也跟著她沒入海中。安全港的碼頭敲響了每一口鐘。港務長撕下最後一張懸賞單，把你的名字釘在酒館門上。海圖之外，還有更富饒的海域，和更兇狠的船長。接下來要往哪裡去，由你決定。",
  vAccount: "船長的帳", vSunkOf: "{n} 艘（海盜 {p} · 海軍 {v} · 商船 {m}）", vRank: "階級",
  vCredits: "製作名單",
  vCreditsTxt: "<b>Privateers</b> · 設計、程式、美術與音樂，全部用程式碼繪製與合成 · 以 Phaser 3 製作 · 字型：IM Fell English SC（Igino Marini）、Barlow Semi Condensed（Jeremy Tribby）、Noto Serif TC 與 Noto Sans TC（Google）。感謝你一路同行。",
  vKeep: "繼續航行", vKeepDs: "在這片海域自由航行",
  vNg: "新遊戲+", vNgDs: "新地圖 · 敵人 +3 級 · 戰利品 ×1.5 · 保留火砲", vNgArm: "再按一次開始",
});

const vicEl = document.createElement("div");
vicEl.id = "victory"; vicEl.hidden = true;
vicEl.innerHTML = `<div class="sheet victory" role="dialog" aria-modal="true" aria-labelledby="vTitle" tabindex="-1"></div>`;
document.body.append(vicEl);
// The ending lands mid-fight with the escorts, while the player is still hammering fire, so the choices ignore presses
// for a moment and focus starts on the page itself rather than on a button that Space / A would click straight away.
const VIC_GRACE_MS = 1200;
let vicNgArmed = false, vicNgT, vicShownAt = 0;
// A compass rose in ink: the one ornament on the page.
function drawRose(cv) {
  const c = cv.getContext("2d"), R = cv.width / 2, ink = "#2a1d10", sepia = "#9a7442";
  c.setTransform(1, 0, 0, 1, R, R); c.clearRect(-R, -R, 2 * R, 2 * R);
  c.strokeStyle = "rgba(42,29,16,.7)"; c.lineWidth = 2;
  for (const k of [0.94, 0.84]) { c.beginPath(); c.arc(0, 0, R * k, 0, TAU); c.stroke(); }
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * TAU, l = i % 4 ? 0.05 : 0.1;
    c.beginPath(); c.moveTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84); c.lineTo(Math.cos(a) * R * (0.84 + l), Math.sin(a) * R * (0.84 + l)); c.stroke();
  }
  for (let i = 7; i >= 0; i--) {   // short points first, so the long ones lie on top
    const a = i / 8 * TAU - Math.PI / 2, long = i % 2 === 0, L = R * (long ? 0.8 : 0.5), w = R * (long ? 0.12 : 0.08);
    const tip = [Math.cos(a) * L, Math.sin(a) * L];
    for (const [side, col] of [[1, ink], [-1, sepia]]) {
      c.beginPath(); c.moveTo(0, 0); c.lineTo(...tip); c.lineTo(Math.cos(a + side * Math.PI / 2) * w, Math.sin(a + side * Math.PI / 2) * w); c.closePath();
      c.fillStyle = col; c.fill();
    }
  }
  c.fillStyle = "#b4412c"; c.beginPath(); c.arc(0, 0, R * 0.07, 0, TAU); c.fill();
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function renderVictory() {
  const st = save.stats, sunk = st.sunk;
  const rows = [
    ["vRank", t("rank_" + save.campaign.rank)], ["st_time", fmtDur(st.time)], ["st_gold", fmt(st.gold)],
    ["st_total", t("vSunkOf", { n: fmt(save.sunk), p: fmt(sunk.pirate), v: fmt(sunk.navy), m: fmt(sunk.merchant) })],
    ["st_deaths", fmt(st.deaths)], ["st_bounties", `${save.campaign.bounty} / ${BOUNTIES.length}`], ["st_longest", fmtDur(st.longest)],
  ];
  vicEl.firstElementChild.innerHTML = `
    <canvas class="v-rose" width="240" height="240" aria-hidden="true"></canvas>
    <div class="eyebrow">${t("vEyebrow")}</div><h1 id="vTitle">${t("vTitle")}</h1>
    <p class="epi">${t("vEpilogue")}</p>
    <section><h2>${t("vAccount")}</h2><dl class="logstats">${statRows(rows)}</dl></section>
    <section class="credits"><h2>${t("vCredits")}</h2><p>${t("vCreditsTxt")}</p></section>
    <footer class="v-choices">
      <button class="btn" type="button" data-v="keep">${t("vKeep")}<small>${t("vKeepDs")}</small></button>
      <button class="sail" type="button" data-v="ng">${t(vicNgArmed ? "vNgArm" : "vNg")}<small>${t("vNgDs")}</small></button>
    </footer>`;
  drawRose(vicEl.querySelector(".v-rose"));
}
function showVictory() {
  if (!vicEl.hidden) return;
  flushTime();
  paused = true;
  document.getElementById("joy").hidden = true; joyVec = { x: 0, y: 0, m: 0 };
  vicNgArmed = false; renderVictory();
  vicEl.hidden = false; vicShownAt = performance.now(); vicEl.firstElementChild.focus();
  sfx("victory");
  if (typeof Snd !== "undefined") Snd.music("harbor");
}
function closeVictory() {
  vicEl.hidden = true; vicNgArmed = false; clearTimeout(vicNgT);
  save.campaign = { ...save.campaign, won: true }; persist();
  if (!docked) { paused = false; if (typeof Snd !== "undefined") Snd.music("sea"); }
  else renderPort();
}
vicEl.addEventListener("click", ev => {
  const b = ev.target.closest("[data-v]");
  if (!b || performance.now() - vicShownAt < VIC_GRACE_MS) return;
  sfx("uiClick");
  if (b.dataset.v === "keep") { closeVictory(); return; }
  if (!vicNgArmed) {   // New Game+ starts the ship and gold over, so it takes a second press
    vicNgArmed = true; b.firstChild.textContent = t("vNgArm");
    clearTimeout(vicNgT);
    vicNgT = setTimeout(() => { vicNgArmed = false; const el = vicEl.querySelector("[data-v=ng]"); if (el) el.firstChild.textContent = t("vNg"); }, 3000);
    return;
  }
  closeVictory(); startNewGamePlus();
});
onHook("lang", () => { if (!vicEl.hidden) renderVictory(); });
