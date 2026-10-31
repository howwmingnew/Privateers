"use strict";
// ---------- The ledger's Crew page: who is aboard, who is ashore or resting, and today's recruits ----------
// Rendered into #crew by the renderPort hook. Its buttons carry data-act "crew*" (CREW_ACTS), handled by harbor.js's click handler through crewAct(),
// which edits `save` (the pure edits are js/crew.js) and returns the sound to play, or null. A move says what happened in a note at the top of the
// page (not the ledger's message box up top, which would scroll the page away from the button).
Object.assign(STR.en, {
  crewSeats: "Aboard {n} / {max} · {size} ({ship})", csz_small: "small hull", csz_medium: "medium hull", csz_large: "large hull",
  crewNow: "Aboard now: {list}", crewNowOne: "{role} ({fx})", crewNoneOn: "No one aboard: no crew bonus at sea.",
  crewOn: "Aboard", crewAshore: "Ashore", crewHurt: "Hurt · back after {n} more sortie(s)", crewSpare: "spare: only the best {role} aboard counts",
  crewToShore: "Send ashore", crewToShip: "Take aboard", crewFull: "Ship full", crewResting: "Resting",
  crewRoster: "Your crew {n} / {max}", crewEmpty: "No crew yet. Hire someone below.",
  crewRecruits: "Looking for a berth", crewRecruitsHint: "New faces after every sortie.", crewNoPool: "No one else today. New faces after your next sortie.",
  crewHire: "Hire · {n}", crewHireShort: "Hire · {n} ({d} more)", crewRosterFull: "Your roster is full ({n}). Crew are never dismissed.",
  crewHired: "{name} the {role} signed on.", crewHiredAshore: "{name} the {role} signed on and waits ashore: the ship is full.",
  crewMovedOn: "{name} is aboard.", crewMovedOff: "{name} went ashore.",
  crewNewsHurt: "Hurt when the ship went down: {names}. They rest in port, then come back.", crewNewsBack: "Back on duty: {names}.",
});
Object.assign(STR.zh, {
  crewSeats: "船上 {n} / {max} · {size}（{ship}）", csz_small: "小船", csz_medium: "中船", csz_large: "大船",
  crewNow: "目前在船上：{list}", crewNowOne: "{role}（{fx}）", crewNoneOn: "船上沒有船員：出海沒有船員加成。",
  crewOn: "在船上", crewAshore: "在岸上", crewHurt: "受傷 · 再 {n} 次出航後歸隊", crewSpare: "備用：同職務只算船上最強的{role}",
  crewToShore: "送上岸", crewToShip: "帶上船", crewFull: "船已滿", crewResting: "休養中",
  crewRoster: "你的船員 {n} / {max}", crewEmpty: "還沒有船員。從下面招募。",
  crewRecruits: "港口裡找差事的人", crewRecruitsHint: "每次出航回來會有新面孔。", crewNoPool: "今天沒有別人了。下次出航回來會有新面孔。",
  crewHire: "招募 · {n}", crewHireShort: "招募 · {n}（還差 {d}）", crewRosterFull: "船員名冊已滿（{n} 位）。船員不會被解雇。",
  crewHired: "{role}{name}加入了。", crewHiredAshore: "{role}{name}加入了，船已滿，先在岸上等。",
  crewMovedOn: "{name}上船了。", crewMovedOff: "{name}上岸了。",
  crewNewsHurt: "沉船時受傷：{names}。在港口休養後就會歸隊。", crewNewsBack: "歸隊：{names}。",
});
const CREW_ACTS = ["crewHire", "crewOn"];
let crewNote = null;   // the latest move [key, vars], shown until the next sortie
onHook("sail", () => { crewNote = null; });

// One member's own effect at their grade, as the page words it.
function crewFxText(c) {
  const fx = CREW_FX[c.role], pct = v => Math.round(v * 100), [k1, k2] = Object.keys(fx), v1 = fx[k1][c.gr - 1], v2 = k2 ? fx[k2][c.gr - 1] : 0;
  return t("cfx_" + c.role, { a: c.role === "surgeon" ? v1 : pct(v1), b: pct(v2) });
}
const crewWho = c => `${crewName(c)}<small>${t("cr_" + c.role)} · ${t("cg_" + c.gr)}</small>`;
// The members whose bonus counts (js/crew.js crewTop: the same pick the bonuses use).
const crewCounted = s => new Set(Object.values(crewTop(s)).map(c => c.id));
function crewMemberHtml(c, s, counted, free) {
  const aboard = crewAboard(s).some(x => x.id === c.id);
  const status = c.rest > 0 ? `<span class="lock">${t("crewHurt", { n: c.rest })}</span>` : aboard ? `<b>${t("crewOn")}</b>` : t("crewAshore");
  const spare = aboard && !counted.has(c.id) ? ` · <i>${t("crewSpare", { role: t("cr_" + c.role) })}</i>` : "";
  const lbl = c.rest > 0 ? "crewResting" : aboard ? "crewToShore" : free > 0 ? "crewToShip" : "crewFull";
  const off = c.rest > 0 || (!aboard && free <= 0);
  return `<div class="item crew-m${c.gr > 1 ? " vet" : ""}${aboard ? " on" : ""}" data-crew="${c.id}"><div class="nm">${crewWho(c)}</div>` +
    `<div class="ds">${crewFxText(c)} · ${status}${spare}</div>` +
    `<button class="btn${aboard ? " ghost" : ""}" type="button" data-act="crewOn" data-id="${c.id}" data-v="${aboard ? 0 : 1}" aria-pressed="${aboard}" ${off ? "disabled" : ""}>${t(lbl)}</button></div>`;
}
function crewPoolHtml(s) {
  const list = crewList(s), cost = crewCost(s), full = list.length >= CREW_MAX;
  if (full) return `<p class="hint-s">${t("crewRosterFull", { n: CREW_MAX })}</p>`;
  if (!s.crew.pool.length) return `<p class="hint-s">${t("crewNoPool")}</p>`;
  return `<div class="list crew-pool">` + s.crew.pool.map((p, i) => {
    const short = s.gold < cost;
    return `<div class="item crew-p"><div class="nm">${crewWho(p)}</div><div class="ds">${crewFxText(p)}</div>` +
      `<button class="btn" type="button" data-act="crewHire" data-i="${i}" ${short ? "disabled" : ""}>${t(short ? "crewHireShort" : "crewHire", { n: fmt(cost), d: fmt(cost - s.gold) })}</button></div>`;
  }).join("") + `</div>`;
}
function crewNewsHtml() {
  const names = ids => ids.map(id => crewList(save).find(c => c.id === id)).filter(Boolean).map(crewName).join(", ");
  const out = [];
  if (crewNews && crewNews.hurt.length) out.push(t("crewNewsHurt", { names: names(crewNews.hurt) }));
  if (crewNews && crewNews.back.length) out.push(t("crewNewsBack", { names: names(crewNews.back) }));
  if (crewNote) out.push(t(...crewNote));
  return out.map(x => `<p class="gnote tip crew-note" role="status">${x}</p>`).join("");
}
function renderCrew() {
  const box = document.getElementById("crew");
  if (!box || !save.crew) return;
  const fit = fitCrew(crewRefresh(save, crewRoll));   // the hull may have changed since (a switch), and the very first visit draws the first pool
  if (fit !== save) { save = fit; persist(); applyPlayerStats(false); }   // fitCrew / crewRefresh return the same save when nothing changed
  const s = save, aboard = crewAboard(s), seats = crewSeats(s.ship), free = seats - aboard.length, counted = crewCounted(s), list = crewList(s);
  const now = aboard.filter(c => counted.has(c.id)).map(c => t("crewNowOne", { role: t("cr_" + c.role), fx: crewFxText(c) })).join(" · ");
  box.innerHTML = `<p class="ds crew-seats">${t("crewSeats", { n: aboard.length, max: seats, size: t("csz_" + crewSize(s.ship)), ship: t("s_" + s.ship) })}</p>` +
    `<p class="ds crew-now">${now ? t("crewNow", { list: now }) : t("crewNoneOn")}</p>` + crewNewsHtml() +
    `<div class="lbl">${t("crewRoster", { n: list.length, max: CREW_MAX })}</div>` +
    (list.length ? `<div class="list crew-list">${list.map(c => crewMemberHtml(c, s, counted, free)).join("")}</div>` : `<p class="hint-s">${t("crewEmpty")}</p>`) +
    `<div class="lbl">${t("crewRecruits")}</div><p class="hint-s">${t("crewRecruitsHint")}</p>` + crewPoolHtml(s);
}
onHook("renderPort", renderCrew);

function crewAct(act, d) {
  if (act === "crewHire") {
    const p = save.crew.pool[+d.i], next = p ? crewHire(save, +d.i) : null;
    if (!next) return null;
    const m = next.crew.list[next.crew.list.length - 1];
    save = next; crewNote = [m.on ? "crewHired" : "crewHiredAshore", { name: crewName(m), role: t("cr_" + m.role) }];
    ledgerFocus = `#crew [data-crew="${m.id}"] [data-act="crewOn"]`;   // the hired one's row: the pool button it was pressed on is gone
    return "buy";
  }
  if (act === "crewOn") {
    const id = +d.id, next = crewSetOn(save, id, d.v === "1");
    if (!next) return null;
    const c = next.crew.list.find(x => x.id === id);
    save = next; crewNote = [c.on ? "crewMovedOn" : "crewMovedOff", { name: crewName(c) }];
    ledgerFocus = `#crew [data-crew="${id}"] [data-act="crewOn"]`;
    return "uiClick";
  }
  return null;
}
