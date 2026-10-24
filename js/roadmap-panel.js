// Roadmap panel on the title: roadmap/index.html framed in embed mode (its own header hidden, the game's language).
// The frame loads on first open so the title never waits for it; reopening in another language reloads it.
// Esc pressed inside the frame never reaches the game's key handler, so the page posts a close request instead.
const rmFrame = document.getElementById("rmFrame");
let rmLang = "";

function openRoadmap(opener) {
  if (rmLang !== lang) {
    rmLang = lang;
    rmFrame.title = t("m_roadmap");
    rmFrame.src = `roadmap/index.html?embed=1&lang=${lang}`;
  }
  openPanel("roadmap", opener);
}

window.addEventListener("message", e => {
  if (e.source !== rmFrame.contentWindow || !e.data || e.data.type !== "privateers-roadmap-close") return;
  if (!document.getElementById("p-roadmap").hidden) closePanel();
});
