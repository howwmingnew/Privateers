// Which browser tests cover which files, for `npm run test:quick` (tools/run-tests.mjs quick).
// Every matching row adds its tests. Add a row when you add a module;
// a changed file that matches no row (and is not documentation) pulls in the CORE set instead.
export const CORE = ["shell", "harbor", "phase1", "campaign", "polish", "collision"];

// [pattern on the repo-relative path, tests]
export const MAP = [
  [/^js\/(gun|deck-art|volley|powder|arsenal)/, ["gundeck", "phase1b"]],
  [/^js\/gear/, ["gear", "gundeck", "boarding", "harbor"]],
  [/^js\/(heat|ports|world-seas|forts|novice)/, ["heat", "ports", "daily-ports"]],
  [/^js\/(escort|fleet)/, ["escorts", "fleet"]],
  [/^js\/ledger-(tabs|panel|hold)/, ["harbor", "shipyard", "escorts", "gundeck", "gear"]],   // the fleet tabs, the context panel and everything they hold
  [/^js\/flee/, ["flee"]],
  [/^js\/(boarding|grapple)/, ["boarding"]],
  [/^js\/(disasters|weather|sea-fx)/, ["disasters", "weather"]],
  [/^js\/audio/, ["audio"]],
  [/^js\/(campaign|bounty|victory|postcard|sharecard)/, ["campaign"]],
  [/^js\/lv-path/, ["campaign", "harbor", "polish"]],   // Ship Lv progress: the HUD label, the upgrade buttons, the poster
  [/^js\/replay/, ["replay"]],
  [/^js\/ram/, ["collision", "harbor"]],   // the bow ram: its ledger row, the crash damage and the save field (#149)
  [/^js\/(collision|ships|combat|strike|ai-nav|ambush|sea-guard)/, ["collision", "phase1"]],
  [/^js\/(plunder|ai-plunder)/, ["aiplunder"]],
  [/^js\/sunk-by/, ["shell", "harbor", "collision"]],
  [/^js\/(ship-lines|shipyard)/, ["shiplines", "shipyard"]],
  [/^js\/flags/, ["flags"]],
  [/^js\/(rematch|run|daily)/, ["rematch", "daily-ports"]],
  [/^js\/(harbor|mooring|repair)/, ["harbor"]],
  [/^js\/(view|input|hud|options|settings|touch-sail|aground|hit-glow)/, ["scale", "platform", "shell"]],
  [/^js\/(novice|aground|hit-glow|touch-sail|notify-order|hud-stack|safety-hints|world-seas|mooring|input|hull-alert|plate-spread)|^css\/safety/, ["safety", "feedback"]],   // the new-captain safety net
  [/^js\/(tutorial|onboard|howto|menu|title-attract|hall|logbook|achievements|ledger|notices|notify|chart-legend|roadmap)/, ["shell", "polish"]],
  [/^js\/(art|scenery|vfx|mini-marks|poster|harbor-art|disasters-art|gun-art)/, ["art-hits", "polish"]],
  [/^js\/(hooks|boot-guard|fonts-link)/, ["shell"]],
  [/^js\/cull/, ["phase1", "harbor", "ports", "scale", "art-hits"]],   // off-screen culling: photo mode, harbor, stations, big views
  [/^js\/ball-pool/, ["gundeck", "collision", "phase1"]],
  // off-screen markers: phase1b and ports check them, escorts and campaign (boss frame) used to get them through CORE
  [/^js\/edge-(marks|math)/, ["phase1b", "ports", "escorts", "campaign", "readmarks"]],
  [/^js\/read-marks/, ["readmarks", "phase1b"]],   // #119: shooter ring, bow chevron, plate rim
  [/^css\//, ["shell", "polish", "scale"]],
  [/^index\.html$/, ["shell", "platform", "portal"]],   // portal: the build rewrites index.html line by line and stops when one no longer matches
  [/^tools\/(build-portal|portal\/)|^js\/fonts-link/, ["portal"]],   // the portal build and its SDK shim (#19); fonts-link.js is where it reads the font URL
  [/^tests\/lib\//, ["phase1b", "ports", "collision"]],   // helpers shared by browser tests
];
// Changes that need no browser test at all (.claude/ and .vscode/ hold editor and agent settings, e.g. an untracked launch.json).
const IGNORE = [/\.md$/, /^roadmap\//, /^og\.png$/, /^\.github\//, /^\.gitignore$/, /^\.claude\//, /^\.vscode\//, /^tools\/(og|roadmap)/, /^tools\/.*\.html$/];

export function browserTestsFor(files, { available = [] } = {}) {
  const tests = new Set();
  let core = false;
  for (const f of files) {
    const own = f.match(/^tests\/([^/]+)\.mjs$/);
    if (own) { if (!/^unit/.test(own[1])) tests.add(own[1]); continue; }   // unit tests run anyway
    if (IGNORE.some(re => re.test(f))) continue;
    const hits = MAP.filter(([re]) => re.test(f));
    if (!hits.length) { core = true; continue; }
    for (const [, ts] of hits) for (const t of ts) tests.add(t);
  }
  if (core) for (const t of CORE) tests.add(t);
  // ignore names with no tests/<name>.mjs (a renamed test must not break the quick run)
  const out = [...tests].filter(t => !available.length || available.includes(t));
  return { tests: out, core, files };
}
