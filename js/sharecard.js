"use strict";
// ---------- Share cards: a few results on a card, as a picture plus a line of text ----------
// shareSpec(kind, data) makes the words (pure); shareCardBlob draws the card; shareButton / shareOffer put it in the
// player's hand through the postcard pipeline (deliverImage, js/postcard.js): the share sheet on a phone, otherwise a
// download plus the text on the clipboard. Kinds: sortie (a paid sortie), boss (a bounty claimed), victory, log (the hall
// of fame) and daily (js/run.js). The link carries #daily or #seed= when the sea can be played again by a friend.
Object.assign(STR.en, {
  sc_share: "Share", sc_shared: "Shared!", sc_copied: "Saved · text copied", sc_saved: "Saved!", sc_fail: "Could not make the card.",
  sc_t_sortie: "Sortie report", sc_t_boss: "Bounty claimed", sc_t_victory: "The Free Port Stands", sc_t_log: "Hall of fame", sc_t_daily: "Daily sea #{n}",
  sc_sunk: "Sunk", sc_gold: "Gold", sc_time: "At sea", sc_chain: "Kill chain", sc_best: "Best sortie", sc_fastest: "Fastest", sc_total: "All time",
  sc_hull: "Hull", sc_captain: "Captain", sc_fast: "Time", sc_away: "Got away", sc_streak: "Streak",
  sc_x_sortie: "⚓ Privateers: {n} sunk · {g} gold · {d} at sea",
  sc_x_boss: "⚓ Privateers: {n} sunk · {boss} taken in {d}",
  sc_x_victory: "⚓ Privateers: Admiral Thorne sunk in {d} · {n} ships · {g} gold",
  sc_x_victory0: "⚓ Privateers: Admiral Thorne sunk · {n} ships · {g} gold",
  sc_x_log: "⚓ Privateers hall of fame: {a} sunk in one sortie · a {b}-kill chain",
  sc_x_dwin: "Privateers Daily #{n} · {boss} sunk in {d} · hull {h}%",
  sc_x_dlose: "Privateers Daily #{n} · {boss} got away · {s} sunk · hull {h}%",
});
Object.assign(STR.zh, {
  sc_share: "分享戰績", sc_shared: "已分享！", sc_copied: "已儲存圖片並複製文字", sc_saved: "已儲存！", sc_fail: "無法製作戰績卡。",
  sc_t_sortie: "出航戰報", sc_t_boss: "懸賞達成", sc_t_victory: "自由港屹立不搖", sc_t_log: "名人堂", sc_t_daily: "每日海域 #{n}",
  sc_sunk: "擊沉", sc_gold: "金幣", sc_time: "出航", sc_chain: "最高連勝", sc_best: "單趟最多", sc_fastest: "最快通關", sc_total: "累計",
  sc_hull: "船體", sc_captain: "船長", sc_fast: "用時", sc_away: "逃脫", sc_streak: "連續",
  sc_x_sortie: "⚓ Privateers：擊沉 {n} 艘 · {g} 金 · 出航 {d}",
  sc_x_boss: "⚓ Privateers：擊沉 {n} 艘 · {d}拿下{boss}",
  sc_x_victory: "⚓ Privateers：{d}擊沉索恩上將 · 共 {n} 艘 · {g} 金",
  sc_x_victory0: "⚓ Privateers：擊沉索恩上將 · 共 {n} 艘 · {g} 金",
  sc_x_log: "⚓ Privateers 名人堂：單趟擊沉 {a} 艘 · {b} 連勝",
  sc_x_dwin: "Privateers 每日 #{n} · {boss} {d} 擊沉 · 船體 {h}%",
  sc_x_dlose: "Privateers 每日 #{n} · {boss} 逃脫 · 擊沉 {s} 艘 · 船體 {h}%",
});

const stamp = d => `privateers-${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
// ---------- the words ----------
// { kind, title, sub, stats: [[label, value]], text, url, name, ship }. url: the game's address, plus #daily / #seed= when
// a friend can open the same sea. `d` is plain data so the card can be made from any screen.
function shareSpec(kind, d = {}) {
  const link = d.link ?? (typeof runLink === "function" ? runLink() : ""), url = SHARE_URL + link, ship = d.ship || (typeof save !== "undefined" ? save.ship : "sloop");
  const base = { kind, url, ship, flag: typeof flagOf === "function" ? flagOf() : null, shipName: typeof shipDisplayName === "function" ? shipDisplayName() : "", name: `${stamp(new Date())}-${kind}.png` };
  switch (kind) {
    case "sortie": return { ...base, title: t("sc_t_sortie"), sub: "",
      stats: [[t("sc_sunk"), fmt(d.sunk)], [t("sc_gold"), fmt(d.gold)], [t("sc_time"), fmtDur(d.secs)]],
      text: t("sc_x_sortie", { n: fmt(d.sunk), g: fmt(d.gold), d: fmtDur(d.secs) }) };
    case "boss": return { ...base, title: t("sc_t_boss"), sub: d.bossName,
      stats: [[t("sc_captain"), d.bossName], [t("sc_sunk"), fmt(d.sunk)], [t("sc_time"), fmtDur(d.secs)]],
      text: t("sc_x_boss", { n: fmt(d.sunk), boss: d.bossName, d: fmtDur(d.secs) }) };
    case "victory": return { ...base, title: t("sc_t_victory"), sub: "",
      stats: [...(d.winTime > 0 ? [[t("sc_fast"), fmtDur(d.winTime)]] : []), [t("sc_sunk"), fmt(d.sunk)], [t("sc_gold"), fmt(d.gold)]],
      text: t(d.winTime > 0 ? "sc_x_victory" : "sc_x_victory0", { n: fmt(d.sunk), g: fmt(d.gold), d: fmtDur(d.winTime) }) };
    case "log": { const h = d.hall || { sunk: 0, chain: 0, win: 0 };
      return { ...base, title: t("sc_t_log"), sub: "",
        stats: [[t("sc_best"), fmt(h.sunk)], [t("sc_chain"), fmt(h.chain)], ...(h.win > 0 ? [[t("sc_fastest"), fmtDur(h.win)]] : [[t("sc_total"), fmt(d.total || 0)]])],
        text: t("sc_x_log", { a: fmt(h.sunk), b: fmt(h.chain) }) }; }
    case "daily": return { ...base, url: SHARE_URL + dailyLink(d.n, d), title: t("sc_t_daily", { n: d.n }), sub: d.tier ? `${d.bossName} · ${dailyTierLabel(d.n)}` : d.bossName,
      stats: [[t("sc_captain"), d.won ? fmtClock(d.bossT) : t("sc_away")], [t("sc_sunk"), fmt(d.sunk)], [t("sc_hull"), d.hull + "%"],
        ...(d.streak > 1 ? [[t("sc_streak"), String(d.streak)]] : [])],
      text: dailyShareText(d) };
    default: throw new Error("unknown share kind: " + kind);
  }
}
// "Privateers Daily #57 · Black Jerry sunk in 1:42 · hull 64%" (daily: d = { n, bossName, won, bossT, sunk, hull })
const dailyShareText = d => t(d.won ? "sc_x_dwin" : "sc_x_dlose", { n: d.n, boss: d.bossName, d: fmtClock(d.bossT), s: fmt(d.sunk), h: d.hull });
// The text as pasted: the line, a space and the link.
const shareFull = spec => `${spec.text} ${spec.url}`;

// ---------- the card ----------
const CARD_W = 1200, CARD_H = 630;
const CARD_FONT = { disp: `"IM Fell English SC", "Noto Serif TC", serif`, ui: `"Barlow Semi Condensed", "Noto Sans TC", system-ui, sans-serif` };
const SHIP_SAILS = { sloop: 1, schooner: 2, gunboat: 2, brigantine: 2, brig: 2, cruiser: 3, frigate: 3, corsair: 3, line: 3 };
// A ship in profile, in ink: hull, masts, square sails; its size is the sail count. (x, y) is the waterline's centre.
function drawShipMark(c, x, y, ship, k = 1) {
  const sails = SHIP_SAILS[ship] || 2, len = (150 + sails * 30) * k;
  c.save(); c.translate(x, y); c.fillStyle = "#2a1d10"; c.strokeStyle = "#2a1d10"; c.lineWidth = 3 * k; c.lineJoin = "round";
  c.beginPath(); c.moveTo(-len / 2, -22 * k); c.lineTo(len / 2, -30 * k); c.lineTo(len / 2 - 26 * k, 6 * k); c.lineTo(-len / 2 + 22 * k, 6 * k); c.closePath(); c.fill();
  for (let i = 0; i < sails; i++) {
    const mx = (-len / 2 + len * (i + 1) / (sails + 1)) , h = (86 + (i === 1 ? 14 : 0)) * k;
    c.beginPath(); c.moveTo(mx, -24 * k); c.lineTo(mx, -24 * k - h - 10 * k); c.stroke();
    c.fillStyle = "#f6f1e3"; c.beginPath(); c.moveTo(mx - 34 * k, -34 * k); c.quadraticCurveTo(mx, -34 * k - 12 * k, mx + 34 * k, -34 * k);
    c.lineTo(mx + 30 * k, -24 * k - h); c.quadraticCurveTo(mx, -24 * k - h - 10 * k, mx - 30 * k, -24 * k - h); c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
}
// A rounded rectangle as the current path (roundRect is missing from older Safari).
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function drawCard(c, spec) {
  const sea = c.createLinearGradient(0, 0, 0, CARD_H);
  sea.addColorStop(0, "#2b8798"); sea.addColorStop(1, "#0f3f52"); c.fillStyle = sea; c.fillRect(0, 0, CARD_W, CARD_H);
  c.strokeStyle = "rgba(246,241,227,.07)"; c.lineWidth = 2;
  for (let y = 40; y < CARD_H; y += 46) { c.beginPath(); for (let x = 0; x <= CARD_W; x += 20) c.lineTo(x, y + Math.sin(x / 50 + y) * 5); c.stroke(); }
  const px = 48, py = 40, pw = CARD_W - 96, ph = CARD_H - 80;   // the parchment
  c.save(); c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = "#f1e6c8"; rr(c, px, py, pw, ph, 14); c.fill(); c.restore();
  c.strokeStyle = "#c08f2e"; c.lineWidth = 3; rr(c, px + 10, py + 10, pw - 20, ph - 20, 8); c.stroke();
  const rose = document.createElement("canvas"); rose.width = rose.height = 240; drawRose(rose);   // js/victory.js
  c.globalAlpha = 0.95; c.drawImage(rose, px + 36, py + 34, 150, 150); c.globalAlpha = 1;
  c.fillStyle = "#2a1d10"; c.textBaseline = "alphabetic"; c.textAlign = "left";
  c.font = `400 78px ${CARD_FONT.disp}`; c.fillText("PRIVATEERS", px + 214, py + 112);
  c.fillStyle = "#b4412c"; c.font = `400 40px ${CARD_FONT.disp}`; c.fillText(spec.title, px + 216, py + 164);
  if (spec.sub) { c.fillStyle = "#6b5a3e"; c.font = `600 28px ${CARD_FONT.ui}`; c.fillText(spec.sub, px + 216, py + 202); }
  drawShipMark(c, px + pw - 160, py + 150, spec.ship);
  if (spec.flag) {   // the captain's flag on the stern staff, streaming aft, and the ship's name beneath her (js/flags.js)
    const k = 1, len = (150 + (SHIP_SAILS[spec.ship] || 2) * 30) * k, sx = px + pw - 160 - len / 2 + 8;
    c.save(); c.translate(sx, py + 150 - 86); c.scale(-1, 1); drawBanner(c, 0, 0, 74, 50, spec.flag, 66); c.restore();
    c.fillStyle = "#2a1d10"; c.textAlign = "center";
    let size = 30; c.font = `400 ${size}px ${CARD_FONT.disp}`;
    while (c.measureText(spec.shipName).width > 300 && size > 16) { size -= 2; c.font = `400 ${size}px ${CARD_FONT.disp}`; }
    c.fillText(spec.shipName, px + pw - 160, py + 208); c.textAlign = "left";
  }
  // stats: up to four tiles side by side
  const n = spec.stats.length, gap = 20, tw = (pw - 72 - gap * (n - 1)) / n, ty = py + 232;
  spec.stats.forEach(([label, value], i) => {
    const x = px + 36 + i * (tw + gap);
    c.fillStyle = "rgba(42,29,16,.08)"; rr(c, x, ty, tw, 170, 10); c.fill();
    c.fillStyle = "#6b5a3e"; c.font = `700 22px ${CARD_FONT.ui}`; c.fillText(String(label).toUpperCase(), x + 20, ty + 44);
    let size = 66; c.font = `400 ${size}px ${CARD_FONT.disp}`;
    while (c.measureText(value).width > tw - 40 && size > 24) { size -= 4; c.font = `400 ${size}px ${CARD_FONT.disp}`; }
    c.fillStyle = "#2a1d10"; c.fillText(String(value), x + 20, ty + 120);
  });
  c.fillStyle = "#6b5a3e"; c.textAlign = "right"; c.font = `700 22px ${CARD_FONT.ui}`;
  c.fillText(POSTCARD_MARK, px + pw - 36, py + ph - 30);
}
// The card as a PNG Blob (resolves null-safe: rejects when the browser cannot make one).
function shareCardBlob(spec) {
  return new Promise((resolve, reject) => {
    const cv = document.createElement("canvas"); cv.width = CARD_W; cv.height = CARD_H;
    try { drawCard(cv.getContext("2d"), spec); } catch (e) { reject(e); return; }
    cv.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) { return false; }
}
// Resolves "shared" | "copied" (downloaded, text on the clipboard) | "saved" (downloaded only) | "cancelled".
async function shareDeliver(spec) {
  const r = await deliverImage(await shareCardBlob(spec), spec.name, { text: spec.text, url: spec.url });
  if (r !== "saved") return r;
  return (await copyText(shareFull(spec))) ? "copied" : "saved";
}
// A button that makes and delivers the card; getSpec() runs at the click, so it reads the numbers of that moment.
function shareButton(getSpec, cls) {
  const b = document.createElement("button");
  b.type = "button"; b.className = cls; b.textContent = t("sc_share"); b.dataset.share = "1";
  let timer = 0;
  const say = key => { b.textContent = t(key); clearTimeout(timer); timer = setTimeout(() => { b.textContent = t("sc_share"); b.disabled = false; }, 1800); };
  b.addEventListener("click", () => {
    if (b.disabled) return;
    b.disabled = true;
    shareDeliver(getSpec()).then(r => say(r === "cancelled" ? "sc_share" : r === "shared" ? "sc_shared" : r === "copied" ? "sc_copied" : "sc_saved"),
      e => { console.error("Share card failed:", e); say("sc_fail"); });
  });
  document.addEventListener("langchange", () => { if (!b.disabled) b.textContent = t("sc_share"); });
  return b;
}

// ---------- where the button shows up ----------
// A chip above the postcard chip after a boss or a paid sortie; the ledger's message line after a sortie that docked.
let shareChip = null, shareChipTimer = 0, shareChipSpec = null, lastTally = null;
function shareOffer(getSpec, ms = POSTCARD_OFFER_MS) {
  shareChipSpec = getSpec;
  if (!shareChip) { shareChip = shareButton(() => shareChipSpec(), "pcchip sharechip"); shareChip.id = "shareChip"; shareChip.hidden = true; document.body.appendChild(shareChip); }
  shareChip.hidden = false;
  clearTimeout(shareChipTimer); shareChipTimer = setTimeout(() => { shareChip.hidden = true; }, ms);
}
onHook("frame", () => { if (shareChip && !shareChip.hidden && (docked || paused || titleOpen)) shareChip.hidden = true; });
const portShareEl = () => document.getElementById("pShare");
function mountPortShare() {
  let p = portShareEl();
  if (!p) { p = document.createElement("p"); p.id = "pShare"; p.className = "msg"; document.getElementById("pMsg").after(p); }
  p.replaceChildren(shareButton(() => shareSpec("sortie", lastTally), "btn"));
}
onHook("tally", d => {
  if (!(d.gold > 0)) return;
  lastTally = { sunk: d.sunk, gold: d.gold, secs: sortieSecs() };   // js/hall.js
  if (docked) mountPortShare();
  else if (d.sunk > 0 && !(runActive() && runKind() === "daily")) { const snap = lastTally; shareOffer(() => shareSpec("sortie", snap)); }
});
onHook("sail", () => { lastTally = null; portShareEl()?.remove(); });
onHook("sunk", (s, killer) => {
  if (!s.boss || killer !== player || (runActive() && runKind() === "daily")) return;   // a daily run ends on its own result screen
  const snap = { bossName: bossName(findBounty(s.boss)), secs: sortieSecs(), sunk: streak };
  setTimeout(() => { if (!docked) shareOffer(() => shareSpec("boss", snap)); }, 1800);
});
