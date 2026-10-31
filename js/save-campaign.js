"use strict";
// ---------- Campaign save fields: island seed, Letters of Marque, stats, achievements, New Game+ ----------
//   seed      islands for this game (the harbor never moves)
//   campaign  { order: bounty-list version, bounty: bounties claimed 0-6, rank 0-4, ships: hulls the yard will sell, outpost, deaths, won }
//   stats     lifetime numbers for the Captain's log; ach { id: unlock time }; ngPlus: New Game+ cycles begun
const LEGACY_SEED = 7;        // the old fixed map
const LEGACY_SHIFT = 1500;    // the old 5000-px map's harbor sat at 2500, the 8000-px map's sits at 4000
// The bounties in poster order (BOUNTIES, js/campaign.js, is checked against it by tests/unit-bounty140.mjs). campaign.bounty counts the
// ones claimed, so it doubles as the index of the one hunted now; every unlock names its captain by id (bountyDone), never by a count, so a
// captain added mid-list (#140: the smuggler between Red Ned and Mother Carey) moves no feature to another boss.
const BOUNTY_ORDER = ["ned", "smuggler", "carey", "saint", "hale", "thorne"];
const BOUNTY_COUNT = BOUNTY_ORDER.length, OUTPOST_AFTER = "saint";
// campaign.order 2: the order above (not the save's own `v`). An order-1 save (5 bounties, no smuggler) past Mother Carey has skipped him,
// so its count moves up one (sanitizeCampaignSave).
const CAMPAIGN_ORDER = 2;
// The rank each claim brings (rank_0..rank_4): the smuggler pays gold and a hull but no new title, and the finale keeps Pirate Lord.
const BOUNTY_RANK = { ned: 1, smuggler: 1, carey: 2, saint: 3, hale: 4, thorne: 4 };
const bountyIndex = id => BOUNTY_ORDER.indexOf(id);   // 0-based poster position, -1 for an unknown id
const bountyDone = (c, id) => { const i = bountyIndex(id); return i >= 0 && !!c && (c.bounty || 0) > i; };
const rankAfter = n => (n > 0 ? BOUNTY_RANK[BOUNTY_ORDER[Math.min(n, BOUNTY_COUNT) - 1]] : 0);
// The captain whose sinking opens each hull at the yard (both ships of a tier, one per line); the sloop is always open. Mother Carey opens none (#140).
const SHIP_GATE = { sloop: null, schooner: "ned", gunboat: "ned", brigantine: "smuggler", brig: "smuggler", cruiser: "saint", frigate: "saint", corsair: "hale", line: "hale" };
const shipOpen = (c, id) => !SHIP_GATE[id] || bountyDone(c, SHIP_GATE[id]);
// What `bounty` claims add up to: rank, the outpost and the hulls on sale (plus any `kept`: listed or sailed already). The claim (js/campaign.js
// claimBounty) and every load (sanitizeCampaignSave) both read it, so a new gate is added here once.
const campaignAt = (bounty, kept = () => false) => ({ order: CAMPAIGN_ORDER, bounty, rank: rankAfter(bounty), outpost: bountyDone({ bounty }, OUTPOST_AFTER),
  ships: SHIP_ORDER.filter(id => shipOpen({ bounty }, id) || kept(id)) });
const randomSeed = () => 1000 + Math.floor(Math.random() * 2147000000);   // never LEGACY_SEED
const freshCampaign = () => ({ ...campaignAt(0), deaths: 0, won: false });
const freshStats = () => ({ time: 0, gold: 0, sunk: { pirate: 0, navy: 0, merchant: 0 }, byLevel: {}, deaths: 0,
  longest: 0, sorties: 0, wrecks: 0, bounties: 0 });
SAVE_DEFAULTS.push(() => ({ seed: randomSeed(), campaign: freshCampaign(), stats: freshStats(), ach: {}, ngPlus: 0 }));

const countOf = v => toInt(v, 0, Number.MAX_SAFE_INTEGER, 0);
const amountOf = v => { const n = toNum(v); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e10) : 0; };
const safeEntries = o => isObj(o) ? Object.entries(o).filter(([k]) => !UNSAFE_KEYS.has(k)) : [];
// A save with no seed predates the 8000-px map. If the captain has any history there, keep the old islands (and move
// their wrecks with the harbor); a save with nothing in it yet is a new game and rolls its own map.
function hasHistory(s) {
  return s.gold > 0 || s.sunk > 0 || s.wrecks.length > 0 || s.ship !== "sloop" || s.hull > 1 || s.sails > 1 || s.hold > 1 ||
    allGuns(s).some(x => x.g !== "six");
}
function sanitizeCampaignSave(s) {
  const storedSeed = toInt(s.seed, 1, 2147483647, 0), legacy = !storedSeed && hasHistory(s);
  const c = isObj(s.campaign) ? s.campaign : {};
  // v1 (5 bounties) -> v2: a count of 2+ is past Mother Carey, so the smuggler (index 1) lies behind it too; 1 (Red Ned only) is already "next: the smuggler".
  // Every load runs this, so the output always carries the marker and a migrated save is never shifted twice.
  const stored = toInt(c.bounty, 0, BOUNTY_COUNT, 0), bounty = c.order === CAMPAIGN_ORDER || stored < 2 ? stored : Math.min(stored + 1, BOUNTY_COUNT);
  const listed = Array.isArray(c.ships) ? c.ships : [];
  const st = isObj(s.stats) ? s.stats : {}, sunk = isObj(st.sunk) ? st.sunk : {};
  const byLevel = Object.fromEntries(safeEntries(st.byLevel).filter(([k]) => /^[1-9]\d?$/.test(k)).map(([k, v]) => [k, countOf(v)]));
  const ach = Object.fromEntries(safeEntries(s.ach).filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && toNum(v) > 0).map(([k, v]) => [k, toNum(v)]));
  const wrecks = legacy ? s.wrecks.map(w => ({ ...w, x: clamp(w.x + LEGACY_SHIFT, 60, W - 60), y: clamp(w.y + LEGACY_SHIFT, 60, H - 60) })) : s.wrecks;
  return { ...s, wrecks,
    seed: storedSeed || (legacy ? LEGACY_SEED : randomSeed()),
    // a captain who already sails a bigger hull keeps it, whatever the bounties say
    campaign: { ...campaignAt(bounty, id => listed.includes(id) || id === s.ship), deaths: countOf(c.deaths),
      won: bounty >= BOUNTY_COUNT && c.won === true },
    stats: { time: amountOf(st.time), gold: amountOf(st.gold), sunk: { pirate: countOf(sunk.pirate), navy: countOf(sunk.navy), merchant: countOf(sunk.merchant) },
      byLevel, deaths: countOf(st.deaths), longest: amountOf(st.longest), sorties: countOf(st.sorties), wrecks: countOf(st.wrecks), bounties: countOf(st.bounties) },
    ach, ngPlus: toInt(s.ngPlus, 0, 99, 0) };
}
SAVE_SANITIZERS.push(sanitizeCampaignSave);
