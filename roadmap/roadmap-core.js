// Roadmap model + SVG drawing, shared by roadmap/index.html (browser) and tools/roadmap-build.mjs (Node, README art).
// Data comes from GitHub issues labelled `enhancement`; each roadmap issue carries one hidden line:
//   <!-- roadmap: phase=3; en=Ship lines: fast vs heavy; deps=10 -->
// Issues without that line (the roadmap overview itself, stray enhancements) are left out.
// Drawn with the diagram-design skill's grammar and the `privateers` profile (game parchment / sea palette).
(function (root) {
  "use strict";

  const REPO = "howwmingnew/Privateers";
  const C = {   // privateers profile, light skin
    paper: "#efe3c4", paper2: "#e0cc9c", ink: "#2a1d10", muted: "#6b5638", soft: "#6f5a3a",
    rule: "rgba(42,29,16,0.14)", ruleSolid: "#c9b585", accent: "#a33a26", accentTint: "rgba(163,58,38,0.08)",
    link: "#0f3f52", done: "#3f7a3b", white: "#fbf6e9",
  };
  const FONT = {
    title: "'IM Fell English SC','Noto Serif TC','Iowan Old Style',Georgia,serif",
    sans: "'Barlow Semi Condensed','Noto Sans TC','PingFang TC','Microsoft JhengHei','Segoe UI',system-ui,sans-serif",
    mono: "ui-monospace,'Cascadia Mono',Consolas,Menlo,monospace",
  };
  const PHASES = {
    1: { zh: "快速見效", en: "Quick wins" }, 2: { zh: "分享循環", en: "Share loop" }, 3: { zh: "船與砲", en: "Ships & guns" },
    4: { zh: "更廣的海", en: "The wider sea" }, 5: { zh: "深度", en: "Depth" }, 6: { zh: "新模式", en: "New mode" },
    7: { zh: "發行", en: "Release" },
  };
  const T = {
    zh: { todo: "待辦", doing: "進行中", waiting: "等待前置", done: "完成", needs: "需要", legend: "圖例",
      phase: "階段", now: "目前", overview: "更新路線圖總覽", detail: "階段細項", other: "其他" },
    en: { todo: "To do", doing: "In progress", waiting: "Waiting", done: "Done", needs: "needs", legend: "Legend",
      phase: "Phase", now: "Now", overview: "Roadmap overview", detail: "Phase detail", other: "Other" },
  };
  const IN_PROGRESS_LABEL = "in progress";
  const META = /<!--\s*roadmap:\s*([^>]*?)-->/;

  // ---------- model ----------
  function parseMeta(body) {
    const m = META.exec(body || "");
    if (!m) return null;
    const out = {};
    for (const part of m[1].split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    const phase = parseInt(out.phase, 10);
    if (!(phase > 0)) return null;
    const deps = (out.deps || "").split(",").map(s => parseInt(s, 10)).filter(n => n > 0);
    return { phase, en: out.en || "", deps };
  }

  // Raw GitHub issue objects (REST shape) -> a frozen plain model. Pull requests and unmarked issues are dropped.
  function buildModel(rawIssues, fetchedAt) {
    const items = [];
    for (const r of rawIssues || []) {
      if (!r || r.pull_request) continue;
      const meta = parseMeta(r.body);
      if (!meta) continue;
      const labels = (r.labels || []).map(l => (typeof l === "string" ? l : l.name || "").toLowerCase());
      items.push({
        number: r.number, title: String(r.title || ""), en: meta.en, phase: meta.phase, deps: meta.deps,
        closed: r.state === "closed", doing: labels.includes(IN_PROGRESS_LABEL), url: r.html_url || issueUrl(r.number),
      });
    }
    const byNum = new Map(items.map(i => [i.number, i]));
    const withStatus = items.map(i => Object.freeze(Object.assign({}, i, { status: statusOf(i, byNum) })));
    const phaseNums = Array.from(new Set(withStatus.map(i => i.phase))).sort((a, b) => a - b);
    const phases = phaseNums.map(n => {
      const list = withStatus.filter(i => i.phase === n).sort((a, b) => a.number - b.number);
      return Object.freeze({ n, items: list, done: list.filter(i => i.closed).length });
    });
    const current = (phases.find(p => p.done < p.items.length) || phases[phases.length - 1] || { n: 0 }).n;
    return Object.freeze({ phases, current, fetchedAt: fetchedAt || null, total: withStatus.length,
      done: withStatus.filter(i => i.closed).length });
  }

  function statusOf(item, byNum) {
    if (item.closed) return "done";
    if (item.doing) return "doing";
    const blocked = item.deps.some(d => byNum.has(d) && !byNum.get(d).closed);
    return blocked ? "waiting" : "todo";
  }

  function issueUrl(n) { return `https://github.com/${REPO}/issues/${n}`; }

  function phaseName(n, lang) { return PHASES[n] ? PHASES[n][lang] : `${T[lang].other} ${n}`; }

  // The card name: zh titles drop the explanatory half after "：" (the full title stays in the tooltip).
  function itemName(item, lang) {
    if (lang === "en" && item.en) return item.en;
    const cut = item.title.search(/[：（]/);
    return cut > 0 ? item.title.slice(0, cut).trim() : item.title;
  }

  // ---------- text metrics (diagram-design width budget: wide chars 1em, others 0.6em sans / 0.62em mono) ----------
  function isWide(ch) {
    const c = ch.codePointAt(0);
    return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6);
  }
  function textWidth(s, size, mono) {
    let w = 0;
    for (const ch of s) w += isWide(ch) ? 1 : (mono ? 0.62 : 0.6);
    return w * size;
  }
  // Greedy wrap by the width budget; breaks at spaces for Latin, anywhere for Han. Max `lines`, ellipsis on overflow.
  function wrap(s, size, maxW, lines) {
    const tokens = s.match(/[⺀-꓏豈-﫿＀-￦]|[^\s⺀-꓏豈-﫿＀-￦]+|\s+/g) || [];
    const out = [];
    let cur = "";
    for (const tok of tokens) {
      const next = cur + tok;
      if (textWidth(next.trim(), size) <= maxW || !cur.trim()) { cur = next; continue; }
      out.push(cur.trim());
      cur = tok.trim() ? tok : "";
    }
    if (cur.trim()) out.push(cur.trim());
    if (out.length <= lines) return out;
    const kept = out.slice(0, lines);
    let last = kept[lines - 1];
    while (last && textWidth(last + "…", size) > maxW) last = Array.from(last).slice(0, -1).join("");
    kept[lines - 1] = last + "…";
    return kept;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- SVG pieces ----------
  const W = 1200;   // both diagrams share the doc-wide-ish width; min-width on the page equals it

  function svgOpen(slug, w, h, title, desc) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" ` +
      `aria-labelledby="${slug}-title ${slug}-desc" style="min-width:${w}px;display:block">` +
      `<title id="${slug}-title">${esc(title)}</title><desc id="${slug}-desc">${esc(desc)}</desc>` +
      `<defs><marker id="${slug}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${C.muted}"/></marker>` +
      `<pattern id="${slug}-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.9" fill="${C.ink}" opacity="0.07"/></pattern></defs>` +
      `<rect width="${w}" height="${h}" fill="${C.paper}"/><rect width="${w}" height="${h}" fill="url(#${slug}-dots)"/>`;
  }

  function tag(x, y, label, stroke) {
    const w = Math.ceil((textWidth(label, 7, true) + 10) / 4) * 4;
    return `<rect x="${x}" y="${y}" width="${w}" height="12" rx="2" fill="none" stroke="${stroke}" stroke-opacity="0.45" stroke-width="0.8"/>` +
      `<text x="${x + w / 2}" y="${y + 9}" fill="${stroke}" font-size="7" font-family="${FONT.mono}" text-anchor="middle" letter-spacing="0.08em">${esc(label)}</text>`;
  }

  // Overview: one node per phase on a single rail, left to right. Accent = the phase being worked on now.
  function renderOverview(model, lang, opt) {
    const o = opt || {};
    const slug = o.slug || "roadmap-overview";
    const ps = model.phases;
    const n = Math.max(ps.length, 1);
    const gap = 24, pad = 52, nodeH = 76, y = 24;
    const nodeW = Math.floor((W - pad * 2 - gap * (n - 1)) / n / 4) * 4;
    const left = Math.round((W - (nodeW * n + gap * (n - 1))) / 2 / 4) * 4;
    const H = 172;
    const t = T[lang];
    let s = svgOpen(slug, W, H, t.overview, lang === "zh"
      ? `${ps.length} 個階段、${model.total} 項新功能，已完成 ${model.done} 項；目前在第 ${model.current} 階段。`
      : `${ps.length} phases, ${model.total} features, ${model.done} done; now in phase ${model.current}.`);
    // arrows first, so nodes sit on top
    for (let i = 0; i < n - 1; i++) {
      const x1 = left + i * (nodeW + gap) + nodeW, x2 = x1 + gap;
      const past = ps[i].n < model.current;
      s += `<line x1="${x1}" y1="${y + nodeH / 2}" x2="${x2 - 1}" y2="${y + nodeH / 2}" stroke="${C.muted}" stroke-width="1.2"` +
        `${past ? "" : ' stroke-dasharray="5,4"'} marker-end="url(#${slug}-arrow)"/>`;
    }
    ps.forEach((p, i) => {
      const x = left + i * (nodeW + gap);
      const state = p.done === p.items.length ? "done" : p.n === model.current ? "now" : "later";
      const fill = state === "now" ? C.accentTint : state === "done" ? "rgba(42,29,16,0.05)" : "rgba(42,29,16,0.02)";
      const stroke = state === "now" ? C.accent : state === "done" ? C.muted : "rgba(42,29,16,0.30)";
      const dash = state === "later" ? ' stroke-dasharray="4,3"' : "";
      const sel = o.selected === p.n;
      s += `<g data-phase="${p.n}" style="cursor:${o.interactive ? "pointer" : "default"}">`;
      s += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" fill="${C.paper}"/>`;
      s += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${state === "now" ? 1.4 : 1}"${dash}/>`;
      s += tag(x + 8, y + 8, `P${p.n}`, stroke === C.accent ? C.accent : C.muted);
      if (state === "now") s += tag(x + nodeW - 8 - Math.ceil((textWidth("NOW", 7, true) + 10) / 4) * 4, y + 8, "NOW", C.accent);
      if (state === "done") s += `<path d="M${x + nodeW - 22} ${y + 14} l4 4 l8 -9" fill="none" stroke="${C.done}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      const name = wrap(phaseName(p.n, lang), 13, nodeW - 16, 1)[0];
      s += `<text x="${x + nodeW / 2}" y="${y + 42}" fill="${C.ink}" font-size="13" font-weight="600" font-family="${FONT.sans}" text-anchor="middle">${esc(name)}</text>`;
      // progress: hairline track + filled share
      const bx = x + 12, bw = nodeW - 24, by = y + 56;
      s += `<rect x="${bx}" y="${by}" width="${bw}" height="4" rx="2" fill="rgba(42,29,16,0.10)"/>`;
      if (p.done) s += `<rect x="${bx}" y="${by}" width="${Math.max(4, Math.round(bw * p.done / p.items.length))}" height="4" rx="2" fill="${C.done}"/>`;
      s += `<text x="${x + nodeW / 2}" y="${y + 71}" fill="${C.soft}" font-size="9" font-family="${FONT.mono}" text-anchor="middle">${p.done}/${p.items.length}</text>`;
      if (sel) s += `<line x1="${x + 12}" y1="${y + nodeH + 8}" x2="${x + nodeW - 12}" y2="${y + nodeH + 8}" stroke="${C.ink}" stroke-width="2"/>`;
      s += `</g>`;
    });
    // legend strip
    const ly = H - 36;
    s += `<line x1="30" y1="${ly - 8}" x2="${W - 30}" y2="${ly - 8}" stroke="${C.rule}" stroke-width="0.8"/>`;
    s += `<text x="30" y="${ly + 10}" fill="${C.muted}" font-size="11" font-family="${FONT.sans}">${esc(t.legend)}</text>`;
    const leg = [["now", t.now], ["done", t.done], ["later", lang === "zh" ? "之後" : "Later"]];
    leg.forEach(([k, label], i) => {
      const lx = 120 + i * 160;
      const st = k === "now" ? C.accent : k === "done" ? C.muted : "rgba(42,29,16,0.30)";
      const fi = k === "now" ? C.accentTint : k === "done" ? "rgba(42,29,16,0.05)" : "rgba(42,29,16,0.02)";
      s += `<rect x="${lx}" y="${ly}" width="20" height="12" rx="2" fill="${fi}" stroke="${st}"${k === "later" ? ' stroke-dasharray="4,3"' : ""}/>`;
      s += `<text x="${lx + 28}" y="${ly + 10}" fill="${C.ink}" font-size="11" font-family="${FONT.sans}">${esc(label)}</text>`;
    });
    return s + `</svg>`;
  }

  // Detail: one phase, its features as cards in issue order. No connectors (kanban rule): a dependency is a sublabel.
  function renderPhase(model, phaseN, lang, opt) {
    const o = opt || {};
    const slug = o.slug || "roadmap-phase";
    const p = model.phases.find(x => x.n === phaseN) || model.phases[0];
    const t = T[lang];
    if (!p) return svgOpen(slug, W, 120, t.detail, "-") + `</svg>`;
    const cols = Math.min(Math.max(p.items.length, 3), 5);
    const gap = 20, pad = 40, y = 72;
    const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols / 4) * 4;
    const lineCount = Math.max(1, ...p.items.map(it => wrap(itemName(it, lang), 14, cardW - 20, 3).length));
    const hasNote = p.items.some(it => it.status === "waiting");
    const cardH = Math.ceil((44 + lineCount * 18 + (hasNote ? 22 : 4)) / 4) * 4;
    const rows = Math.ceil(p.items.length / cols);
    const H = y + rows * (cardH + gap) - gap + 80;
    const left = Math.round((W - (cardW * cols + gap * (cols - 1))) / 2 / 4) * 4;
    let s = svgOpen(slug, W, H, `${t.phase} ${p.n} · ${phaseName(p.n, lang)}`, lang === "zh"
      ? `第 ${p.n} 階段「${phaseName(p.n, "zh")}」共 ${p.items.length} 項，完成 ${p.done} 項。`
      : `Phase ${p.n}, ${phaseName(p.n, "en")}: ${p.items.length} features, ${p.done} done.`);
    s += `<text x="${pad}" y="34" fill="${C.muted}" font-size="8" font-family="${FONT.mono}" letter-spacing="0.18em">${esc(`PHASE ${p.n} / ${model.phases.length}`)}</text>`;
    s += `<text x="${pad}" y="56" fill="${C.ink}" font-size="20" font-family="${FONT.title}">${esc(phaseName(p.n, lang))}</text>`;
    let accentLeft = 1;   // focal budget: the "now" phase node is the other accent
    p.items.forEach((it, i) => {
      const x = left + (i % cols) * (cardW + gap), cy = y + Math.floor(i / cols) * (cardH + gap);
      const st = it.status;
      const focal = st === "doing" && accentLeft-- > 0;
      const fill = focal ? C.accentTint : st === "done" ? "rgba(42,29,16,0.05)" : st === "waiting" ? "rgba(42,29,16,0.02)" : C.white;
      const stroke = focal ? C.accent : st === "done" ? C.muted : st === "waiting" ? "rgba(42,29,16,0.30)" : C.ink;
      const dash = st === "waiting" ? ' stroke-dasharray="4,3"' : "";
      s += `<g data-issue="${it.number}"${o.interactive ? ' style="cursor:pointer"' : ""}><title>${esc(`#${it.number} ${it.title}`)}</title>`;
      s += `<rect x="${x}" y="${cy}" width="${cardW}" height="${cardH}" rx="6" fill="${C.paper}"/>`;
      s += `<rect x="${x}" y="${cy}" width="${cardW}" height="${cardH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`;
      s += tag(x + 10, cy + 10, `#${it.number}`, focal ? C.accent : C.muted);
      const stLabel = t[st];
      const stW = Math.ceil((textWidth(stLabel, 10) + 4) / 4) * 4;
      s += `<text x="${x + cardW - 10}" y="${cy + 20}" fill="${st === "done" ? C.done : focal ? C.accent : C.soft}" font-size="10" font-weight="600" font-family="${FONT.sans}" text-anchor="end">${esc(stLabel)}</text>`;
      if (st === "done") s += `<path d="M${x + cardW - 18 - stW} ${cy + 15} l3 3 l6 -7" fill="none" stroke="${C.done}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      const lines = wrap(itemName(it, lang), 14, cardW - 20, 3);
      lines.forEach((ln, k) => {
        s += `<text x="${x + 10}" y="${cy + 46 + k * 18}" fill="${st === "done" ? C.muted : C.ink}" font-size="14" font-weight="600" font-family="${FONT.sans}">${esc(ln)}</text>`;
      });
      const openDeps = it.deps.filter(d => p.items.concat(...model.phases.map(q => q.items)).some(q => q.number === d && !q.closed));
      if (st === "waiting" && openDeps.length) {
        s += `<text x="${x + 10}" y="${cy + cardH - 12}" fill="${C.soft}" font-size="11" font-family="${FONT.sans}">${esc(`${t.needs} ${openDeps.map(d => "#" + d).join("、")}`)}</text>`;
      }
      s += `</g>`;
    });
    const ly = H - 36;
    s += `<line x1="30" y1="${ly - 8}" x2="${W - 30}" y2="${ly - 8}" stroke="${C.rule}" stroke-width="0.8"/>`;
    s += `<text x="30" y="${ly + 10}" fill="${C.muted}" font-size="11" font-family="${FONT.sans}">${esc(t.legend)}</text>`;
    [["todo", C.white, C.ink, ""], ["doing", C.accentTint, C.accent, ""], ["waiting", "rgba(42,29,16,0.02)", "rgba(42,29,16,0.30)", ' stroke-dasharray="4,3"'],
      ["done", "rgba(42,29,16,0.05)", C.muted, ""]].forEach(([k, fi, st, da], i) => {
      const lx = 120 + i * 160;
      s += `<rect x="${lx}" y="${ly}" width="20" height="12" rx="2" fill="${fi}" stroke="${st}"${da}/>`;
      s += `<text x="${lx + 28}" y="${ly + 10}" fill="${C.ink}" font-size="11" font-family="${FONT.sans}">${esc(t[k])}</text>`;
    });
    return s + `</svg>`;
  }

  root.RoadmapCore = Object.freeze({ REPO, PHASES, T, IN_PROGRESS_LABEL, parseMeta, buildModel, renderOverview, renderPhase,
    phaseName, itemName, issueUrl, wrap, textWidth });
})(typeof globalThis !== "undefined" ? globalThis : this);
