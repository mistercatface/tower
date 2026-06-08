/** @param {import("../index.js").TileLabGameState} state */
export function applyLabViewChrome(state) {
    const showOverlay = state.labShowTopologyOverlay;
    const app = document.querySelector(".app");
    if (app) app.dataset.topologyOverlay = showOverlay ? "true" : "false";
    const topologyPanel = document.getElementById("topologyEditorPanel");
    const mapStatus = document.getElementById("mapStatusLine");
    if (topologyPanel) topologyPanel.style.display = showOverlay ? "flex" : "none";
    if (mapStatus) mapStatus.style.display = showOverlay ? "block" : "none";
    const checkbox = document.getElementById("showTopologyOverlayInput");
    if (checkbox) checkbox.checked = showOverlay;
}
/** @param {import("../index.js").TileLabGameState} state @param {() => void} onChange */
export function bindViewModeControls(state, onChange) {
    document.getElementById("showTopologyOverlayInput")?.addEventListener("change", (e) => {
        state.labShowTopologyOverlay = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onChange();
    });
    applyLabViewChrome(state);
}
