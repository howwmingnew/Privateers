"use strict";
// ---------- The daily sea: today's number, its seed, its captain, and the local record of days played ----------
// Pure logic, no scene: js/run.js plays it. The day is the UTC day (DAILY_EPOCH, js/config.js is #1), so two devices agree.
// Everything about the captain (name, hull class, escort) and the layout comes from mulberry32(seed): same day, same sea.
const DAILY_KEY = "privateers-daily-v1";   // its own storage key: the campaign save (privateers-save-v2) is never touched
const DAILY_NAMES = [
  ["Black Jerry", "黑喬瑞"], ["Salt Maggie", "鹽巴瑪姬"], ["One-Eye Tobias", "獨眼托比亞斯"], ["Mad Dog Fenn", "瘋狗芬恩"],
  ["Lady Cutlass", "彎刀夫人"], ["Old Barnacle", "老藤壺"], ["Cap'n Gallows", "絞架船長"], ["Silver Nell", "銀鈴奈兒"],
  ["Dread Humphrey", "恐怖漢弗萊"], ["Storm Rook", "風暴魯克"], ["Bloody Anselm", "血手安瑟"], ["Widow Marsh", "沼澤寡婦"],
];
// The captain's escort: what sails beside the hull. `cls` picks the escort's class (js/archetypes.js).
const DAILY_TRAITS = [
  { id: "alone", escorts: [] },
  { id: "twin", escorts: [{ cls: "brig" }, { cls: "brig" }] },
  { id: "fire", escorts: [{ cls: "fireship", hpMul: 0.6 }, { cls: "fireship", hpMul: 0.6 }] },
  { id: "guard", escorts: [{ cls: "frigate" }] },
  { id: "swift", escorts: [{ cls: "cutter" }, { cls: "cutter" }, { cls: "cutter" }] },
];
const DAILY_CLASSES = ["cutter", "brig", "frigate"];
Object.assign(STR.en, {
  dtrait_alone: "Sails alone", dtrait_twin: "Two brigs in company", dtrait_fire: "Fire-raiders ahead", dtrait_guard: "A frigate guards her", dtrait_swift: "A pack of cutters",
  m_daily: "Daily sea #{n}", m_dailyStreak: "Daily sea #{n} · {k}-day streak",
});
Object.assign(STR.zh, {
  dtrait_alone: "單船出航", dtrait_twin: "兩艘雙桅船隨行", dtrait_fire: "縱火船開路", dtrait_guard: "巡防艦護衛", dtrait_swift: "一群快艇",
  m_daily: "每日海域 #{n}", m_dailyStreak: "每日海域 #{n} · 連續 {k} 天",
});
DAILY_NAMES.forEach(([en, zh], i) => { STR.en["boss_d" + i] = en; STR.zh["boss_d" + i] = zh; });

// The day's number: #1 on DAILY_EPOCH, +1 at every UTC midnight. A clock set before the epoch still reads #1.
const dailyNumber = (ms = Date.now()) => Math.max(1, Math.floor((ms - DAILY_EPOCH) / 86400000) + 1);
// Day number to the sea's seed: spread out so neighbouring days look nothing alike. Always 1000..2147000000 (never LEGACY_SEED).
const dailySeed = n => 1000 + (Math.imul(n, 2654435761) >>> 0) % 2146000000;
// Seeded sea: the captain as a bounty entry the campaign code can hunt (js/campaign.js spawnBounty): its own id, class,
// hull multiplier, lair angle and escort. The lair sits mid-ring DAILY_LEVEL so the captain is the ring's level.
function dailySpec(seed) {
  const r = mulberry32(seed ^ 0x5eed5eed), pick = list => list[Math.floor(r() * list.length)];
  const nameIdx = Math.floor(r() * DAILY_NAMES.length), cls = pick(DAILY_CLASSES), trait = pick(DAILY_TRAITS);
  const hpMul = Math.round((cls === "cutter" ? 2.5 : cls === "brig" ? 2.2 : 1.4) * (0.9 + r() * 0.3) * 10) / 10;
  return { id: "d" + nameIdx, daily: true, L: DAILY_LEVEL, cls, faction: cls === "frigate" ? "navy" : "pirate", hpMul,
    speed: cls === "cutter" ? 0.9 : 1, ang: r() * Math.PI * 2, r: SAFE_R + (DAILY_LEVEL - 1) * ZONE_STEP + ZONE_STEP / 2,
    reward: 0, escorts: trait.escorts, trait: trait.id };
}

// ---------- results ----------
const fmtClock = sec => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
// won: the captain went down to the player · bossT: seconds into the run when it did · sunk: ships sunk · hull: 0-100
const dailyResult = ({ won, bossT, sunk, hull }) => ({ won: !!won, bossT: won ? Math.max(0, Math.round(bossT)) : null,
  sunk: Math.max(0, Math.floor(sunk) || 0), hull: Math.max(0, Math.min(100, Math.round(hull) || 0)) });
// Does result a beat result b? A sunk captain beats a free one, then the faster kill, then more ships, then more hull.
function dailyBeats(a, b) {
  if (!b) return true;
  if (a.won !== b.won) return a.won;
  if (a.won && a.bossT !== b.bossT) return a.bossT < b.bossT;
  if (a.sunk !== b.sunk) return a.sunk > b.sunk;
  return a.hull > b.hull;
}

// ---------- the local record: best result per day, and the run of days played ----------
const DAILY_KEEP = 60;   // days of history kept
const freshDaily = () => ({ v: 1, days: {}, streak: 0, bestStreak: 0, last: 0 });
function cleanDay(d) {
  if (!d || typeof d !== "object") return null;
  const n = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v >= 0 ? Math.min(v, 1e6) : 0; };
  return dailyResult({ won: d.won === true, bossT: n(d.bossT), sunk: n(d.sunk), hull: n(d.hull) });
}
function sanitizeDaily(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return freshDaily();
  const days = {};
  for (const [k, v] of Object.entries(raw.days && typeof raw.days === "object" ? raw.days : {})) {
    const day = cleanDay(v);
    if (/^[1-9]\d{0,5}$/.test(k) && day) days[k] = day;
  }
  const num = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? Math.min(v, 1e6) : 0; };
  const keys = Object.keys(days).map(Number).sort((a, b) => b - a).slice(0, DAILY_KEEP);
  return { v: 1, days: Object.fromEntries(keys.map(k => [k, days[k]])), streak: num(raw.streak), bestStreak: num(raw.bestStreak), last: num(raw.last) };
}
// Fold a finished run of day n into the record. Returns { store, best: it beat the day's best, streak }. Never mutates.
function dailyRecord(store, n, result) {
  const s = sanitizeDaily(store), prev = s.days[n], best = dailyBeats(result, prev);
  const streak = s.last === n ? s.streak : s.last === n - 1 ? s.streak + 1 : 1;
  const days = { ...s.days, [n]: best ? result : prev };
  const keys = Object.keys(days).map(Number).sort((a, b) => b - a).slice(0, DAILY_KEEP);
  return { best, streak, store: { v: 1, days: Object.fromEntries(keys.map(k => [k, days[k]])), streak, bestStreak: Math.max(s.bestStreak, streak), last: Math.max(s.last, n) } };
}
function loadDaily() { try { return sanitizeDaily(JSON.parse(localStorage.getItem(DAILY_KEY))); } catch (e) { return freshDaily(); } }
function saveDaily(store) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(store)); } catch (e) { console.error("Could not save the daily record:", e); } }
// A page address to a run: "#daily" -> { kind: "daily" }, "#seed=12345" -> { kind: "seed", seed: 12345 }, anything else null.
function parseRunHash(hash) {
  if (hash === "#daily") return { kind: "daily", seed: 0 };
  const m = /^#seed=(\d{1,10})$/.exec(hash || ""), seed = m ? Number(m[1]) : 0;
  return seed >= 1 && seed <= 2147483647 ? { kind: "seed", seed } : null;
}
// The streak as the title shows it: still alive if the last day played is today or yesterday.
const liveStreak = (store, n) => (store.last === n || store.last === n - 1 ? store.streak : 0);
