"use strict";
// ---------- Rematch: a beaten captain sails again from his lair every sortie ----------
// "Beaten" is derived, not saved: the first save.campaign.bounty entries of BOUNTIES (js/campaign.js); a v1 save's count is moved onto the six-bounty order on load (js/save-campaign.js).
// Each departure puts up to REMATCH_MAX of them back at their lairs (farthest from the harbor first, the rest take their
// turn next sailing) with their escorts, tagged "rematch". Sinking one pays REMATCH_PCT of the bounty's chest plus the
// usual spoils, never moves the campaign on (that is claimBounty's job, and only for the hunted captain), and still
// counts for the Hall of fame's fastest-sinking record (js/hall.js hooks `sunk` for any s.boss). A daily or seeded run
// (js/run.js) hunts its own captain and gets no rematches.
Object.assign(STR.en, { rematchTag: "{name} · Rematch", rematchPay: "Rematch bounty +{n}" });
Object.assign(STR.zh, { rematchTag: "{name}・再戰", rematchPay: "再戰賞金 +{n}" });

// The beaten captains to put to sea: farthest lair first (a lair's r is its distance from the harbor), at most `max`.
// `bounties` is the campaign list, `beaten` how many are claimed.
const rematchPicks = (bounties, beaten, max) =>
  bounties.slice(0, Math.max(0, beaten)).sort((p, q) => q.r - p.r).slice(0, Math.max(0, max));
const rematchReward = (b, mul = 1) => Math.round(b.reward * REMATCH_PCT * mul);

let rematches = [];   // { ship, tag, hitAt }
function clearRematches() {
  for (const r of rematches) { r.tag.txt.destroy(); r.tag.skull.destroy(); }
  rematches = [];
}
function spawnRematches() {
  if (runActive() || !save.tutorialDone) return;
  for (const b of rematchPicks(BOUNTIES, save.campaign.bounty, REMATCH_MAX)) {
    const ship = spawnCaptain(b);
    if (!ship) continue;
    ship.rematch = true;
    rematches = [...rematches, { ship, tag: makeBossTag(t("rematchTag", { name: bossName(b) })), hitAt: -1e9 }];
  }
}
function payRematch(b, s) {
  const pay = rematchReward(b, lootMul());
  save.gold += pay;
  save.stats = { ...save.stats, gold: save.stats.gold + pay };
  persist();
  floatText(s.x, s.y - 60, t("rematchPay", { n: fmt(pay) }), "#f6d27a", 22);
  sfx("coin", { amount: pay, delay: 0.35 });
  hud(true);
}
onHook("sail", () => { clearRematches(); spawnRematches(); });
onHook("hurt", (s, dmg, src) => { if (s.rematch && src === player) { const r = rematches.find(x => x.ship === s); if (r) r.hitAt = S.time.now; } });
onHook("sunk", (s, killer) => {
  const r = s.rematch && rematches.find(x => x.ship === s);
  if (!r) return;
  rematches = rematches.filter(x => x !== r); r.tag.txt.destroy(); r.tag.skull.destroy();
  if (killer === player || S.time.now - r.hitAt < ASSIST_MS) payRematch(findBounty(s.boss), s);
});
onHook("frame", () => {
  for (const r of rematches) placeBossTag(r.tag, r.ship);
  if (rematches.some(r => !r.ship.alive)) { for (const r of rematches) if (!r.ship.alive) { r.tag.txt.destroy(); r.tag.skull.destroy(); } rematches = rematches.filter(r => r.ship.alive); }
});
onHook("lang", () => { for (const r of rematches) r.tag.txt.setText(t("rematchTag", { name: bossName(findBounty(r.ship.boss)) })); });
// A dim mark on the chart so a captain out for a rematch can be found; the live bounty keeps the gold one (js/campaign-ui.js).
onHook("mini", (c, k, u) => {
  for (const r of rematches) {
    if (!r.ship.alive) continue;
    const x = r.ship.x * k, y = r.ship.y * k;
    c.fillStyle = "#1b1410"; c.beginPath(); c.arc(x, y, 6 * u, 0, TAU); c.fill();
    c.strokeStyle = "rgba(240,199,102,.6)"; c.lineWidth = 1.1 * u; c.stroke();
    drawSkull(c, x, y + 0.4 * u, 4.4 * u, "rgba(240,199,102,.7)");
  }
});
