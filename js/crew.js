"use strict";
// ---------- Crew (#66): people aboard the flagship, each with a role that gives a small passive bonus ----------
// Crew are people, not gear: hired in the harbor ledger (js/crew-ui.js) from a small pool that changes after every sortie, or (rarely) a veteran who
// joins from a bounty captain's crew. They never leave and are never lost: only when the flagship SINKS are the ones aboard hurt, and they rest in
// port for CREW_REST sorties (a surgeon aboard at the sinking cuts that), then come back to duty. Seats depend on the hull's size (crewSeats).
// save.crew = { list: [{ id, role, gr, n, on, rest }], pool: [{ role, gr, n }], poolAt, seq }
//   role  one of CREW_ROLES   gr  1 able (hired) | 2 veteran (a bounty's)   n  name index (cn0..)   on  sails with you   rest  sorties still to sit out (0 = fit)
//   pool  today's candidates in port   poolAt  stats.sorties when the pool was drawn (a new sortie: a new pool)   seq  the next id
// The bonuses never stack into a big multiplier with gear: a crew member's share is ADDED to the worn gear's total of the same effect and the sum
// stops at that effect's GEAR_CAP (js/config.js), the cap gear alone already has; reload, which gear only has per gun, stops at CREW_RELOAD_CAP.
// Only the best of each role aboard counts, so a second gunner is a spare, not a second bonus. Escorts wear nothing (js/gear-fx.js): crew
// sail with the captain only. A daily or seeded run plays a default save (js/run.js), which has no crew.
Object.assign(STR.en, {   // crewTitle / crewHint are the ledger section's heading and hint: js/hud.js applies data-i18n as it loads, so they live here, before it
  crewTitle: "Crew", crewHint: "People who sail with your flagship, each with a small bonus by role. Seats by hull size: small 2, medium 3, large 4. Only the best of each role aboard counts, and a crew bonus adds to gear of the same kind but never past the gear's own cap. Crew never leave: if your ship sinks, those aboard rest in port for a few sorties, then come back.",
  cr_gunner: "Master gunner", cr_carpenter: "Carpenter", cr_surgeon: "Surgeon", cr_navigator: "Navigator",
  cg_1: "Able", cg_2: "Veteran",
  cfx_gunner: "Reload +{a}%", cfx_carpenter: "Hull repair at sea +{a}%", cfx_surgeon: "Hurt crew rest {a} sortie(s) less · fires aboard burn out {b}% sooner", cfx_navigator: "Speed +{a}% · storm yaw -{b}%",
  crewJoin: "{name}, a veteran {role} from {boss}'s crew, joins you!", crewJoinAshore: "{name}, a veteran {role} from {boss}'s crew, waits for you in port.",
  cn0: "Tom Harrow", cn1: "Ned Blake", cn2: "Will Crane", cn3: "Sam Pike", cn4: "Jack Reed", cn5: "Ben Marsh", cn6: "Kit Fallow", cn7: "Hal Rook",
  cn8: "Abel Shaw", cn9: "Joss Wren", cn10: "Dan Locke", cn11: "Moss Carter", cn12: "Mary Quill", cn13: "Anne Holt", cn14: "Grace Penn", cn15: "Bess Hale",
  cn16: "Ruth Vane", cn17: "Nell Ashby", cn18: "Ezra Cole", cn19: "Silas Ford", cn20: "Owen Tarr", cn21: "Rafe Dunn", cn22: "Gil Morrow", cn23: "Luke Sable",
});
Object.assign(STR.zh, {
  crewTitle: "船員", crewHint: "跟著旗艦出航的人，依職務各有一點小加成。座位看船的大小：小船 2 位、中船 3 位、大船 4 位。同一職務只算船上最強的一位；船員加成會和同類裝備相加，但不會超過裝備本身的上限。船員不會離開：沉船時在船上的人會回港休養幾次出航，之後歸隊。",
  cr_gunner: "砲術長", cr_carpenter: "木匠", cr_surgeon: "船醫", cr_navigator: "航海士",
  cg_1: "熟手", cg_2: "老手",
  cfx_gunner: "裝填 +{a}%", cfx_carpenter: "海上修船 +{a}%", cfx_surgeon: "受傷船員少休 {a} 次出航 · 著火時間 -{b}%", cfx_navigator: "速度 +{a}% · 暴風偏航 -{b}%",
  crewJoin: "{name}，{boss}船上的老手{role}，加入了你的船！", crewJoinAshore: "{name}，{boss}船上的老手{role}，在港口等你。",
  cn0: "湯姆", cn1: "阿德", cn2: "威廉", cn3: "老山", cn4: "傑克", cn5: "阿班", cn6: "阿凱", cn7: "老哈",
  cn8: "艾伯", cn9: "喬斯", cn10: "阿丹", cn11: "老莫", cn12: "瑪莉", cn13: "安妮", cn14: "葛蕾絲", cn15: "貝絲",
  cn16: "露絲", cn17: "奈兒", cn18: "以斯拉", cn19: "賽勒斯", cn20: "歐文", cn21: "拉夫", cn22: "吉爾", cn23: "路克",
});

const CREW_ROLES = ["gunner", "carpenter", "surgeon", "navigator"];
// [able, veteran]. reload: shorter gun reload (with the gun's own reload affix, capped at CREW_RELOAD_CAP); repair: the at-sea mend rate (js/repair.js,
// gear key "repair"); spd / storm: top speed and less storm yaw (gear keys "spd" / "storm", js/ships.js and js/weather.js); rest: sorties cut from the hurt crew's rest;
// douse: each fire on the flagship burns that much shorter (BURN_T 4 s -> 3.2 / 2.6 s, js/arsenal.js addBurn; on top of fire-resistant gear, which cuts its dps).
const CREW_FX = { gunner: { reload: [0.08, 0.12] }, carpenter: { repair: [0.25, 0.4] }, surgeon: { rest: [1, 2], douse: [0.2, 0.35] }, navigator: { spd: [0.03, 0.05], storm: [0.15, 0.25] } };
const CREW_RELOAD_CAP = 0.25;   // gun reload affix + gunner: one gun's best roll (0.14 x item level 1.5 = 0.21) plus an able gunner already meets it
const CREW_MAX = 8;             // people on the roster (aboard or ashore): two of each role
const CREW_POOL = 3;            // candidates in port at once
const CREW_HIRE = 200, CREW_HIRE_STEP = 0.5;   // price = CREW_HIRE x (1 + step x crew already on the roster): 200, 300, 400 ... 900
const CREW_REST = 3;            // sorties a hurt crew member sits out (a surgeon aboard at the sinking cuts 1 or 2, never under 1)
const CREW_REST_SEA_S = 60;     // a sortie counts toward that rest only after this long at sea (owner's call, #161): out of port and straight back counts nothing
const CREW_BOSS_CHANCE = 0.4;   // a claimed bounty (the Admiral too): chance a veteran from the beaten crew joins you
const CREW_NAMES = 24;          // name keys cn0 .. cn23
const crewName = c => t("cn" + c.n);

// ---------- seats ----------
// Hull size by Letter of Marque tier: tiers 1-2 small (2 seats), 3 medium (3), 4-5 large (4).
const crewSize = ship => { const tier = Object.hasOwn(SHIPS, ship) ? SHIPS[ship].tier : 1; return tier <= 2 ? "small" : tier === 3 ? "medium" : "large"; };
const CREW_SEATS = { small: 2, medium: 3, large: 4 };
const crewSeats = ship => CREW_SEATS[crewSize(ship)];
const crewList = s => (s && s.crew && Array.isArray(s.crew.list) ? s.crew.list : []);
// Who sails: the fit ones marked aboard, in roster order, as many as the hull seats (fitCrew keeps the flags in step; this never trusts them).
const crewAboard = (s = save) => crewList(s).filter(c => c.on && !c.rest).slice(0, crewSeats(s.ship));
const crewFree = s => crewSeats(s.ship) - crewAboard(s).length;
// The member each role counts on: the first of the best grade of that role aboard; a second of the same role adds nothing. The ledger marks the
// rest "spare" from this too (js/crew-ui.js). Memoised on the crew and the hull (both replaced, never edited in place): crewReloadK asks once per gun.
let crewTopMemo = { crew: undefined, ship: undefined, top: null };
function crewTop(s = save) {
  if (crewTopMemo.crew === s.crew && crewTopMemo.ship === s.ship) return crewTopMemo.top;
  const top = {};
  for (const c of crewAboard(s)) if (!top[c.role] || c.gr > top[c.role].gr) top[c.role] = c;
  crewTopMemo = { crew: s.crew, ship: s.ship, top };
  return top;
}
// The bonus of each effect aboard, from the members who count.
function crewBest(s = save) {
  const out = {};
  for (const c of Object.values(crewTop(s))) for (const [k, v] of Object.entries(CREW_FX[c.role])) out[k] = Math.max(out[k] || 0, v[c.gr - 1]);
  return out;
}
// Gear totals (js/gear-core.js gearTotals) with the crew added: each effect the crew shares with gear is gear + crew, but never past GEAR_CAP and
// never below what the gear gives alone. Called by gxTotals (js/gear-fx.js), so gx("repair"), gx("spd") and gx("storm") include the crew.
function crewMix(tot, s = save) {
  const best = crewBest(s), out = { ...tot };
  // only the effects gear has too (repair, spd, storm); reload is per gun (crewReloadK), the surgeon's rest and douse are the crew's own
  for (const k of Object.keys(best).filter(k => k in GEAR_CAP)) { const g = out[k] || 0; out[k] = Math.max(g, Math.min(GEAR_CAP[k], g + best[k])); }
  return out;
}
const crewPickRole = rnd => CREW_ROLES[Math.floor(rnd() * CREW_ROLES.length) % CREW_ROLES.length];
// A gun's reload share with the gunner: its own reload affix `gr` + the best gunner aboard, capped (never lower than the affix alone).
const crewReloadK = (gr, s = save) => { const c = crewBest(s).reload || 0; return c ? Math.max(gr, Math.min(CREW_RELOAD_CAP, gr + c)) : gr; };
// How long one fire burns on the flagship (js/arsenal.js addBurn): BURN_T less the surgeon's douse.
const crewBurnT = (s = save) => BURN_T * (1 - (crewBest(s).douse || 0));
// The rest the hurt crew get when the ship sinks with `aboard` on it: CREW_REST less the best surgeon among them (the surgeon is hurt too, but treats them on the way home).
const crewRestFor = aboard => Math.max(1, CREW_REST - aboard.reduce((m, c) => Math.max(m, c.role === "surgeon" ? CREW_FX.surgeon.rest[c.gr - 1] : 0), 0));

// ---------- save edits (pure: each returns a new save, or null when it cannot be done) ----------
const crewCost = s => Math.round(CREW_HIRE * (1 + CREW_HIRE_STEP * crewList(s).length));
const withCrew = (s, patch) => ({ ...s, crew: { ...s.crew, ...patch } });
// The flags match the hull: the hurt are ashore, and fit ones marked aboard past the seats go ashore (the last in roster order first). Idempotent.
function fitCrew(s) {
  let seats = crewSeats(s.ship);
  let changed = false;
  const list = crewList(s).map(c => { const on = c.on && !c.rest && seats > 0; if (on) seats--; if (on === c.on) return c; changed = true; return { ...c, on }; });
  return changed ? withCrew(s, { list }) : s;   // unchanged: the same save, so callers (js/crew-ui.js) and the gear memo can compare by identity
}
// Hire candidate i of the pool: costs crewCost, needs a free place on the roster; joins aboard when a seat is free, else ashore.
function crewHire(s, i) {
  const p = s.crew.pool[i];
  if (!p || crewList(s).length >= CREW_MAX || s.gold < crewCost(s)) return null;
  const m = { id: s.crew.seq, role: p.role, gr: p.gr, n: p.n, on: crewFree(s) > 0, rest: 0 };
  return withCrew({ ...s, gold: s.gold - crewCost(s) }, { list: [...s.crew.list, m], pool: s.crew.pool.filter((_, k) => k !== i), seq: s.crew.seq + 1 });
}
// Send member `id` aboard (on) or ashore. Aboard needs them fit and a free seat.
function crewSetOn(s, id, on) {
  const c = crewList(s).find(x => x.id === id);
  if (!c || !!c.on === !!on) return null;
  if (on && (c.rest > 0 || crewFree(s) <= 0)) return null;
  return withCrew(s, { list: s.crew.list.map(x => (x.id === id ? { ...x, on: !!on } : x)) });
}
// A name nobody on the roster or in the pool has (any, if all are taken).
function crewFreshName(s, rnd, taken = []) {
  const used = new Set([...crewList(s), ...(s.crew.pool || []), ...taken].map(c => c.n)), free = [...Array(CREW_NAMES).keys()].filter(n => !used.has(n));
  const from = free.length ? free : [...Array(CREW_NAMES).keys()];
  return from[Math.floor(rnd() * from.length) % from.length];
}
// A new pool after a sortie: CREW_POOL able hands of random roles, drawn once per value of stats.sorties (reloading the page draws nothing new).
function crewRefresh(s, rnd) {
  const at = (s.stats && s.stats.sorties) | 0;
  if (s.crew.poolAt === at) return s;
  const pool = [];
  for (let i = 0; i < CREW_POOL; i++) pool.push({ role: crewPickRole(rnd), gr: 1, n: crewFreshName({ ...s, crew: { ...s.crew, pool: [] } }, rnd, pool) });
  return withCrew(s, { pool, poolAt: at });
}
// Back in port after a sortie (not the welcome dock at load): the hurt sat this one out (rest - 1) when it `counts` (CREW_REST_SEA_S at sea); if the
// flagship sank, everyone aboard is hurt for crewRestFor sorties and goes ashore, however short the sortie. Those whose rest ran out are fit again and
// go back aboard when a seat is free. Returns { save, hurt: [ids], back: [ids] }.
function crewDock(s, sunk, counts = true) {
  const aboard = sunk ? crewAboard(s) : [], ids = new Set(aboard.map(c => c.id)), rest = crewRestFor(aboard), back = [];
  let list = crewList(s).map(c => {
    if (ids.has(c.id)) return { ...c, on: false, rest };
    if (c.rest > 0 && counts) { const r = c.rest - 1; if (!r) back.push(c.id); return { ...c, rest: r, on: false }; }
    return c;
  });
  let free = crewSeats(s.ship) - list.filter(c => c.on && !c.rest).length;
  list = list.map(c => (back.includes(c.id) && free > 0 ? (free--, { ...c, on: true }) : c));
  return { save: fitCrew(withCrew(s, { list })), hurt: [...ids], back };
}
// A claimed bounty: maybe a veteran joins (CREW_BOSS_CHANCE), aboard if a seat is free. Returns { save, m } or null (no roll, or a full roster).
function crewBossRoll(s, rnd) {
  if (crewList(s).length >= CREW_MAX || !(rnd() < CREW_BOSS_CHANCE)) return null;
  const m = { id: s.crew.seq, role: crewPickRole(rnd), gr: 2, n: crewFreshName(s, rnd), on: crewFree(s) > 0, rest: 0 };
  return { save: withCrew(s, { list: [...s.crew.list, m], seq: s.crew.seq + 1 }), m };
}

// ---------- the save ----------
const freshCrew = () => ({ list: [], pool: [], poolAt: -1, seq: 0 });
SAVE_DEFAULTS.push(() => ({ crew: freshCrew() }));
// Untrusted: unknown roles, bad numbers, duplicate ids, too many people, a hurt member marked aboard; an old save has no crew at all.
function sanitizeCrew(s) {
  const c = isObj(s.crew) ? s.crew : {}, list = [], ids = new Set();
  const name = v => toInt(v, 0, CREW_NAMES - 1, 0), role = v => (typeof v === "string" && CREW_ROLES.includes(v) ? v : null);
  for (const m of Array.isArray(c.list) ? c.list : []) {
    if (!isObj(m) || !role(m.role) || list.length >= CREW_MAX) continue;
    const id = Number.isInteger(m.id) && m.id >= 0 && m.id <= 1e6 ? m.id : -1;   // out of range is not clamped onto another id: it gets a new one below
    list.push({ id: id >= 0 && !ids.has(id) ? id : -1, role: m.role, gr: toInt(m.gr, 1, 2, 1), n: name(m.n), on: m.on === true, rest: toInt(m.rest, 0, CREW_REST, 0) });
    if (id >= 0) ids.add(id);
  }
  let seq = Math.max(toInt(c.seq, 0, 1e6, 0), ...list.map(m => m.id + 1));
  for (const m of list) if (m.id < 0) m.id = seq++;   // a missing or repeated id gets a new one
  const pool = (Array.isArray(c.pool) ? c.pool : []).filter(p => isObj(p) && role(p.role)).slice(0, CREW_POOL).map(p => ({ role: p.role, gr: 1, n: name(p.n) }));
  return fitCrew({ ...s, crew: { list, pool, poolAt: toInt(c.poolAt, -1, Number.MAX_SAFE_INTEGER, -1), seq } });
}
SAVE_SANITIZERS.push(sanitizeCrew);

// ---------- at sea and in port ----------
let crewNews = null;   // what the last dock did to the crew, for the ledger's crew page: { hurt: [ids], back: [ids] } or null
// gameClock (js/hall.js) when this sortie set sail: its unpaused time at sea. Not js/logbook.js's sortie.t, which a sinking drops before the dock.
let crewSailAt = 0;
function crewRoll() { return Math.random(); }   // a function so the browser test can fix the rolls
onHook("dock", kind => {
  if (kind === "welcome" || !save.crew) return;
  const r = crewDock(save, kind === "sunk", gameClock - crewSailAt >= CREW_REST_SEA_S);
  save = crewRefresh(r.save, crewRoll);
  crewNews = r.hurt.length || r.back.length ? { hurt: r.hurt, back: r.back } : null;
});
onHook("sail", () => { crewNews = null; crewSailAt = gameClock; });
// A bounty claimed (js/campaign.js claimBounty; the Admiral is the last one): maybe a veteran from that crew joins.
onHook("bounty", (n, b) => {
  if (!save.crew || (typeof runActive === "function" && runActive())) return;
  const r = crewBossRoll(save, crewRoll);
  if (!r) return;
  save = r.save; persist();
  const vars = { name: crewName(r.m), role: t("cr_" + r.m.role), boss: typeof bossName === "function" ? bossName(b) : "" };
  toast(t(r.m.on ? "crewJoin" : "crewJoinAshore", vars), false, 6000, 1);
  sfx("bell", { pitch: 0.9, delay: 1.6 });
  if (typeof applyPlayerStats === "function" && typeof player !== "undefined" && player) { const hp = player.hp; applyPlayerStats(false); player.hp = Math.min(hp, player.maxHp); }
});
