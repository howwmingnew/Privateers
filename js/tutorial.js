"use strict";
// ---------- First-voyage tutorial ----------
// A small coach card walks a brand-new captain through one whole loop. Every step advances from real game state,
// polled each frame (tutorialTick, from shellTick), never from a timer. It can be skipped at any time and
// replayed from How to play. Progress is kept in the save (tutorialDone / tutorialStep).
Object.assign(STR.en, {
  tut_title: "First voyage", tut_skip: "Skip", tut_count: "{n} of {m}",
  tut_out: "{steer} Head out of the harbor.",
  tut_aim: "Find a ship with a green badge (the gold ring marks one). Turn until an aim line touches it: the line turns red when the shot will hit.",
  tut_fire: "Red means a hit. {fire}",
  tut_sink: "Keep firing until it sinks. Faint lines are still reloading.",
  tut_scoop: "Sunk! Sail over the floating crate to scoop up the plunder.",
  tut_sell: "Now sail back into the dashed ring around the harbor to sell your cargo.",
  tut_buy: "Spend your gold: buy or upgrade anything in this ledger. The cheapest costs {n} gold.",
  tut_poor: "The cheapest upgrade costs {n} gold. Set sail, sink another ship and bring its plunder back.",
  tut_buySea: "Bring plunder home, then buy or upgrade something. The cheapest costs {n} gold.",
  tut_docked: "Set sail to carry on with your first voyage.",
  tut_done: "That is the whole loop, captain. Farther waters hold richer ships, and deadlier ones.",
  ctl_steer_keys: "W raises the sail, S lowers it, A and D turn.", ctl_steer_mouse: "Hold the left mouse button where you want to sail; farther means faster.",
  ctl_steer_touch: "Drag anywhere to steer.", ctl_steer_pad: "Steer with the left stick; D-pad up raises the sail.",
  ctl_steer_desk: "Steer with W A S D, or hold the left mouse button where you want to sail.",
  ctl_fire_keys: "Press Space to fire.", ctl_fire_mouse: "Let go of the mouse button, or click, to fire.", ctl_fire_touch: "Let go to fire.",
  ctl_fire_pad: "Press A or RT to fire.", ctl_fire_desk: "Press Space, or click, to fire.",
});
Object.assign(STR.zh, {
  tut_title: "首航", tut_skip: "略過", tut_count: "第 {n}／{m} 步",
  tut_out: "{steer}先駛出港口。",
  tut_aim: "找一艘綠色標籤的船（金色圓圈標出了一艘）。轉動船身，讓瞄準線碰到它；線變紅，就代表這一發會命中。",
  tut_fire: "紅線代表會命中。{fire}",
  tut_sink: "繼續開火，直到它沉沒。淡色的線代表還在裝填。",
  tut_scoop: "擊沉了！駛過漂浮的木箱，把戰利品撈上船。",
  tut_sell: "現在駛回港口周圍的虛線圈，把貨物賣掉。",
  tut_buy: "把金幣花掉吧：在帳簿裡購買或升級任何一項。最便宜的要 {n} 金幣。",
  tut_poor: "最便宜的升級要 {n} 金幣。再出航擊沉一艘船，把戰利品帶回來。",
  tut_buySea: "把戰利品帶回港口，再購買或升級任何一項。最便宜的要 {n} 金幣。",
  tut_docked: "啟航，繼續你的首航。",
  tut_done: "這就是整個循環了，船長。越遠的海域，敵船越富有，也越危險。",
  ctl_steer_keys: "W 升帆、S 降帆，A 和 D 轉向。", ctl_steer_mouse: "在想去的方向按住滑鼠左鍵，游標越遠速度越快。",
  ctl_steer_touch: "在任意位置拖曳來轉向。", ctl_steer_pad: "用左搖桿轉向，十字鍵上升帆。",
  ctl_steer_desk: "用 W A S D 操控，或在想去的方向按住滑鼠左鍵。",
  ctl_fire_keys: "按空白鍵開火。", ctl_fire_mouse: "放開滑鼠左鍵或點一下就會開火。", ctl_fire_touch: "放開手指就會開火。",
  ctl_fire_pad: "按 A 或 RT 開火。", ctl_fire_desk: "按空白鍵或點一下滑鼠開火。",
});

const TUT = ["out", "aim", "fire", "sink", "scoop", "sell", "buy"];
const tut = { active: false, step: 0, sunk0: 0, gold0: 0, sig: "", target: null, pickT: 0, doneT: 0, html: "", g: null };

function hasProgress(s) {
  return s.sunk > 0 || s.gold > 0 || s.ship !== "sloop" || s.hull > 1 || s.sails > 1 || s.hold > 1 ||
    Object.values(s.gunLv || {}).some(l => l > 1) || Object.keys(s.unlocked || {}).some(k => k !== "six" && s.unlocked[k]) ||
    (Array.isArray(s.wrecks) && s.wrecks.length > 0);
}
// Saves from before the tutorial existed have no tutorialDone field: a captain with progress already knows the ropes.
(() => {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!(raw && typeof raw === "object" && "tutorialDone" in raw) && hasProgress(save)) save.tutorialDone = true;
})();

const tutEl = id => document.getElementById(id);
const purchaseSig = () => JSON.stringify([save.ship, save.hull, save.sails, save.hold, save.gunLv, save.unlocked]);
function cheapestBuy() {
  const c = [];
  for (const id of GUN_ORDER) { if (!save.unlocked[id]) c.push(GUNS[id].cost); else if (save.gunLv[id] < GUN_MAX) c.push(gunUpCost(id)); }
  for (const [k, y] of Object.entries(YARD)) if (save[k] < y.max) c.push(y.cost(save[k]));
  for (const id of SHIP_ORDER.slice(SHIP_ORDER.indexOf(save.ship) + 1)) c.push(SHIPS[id].cost);
  const m = Math.min(...c.filter(v => v > 0));
  return Number.isFinite(m) ? m : 0;
}
// Is any loaded gun's line passing through an enemy right now (the red line in drawOverlays)?
function aimOnTarget() {
  for (const mount of MOUNTS) {
    if (!mountEngaged(mount)) continue;
    const arr = player.guns[mount.key];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].cd > 0) continue;
      const m = muzzle(player, mount, i, arr.length);
      if (lineHits(m.x, m.y, m.a, arr[i].range)) return true;
    }
  }
  return false;
}

// Until the captain's first sinking, every departure puts an easy Lv 1 merchant just past the safe waters,
// in the direction the ship leaves the harbor.
function forgivingSpawn() {
  if (save.sunk > 0) return null;
  const base = Math.atan2(player.y - PORT.y, player.x - PORT.x), r = SAFE_R + 140;   // still inside the Lv 1 ring
  for (let i = 0; i < 24; i++) {
    const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.22, x = PORT.x + Math.cos(a) * r, y = PORT.y + Math.sin(a) * r;
    if (islands.some(s => Math.hypot(s.x - x, s.y - y) < s.r * 1.3 + 60)) continue;
    return spawnEnemy(S, { x, y, merchant: true }) || null;
  }
  return null;
}
// Called by the shell when a voyage begins (the ledger closed and the sea is live).
function tutorialOnVoyage() {
  const easy = forgivingSpawn();
  tutorialStart();
  if (easy) tut.target = easy;
}
function tutorialStart() {
  if (save.tutorialDone || tut.active) return;
  Object.assign(tut, { active: true, doneT: 0, html: "" });
  enterStep(clamp(save.tutorialStep | 0, 0, TUT.length - 1));
}
function tutorialReplay() {
  save.tutorialDone = false; save.tutorialStep = 0; persist();
  Object.assign(tut, { active: false, step: 0, doneT: 0, html: "" });
  if (!titleOpen) tutorialStart();   // replayed from the pause menu or the ledger: start right away
  renderCoach();
}
function tutorialSkip() {
  save.tutorialDone = true; persist();
  tut.active = false; renderCoach();
}
function tutorialReset() { Object.assign(tut, { active: false, step: 0, target: null, doneT: 0, html: "" }); renderCoach(); }
const tutorialRunning = () => tut.active && tut.doneT <= 0;

function enterStep(n) {
  tut.step = n; save.tutorialStep = n;
  if (n <= 3) tut.sunk0 = save.sunk;        // only a sinking from here on counts
  if (TUT[n] === "sell") tut.gold0 = save.gold;
  if (TUT[n] === "buy") tut.sig = purchaseSig();
  persist();
}
function finish() {
  save.tutorialDone = true; save.tutorialStep = 0; persist();
  tut.doneT = 6;
}

function tutorialTick(dt) {
  if (!tut.active) { if (tut.g) tut.g.clear(); return; }
  if (tut.doneT > 0) { tut.doneT -= dt; if (tut.doneT <= 0) tut.active = false; renderCoach(); if (tut.g) tut.g.clear(); return; }
  const at = TUT[tut.step];
  let next = tut.step;
  if (!docked && !paused) {
    if (save.sunk > tut.sunk0 && next < 4) next = 4;                       // played ahead of the card: catch up
    if (cargo > 0 && next < 5) next = 5;
    if (at === "out" && Math.hypot(player.x - PORT.x, player.y - PORT.y) > DOCK_R + 140) next = Math.max(next, 1);
    else if (at === "aim" && aimOnTarget()) next = Math.max(next, 2);
    else if (at === "fire" && balls.some(b => b.fromPlayer)) next = Math.max(next, 3);
    else if ((at === "scoop" || at === "sell") && cargo <= 0 && !crates.some(c => !c.wreck)) next = 3;   // the loot drifted away
  } else if (docked) {
    if (at === "sell") next = save.gold > tut.gold0 ? 6 : 3;               // docked by sinking: the hold was lost
    else if (at === "buy" && purchaseSig() !== tut.sig) { finish(); renderCoach(); return; }
  }
  if (next !== tut.step) enterStep(next);
  renderCoach();
  drawGuide(dt);
}

function coachText() {
  if (tut.doneT > 0) return t("tut_done");
  const at = TUT[tut.step];
  if (at === "buy") { const n = fmt(cheapestBuy()); return t(!docked ? "tut_buySea" : save.gold >= cheapestBuy() ? "tut_buy" : "tut_poor", { n }); }
  if (docked) return t("tut_docked");
  return t("tut_" + at, { steer: t("ctl_steer_" + device), fire: t("ctl_fire_" + device) });
}
// The card floats over the sea, and moves into the ledger sheet while docked so it never covers the shop.
function renderCoach() {
  const el = tutEl("coach"), show = tut.active && !titleOpen && !pauseOpen;
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  const sheet = document.querySelector("#port .sheet"), home = docked ? sheet : document.body;
  if (el.parentElement !== home) { if (docked) sheet.insertBefore(el, tutEl("pMsg")); else document.body.appendChild(el); }
  el.classList.toggle("in-sheet", docked);
  const head = tut.doneT > 0 ? t("tut_title") : `${t("tut_title")} · ${t("tut_count", { n: tut.step + 1, m: TUT.length })}`;
  const html = head + "|" + coachText();
  if (html === tut.html) return;
  tut.html = html;
  tutEl("coachStep").textContent = head;
  tutEl("coachTxt").textContent = coachText();
  tutEl("coachSkip").hidden = tut.doneT > 0;
}
document.addEventListener("langchange", () => { tut.html = ""; renderCoach(); });
document.addEventListener("devicechange", () => { tut.html = ""; renderCoach(); });

// ---------- On-sea guide: a gold ring on the thing to go for, and an arrow at the screen edge when it is off-screen ----------
function guideTarget(dt) {
  const at = TUT[tut.step];
  if (at === "aim" || at === "fire" || at === "sink") {
    if (tut.target && tut.target.alive) return { x: tut.target.x, y: tut.target.y, r: 46 };
    tut.pickT -= dt;
    if (tut.pickT <= 0 || !tut.target || !tut.target.alive) {
      tut.pickT = 0.5;
      const mine = shipRating();
      tut.target = enemies.filter(e => e.alive && e.L <= mine && dist(e, player) < 1600).sort((a, b) => dist(a, player) - dist(b, player))[0] || null;
    }
    return tut.target ? { x: tut.target.x, y: tut.target.y, r: 46 } : null;
  }
  if (at === "scoop") { const c = crates.filter(k => !k.wreck).sort((a, b) => dist(a, player) - dist(b, player))[0]; return c ? { x: c.x, y: c.y, r: 24 } : null; }
  if (at === "sell" || at === "buy") return { x: PORT.x, y: PORT.y, r: 0 };
  return null;
}
function drawGuide(dt) {
  if (!tut.g) tut.g = S.add.graphics().setDepth(9);
  const g = tut.g; g.clear();
  if (docked || paused) return;
  const tg = guideTarget(dt);
  if (!tg) return;
  const cam = S.cameras.main, v = cam.worldView, z = cam.zoom, now = S.time.now / 1000;
  if (tg.r) { g.lineStyle(3 / z, 0xf0c766, 0.9); g.strokeCircle(tg.x, tg.y, tg.r + Math.sin(now * 4) * 4); }
  // keep the arrow clear of the HUD strip at the top (in screen px, so divide by zoom)
  const L = v.x + 48 / z, R = v.right - 48 / z, T = v.y + 130 / z, B = v.bottom - 56 / z;
  if (tg.x > L && tg.x < R && tg.y > T && tg.y < B) return;
  const cx = (L + R) / 2, cy = (T + B) / 2, a = Math.atan2(tg.y - cy, tg.x - cx);
  const k = Math.min((R - L) / 2 / Math.max(Math.abs(Math.cos(a)), 1e-6), (B - T) / 2 / Math.max(Math.abs(Math.sin(a)), 1e-6));
  const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k, s = 18 / z;
  g.fillStyle(0x08222d, 0.6); g.fillCircle(ax, ay, s * 1.15);
  g.fillStyle(0xf0c766, 1);
  g.fillTriangle(ax + Math.cos(a) * s, ay + Math.sin(a) * s, ax + Math.cos(a + 2.4) * s * 0.8, ay + Math.sin(a + 2.4) * s * 0.8, ax + Math.cos(a - 2.4) * s * 0.8, ay + Math.sin(a - 2.4) * s * 0.8);
}
