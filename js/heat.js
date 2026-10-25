"use strict";
// ---------- Navy heat and the Admiral's fleet (issue #14) ----------
// Heat (0..100, five stars) rises when the player sinks Navy ships and cools by itself after HEAT_CALM_S of peace, or at once in
// any harbor. It is not saved: a sortie starts cold. Each star pays warship bounties +20%; from two stars the Navy puts hunting
// patrol fleets (js/fleet.js) to sea after the player, stronger and more often as the stars climb. They lose interest when
// heat falls below two stars. Once four bounties are claimed, the Admiral's own fleet (flagship + escort) also patrols the deep
// now and then, sooner when the captain is wanted: the warning shot before the last captain. Off in daily/seed runs.
Object.assign(STR.en, {
  heat_lbl: "Wanted", heat_aria: "Navy heat {n} of 5 stars, warship bounties x{m}",
  heatUp: "Navy heat {n}/5: bounties x{m}", heatUpHunt: "Navy heat {n}/5: bounties x{m}. Hunters are at sea!",
  heatCooled: "The Navy has lost your trail.", heatHunt: "A Navy hunting fleet is on your wake!",
  admiralSighted: "The Admiral's fleet! A flagship and her escort patrol these waters.",
});
Object.assign(STR.zh, {
  heat_lbl: "通緝", heat_aria: "海軍通緝熱度 {n} / 5 星，戰艦賞金 ×{m}",
  heatUp: "海軍通緝 {n}/5：賞金 ×{m}", heatUpHunt: "海軍通緝 {n}/5：賞金 ×{m}。追獵艦隊出海了！",
  heatCooled: "海軍丟失了你的蹤跡。", heatHunt: "海軍的追獵艦隊正咬著你的尾流！",
  admiralSighted: "上將艦隊！旗艦帶著護航艦在這片海域巡邏。",
});

// ---------- Pure rules ----------
const heatStars = h => Math.min(HEAT_STARS, Math.max(0, Math.floor(h / HEAT_STAR_SIZE + 1e-9)));
const heatBountyMul = stars => 1 + HEAT_BOUNTY_STEP * Math.min(Math.max(stars, 0), HEAT_STARS);
const heatMax = () => HEAT_STARS * HEAT_STAR_SIZE;
// Heat after `dt` more seconds, `quiet` seconds since the last Navy sinking (cooling starts HEAT_CALM_S in).
const heatCool = (h, quiet, dt) => quiet >= HEAT_CALM_S ? Math.max(0, h - HEAT_COOL * dt) : h;
const heatGain = (h, n) => Math.min(heatMax(), h + n);
const heatForSink = s => s.admiral ? HEAT_FLAGSHIP_SINK : s.hunter ? HEAT_HUNTER_SINK : HEAT_PER_SINK;
// Seconds to the next Admiral sighting: a roll in ADMIRAL_EVERY (r in 0..1), shortened by heat.
const admiralWait = (stars, r) => (ADMIRAL_EVERY[0] + (ADMIRAL_EVERY[1] - ADMIRAL_EVERY[0]) * r) / (1 + ADMIRAL_HEAT * stars);

// ---------- State (one sortie) ----------
let heat = 0, heatQuiet = 0, huntT = 0, admT = 0, heatTickT = 0, heatKey = "";
const heatOn = () => !!(save && save.tutorialDone && !(typeof runActive === "function" && runActive()) && !(typeof firstVoyage === "function" && firstVoyage()));
const heatNow = () => (heatOn() ? heat : 0);
const heatMulNow = () => heatBountyMul(heatStars(heatNow()));   // read by js/plunder.js
const hunters = () => enemies.filter(e => e.alive && e.hunter);
const huntFleets = () => fleetsLive().filter(f => f.hunt);

function heatReset() {
  heat = 0; heatQuiet = 0; huntT = 0; heatKey = "";
  admT = admiralWait(0, Math.random()) * 0.6;
  releaseHunters();
  heatPaint();
}
function heatAdd(n) {
  if (!heatOn() || !player || !player.alive) return;
  const before = heatStars(heat);
  heat = heatGain(heat, n * gearCut("heat")); heatQuiet = 0;   // a flag that draws less attention (js/gear-core.js)
  const st = heatStars(heat);
  if (st > before) {
    if (before < HEAT_HUNT_FROM && st >= HEAT_HUNT_FROM) huntT = HEAT_HUNT_FIRST;
    toast(t(st >= HEAT_HUNT_FROM ? "heatUpHunt" : "heatUp", { n: st, m: heatBountyMul(st).toFixed(1) }));
    sfx("bell", { pitch: 0.5 + st * 0.08 });
  }
  heatPaint();
}
// Hunters give up the chase (they sail as ordinary patrols again, and the sea may retire them).
function releaseHunters() {
  for (const e of hunters()) { e.hunter = false; e.angry = 0; if (e.attacker === player) e.attacker = null; }
  for (const f of fleets) f.hunt = false;
}

// ---------- Spawning ----------
// A spot r px from the player, out of sight, in open water away from the harbor's safe waters.
function seaSpot(rMin, rMax) {
  for (let k = 0; k < 40; k++) {
    const a = rand(0, TAU), r = rand(rMin, rMax), x = player.x + Math.cos(a) * r, y = player.y + Math.sin(a) * r;
    if (x > 260 && x < W - 260 && y > 260 && y < H - 260 && Math.hypot(x - PORT.x, y - PORT.y) > SAFE_R + 350 && !onScreen(x, y, 150) &&
        !islands.some(i => Math.hypot(i.x - x, i.y - y) < i.r * 1.3 + 140)) return { x, y };
  }
  return null;
}
const heatMaxLevel = () => MAX_RING + WAR_MAX + levelBonus() + 2;   // the deepest ring at its war level, plus the most a hunter or the Admiral adds
function spawnHunters(stars) {
  const p = seaSpot(HEAT_HUNT_R[0], HEAT_HUNT_R[1]);
  if (!p) return false;
  const L = Math.min(levelAt(Math.hypot(p.x - PORT.x, p.y - PORT.y)) + HEAT_HUNT_LV[stars], heatMaxLevel());
  const lead = makeEnemy(S, p.x, p.y, L, "navy");
  lead.rot = Math.atan2(player.y - p.y, player.x - p.x);
  const classes = fleetPlan("patrol", lead, stars - 1), want = Math.min(stars - 1, fleetMaxSize(lead.ring) - 1);
  while (classes.length && classes.length < want) classes.push(classes[classes.length - 1]);   // a hunting fleet is as big as the stars allow
  const ships = classes.length ? spawnWing(S, "patrol", lead, classes) : [lead];
  const f = ships.length > 1 ? makeFleet("patrol", ships) : null;
  if (f) f.hunt = true;
  ships.forEach(s => { s.hunter = true; });
  heatKeepHunting();
  toast(t("heatHunt")); sfx("bell", { pitch: 0.45 });
  return true;
}
function spawnAdmiral() {
  const p = seaSpot(ADMIRAL_R[0], ADMIRAL_R[1]);
  if (!p) return false;
  const L = Math.min(levelAt(Math.hypot(p.x - PORT.x, p.y - PORT.y)) + ADMIRAL_LV, heatMaxLevel());
  const lead = makeEnemy(S, p.x, p.y, L, "navy", "manowar");
  lead.rot = Math.atan2(PORT.y - p.y, PORT.x - p.x) + rand(-1, 1);
  lead.maxHp = lead.hp = lead.maxHp * ADMIRAL_HP; lead.loot = Math.round(lead.loot * ADMIRAL_LOOT);
  lead.admiral = true;
  applyShipArt(lead, "line", "boss");   // gold trim and the big flag: the flagship reads at a glance
  refreshBadge(lead);
  const ships = spawnWing(S, "admiral", lead, fleetPlan("admiral", lead, 4));
  if (ships.length < 3) {   // no room for an escort: no fleet at all
    retireShips(ships);
    return false;
  }
  makeFleet("admiral", ships).admiral = true;
  ships.forEach(s => { s.holdSea = true; });   // the sea's population control leaves him alone (js/world-seas.js)
  return true;
}
function retireShips(ships) {
  for (const s of ships) { s.alive = false; s.spr.destroy(); s.badge?.destroy(); const i = enemies.indexOf(s); if (i >= 0) enemies.splice(i, 1); }
}
// Hunters never lose the scent while the Navy is after the captain: keep them angry at the player and point them at him.
function heatKeepHunting() {
  for (const e of hunters()) {
    e.attacker = player; e.angry = Math.max(e.angry, 5);
    if (!e.target && dist(e, player) < 1400 && !docked) { e.ignore.delete(player); e.target = player; e.chaseFrom = { x: e.x, y: e.y }; }
  }
}

// ---------- Upkeep ----------
function heatTick(dt) {
  if (!heatOn()) { if (heat > 0) heatReset(); return; }
  const before = heatStars(heat), h0 = heat;
  heatQuiet += dt;
  heat = heatCool(heat, heatQuiet, dt);
  const st = heatStars(heat);
  if (h0 > 0 && heat === 0) toast(t("heatCooled"));
  if (st < HEAT_HUNT_FROM && before >= HEAT_HUNT_FROM) releaseHunters();
  if (st >= HEAT_HUNT_FROM) {
    huntT -= dt;
    if (huntT <= 0) {
      const fresh = huntFleets().length < HEAT_HUNT_MAX[st] && !inSafe(player);
      huntT = fresh && spawnHunters(st) ? HEAT_HUNT_EVERY[st] : 5;
    }
    if ((heatTickT -= dt) <= 0) { heatTickT = 0.5; heatKeepHunting(); }
  } else huntT = 0;
  if (save.campaign.bounty >= ADMIRAL_AFTER && playerRing() >= ADMIRAL_RING && !inSafe(player)) {
    admT -= dt * (1 + ADMIRAL_HEAT * st);
    if (admT <= 0) admT = fleetsLive().some(f => f.admiral) ? 20 : spawnAdmiral() ? admiralWait(st, Math.random()) : 15;
  }
  for (const f of fleets) {
    if (f.admiral && f.lead.alive && dist(f.lead, player) > ADMIRAL_GONE) { retireShips(f.ships.filter(s => s.alive)); f.dead = true; continue; }
    if (f.admiral && !f.warned && !f.lost && f.lead.alive && dist(f.lead, player) < 1300) { f.warned = true; toast(t("admiralSighted")); sfx("bell", { pitch: 0.4 }); }
  }
  heatPaint();
}

// ---------- HUD (the hudrow beside the sail dial: stars sized by font-size, so the UI size slider --ts scales them) ----------
function heatPaint() {
  const el = document.getElementById("heatInd");
  if (!el) return;
  const h = heatNow(), st = heatStars(h), part = st >= HEAT_STARS ? 0 : Math.round((h % HEAT_STAR_SIZE) / HEAT_STAR_SIZE * 20) * 5;
  const key = `${h > 0}/${st}/${part}/${lang}`;
  if (key === heatKey) return;
  heatKey = key;
  el.hidden = !(h > 0);
  el.classList.toggle("hot", st >= 3);
  el.querySelectorAll(".stars i").forEach((s, i) => { s.classList.toggle("on", i < st); s.style.setProperty("--p", i === st ? part + "%" : "0%"); });
  const m = heatBountyMul(st);
  document.getElementById("heatLbl").textContent = t("heat_lbl");   // not data-i18n: the language pass runs before this file adds its strings
  document.getElementById("heatTxt").textContent = st > 0 ? "x" + m.toFixed(1) : "";
  el.setAttribute("aria-label", t("heat_aria", { n: st, m: m.toFixed(1) }));
}
document.addEventListener("langchange", () => { heatKey = ""; heatPaint(); });

onHook("sunk", (s, killer) => { if (killer === player && s.faction === "navy" && !s.fixed) heatAdd(heatForSink(s)); });
onHook("sail", heatReset);
onHook("dock", () => { if (heat > 0) { heat = 0; heatQuiet = 0; releaseHunters(); heatPaint(); } });
onHook("frame", dt => { if (!paused && !docked && S && player && player.alive) heatTick(dt); });
