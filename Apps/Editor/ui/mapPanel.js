/** @param {import("../state.js").TileLabGameState} state */
export function buildMapPanel(state) {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent = "Play width and height are in the toolbar — they apply on Redraw. Cavern and rail generation are in Props.";
    panel.appendChild(hint);
}
