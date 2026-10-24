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
  dow_1: "Monday", dow_2: "Tuesday", dow_3: "Wednesday", dow_4: "Thursday", dow_5: "Friday", dow_6: "Saturday", dow_7: "Sunday",
  dr_tier: "{day} · Difficulty {k}/7",
  dc_faster: "{s} s faster than your friend", dc_slower: "{s} s slower than your friend", dc_same: "The same time as your friend",
  dc_winOnly: "You sank the captain; your friend didn't", dc_friendOnly: "Your friend sank the captain; you didn't",
  dc_more: "{n} more ships sunk", dc_fewer: "{n} ships short", dc_hullUp: "{n}% more hull", dc_hullDown: "{n}% less hull", dc_tie: "A dead heat with your friend",
  dc_friendWin: "Friend: {boss} sunk in {d} · hull {h}% · {s} sunk", dc_friendLose: "Friend: {boss} got away · hull {h}% · {s} sunk",
});
Object.assign(STR.zh, {
  dtrait_alone: "單船出航", dtrait_twin: "兩艘雙桅船隨行", dtrait_fire: "縱火船開路", dtrait_guard: "巡防艦護衛", dtrait_swift: "一群快艇",
  m_daily: "每日海域 #{n}", m_dailyStreak: "每日海域 #{n} · 連續 {k} 天",
  dow_1: "週一", dow_2: "週二", dow_3: "週三", dow_4: "週四", dow_5: "週五", dow_6: "週六", dow_7: "週日",
  dr_tier: "{day}・難度 {k}/7",
  dc_faster: "比朋友快 {s} 秒", dc_slower: "比朋友慢 {s} 秒", dc_same: "和朋友同樣時間",
  dc_winOnly: "你擊沉了船長，朋友沒有", dc_friendOnly: "朋友擊沉了船長，你沒有",
  dc_more: "多擊沉 {n} 艘", dc_fewer: "還差 {n} 艘", dc_hullUp: "船體多 {n}%", dc_hullDown: "船體少 {n}%", dc_tie: "和朋友不分高下",
  dc_friendWin: "朋友：{boss} {d} 擊沉 · 船體 {h}% · 擊沉 {s} 艘", dc_friendLose: "朋友：{boss} 逃脫 · 船體 {h}% · 擊沉 {s} 艘",
});
DAILY_NAMES.forEach(([en, zh], i) => { STR.en["boss_d" + i] = en; STR.zh["boss_d" + i] = zh; });

// The day's number: #1 on DAILY_EPOCH, +1 at every UTC midnight. A clock set before the epoch still reads #1.
const dailyNumber = (ms = Date.now()) => Math.max(1, Math.floor((ms - DAILY_EPOCH) / 86400000) + 1);
// Day number to the sea's seed: spread out so neighbouring days look nothing alike. Always 1000..2147000000 (never LEGACY_SEED).
// The weekday sets the difficulty: Monday 1 .. Sunday 7 by the UTC date of daily n. Everyone gets the same one.
const dailyTier = n => ((new Date(DAILY_EPOCH + (Math.max(1, n) - 1) * 86400000).getUTCDay() + 6) % 7) + 1;
const dailyTierLabel = n => t("dr_tier", { day: t("dow_" + dailyTier(n)), k: dailyTier(n) });
const dailySeed = n => 1000 + (Math.imul(n, 2654435761) >>> 0) % 2146000000;
// Seeded sea: the captain as a bounty entry the campaign code can hunt (js/campaign.js spawnBounty): its own id, class,
// hull multiplier, lair angle and escort. The lair sits mid-ring DAILY_LEVEL so the captain is the ring's level.
function dailySpec(seed, tier = 1) {
  const r = mulberry32(seed ^ 0x5eed5eed), pick = list => list[Math.floor(r() * list.length)];
  const nameIdx = Math.floor(r() * DAILY_NAMES.length), cls = pick(DAILY_CLASSES), trait = pick(DAILY_TRAITS);
  const T = DAILY_TIERS[clamp(Math.floor(tier) || 1, 1, DAILY_TIERS.length) - 1];
  const hpMul = Math.round((cls === "cutter" ? 2.5 : cls === "brig" ? 2.2 : 1.4) * (0.9 + r() * 0.3) * T.hp * 10) / 10;
  return { id: "d" + nameIdx, daily: true, L: DAILY_LEVEL, cls, faction: cls === "frigate" ? "navy" : "pirate", hpMul,
    speed: Math.round((cls === "cutter" ? 0.9 : 1) * T.speed * 100) / 100, ang: r() * Math.PI * 2, r: SAFE_R + (DAILY_LEVEL - 1) * ZONE_STEP + ZONE_STEP / 2,
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
// A page address to a run. "#daily" (no number: today's sea), "#daily=57&t=102&hp=64&k=9" (daily 57 and a friend's result: t = seconds
// to sink the captain, left out when it got away; hp = hull % left; k = ships sunk) and "#seed=12345" (a free voyage). Numbers only.
// The day must be a plain number; the friend's figures are clamped to what a run can reach, and a figure that is not a number
// is ignored. Without both hp and k there is no friend result. Anything else is null.
const hashInt = (v, lo, hi) => (typeof v === "string" && /^\d{1,9}$/.test(v) ? clamp(Number(v), lo, hi) : null);
function parseRunHash(hash) {
  const [head, ...rest] = String(hash || "").replace(/^#/, "").split("&");
  const kv = new Map(rest.map(p => p.split("=")).filter(p => p.length === 2));
  if (head === "daily") return { kind: "daily", n: 0, seed: 0, friend: null };
  const d = /^daily=(\d{1,6})$/.exec(head);
  if (d) {
    const n = Number(d[1]), t = hashInt(kv.get("t"), 0, DAILY_SECONDS), hp = hashInt(kv.get("hp"), 0, 100), k = hashInt(kv.get("k"), 0, 999);
    if (n < 1) return null;
    return { kind: "daily", n, seed: 0, friend: hp !== null && k !== null ? { won: t !== null, bossT: t === null ? 0 : t, hull: hp, sunk: k } : null };
  }
  const m = /^seed=(\d{1,10})$/.exec(head), seed = m ? Number(m[1]) : 0;
  return seed >= 1 && seed <= 2147483647 ? { kind: "seed", n: 0, seed, friend: null } : null;
}
// The address that carries a result: "#daily=57&t=102&hp=64&k=9" (no t when the captain got away).
const dailyLink = (n, r) => `#daily=${n}${r.won ? `&t=${r.bossT}` : ""}&hp=${r.hull}&k=${r.sunk}`;
// Me against a friend's result (both dailyResult shapes): a list of [string key, vars] lines, only what differs.
function compareFriend(me, fr) {
  const out = [], line = (key, vars = {}) => out.push([key, vars]);
  if (me.won && fr.won) { const d = fr.bossT - me.bossT; if (d > 0) line("dc_faster", { s: d }); else if (d < 0) line("dc_slower", { s: -d }); else line("dc_same"); }
  else if (me.won !== fr.won) line(me.won ? "dc_winOnly" : "dc_friendOnly");
  const k = me.sunk - fr.sunk, h = me.hull - fr.hull;
  if (k) line(k > 0 ? "dc_more" : "dc_fewer", { n: Math.abs(k) });
  if (h) line(h > 0 ? "dc_hullUp" : "dc_hullDown", { n: Math.abs(h) });
  if (!out.length) line("dc_tie");
  return out;
}
// "Friend: Black Jerry sunk in 1:42 · hull 64% · 9 sunk"
const friendText = (n, f) => t(f.won ? "dc_friendWin" : "dc_friendLose", { boss: t("boss_" + dailySpec(dailySeed(n)).id), d: fmtClock(f.bossT), h: f.hull, s: f.sunk });
// The streak as the title shows it: still alive if the last day played is today or yesterday.
const liveStreak = (store, n) => (store.last === n || store.last === n - 1 ? store.streak : 0);
