"use strict";
// ---------- AI plunder: pirates and navy scoop floating loot and level up on the spot (issue #31) ----------
// An idle pirate or navy ship (not a boss, escort, fireship, merchant or fort) turns toward loose loot within AIP_SEEK_R and
// takes it when it gets there; a ship with a target close by keeps fighting. Loot it takes is kept on the hull (e.stolen) and
// every aipCost() of it buys one level: more hull and gun damage, a flash, a bouncing badge. Sinking it drops all it carries
// as a crate. The growth lives on the ship object, so the next sortie's fresh sea (resetEnemies, js/harbor.js) starts at
// the designed levels and nothing is saved. A daily run turns it off: the loot there depends on how the player fights, so it
// would make today's sea differ between players.
Object.assign(STR.en, { aipUp: "Level up!", aipLoot: "Plundered +{n}" });
Object.assign(STR.zh, { aipUp: "升級！", aipLoot: "搶得 +{n}" });

const aipCost = (L, up) => Math.max(1, Math.round(enemyStats(L, false).loot * AIP_COST_K * (1 + AIP_COST_GROW * up)));
const aipOn = e => e.alive && !e.boss && !e.escortOf && !e.merchant && !e.fixed && !(e.A && e.A.boom) && (e.faction === "pirate" || e.faction === "navy") &&
  !(typeof runActive === "function" && runActive() && runKind() === "daily");
// Loot a ship may take: floating cargo, not the captain's wreck and not a fort's treasure chest, and not inside the safe harbor waters.
const aipTreasure = c => typeof fortSites !== "undefined" && fortSites.some(f => f.crate === c);
const aipFree = c => !c.wreck && c.value > 0 && !aipTreasure(c) && dist(c, PORT) > SAFE_R + 80;

// From think() (js/ships.js) when nothing else steers the ship: course for the best loose crate, or null.
// d = distance to its target (0 = none). A ship gives up on a crate it has chased for AIP_PATIENCE s.
function aipSeek(e, d, dt) {
  if (!aipOn(e) || (e.target && d < AIP_BREAK)) { e.aipC = null; return null; }
  const now = S.time.now / 1000, skip = e.aipSkip || (e.aipSkip = new Map());
  let best = null, bs = 0;
  for (const c of crates) {
    const cd = dist(e, c);   // the cheap test first: most crates are out of reach
    if (cd > AIP_SEEK_R || !aipFree(c) || (skip.get(c) || 0) > now) continue;
    const sc = c.value / (cd + 120);   // rich and near first
    if (sc > bs) { best = c; bs = sc; }
  }
  if (!best) { e.aipC = null; return null; }
  if (e.aipC !== best) { e.aipC = best; e.aipT = 0; }
  if ((e.aipT += dt) > AIP_PATIENCE) { skip.set(best, now + 30); e.aipC = null; return null; }
  return { desired: Math.atan2(best.y - e.y, best.x - e.x), thr: clamp(dist(e, best) / 250, 0.3, 0.8) };   // slows near the crate so a slow-turning hull doesn't circle it
}
// Per frame: a ship on a crate takes it all.
function aipScoop() {
  if (!crates.length || (typeof runActive === "function" && runActive() && runKind() === "daily")) return;   // the daily sea: aipOn is false for every ship
  for (const e of enemies) {
    if (!aipOn(e)) continue;
    for (const c of crates) {
      if (dist(e, c) > AIP_PICK_R || !aipFree(c)) continue;   // distance first: a ship x crate pair is nearly always far apart
      const n = c.value; c.value = 0; e.stolen = (e.stolen || 0) + n; aipGrow(e);
      if (typeof refreshBadge === "function") refreshBadge(e);
      if (onScreen(e.x, e.y)) { floatText(e.x, e.y - 52, t("aipLoot", { n: fmt(n) }), "#f0c766", 14); sfx("pickup", { x: e.x, y: e.y }); }
      break;
    }
  }
}
// Spend what the ship carries on levels, as many as it affords.
function aipGrow(e) {
  while ((e.up || 0) < AIP_MAX_UP) {
    const cost = aipCost(e.L, e.up || 0);
    if ((e.stolen || 0) - (e.spent || 0) < cost) break;
    e.spent = (e.spent || 0) + cost;
    aipLevelUp(e);
  }
}
function aipLevelUp(e) {
  if (e.up === undefined || !e.up) e.baseThreat = e.threatL ?? e.L;
  e.up = (e.up || 0) + 1;
  const add = e.maxHp * (AIP_HP - 1);
  e.maxHp += add; e.hp = Math.min(e.maxHp, e.hp + add);
  for (const m in e.guns) for (const g of e.guns[m]) g.dmg *= AIP_DMG;
  e.threatL = Math.max(threatLevelOf(e), e.baseThreat + e.up);   // always reads at least one level up per level gained
  if (!e.spr || !e.spr.active) return;
  e.spr.setTintFill(0xfff1b0); S.time.delayedCall(180, () => { if (e.alive && e.spr.active) e.spr.clearTint(); });
  if (typeof refreshBadge === "function") refreshBadge(e);
  if (e.badge) { S.tweens.killTweensOf(e.badge); e.badge.setScale(1); S.tweens.add({ targets: e.badge, scale: 1.7, duration: 160, yoyo: true, ease: "Quad.easeOut" }); }
  if (onScreen(e.x, e.y)) { floatText(e.x, e.y - 70, t("aipUp"), "#ffe08a", 18); sfx("bell", { x: e.x, y: e.y }); }
}
onHook("frame", () => { if (S && !paused && !docked) aipScoop(); });
