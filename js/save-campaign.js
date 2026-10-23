"use strict";
// ---------- Campaign save fields: island seed, Letters of Marque, stats, achievements, New Game+ ----------
//   seed      islands for this game (the harbor never moves)
//   campaign  { bounty: bounties claimed 0-5, rank 0-4, ships: hulls the yard will sell, outpost, deaths, won }
//   stats     lifetime numbers for the Captain's log; ach { id: unlock time }; ngPlus: New Game+ cycles begun
const LEGACY_SEED = 7;        // the old fixed map
const LEGACY_SHIFT = 1500;    // the old 5000-px map's harbor sat at 2500, the 8000-px map's sits at 4000
const BOUNTY_COUNT = 5, RANK_MAX = 4, OUTPOST_BOUNTY = 3;
// Bounties needed before the yard sells each hull (bounty n unlocks the ship with gate n).
const SHIP_GATE = { sloop: 0, schooner: 1, brig: 2, frigate: 3, line: 4 };
const randomSeed = () => 1000 + Math.floor(Math.random() * 2147000000);   // never LEGACY_SEED
const freshCampaign = () => ({ bounty: 0, rank: 0, ships: ["sloop"], outpost: false, deaths: 0, won: false });
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
    Object.keys(s.unlocked).length > 1;
}
function sanitizeCampaignSave(s) {
  const storedSeed = toInt(s.seed, 1, 2147483647, 0), legacy = !storedSeed && hasHistory(s);
  const c = isObj(s.campaign) ? s.campaign : {};
  const bounty = toInt(c.bounty, 0, BOUNTY_COUNT, 0);
  const listed = Array.isArray(c.ships) ? c.ships : [];
  // a captain who already sails a bigger hull keeps it, whatever the bounties say
  const ships = SHIP_ORDER.filter(id => SHIP_GATE[id] <= bounty || listed.includes(id) || id === s.ship);
  const st = isObj(s.stats) ? s.stats : {}, sunk = isObj(st.sunk) ? st.sunk : {};
  const byLevel = Object.fromEntries(safeEntries(st.byLevel).filter(([k]) => /^[1-9]\d?$/.test(k)).map(([k, v]) => [k, countOf(v)]));
  const ach = Object.fromEntries(safeEntries(s.ach).filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && toNum(v) > 0).map(([k, v]) => [k, toNum(v)]));
  const wrecks = legacy ? s.wrecks.map(w => ({ ...w, x: clamp(w.x + LEGACY_SHIFT, 60, W - 60), y: clamp(w.y + LEGACY_SHIFT, 60, H - 60) })) : s.wrecks;
  return { ...s, wrecks,
    seed: storedSeed || (legacy ? LEGACY_SEED : randomSeed()),
    campaign: { bounty, rank: Math.min(bounty, RANK_MAX), ships, outpost: bounty >= OUTPOST_BOUNTY, deaths: countOf(c.deaths),
      won: bounty >= BOUNTY_COUNT && c.won === true },
    stats: { time: amountOf(st.time), gold: amountOf(st.gold), sunk: { pirate: countOf(sunk.pirate), navy: countOf(sunk.navy), merchant: countOf(sunk.merchant) },
      byLevel, deaths: countOf(st.deaths), longest: amountOf(st.longest), sorties: countOf(st.sorties), wrecks: countOf(st.wrecks), bounties: countOf(st.bounties) },
    ach, ngPlus: toInt(s.ngPlus, 0, 99, 0) };
}
SAVE_SANITIZERS.push(sanitizeCampaignSave);
