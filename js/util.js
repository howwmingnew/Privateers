"use strict";
// ---------- Helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
// Generation RNG: who spawns where and as what. Math.random until a daily or seeded run (js/run.js) points it at a seeded
// stream, so the same sea comes out the same on every device. Purely visual effects keep using rand / Math.random.
let genRng = null;
const setGenRng = fn => { genRng = fn; };
const grandom = () => (genRng ? genRng() : Math.random());
const grand = (a, b) => a + grandom() * (b - a);
function fmt(n) { n = Math.round(n); if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e4) return (n / 1e3).toFixed(1) + "K"; return n.toLocaleString("en-US"); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let z = Math.imul(a ^ a >>> 15, 1 | a); z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; }; }
function threatColor(L) { const d = L - shipRating(); return d <= -1 ? "#86c46f" : d === 0 ? "#e8c25a" : d === 1 ? "#e88a3a" : "#d9493a"; }
