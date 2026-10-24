"use strict";
// ---------- Campaign UI: the Wanted poster in the ledger, the bounty's flag, the edge arrow, boss bar, chart marks ----------
Object.assign(STR.en, {
  wanted: "Wanted", marque: "Letter of Marque {n} of {m}", sunkOrTaken: "Sunk or taken",
  pTarget: "Target", pSeen: "Last seen", pReward: "Reward",
  pEscort1: "1 escort", pEscorts: "{n} escorts", pWhere: "{sea}, {dir} of the harbor", pGold: "{n} gold",
  pUnlocks: "unlocks the {ship}", pUnlocksOutpost: "unlocks the {ship} and the Hulk Outpost", pFinal: "ends the war",
  dir_0: "east", dir_1: "south-east", dir_2: "south", dir_3: "south-west", dir_4: "west", dir_5: "north-west", dir_6: "north", dir_7: "north-east",
  rankLbl: "Rank", ngLbl: "New Game+ {n}", logBtn: "Captain's log",
  allDoneT: "The seas are yours",
  allDone: "Every Letter of Marque is claimed. Sail on as you please, or begin New Game+: a new map, enemies 3 levels stronger, half again the plunder. You keep your guns.",
  ngBtn: "Begin New Game+", ngArm: "Press again to begin",
});
Object.assign(STR.zh, {
  wanted: "懸賞通緝", marque: "私掠許可狀 {n}/{m}", sunkOrTaken: "擊沉或擒獲",
  pTarget: "目標", pSeen: "最後目擊", pReward: "賞金",
  pEscort1: "另有 1 艘護衛", pEscorts: "另有 {n} 艘護衛", pWhere: "{sea}，港口{dir}方", pGold: "{n} 金幣",
  pUnlocks: "解鎖{ship}", pUnlocksOutpost: "解鎖{ship}與廢船前哨站", pFinal: "結束這場戰爭",
  dir_0: "東", dir_1: "東南", dir_2: "南", dir_3: "西南", dir_4: "西", dir_5: "西北", dir_6: "北", dir_7: "東北",
  rankLbl: "階級", ngLbl: "新遊戲+ {n}", logBtn: "航海日誌",
  allDoneT: "大海是你的了",
  allDone: "所有私掠許可狀都已完成。你可以繼續自由航行，或開始新遊戲+：新的地圖、敵人強 3 級、戰利品多一半，火砲全部保留。",
  ngBtn: "開始新遊戲+", ngArm: "再按一次開始",
});

// A skull in the game's gold, for the chart, the arrow and the posters.
function drawSkull(c, x, y, r, fill = "#f0c766", hole = "#1b1410") {
  c.fillStyle = fill;
  c.beginPath(); c.arc(x, y - r * 0.15, r * 0.8, 0, TAU); c.fill();
  c.fillRect(x - r * 0.45, y + r * 0.2, r * 0.9, r * 0.55);
  c.fillStyle = hole;
  for (const sx of [-1, 1]) { c.beginPath(); c.arc(x + sx * r * 0.33, y - r * 0.1, r * 0.22, 0, TAU); c.fill(); }
  c.fillRect(x - r * 0.15, y + r * 0.47, r * 0.09, r * 0.28); c.fillRect(x + r * 0.06, y + r * 0.47, r * 0.09, r * 0.28);
}

// ---------- Flags: each captain flies their own colours on the poster ----------
const FLAGS = { ned: { base: "#8e1f1a", mark: "skull" }, carey: { base: "#1f1b19", mark: "bones" }, saint: { base: "#463d37", mark: "halo" },
  hale: { base: "#22375a", mark: "anchor", navy: true }, thorne: { base: "#7c1c1a", mark: "crown", navy: true } };
function drawEmblem(c, mark, x, y, s) {
  const bone = "#efe3c4", gold = "#e0b44a";
  c.lineCap = "round";
  if (mark === "bones") { c.strokeStyle = bone; c.lineWidth = s * 0.28;
    c.beginPath(); c.moveTo(x - s * 1.2, y - s * 0.7); c.lineTo(x + s * 1.2, y + s * 1.1); c.moveTo(x + s * 1.2, y - s * 0.7); c.lineTo(x - s * 1.2, y + s * 1.1); c.stroke(); }
  if (mark === "halo") { c.strokeStyle = gold; c.lineWidth = s * 0.16; c.beginPath(); c.ellipse(x, y - s * 1.15, s * 0.75, s * 0.25, 0, 0, TAU); c.stroke(); }
  if (mark === "skull" || mark === "bones" || mark === "halo") { drawSkull(c, x, y, s, bone, FLAGS.carey.base); return; }
  c.strokeStyle = gold; c.fillStyle = gold; c.lineWidth = s * 0.2;
  if (mark === "anchor") {
    c.beginPath(); c.arc(x, y - s * 1.05, s * 0.28, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(x, y - s * 0.75); c.lineTo(x, y + s * 1.1); c.moveTo(x - s * 0.6, y - s * 0.45); c.lineTo(x + s * 0.6, y - s * 0.45); c.stroke();
    c.beginPath(); c.arc(x, y + s * 0.3, s * 0.85, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  } else {   // crown
    c.beginPath(); c.moveTo(x - s, y + s * 0.6); c.lineTo(x - s, y - s * 0.5); c.lineTo(x - s * 0.5, y + s * 0.05); c.lineTo(x, y - s * 0.8);
    c.lineTo(x + s * 0.5, y + s * 0.05); c.lineTo(x + s, y - s * 0.5); c.lineTo(x + s, y + s * 0.6); c.closePath(); c.fill();
    c.fillRect(x - s * 1.05, y + s * 0.7, s * 2.1, s * 0.3);
  }
}
function drawFlag(cv, id) {
  const c = cv.getContext("2d"), w = cv.width, h = cv.height, f = FLAGS[id];
  const x0 = w * 0.1, x1 = w * 0.96, y0 = h * 0.08, y1 = h * 0.74, wave = x => Math.sin((x - x0) / (x1 - x0) * Math.PI * 1.7) * h * 0.04;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#3b2414"; c.fillRect(w * 0.065, h * 0.03, w * 0.035, h * 0.94);   // the staff
  c.beginPath(); c.moveTo(x0, y0);
  for (let x = x0; x <= x1; x += 3) c.lineTo(x, y0 + wave(x));
  for (let x = x1; x >= x0; x -= 3) c.lineTo(x, y1 + wave(x));
  c.closePath(); c.fillStyle = f.base; c.fill();
  c.save(); c.clip();
  if (f.navy) {   // the Crown's canton: a red cross on white
    const cw = (x1 - x0) * 0.36, ch = (y1 - y0) * 0.5;
    c.fillStyle = "#efe3c4"; c.fillRect(x0, y0 - h * 0.06, cw, ch + h * 0.06);
    c.fillStyle = "#b4412c"; c.fillRect(x0 + cw / 2 - w * 0.022, y0 - h * 0.06, w * 0.044, ch + h * 0.06); c.fillRect(x0, y0 + ch / 2 - h * 0.035, cw, h * 0.07);
  }
  c.restore();
  drawEmblem(c, f.mark, (x0 + x1) / 2 + (f.navy ? w * 0.12 : 0), (y0 + y1) / 2 + h * 0.02, h * 0.17);
  c.strokeStyle = "rgba(42,29,16,.55)"; c.lineWidth = 2; c.stroke();
}

// ---------- Wanted poster (a section of the harbor ledger) ----------
const wantedEl = document.createElement("section");
wantedEl.id = "wanted";
document.getElementById("pStats").after(wantedEl);
let ngArmed = false, ngArmT;
const dirWord = a => t("dir_" + (Math.round(((a % TAU) + TAU) % TAU / (Math.PI / 4)) % 8));
function posterHtml(b) {
  const i = BOUNTIES.indexOf(b), sea = t("sea_" + seaOfRing(b.L).id), ship = shipFor(i);
  const escorts = b.escorts.length ? " · " + t(b.escorts.length === 1 ? "pEscort1" : "pEscorts", { n: b.escorts.length }) : "";
  const prize = b.final ? t("pFinal") : t(i + 1 === OUTPOST_BOUNTY ? "pUnlocksOutpost" : "pUnlocks", { ship: t("s_" + ship) });
  return `<div class="poster" data-boss="${b.id}">
    <div class="p-marque">${t("marque", { n: i + 1, m: BOUNTIES.length })}</div>
    <div class="p-head"><canvas class="p-flag" width="240" height="170" aria-hidden="true"></canvas>
      <div><div class="p-wanted">${t("wanted")}</div><div class="p-name">${bossName(b)}</div><div class="p-sub">${t("sunkOrTaken")}</div></div></div>
    ${posterShipHtml(b)}
    <p class="p-story">${t("intro_" + b.id)}</p>
    <dl class="p-facts">
      <div><dt>${t("pTarget")}</dt><dd>${t("cls_" + b.cls)}${escorts}</dd></div>
      ${recLine(b)}
      <div><dt>${t("pSeen")}</dt><dd>${t("pWhere", { sea, dir: dirWord(b.ang) })}</dd></div>
      <div><dt>${t("pReward")}</dt><dd><b>${t("pGold", { n: fmt(bountyReward(b)) })}</b> · ${prize}</dd></div>
    </dl></div>`;
}
function renderWanted() {
  const c = save.campaign, b = activeBounty();
  const story = storyKey ? `<p class="story">${t(storyKey, { n: save.ngPlus })}</p>` : "";
  const note = atOutpost ? `<p class="hint-s">${t("outpostNote")}</p>` : "";
  const body = b ? posterHtml(b)
    : `<div class="poster done"><div class="p-wanted">${t("allDoneT")}</div><p class="p-story">${t("allDone")}</p>
       <button class="btn ngbtn" type="button" data-camp="ng">${t(ngArmed ? "ngArm" : "ngBtn")}</button></div>`;
  wantedEl.innerHTML = story + note + body +
    `<div class="rankline"><span>${t("rankLbl")} <b>${t("rank_" + c.rank)}</b>${save.ngPlus ? ` · ${t("ngLbl", { n: save.ngPlus })}` : ""}</span>` +
    `<button class="logbtn" type="button" data-camp="log">${t("logBtn")}</button></div>`;
  const cv = wantedEl.querySelector(".p-flag");
  if (cv && b) drawFlag(cv, b.id);
  const ship = wantedEl.querySelector(".p-ship");
  if (ship && b) paintPosterShip(ship, b);   // js/poster-ship.js
}
wantedEl.addEventListener("click", ev => {
  const btn = ev.target.closest("[data-camp]");
  if (!btn) return;
  if (btn.dataset.camp === "log") { openLog(); return; }   // js/logbook.js
  if (!ngArmed) {   // New Game+ wipes the ship and gold, so it takes a second press
    ngArmed = true; btn.textContent = t("ngArm"); sfx("uiClick");
    clearTimeout(ngArmT); ngArmT = setTimeout(() => { ngArmed = false; const el = wantedEl.querySelector("[data-camp=ng]"); if (el) el.textContent = t("ngBtn"); }, 3000);
    return;
  }
  ngArmed = false; clearTimeout(ngArmT); startNewGamePlus();
});
onHook("renderPort", () => {
  for (const id of ["deck", "armory", "yard", "ships"]) { const sec = document.getElementById(id)?.closest("section"); if (sec) sec.hidden = atOutpost; }
  document.getElementById("portTitle").textContent = t(atOutpost ? "outpostName" : "harbor");
  renderWanted();
});

// ---------- At sea: an arrow on the screen edge toward the bounty, and its hull bar once close ----------
const bossArrow = document.createElement("div"), bossBar = document.createElement("div");
bossArrow.id = "bossArrow"; bossArrow.hidden = true; bossArrow.setAttribute("aria-hidden", "true");
bossArrow.innerHTML = `<i class="ptr"></i><canvas width="64" height="64"></canvas>`;
bossBar.id = "bossBar"; bossBar.hidden = true;
bossBar.innerHTML = `<span></span><div class="bb"><i></i></div>`;
document.body.append(bossArrow, bossBar);
{ const c = bossArrow.querySelector("canvas").getContext("2d"); c.fillStyle = "rgba(27,20,16,.85)"; c.beginPath(); c.arc(32, 32, 30, 0, TAU); c.fill();
  c.strokeStyle = "#f0c766"; c.lineWidth = 3; c.stroke(); drawSkull(c, 32, 33, 17); }
const EDGE = { side: 34, top: 76 };   // keep the arrow clear of the HUD strip
function placeBossArrow() {
  if (edgeShowsBoss) { bossArrow.hidden = true; return; }   // the bounty already has a bigger box on the edge, with its distance (js/edge-marks.js)
  const v = S.cameras.main.worldView, fx = (bossShip.x - v.x) / v.width, fy = (bossShip.y - v.y) / v.height;
  if (fx > 0.03 && fx < 0.97 && fy > 0.03 && fy < 0.97) { bossArrow.hidden = true; return; }
  const vw = VIEW.cssW, vh = VIEW.cssH, cx = vw / 2, cy = (vh + EDGE.top - EDGE.side) / 2;
  const dx = fx * vw - cx, dy = fy * vh - cy, hx = vw / 2 - EDGE.side, hy = (vh - EDGE.top - EDGE.side) / 2;
  const k = Math.min(hx / Math.max(Math.abs(dx), 1e-6), hy / Math.max(Math.abs(dy), 1e-6));
  bossArrow.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px)`;
  bossArrow.firstElementChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  bossArrow.hidden = false;
}
onHook("frame", () => {
  const live = bossShip && bossShip.alive && !paused && !docked && player.alive;
  if (!live) { bossArrow.hidden = true; bossBar.hidden = true; return; }
  placeBossArrow();
  const near = dist(player, bossShip) < 1200;
  bossBar.hidden = !near;
  if (near) {
    bossBar.firstElementChild.textContent = bossName(findBounty(bossShip.boss));
    bossBar.querySelector("i").style.width = clamp(bossShip.hp / bossShip.maxHp, 0, 1) * 100 + "%";
  }
});

// ---------- Chart marks: the bounty (live ship, or its lair while in port); the outpost is drawn by js/hud.js ----------
onHook("mini", (c, k, u) => {
  const b = activeBounty();
  if (!b || (bountyHeld && !docked)) return;   // the first voyage: no bounty until the tutorial is done (js/campaign.js)
  const p = bossShip && bossShip.alive ? bossShip : lairOf(b), x = p.x * k, y = p.y * k, pulse = 1 + 0.25 * Math.sin(performance.now() / 260);
  c.strokeStyle = "rgba(240,199,102,.85)"; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(x, y, 10 * u * pulse, 0, TAU); c.stroke();
  c.fillStyle = "#1b1410"; c.beginPath(); c.arc(x, y, 7.5 * u, 0, TAU); c.fill();
  c.strokeStyle = "#f0c766"; c.lineWidth = 1.3 * u; c.stroke();
  drawSkull(c, x, y + 0.5 * u, 5.5 * u);
});
