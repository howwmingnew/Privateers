"use strict";
// ---------- Ship name and flag: the captain's colours ----------
// save.flag = { main, alt, emblem }: ids from FLAG_COLORS / FLAG_EMBLEMS (js/config.js), one flag for the whole captain.
// save.shipName: the ship's own name, "" = the default name. Both are checked by the sanitizers below, so a hand-edited or
// older save always loads with the classic blue-and-cream ensign and the default name.
// The flag reaches the sea through a livery (flagLivery, js/art.js liveryFor), the ledger card, the chart mark and the share card.
Object.assign(STR.en, {
  flTitle: "Colours", flHint: "Name your ship and pick the flag she flies: it shows at sea, on the chart and on share cards.",
  flName: "Ship name", flNamePh: "Sea Wolf", flDefName: "Sea Wolf", flReset: "Default name", flRude: "That name is not allowed. Try another.",
  flMain: "Main colour", flAlt: "Second colour", flEmblem: "Emblem", flShip: "Ship",
  fc_red: "Red", fc_blue: "Blue", fc_green: "Green", fc_black: "Black", fc_gold: "Gold", fc_purple: "Purple", fc_teal: "Teal", fc_orange: "Orange", fc_white: "White", fc_grey: "Grey",
  fe_diag: "Sash", fe_skull: "Skull", fe_anchor: "Anchor", fe_swords: "Swords", fe_star: "Star", fe_cross: "Cross",
});
Object.assign(STR.zh, {
  flTitle: "船旗", flHint: "替你的船取名，並選擇她升起的旗幟：海上、海圖與分享卡上都看得到。",
  flName: "船名", flNamePh: "海狼號", flDefName: "海狼號", flReset: "恢復預設船名", flRude: "這個名字不能用，請換一個。",
  flMain: "主色", flAlt: "副色", flEmblem: "圖案", flShip: "船",
  fc_red: "紅", fc_blue: "藍", fc_green: "綠", fc_black: "黑", fc_gold: "金", fc_purple: "紫", fc_teal: "青", fc_orange: "橙", fc_white: "白", fc_grey: "灰",
  fe_diag: "斜帶", fe_skull: "骷髏", fe_anchor: "船錨", fe_swords: "雙劍", fe_star: "星星", fe_cross: "十字",
});

// ---------- the data (pure) ----------
const cleanFlag = raw => {
  const f = isObj(raw) ? raw : {}, pick = (v, list, def) => (typeof v === "string" && list.includes(v) ? v : def);
  return { main: pick(f.main, FLAG_COLORS, DEFAULT_FLAG.main), alt: pick(f.alt, FLAG_COLORS, DEFAULT_FLAG.alt), emblem: pick(f.emblem, FLAG_EMBLEMS, DEFAULT_FLAG.emblem) };
};
// Width of a name: CJK, kana, hangul and full-width characters count 2.
const nameUnits = s => [...s].reduce((n, ch) => n + (/[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/.test(ch) ? 2 : 1), 0);
// A name from untrusted text: control, format and bidi characters and anything HTML-ish go, spaces collapse, and the rest is cut to
// FLAG_NAME_UNITS. Returns "" for nothing usable (the default name then shows).
function cleanShipName(v) {
  if (typeof v !== "string") return "";
  const s = v.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u206f\ufeff\ufff9-\ufffc]/g, " ")
    .replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim();
  let out = "", units = 0;
  for (const ch of s) { const w = nameUnits(ch); if (units + w > FLAG_NAME_UNITS) break; out += ch; units += w; }
  return out.trim();
}
// A short list: whole words in English (no Scunthorpe trouble), substrings in Chinese. A polite guard, not a moderator.
const RUDE_EN = ["fuck", "fucker", "fucking", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "whore", "slut", "dick", "cock", "pussy", "asshole", "retard", "rape", "nazi"];
const RUDE_ZH = ["幹你", "干你", "操你", "他媽的", "他妈的", "屌", "屄", "雞巴", "鸡巴", "傻逼", "婊子", "機掰", "雞掰", "肏", "強姦", "賤人", "去死", "智障"];
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", $: "s", "@": "a" };
function shipNameRude(s) {
  const low = String(s).toLowerCase().replace(/[01345$@]/g, c => LEET[c]);
  const words = low.split(/[^a-z]+/).filter(Boolean), glued = low.replace(/[^a-z]/g, "");
  return RUDE_EN.some(w => words.includes(w) || (/^(fuck|nigg|fagg)/.test(w) && glued.includes(w))) || RUDE_ZH.some(w => s.includes(w));
}
const goodShipName = v => { const n = cleanShipName(v); return n && !shipNameRude(n) ? n : ""; };
SAVE_DEFAULTS.push(() => ({ flag: { ...DEFAULT_FLAG }, shipName: "" }));
// Every ship keeps its own name (the active one in shipName, parked ones in their fleet entry, js/shipyard.js); the flag is the captain's.
SAVE_SANITIZERS.push(s => ({ ...s, flag: cleanFlag(s.flag), shipName: goodShipName(s.shipName),
  fleet: Array.isArray(s.fleet) ? s.fleet.map(e => { if (!isObj(e)) return e; const { name, ...rest } = e, n = goodShipName(name); return n ? { ...rest, name: n } : rest; }) : s.fleet }));

const flagOf = () => cleanFlag(typeof save !== "undefined" ? save.flag : null);
const shipDisplayName = () => (typeof save !== "undefined" && save.shipName) || t("flDefName");
const flagColor = id => FLAG_HEX[id] || FLAG_HEX.blue;

// ---------- drawing: one emblem painter for the sea, the ledger card, the chart and the share card ----------
function starPath(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.42 : r; c[i ? "lineTo" : "moveTo"](x + Math.cos(a) * k, y + Math.sin(a) * k); }
  c.closePath();
}
// An emblem of radius s centred on (x, y) in colour col; bg fills the cut-outs (a skull's eyes).
function drawFlagEmblem(c, id, x, y, s, col, bg) {
  c.save(); c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.26;
  if (id === "diag") { c.lineWidth = s * 0.55; c.beginPath(); c.moveTo(x - s * 1.5, y + s * 0.8); c.lineTo(x + s * 1.5, y - s * 0.8); c.stroke(); }
  else if (id === "skull") {
    c.lineWidth = s * 0.24; c.beginPath(); c.moveTo(x - s * 1.05, y - s * 0.55); c.lineTo(x + s * 1.05, y + s * 1.0); c.moveTo(x + s * 1.05, y - s * 0.55); c.lineTo(x - s * 1.05, y + s * 1.0); c.stroke();
    drawSkull(c, x, y - s * 0.05, s * 0.9, col, bg);   // js/campaign-ui.js
  } else if (id === "anchor") {
    c.lineWidth = s * 0.22;
    c.beginPath(); c.arc(x, y - s * 0.85, s * 0.26, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(x, y - s * 0.58); c.lineTo(x, y + s * 0.95); c.moveTo(x - s * 0.55, y - s * 0.3); c.lineTo(x + s * 0.55, y - s * 0.3); c.stroke();
    c.beginPath(); c.arc(x, y + s * 0.2, s * 0.8, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
  } else if (id === "swords") {
    c.lineWidth = s * 0.2;
    for (const k of [-1, 1]) {
      c.beginPath(); c.moveTo(x - k * s * 0.95, y - s * 0.95); c.lineTo(x + k * s * 0.8, y + s * 0.8); c.stroke();   // blade
      const gx = x + k * s * 0.3, gy = y + s * 0.3;   // crossguard near the hilt
      c.beginPath(); c.moveTo(gx - s * 0.38, gy - k * s * 0.38); c.lineTo(gx + s * 0.38, gy + k * s * 0.38); c.stroke();
    }
  } else if (id === "star") { starPath(c, x, y + s * 0.05, s * 1.15); c.fill(); c.stroke(); }
  else if (id === "cross") { c.lineWidth = s * 0.44; c.beginPath(); c.moveTo(x, y - s * 0.95); c.lineTo(x, y + s * 0.95); c.moveTo(x - s * 0.95, y); c.lineTo(x + s * 0.95, y); c.stroke(); }
  c.restore();
}
// The flag on a staff: staff at (x, y), cloth w × h streaming right with a gentle wave. flag = { main, alt, emblem }.
function drawBanner(c, x, y, w, h, flag, staff = h * 1.25) {
  const f = cleanFlag(flag), main = flagColor(f.main), alt = flagColor(f.alt), wave = u => Math.sin(u * 4.4) * h * 0.04;
  c.save();
  c.fillStyle = "#3b2414"; c.fillRect(x - w * 0.025, y - h * 0.08, Math.max(2, w * 0.04), staff);
  const path = () => {
    c.beginPath(); c.moveTo(x, y);
    for (let i = 1; i <= 10; i++) c.lineTo(x + w * i / 10, y + wave(i / 10));
    for (let i = 10; i >= 0; i--) c.lineTo(x + w * i / 10, y + h + wave(i / 10));
    c.closePath();
  };
  path(); c.fillStyle = main; c.fill(); c.save(); path(); c.clip();
  drawFlagEmblem(c, f.emblem, x + w / 2, y + h / 2, Math.min(w * 0.2, h * 0.3), alt, main);
  c.restore(); path(); c.lineWidth = Math.max(1, h * 0.03); c.strokeStyle = "rgba(42,29,16,.6)"; c.stroke();
  c.restore();
}
// Chart mark: the player's masthead pennant in the flag's colours, drawn inside miniPlayer's rotated frame (js/mini-marks.js).
function flagMiniMark(c) {
  const f = flagOf();
  c.beginPath(); c.moveTo(0.5, 0); c.lineTo(-5, -2.1); c.lineTo(-5, 2.1); c.closePath();
  c.fillStyle = flagColor(f.main); c.fill(); c.lineWidth = 0.9; c.strokeStyle = flagColor(f.alt); c.stroke();
}

// ---------- the sea: the flag becomes the player's livery (js/art.js liveryFor, js/ships.js applyPlayerStats) ----------
function flagLivery(flag = flagOf()) {
  const f = cleanFlag(flag), name = `pf-${f.main}-${f.alt}-${f.emblem}`;
  if (!LIVERY[name]) {
    const main = flagColor(f.main), alt = flagColor(f.alt);
    LIVERY[name] = { ...LIVERY.player, flag: main, flag2: alt, pennant: main, trim: f.main === "black" ? alt : main, emblem: f.emblem };
  }
  return name;
}
const playerLivery = () => flagLivery(flagOf());

// ---------- the name at sea ----------
let nameTag = null, nameTagLk = 0;
onHook("ready", () => {
  nameTag = S.add.text(0, 0, "", { fontFamily: UI_FONT, fontSize: "13px", fontStyle: "700", color: "#f6f1e3", stroke: "#0b2530", strokeThickness: 3 })
    .setOrigin(0.5, 0).setDepth(8).setAlpha(0.9).setVisible(false);
});
onHook("frame", () => {
  if (!nameTag || !player) return;
  const on = !!player.alive && !!player.spr && player.spr.visible && !docked && !titleOpen;
  if (nameTag.visible !== on) nameTag.setVisible(on);
  if (!on) return;
  const name = shipDisplayName(), lk = labelScale();
  if (nameTag.text !== name || nameTagLk !== lk) { nameTag.setText(name); labelText(nameTag); nameTagLk = lk; }
  nameTag.setPosition(player.x, 2 * player.y - shipTop(player) + 6 * lk);
});

// ---------- the ledger card ----------
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const flagEl = document.createElement("section");
flagEl.id = "flagbox";
document.querySelector("#port .lcol-l").appendChild(flagEl);
let flagMsg = "", flagOpen = false;   // "rude" after a refused name; the card starts folded: first screens belong to the gun deck
function swatches(k, list, cur, label) {
  return `<div class="fl-row" role="radiogroup" aria-label="${label}"><span class="fl-lab">${label}</span><span class="fl-opts">` + list.map(id => {
    const on = id === cur, nm = t((k === "emblem" ? "fe_" : "fc_") + id);
    const face = k === "emblem" ? `<canvas width="44" height="44" data-em="${id}" aria-hidden="true"></canvas>` : `<i style="background:${FLAG_HEX[id]}"></i>`;
    return `<button type="button" class="fl-sw${on ? " on" : ""}" data-flag="1" data-k="${k}" data-id="${id}" role="radio" aria-checked="${on}" aria-label="${nm}" title="${nm}">${face}</button>`;
  }).join("") + `</span></div>`;
}
function renderFlagCard() {
  const f = flagOf(), name = save.shipName;
  if (document.activeElement && document.activeElement.id === "shipNameIn") return;   // never rebuild a field somebody is typing in
  flagEl.classList.toggle("open", flagOpen);
  flagEl.innerHTML = `<h2><button type="button" class="fold-h" data-flag-fold="1" aria-expanded="${flagOpen}" aria-controls="flagBody">${t("flTitle")}</button></h2>
    <div id="flagBody"${flagOpen ? "" : " hidden"}><p class="hint-s">${t("flHint")}</p>
    <div class="fl-top"><canvas class="fl-prev" width="200" height="130" aria-hidden="true"></canvas>
    <div class="fl-name"><label for="shipNameIn">${t("flName")}</label>
      <input id="shipNameIn" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="${FLAG_NAME_UNITS}" value="${esc(name)}" placeholder="${esc(t("flNamePh"))}">
      <p class="fl-err" role="alert">${flagMsg === "rude" ? t("flRude") : ""}</p>
      <button type="button" class="textbtn" data-flag-reset="1" ${name ? "" : "disabled"}>${t("flReset")}</button></div></div>` +
    swatches("main", FLAG_COLORS, f.main, t("flMain")) + swatches("alt", FLAG_COLORS, f.alt, t("flAlt")) + swatches("emblem", FLAG_EMBLEMS, f.emblem, t("flEmblem")) + `</div>`;
  drawBanner(flagEl.querySelector(".fl-prev").getContext("2d"), 30, 14, 150, 100, f, 112);
  for (const cv of flagEl.querySelectorAll("canvas[data-em]")) {
    drawFlagEmblem(cv.getContext("2d"), cv.dataset.em, 22, 22, 11, flagColor(f.alt), flagColor(f.main));
    cv.parentElement.style.background = flagColor(f.main);
  }
  flagMsg = "";
}
function flagChanged() { persist(); applyPlayerStats(false); renderPort(); }   // renderPort rebuilds the card and the gun-deck ship (js/deck-art.js)
flagEl.addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.flagFold) { if (document.activeElement && document.activeElement.id === "shipNameIn") document.activeElement.blur();   // Safari leaves the field focused, and a focused field stops the redraw
    flagOpen = !flagOpen; Snd.play("uiClick"); renderFlagCard(); b.blur(); flagEl.querySelector(".fold-h")?.focus({ preventScroll: true }); return; }
  if (b.dataset.flagReset) { save = { ...save, shipName: "" }; Snd.play("uiClick"); flagChanged(); return; }
  if (!b.dataset.flag) return;
  save = { ...save, flag: cleanFlag({ ...save.flag, [b.dataset.k]: b.dataset.id }) };
  Snd.play("uiClick"); flagChanged();
});
flagEl.addEventListener("change", ev => {
  if (ev.target.id !== "shipNameIn") return;
  const raw = cleanShipName(ev.target.value);
  if (raw && shipNameRude(raw)) { flagMsg = "rude"; Snd.play("denied"); ev.target.blur(); renderPort(); return; }
  if (raw !== save.shipName) { save = { ...save, shipName: raw }; persist(); }
  ev.target.blur(); renderPort();
});
flagEl.addEventListener("keydown", ev => { if (ev.target.id === "shipNameIn" && ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } });
onHook("renderPort", () => {
  renderFlagCard();
  const first = document.querySelector("#pStats > span b");   // the ship's name leads the stats line
  if (first) first.textContent = `${shipDisplayName()} · ${t("s_" + save.ship)}`;
});
document.addEventListener("langchange", () => { if (typeof save !== "undefined" && !flagEl.closest("[hidden]")) renderFlagCard(); });

// ---------- the sale tally: the ship that earned it ----------
onHook("tally", () => {
  const el = document.getElementById("tally"); if (!el) return;
  const f = document.createElement("div"); f.className = "t-ship"; f.textContent = shipDisplayName(); el.appendChild(f);
});
