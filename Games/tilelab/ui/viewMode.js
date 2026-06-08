/** @typedef {"surface" | "topology" | "both"} LabViewMode */
/** @param {LabViewMode | string} mode */
export function showsSurfaceView(mode) {
    return mode === "surface" || mode === "both";
}
/** @param {LabViewMode | string} mode */
export function showsTopologyView(mode) {
    return mode === "topology" || mode === "both";
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function applyLabViewMode(state) {
    const mode = state.labViewMode;
    const showSurface = showsSurfaceView(mode);
    const showTopology = showsTopologyView(mode);
    const app = document.querySelector(".app");
    if (app) app.dataset.labView = mode;
    const animationStage = document.getElementById("animationStage");
    const surfacePanel = document.getElementById("surfaceEditorPanel");
    const topologyPanel = document.getElementById("topologyEditorPanel");
    const surfaceToolbar = document.getElementById("surfaceToolbarGroup");
    const gameMeta = document.getElementById("gameMetaLine");
    const mapStatus = document.getElementById("mapStatusLine");
    if (animationStage) animationStage.style.display = showSurface ? "flex" : "none";
    if (surfacePanel) surfacePanel.style.display = showSurface ? "flex" : "none";
    if (topologyPanel) topologyPanel.style.display = showTopology ? "flex" : "none";
    if (surfaceToolbar) surfaceToolbar.style.display = showSurface ? "inline" : "none";
    if (gameMeta) gameMeta.style.display = showSurface ? "block" : "none";
    if (mapStatus) mapStatus.style.display = showTopology ? "block" : "none";
    document.querySelectorAll('input[name="labViewMode"]').forEach((el) => {
        el.checked = el.value === mode;
    });
}
/** @param {LabViewMode | string} value */
function parseLabViewMode(value) {
    if (value === "topology" || value === "both") return value;
    return "surface";
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} onChange */
export function bindViewModeControls(state, onChange) {
    document.querySelectorAll('input[name="labViewMode"]').forEach((el) => {
        el.addEventListener("change", () => {
            if (!el.checked) return;
            state.labViewMode = parseLabViewMode(el.value);
            applyLabViewMode(state);
            onChange();
        });
    });
    applyLabViewMode(state);
}
