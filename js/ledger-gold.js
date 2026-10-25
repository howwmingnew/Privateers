"use strict";
// ---------- Harbor ledger: the purse stays in view while the sheet scrolls, and ticks when gold moves (#73) ----------
// The header (title + gold, index.html #port) is sticky at the top of the sheet in css/ledger.css; the same header serves Safe Harbor,
// the Hulk Outpost and the supply stations / trade ports, so one rule covers every ledger. It keeps its height (no layout jump while
// scrolling) and stays a single slim row on a phone. A purchase rolls the number to its new value and the figure flashes: red when
// gold goes out, green when it comes in.
const GOLD_ROLL_MS = 380;   // how long the purse number counts to its new value
let shownGold = null, goldRaf = 0;
const goldEl = () => document.getElementById("pGold");

// Pure: the number to print `k` (0..1) of the way from `from` to `to`, easing out.
const goldRoll = (from, to, k) => Math.round(from + (to - from) * (1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)));

function rollGold(el, from, to) {
  cancelAnimationFrame(goldRaf);
  const dur = typeof reduceMotion === "function" && reduceMotion() ? 0 : GOLD_ROLL_MS, t0 = performance.now();
  el.classList.remove("spent", "gained"); void el.offsetWidth; el.classList.add(to < from ? "spent" : "gained");
  if (typeof punch === "function") punch(el);   // js/juice-ui.js
  const tick = () => {
    const k = dur ? (performance.now() - t0) / dur : 1;
    el.textContent = fmt(goldRoll(from, to, k));
    if (k < 1) goldRaf = requestAnimationFrame(tick); else setTimeout(() => el.classList.remove("spent", "gained"), 500);
  };
  tick();
}
// ---------- what a visit took out of the purse, itemised under the ledger's message ----------
// The sale line only says what came in. The escorts' repair bills (js/escort-ai.js, paid in the dock hook before the sale), a supply station's repair fee
// (js/ports.js) and the escorts' unpaid balance would otherwise just make the purse lower than the sale says (#107). The list belongs to the message it
// was made for: a later message (a purchase) drops it, so a stale bill never sits under a new line.
Object.assign(STR.en, { billsHead: "Paid out: ", billSep: "; ", billEnd: ".", billEsc: "escort repairs −{n} gold", billFee: "repair fee at the supply station −{n} gold", billOwed: "{n} gold of escort repairs still owed" });
Object.assign(STR.zh, { billsHead: "已扣款：", billSep: "；", billEnd: "。", billEsc: "隨從修理費 −{n} 金", billFee: "補給站修船費 −{n} 金", billOwed: "隨從修理費還欠 {n} 金" });
let visitBills = [], visitBillsFor = null, billSeen = null;
// Pure: the bill lines [{ key, n }] for the escort report (js/escort-ai.js escortReport: { paid }), a station fee and the escorts' unpaid total; empty ones left out.
const billLines = (report, fee, owed) => [["billEsc", report ? report.paid : 0], ["billFee", fee], ["billOwed", owed]].filter(([, n]) => n > 0).map(([key, n]) => ({ key, n: Math.round(n) }));
function setVisitBills(kind, msg) {
  const report = typeof escortReport !== "undefined" && escortReport !== billSeen ? escortReport : null;   // only a report made by this dock's own hook
  if (typeof escortReport !== "undefined") billSeen = escortReport;
  const fee = kind === "supply" && typeof visitFee !== "undefined" ? visitFee : 0, owed = (save.escorts || []).reduce((n, e) => n + (e.owed || 0), 0);
  visitBills = billLines(report, fee, report || fee ? owed : 0); visitBillsFor = msg;
}
const visitBillsHtml = () => (visitBills.length && visitBillsFor === portMsg ? ` <span class="bills">${t("billsHead")}${visitBills.map(b => t(b.key, { n: fmt(b.n) })).join(t("billSep"))}${t("billEnd")}</span>` : "");
onHook("dock", () => { shownGold = null; });   // a fresh visit starts from the real figure, not from last visit's
onHook("renderPort", () => {
  const el = goldEl(); if (!el) return;
  const to = save.gold;
  if (shownGold !== null && shownGold !== to) rollGold(el, shownGold, to);
  shownGold = to;
});
