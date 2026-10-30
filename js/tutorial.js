"use strict";
// ---------- First-voyage tutorial ----------
// A small coach card walks a brand-new captain through one whole loop. Every step advances from real game state,
// polled each frame (tutorialTick, from shellTick), never from a timer. It can be skipped at any time and
// replayed from How to play. Progress is kept in the save (tutorialDone / tutorialStep).
Object.assign(STR.en, {
  tut_title: "First voyage", tut_skip: "Skip", tut_count: "{n} of {m}",
  tut_out: "Sail out of the harbor. {mouse}",
  tut_aim: "Find the gold-ringed ship (off screen, a gold arrow at the edge points to it) and turn until the aim line turns red.\nA green tag only means it is weaker than you. It does not mean merchant.",
  tut_fire: "Red means a hit. Fire! {fire}",
  tut_mouse: "Mouse: hold the right button and the ship sails toward the cursor: the farther the cursor from the ship, the fuller the sail (W/S do nothing while you hold). Let go and the sail stays; press S to stop; left-click fires.",
  tut_loaded: "Plunder aboard! Next, sell it at the harbor.",
  tut_sink: "Keep firing until it sinks. Faint lines are still reloading. {hold}",
  tut_scoop: "Sunk! Sail over the floating crate to scoop up the plunder.", tut_scoopNo: "Sail over the floating crate to scoop up the plunder.",
  tut_sell: "Now sail back to {harbor} (the gold arrow points to it) and into the dashed ring around it to sell your cargo.",
  tut_buy: "Spend your gold here at {harbor}: tap a gun port to buy or upgrade a gun, or tap the hull to upgrade the ship. The cheapest costs {n} gold.",
  tut_poor: "The cheapest upgrade costs {n} gold. Set sail, sink another ship and bring its plunder back.",
  tut_buySea: "Sail back to {harbor} (gold arrow): only it sells guns and ships. Buy or upgrade something there. The cheapest costs {n} gold.",
  tut_buyMoor: "Stop inside the {harbor} ring and hold still to open the ledger, then buy or upgrade something. The cheapest costs {n} gold.",
  tut_wrong_supply_sell: "The Supply Station only mends hulls. To sell your cargo, sail to {harbor} (gold arrow).",
  tut_wrong_supply_buy: "The Supply Station only mends hulls. To upgrade, sail to {harbor} (gold arrow).",
  tut_wrong_trade_buy: "The Trade Port only buys cargo. To spend gold on upgrades, sail to {harbor} (gold arrow).",
  tut_again: "The plunder is gone, but your progress is kept. Follow the gold arrow to a ship, sink it and scoop its crate.",
  tut_docked: "Set sail to carry on with your first voyage.",
  tut_done: "That is the whole loop, captain. What next:\n1. Sink ships with green tags (weaker than you) to earn gold.\n2. Back in port, upgrade guns or change ship until your Ship Lv reaches {lv} (now Lv {me}).\n3. {boss} lurks {dir} of the harbor: follow the gold skull arrow.",
  tut_doneGen: "That is the whole loop, captain. Farther waters hold richer ships, and deadlier ones.", tut_ok: "Got it",
  ctl_steer_keys: "W raises the sail, S lowers it, A and D turn.", ctl_steer_mouse: "Hold the right mouse button where you want to sail: the farther the cursor, the fuller the sail. W/S do nothing while you hold.",
  ctl_steer_touch: "Drag anywhere to steer.", ctl_steer_pad: "Steer with the left stick; D-pad up raises the sail.",
  ctl_steer_desk: "Steer with W A S D, or hold the right mouse button where you want to sail.",
  ctl_fire_keys: "Press Space to fire.", ctl_fire_mouse: "Left-click to fire.", ctl_fire_touch: "Let go to fire.",
  ctl_fire_pad: "Press A or RT to fire.", ctl_fire_desk: "Press Space, or click, to fire.",
  ctl_hold: "Hold Space to auto-fire at red lines.",
});
Object.assign(STR.zh, {
  tut_title: "首航", tut_skip: "略過", tut_count: "第 {n}／{m} 步",
  tut_out: "駛出港口。{mouse}",
  tut_aim: "找金圈標示的船（不在畫面內時，邊緣的金色箭頭會指路），轉向讓瞄準線變紅。\n標籤是綠色，只代表比你弱，不代表是商船。",
  tut_fire: "紅線代表會命中。開火！{fire}",
  tut_mouse: "用滑鼠：按住右鍵，船會朝游標駛去，游標離船越遠帆越滿（按住時 W/S 無效）。放開後帆速維持不變，要停船按 S；左鍵開火。",
  tut_loaded: "戰利品上船了！下一步把它帶回港口賣掉。",
  tut_sink: "繼續開火，直到它沉沒。淡色的線代表還在裝填。{hold}",
  tut_scoop: "擊沉了！駛過漂浮的木箱，把戰利品撈上船。", tut_scoopNo: "駛過漂浮的木箱，把戰利品撈上船。",
  tut_sell: "現在回「{harbor}」（金色箭頭指向它），駛進它周圍的虛線圈把貨物賣掉。",
  tut_buy: "在「{harbor}」把金幣花掉吧：點砲口購買或升級火砲，或點船身升級船隻。最便宜的要 {n} 金幣。",
  tut_poor: "最便宜的升級要 {n} 金幣。再出航擊沉一艘船，把戰利品帶回來。",
  tut_buySea: "回「{harbor}」（金色箭頭）：只有那裡能買砲、買船、升級。最便宜的要 {n} 金幣。",
  tut_buyMoor: "在「{harbor}」的虛線圈裡停船、保持靜止就能打開帳簿，再購買或升級任何一項。最便宜的要 {n} 金幣。",
  tut_wrong_supply_sell: "補給站只能修船。要賣貨，請回「{harbor}」（金色箭頭）。",
  tut_wrong_supply_buy: "補給站只能修船。要升級，請回「{harbor}」（金色箭頭）。",
  tut_wrong_trade_buy: "交易港只能賣貨。要花金幣升級，請回「{harbor}」（金色箭頭）。",
  tut_again: "戰利品沒了，但你的進度還在。跟著金色箭頭找一艘船，擊沉它、撈起木箱。",
  tut_docked: "啟航，繼續你的首航。",
  tut_done: "這就是整個循環了，船長。接下來：\n1. 去打標籤是綠色（比你弱）的船賺金幣。\n2. 回港口在帳簿升級砲或換船，讓船艦 Lv 升到 {lv}（現在 Lv {me}）。\n3. {boss}在港口{dir}方，跟著金色骷髏指標去找他。",
  tut_doneGen: "這就是整個循環了，船長。越遠的海域，敵船越富有，也越危險。", tut_ok: "知道了",
  ctl_steer_keys: "W 升帆、S 降帆，A 和 D 轉向。", ctl_steer_mouse: "在想去的方向按住滑鼠右鍵，游標離船越遠帆越滿；按住時 W/S 無效。",
  ctl_steer_touch: "在任意位置拖曳來轉向。", ctl_steer_pad: "用左搖桿轉向，十字鍵上升帆。",
  ctl_steer_desk: "用 W A S D 操控，或在想去的方向按住滑鼠右鍵。",
  ctl_fire_keys: "按空白鍵開火。", ctl_fire_mouse: "按滑鼠左鍵開火。", ctl_fire_touch: "放開手指就會開火。",
  ctl_fire_pad: "按 A 或 RT 開火。", ctl_fire_desk: "按空白鍵或點一下滑鼠開火。",
  ctl_hold: "按住空白鍵，會自動對紅線開火。",
});

const TUT_MIN_T = 1.6;   // seconds the scoop card (step 5) stays up at least: a crate picked up in the same moment as the kill must not skip it
const TUT_DONE_T = 30;   // seconds at sea the "what next" card stays up (the ledger does not count it down); "Got it" closes it sooner
const TUT = ["out", "aim", "fire", "sink", "scoop", "sell", "buy"];
const tut = { active: false, step: 0, sunk0: 0, gold0: 0, sold: false, sig: "", looted: false, killed: false, target: null, pickT: 0, doneT: 0, stepT: 0, html: "", g: null, up: false, plan: "", planT: 0, lbl: null, arrow: null };

function hasProgress(s) {
  return s.sunk > 0 || s.gold > 0 || s.ship !== "sloop" || s.hull > 1 || s.sails > 1 || s.hold > 1 ||
    allGuns(s).some(x => x.lv > 1 || x.g !== "six") || (s.store || []).length > 0 ||
    (Array.isArray(s.wrecks) && s.wrecks.length > 0);
}
// Saves from before the tutorial existed have no tutorialDone field: a captain with progress already knows the ropes.
(() => {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!(raw && typeof raw === "object" && "tutorialDone" in raw) && hasProgress(save)) save = { ...save, tutorialDone: true };
})();
// New games start with the fields (js/save.js SAVE_DEFAULTS); the check below fills them into the first load.
if (typeof SAVE_DEFAULTS !== "undefined") SAVE_DEFAULTS.push(() => ({ tutorialDone: false, tutorialStep: 0 }));
// js/save.js runs these on every load (and once more after all scripts): a bad or missing value means "not done yet".
if (typeof SAVE_SANITIZERS !== "undefined") SAVE_SANITIZERS.push(s => ({ ...s,
  tutorialDone: s.tutorialDone === true, tutorialStep: Number.isInteger(s.tutorialStep) ? clamp(s.tutorialStep, 0, TUT.length - 1) : 0 }));

const tutEl = id => document.getElementById(id);
const purchaseSig = () => JSON.stringify([save.ship, save.hull, save.sails, save.hold, allGuns().map(x => x.g + x.lv).sort(), allGuns().length]);
function cheapestBuy() {
  const c = [];
  for (const id of GUN_ORDER) c.push(GUNS[id].cost);
  for (const gun of allGuns()) if (gun.lv < GUN_MAX) c.push(gunUpCost(gun));
  for (const [k, y] of Object.entries(YARD)) if (save[k] < y.max) c.push(y.cost(save[k]));
  for (const id of SHIP_ORDER) if (SHIPS[id].tier > SHIPS[save.ship].tier) c.push(SHIPS[id].cost);
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
      const m = muzzle(player, mount, arr[i].pi, arr[i].pn);
      if (lineHits(m.x, m.y, m.a, arr[i].range)) return true;
    }
  }
  return false;
}

// Every departure on the first voyage that has no kill and loot to work with yet (the first sortie, or one after a sinking
// took them away) puts an easy Lv 1 merchant just past the safe waters, in the direction the ship leaves the harbor. It sails
// at TUT_MARK_HULL of its hull, so 3-4 hits sink it, and its hold is worth at least the cheapest buy, so the first sale buys
// something. It is slow and never runs (e.tutMark: js/ships.js): the lesson is to sink it, not to chase it.
const TUT_MARK_HULL = 0.4, TUT_MARK_SPEED = 0.7;
const needsMark = () => !save.tutorialDone && save.tutorialStep < TUT.indexOf("buy") &&
  (save.tutorialStep <= TUT.indexOf("sink") || (cargo <= 0 && !lootCrates().length));
// Where the lesson may send the captain: never a warship, never a sea above the captain's own (or one far over the rating),
// never next to a running disaster, and (when picking) never into a knot of warships. Used for the gold ring and arrow.
const TUT_NAVY_GAP = 450, TUT_HAZARD_PAD = 260;
const tutHazard = (x, y) => typeof disMarks === "function" && disMarks().some(h => Math.hypot(h.x - x, h.y - y) < (DISASTER[h.kind] ? DISASTER[h.kind].R : 300) * 1.5 + TUT_HAZARD_PAD);
const tutNavyNear = (x, y, but) => enemies.some(o => o !== but && o.alive && o.faction === "navy" && Math.hypot(o.x - x, o.y - y) < TUT_NAVY_GAP);
function tutSafeSea(x, y) {
  const sea = seaOfRing(ringAt(Math.hypot(x - PORT.x, y - PORT.y)));
  return SEAS.indexOf(sea) <= SEAS.indexOf(seaOfRing(playerRing())) && (sea === SEAS[0] || !seaIsDanger(sea.id)) && !tutHazard(x, y);   // the first sea is where the mark is put: on New Game+ its level bonus would flag it "danger" for ever
}
const tutSafe = e => e.alive && isOrdinary(e) && e.faction !== "navy" && tutSafeSea(e.x, e.y) && (!practiceZone(player.x, player.y) || !!e.practice);   // with the captain in the practice waters (js/novice.js) the lesson only sends him at a practice target
let lastMark = null;   // the mark put out last: while it still sails, no second one is made, so a target that is not "safe" can never make a ship every frame
function forgivingSpawn() {
  if (!needsMark() || (lastMark && lastMark.alive && enemies.includes(lastMark))) return null;
  const base = Math.atan2(player.y - PORT.y, player.x - PORT.x), r = SAFE_R + 140;   // still inside the Lv 1 ring
  for (let i = 0; i < 24; i++) {
    const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.22, x = PORT.x + Math.cos(a) * r, y = PORT.y + Math.sin(a) * r;
    if (islands.some(s => Math.hypot(s.x - x, s.y - y) < s.r * 1.3 + 60) || tutHazard(x, y) || tutNavyNear(x, y)) continue;   // calm shallows only
    const e = spawnEnemy(S, { x, y, faction: "merchant", near: true });
    if (!e) return null;
    lastMark = e;
    e.maxHp = e.hp = Math.ceil(e.maxHp * TUT_MARK_HULL);
    e.tutMark = true; e.practice = true; e.maxSpeed *= TUT_MARK_SPEED;
    e.loot = Math.max(e.loot || 0, cheapestBuy());
    retireSpare(e);
    return e;
  }
  return null;
}
// The mark comes out of the sea's ENEMY_COUNT, not on top of it: a fresh sea is already full, so the farthest calm
// ordinary ship goes (off screen, one of its own ring first). The population top-up then keeps the count where it was.
function retireSpare(mark) {
  const pool = enemies.filter(o => o !== mark && o.alive && isOrdinary(o) && !(o.angry > 0));
  if (seaCensus().total <= ENEMY_COUNT || !pool.length) return;
  const score = o => (onScreen(o.x, o.y, 200) ? 0 : 1e7) + (o.ring === mark.ring ? 1e6 : 0) + dist(o, player);   // out of view first
  const o = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
  o.alive = false; o.spr.destroy(); o.badge?.destroy(); enemies.splice(enemies.indexOf(o), 1);
}
// Called by the shell when a voyage begins (the ledger closed and the sea is live).
function tutorialOnVoyage() {
  const easy = forgivingSpawn();
  tutorialStart();
  tut.target = easy || null;   // the old sea was just destroyed (resetEnemies), so drop any old target too
  // a fresh mark never moves the card back: the step stays where the captain got to (a sinking keeps the progress), and the
  // gold ring and arrow (guideTarget) point at the new mark; steps 5-6 with an empty hold read "tut_again" (tutRefill)
}
function tutorialStart() {
  if (save.tutorialDone || tut.active) return;
  Object.assign(tut, { active: true, doneT: 0, html: "" });
  enterStep(clamp(save.tutorialStep | 0, 0, TUT.length - 1));
}
function tutorialReplay() {
  save.tutorialDone = false; save.tutorialStep = 0; persist();
  Object.assign(tut, { active: false, step: 0, doneT: 0, html: "", killed: false });
  if (!titleOpen) tutorialStart();   // replayed from the pause menu or the ledger: start right away
  renderCoach();
}
function tutorialSkip() {
  save.tutorialDone = true; persist();
  tut.active = false; renderCoach();
}
function tutorialReset() { Object.assign(tut, { active: false, step: 0, target: null, doneT: 0, html: "", killed: false }); if (typeof bossHpReset === "function") bossHpReset(); renderCoach(); }
const tutorialRunning = () => tut.active && tut.doneT <= 0;
// Up to the first scoop only the tutorial's mark may pick a fight with the player (js/ships.js pickTarget), and the
// volley tip stays quiet (js/volley.js): the first kill and its crate are uncontested.
const tutorialCalm = () => firstVoyage() && tut.step <= TUT.indexOf("scoop") && !docked;
// Plunder the coach can point at: a fort's treasure crate (js/forts.js) sits under its guns, and wrecks are the player's own.
const lootCrates = () => crates.filter(c => !c.wreck && !(typeof fortSites !== "undefined" && fortSites.some(f => f.crate === c)));
// The "sell" step passes on a real sale of the hold (js/plunder.js sellHold), not on gold: a warship's bounty is gold too.
// Plunder picked up from a crate that is not a wreck (also from a ship someone else sank) counts as the first loot.
onHook("pickup", c => { if (tut.active && !c.wreck) tut.looted = true; });
onHook("sale", () => { if (tut.active && TUT[tut.step] === "sell") tut.sold = true; });
// The coach is up on a voyage the captain has not finished or skipped (a save edited to done also counts as done).
// Past the first sinking but the plunder is gone (a sinking took the hold, or the crate drifted off): no step back, only a new goal.
const tutRefill = () => tut.active && tut.doneT <= 0 && plunderStep(TUT[tut.step]) && plunderPlan() === "again" && !tut.sold;
const firstVoyage = () => tutorialRunning() && !save.tutorialDone;
// A sinking wipes the hold and the kill/crate tallies the steps read, so only what happens after the respawn can move the card.
onHook("sunk", (s, killer) => {
  if (!tut.active) return;
  if (s.isPlayer) Object.assign(tut, { sunk0: save.sunk, looted: false, killed: false, plan: "", planT: 0 });
  else if (killer === player) tut.killed = true;   // only the captain's own kill makes the card say "Sunk!" or lets a hold alone move it on
});

// What the plunder steps (scoop, sell) ask for right now: sell a hold, scoop a crate, or find a new ship. One answer feeds both the
// card and the gold arrow, so they never disagree, and a change between "scoop" and "again" has to hold for PLAN_HOLD seconds
// (a crate drifting off or another ship's loot appearing must not flip the card back and forth).
const PLAN_HOLD = 0.8;
const plunderRaw = () => cargo > 0 ? "sell" : lootCrates().length ? "scoop" : "again";
const plunderStep = at => at === "scoop" || at === "sell";
const plunderPlan = () => tut.plan || plunderRaw();
function plunderTick(dt) {
  const raw = plunderRaw();
  if (!tut.plan || raw === "sell" || raw === tut.plan) { tut.plan = raw; tut.planT = 0; }
  else if ((tut.planT += dt) >= PLAN_HOLD) { tut.plan = raw; tut.planT = 0; }
}
// The open-sea dock the captain is in (or the ledger is for), when it is a supply station or trade port, not Safe Harbor.
function wrongPort() {
  if (docked) return typeof dockKind !== "undefined" && isStationKind(dockKind) ? dockKind : null;
  if (typeof moor === "undefined" || !moor.inside) return null;
  const k = nearestHarbor().kind;
  return isStationKind(k) ? k : null;
}

function enterStep(n) {
  tut.step = n; save.tutorialStep = n; tut.plan = ""; tut.planT = 0; tut.stepT = 0;
  if (n <= 3) { tut.sunk0 = save.sunk; tut.looted = false; tut.killed = false; }        // only a sinking from here on counts
  if (TUT[n] === "sell") { tut.gold0 = save.gold; tut.sold = false; }
  if (TUT[n] === "buy") tut.sig = purchaseSig();
  persist();
}
function finish() {
  save.tutorialDone = true; save.tutorialStep = 0; persist();
  tut.doneT = TUT_DONE_T; doneCache = { key: "", text: "" };
}

function tutorialTick(dt) {
  if (!tut.active) { if (tut.g) tut.g.clear(); if (tut.lbl) tut.lbl.setVisible(false); return; }
  if (tut.doneT > 0) { if (!docked && !paused) tut.doneT -= dt; if (tut.doneT <= 0) tut.active = false; renderCoach(); if (tut.g) tut.g.clear(); if (tut.lbl) tut.lbl.setVisible(false); return; }
  const at = TUT[tut.step];
  if (at === "buy" && !cheapestBuy()) { finish(); renderCoach(); return; }   // a replay on a maxed-out save: nothing left to buy
  let next = tut.step;
  if (plunderStep(at) && !docked && !paused && player.alive) plunderTick(dt);
  if (!docked && !paused && player.alive) {   // a sinking in progress (the 1.7 s before the ledger) moves nothing
    tut.stepT += dt;
    if (save.sunk > tut.sunk0 && next < 4) next = 4;                       // played ahead of the card: catch up, but only as far as "scoop"
    if (cargo > 0 && next < 4 && (tut.killed || tut.looted || cargo >= player.cap)) next = 4;   // (a wreck's cargo alone is not the lesson's plunder); a crate picked up counts even when the kill was not the player's
    if (at === "scoop" && cargo > 0 && tut.stepT >= TUT_MIN_T && (tut.killed || tut.looted || cargo >= player.cap)) next = 5;   // the card moves on from "scoop" only after it has been seen (it used to jump 4 -> 6 when sunk and loot landed together)
    if (at === "out" && Math.hypot(player.x - PORT.x, player.y - PORT.y) > DOCK_R + 140) next = Math.max(next, 1);
    else if (at === "aim" && aimOnTarget()) next = Math.max(next, 2);
    else if (at === "fire" && balls.some(b => b.fromPlayer)) next = Math.max(next, 3);
    else if (at === "sell" && tut.sold) next = 6;                           // sold on a pass through the ring (js/mooring.js)
  } else if (docked) {
    if (at === "sell" && tut.sold) next = 6;                // (docked by sinking: the hold was lost, the step stays: tutRefill)
    else if (at === "buy" && purchaseSig() !== tut.sig) { finish(); renderCoach(); return; }
  }
  if (next !== tut.step) enterStep(next);
  renderCoach();
  drawGuide(dt);
}

// What to do next, in words: the first bounty's goal level, where its captain lurks (the skull arrow points the way).
let doneCache = { key: "", text: "" };
function nextStepText() {
  const b = typeof activeBounty === "function" ? activeBounty() : null;
  if (!b || typeof bountyRecLv !== "function" || typeof dirWord !== "function" || typeof bossName !== "function") return t("tut_doneGen");
  const key = lang + "|" + docked + "|" + save.campaign.bounty;   // the card is redrawn every frame; the goal level and rating only change in port
  if (doneCache.key !== key) doneCache = { key, text: t("tut_done", { lv: bountyRecLv(b), me: shipRating(), boss: bossName(b), dir: dirWord(b.ang) }) };
  return doneCache.text;
}
function coachText() {
  if (tut.doneT > 0) return nextStepText();
  const at = TUT[tut.step], harbor = t("harbor");
  const wrong = (at === "sell" || at === "buy") && wrongPort();   // a supply station or trade port: say what it can and cannot do
  if (wrong && !(wrong === "trade" && at === "sell" && cargo > 0)) return t("tut_wrong_" + wrong + "_" + (wrong === "supply" ? at : "buy"), { harbor });   // (a trade port still buys a hold)
  if (at === "buy") {
    const n = fmt(cheapestBuy()), rich = save.gold >= cheapestBuy();
    return t(!docked ? (rich ? "tut_buyMoor" : "tut_buySea") : rich ? "tut_buy" : "tut_poor", { n, harbor });
  }
  if (docked) return t("tut_docked");
  if (tutRefill()) return t("tut_again");
  const key = at === "scoop" && cargo > 0 ? "tut_loaded" : plunderStep(at) && plunderPlan() === "scoop" ? (tut.killed ? "tut_scoop" : "tut_scoopNo") : "tut_" + at;   // the plunder is already aboard (a dwell on the card, or loot from another ship's kill)   // a sale step with an empty hold and a crate afloat asks for the crate
  const pc = device !== "touch" && device !== "pad";
  return t(key, { harbor, mouse: device === "mouse" || device === "desk" ? t("tut_mouse") : "", fire: t("ctl_fire_" + device), hold: SETTINGS.autoFire && pc ? t("ctl_hold") : "" }).trim();   // Space only
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
  // steps 1-3 show the control itself: keycaps, a mouse or a finger (js/onboard.js)
  tutEl("coachKeys").innerHTML = !docked && tut.doneT <= 0 && typeof coachGlyphs === "function" ? coachGlyphs(TUT[tut.step]) : "";
  const skip = tutEl("coachSkip"); skip.dataset.i18n = tut.doneT > 0 ? "tut_ok" : "tut_skip"; skip.textContent = t(skip.dataset.i18n);   // the done card closes with "Got it"
}
document.addEventListener("langchange", () => { tut.html = ""; renderCoach(); });
document.addEventListener("devicechange", () => { tut.html = ""; renderCoach(); });

// ---------- On-sea guide: a gold ring on the thing to go for, and an arrow at the screen edge when it is off-screen ----------
function guideTarget(dt) {
  const at = TUT[tut.step];
  if (at === "aim" || at === "fire" || at === "sink" || tutRefill()) {
    const live = tut.target && tut.target.alive && enemies.includes(tut.target) && tutSafe(tut.target);   // not sunk, not removed from the sea
    if (live) return { x: tut.target.x, y: tut.target.y, r: 46 };
    tut.pickT -= dt;
    if (tut.pickT <= 0 || !live) {
      tut.pickT = 0.5;
      const mine = shipRating();
      tut.target = enemies.filter(e => e.L <= mine && tutSafe(e) && !tutNavyNear(e.x, e.y, e) && dist(e, player) < 1600).sort((a, b) => (practiceZone(b.x, b.y) - practiceZone(a.x, a.y)) || dist(a, player) - dist(b, player))[0] || null;
      if (!tut.target && lastMark && lastMark.alive && enemies.includes(lastMark)) tut.target = lastMark;   // the mark put out earlier, however far (the captain sailed out of the practice waters)
      if (!tut.target) tut.target = forgivingSpawn();   // a step walked back with nothing qualifying near: a fresh slow mark, so the ring and arrow have something to point at
    }
    return tut.target ? { x: tut.target.x, y: tut.target.y, r: 46 } : null;
  }
  if (plunderStep(at) && plunderPlan() === "scoop") { const c = lootCrates().sort((a, b) => dist(a, player) - dist(b, player))[0]; return c ? { x: c.x, y: c.y, r: 24 } : null; }
  if (at === "sell" || at === "buy" || plunderStep(at)) return { x: PORT.x, y: PORT.y, r: DOCK_R, label: t("harbor") };   // Safe Harbor: its dock ring in gold and its name, so a nearer trade port or supply station is not taken for it
  return null;
}
// The bottom edge (CSS px) of the HUD's left bars and right panel, read a few times a second (a layout read per frame is costly).
let hudKeep = 0, hudKeepT = 0;
function hudBottom(dt) {
  if ((hudKeepT -= dt) > 0) return hudKeep;
  hudKeepT = 0.4;
  return (hudKeep = Math.max(0, ...[...document.querySelectorAll("#hud .side, #hud .bars")].map(el => el.hidden ? 0 : el.getBoundingClientRect().bottom)));
}
// The arrow (or, with the harbor in view, the harbor itself) names what it points at (Safe Harbor): never taken for a ship, a supply station or a trade port.
function guideLabel(tg, x, y) {
  if (!tg.label) return;
  if (!tut.lbl) tut.lbl = worldText(x, y, tg.label, { fontFamily: UI_FONT, fontSize: "14px", fontStyle: "700", color: "#f0c766", stroke: "#0b2530", strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
  if (tut.lbl.text !== tg.label) tut.lbl.setText(tg.label);
  tut.lbl.setPosition(x, y).setVisible(true);
}
function drawGuide(dt) {
  if (!tut.g) tut.g = S.add.graphics().setDepth(9);
  const g = tut.g; g.clear(); tut.arrow = null;
  if (tut.lbl && tut.lbl.visible) tut.lbl.setVisible(false);
  // .up pins top: a stale inline bottom (js/hud-stack.js) would stretch the card, so it is dropped
  const coachUp = on => { if (on !== tut.up) { tut.up = on; const el = tutEl("coach"); el.classList.toggle("up", on); if (on) el.style.removeProperty("bottom"); } };
  if (docked || paused) { coachUp(false); return; }
  const tg = guideTarget(dt);
  if (!tg) { coachUp(false); return; }   // nothing to point at: the card goes back to its place, it must not stay up top
  // px = CSS pixels on screen in world units (camera zoom includes the device pixel ratio, js/view.js)
  const cam = S.cameras.main, v = cam.worldView, px = (typeof VIEW !== "undefined" ? VIEW.dpr : 1) / cam.zoom, now = S.time.now / 1000;
  // the card sits at the bottom, and hops to the top while the thing to go for is in the lower part of the screen (a gap between
  // the two thresholds keeps it from flickering); it never covers what it is pointing at
  const fy = (tg.y - v.y) / v.height, up = fy > 0.55 ? true : fy < 0.4 ? false : tut.up;
  coachUp(up);
  if (tg.r) { g.lineStyle(3 * px, 0xf0c766, 0.9); strokeRing(g, tg.x, tg.y, tg.r + Math.sin(now * 4) * 4); }
  // keep the arrow clear of the HUD strip at the top: bars, wind dial and chart are read off the page (the dial sat under a fixed 130 px)
  const L = v.x + 48 * px, R = v.right - 48 * px, T = v.y + Math.max(130, hudBottom(dt) + 12) * px, B = v.bottom - 56 * px;
  if (tg.x > L && tg.x < R && tg.y > T && tg.y < B) { guideLabel(tg, tg.x, tg.y - (tg.r + 22) * px); return; }
  const cx = (L + R) / 2, cy = (T + B) / 2, a = Math.atan2(tg.y - cy, tg.x - cx);
  const k = Math.min((R - L) / 2 / Math.max(Math.abs(Math.cos(a)), 1e-6), (B - T) / 2 / Math.max(Math.abs(Math.sin(a)), 1e-6));
  const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k, s = 18 * px;
  guideLabel(tg, ax - Math.cos(a) * s * 2.6, ay - Math.sin(a) * s * 1.8);
  tut.arrow = { x: ax, y: ay };   // world position of the drawn arrow (tests/shell.mjs checks it is clear of the HUD)
  g.fillStyle(0x08222d, 0.6); fillDisc(g, ax, ay, s * 1.15);
  g.fillStyle(0xf0c766, 1);
  g.fillTriangle(ax + Math.cos(a) * s, ay + Math.sin(a) * s, ax + Math.cos(a + 2.4) * s * 0.8, ay + Math.sin(a + 2.4) * s * 0.8, ax + Math.cos(a - 2.4) * s * 0.8, ay + Math.sin(a - 2.4) * s * 0.8);
}
