import { syncCamerasForViewMode } from "../world/labCamera.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function applyLabViewMode(state) {
    const isTopology = state.labViewMode === "topology";
    const gameCanvas = document.getElementById("gameCanvas");
    const mapPreview = document.getElementById("mapPreview");
    const animationStage = document.getElementById("animationStage");
    const surfacePanel = document.getElementById("surfaceEditorPanel");
    const topologyPanel = document.getElementById("topologyEditorPanel");
    const surfaceToolbar = document.getElementById("surfaceToolbarGroup");
    const gameMeta = document.getElementById("gameMetaLine");
    const mapStatus = document.getElementById("mapStatusLine");
    if (gameCanvas) gameCanvas.style.display = isTopology ? "none" : "block";
    if (mapPreview) mapPreview.style.display = isTopology ? "block" : "none";
    if (animationStage) animationStage.style.display = isTopology ? "none" : "flex";
    if (surfacePanel) surfacePanel.style.display = isTopology ? "none" : "flex";
    if (topologyPanel) topologyPanel.style.display = isTopology ? "flex" : "none";
    if (surfaceToolbar) surfaceToolbar.style.display = isTopology ? "none" : "inline";
    if (gameMeta) gameMeta.style.display = isTopology ? "none" : "block";
    if (mapStatus) mapStatus.style.display = isTopology ? "block" : "none";
    document.querySelectorAll('input[name="labViewMode"]').forEach((el) => {
        el.checked = el.value === state.labViewMode;
    });
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} onChange */
export function bindViewModeControls(state, onChange) {
    document.querySelectorAll('input[name="labViewMode"]').forEach((el) => {
        el.addEventListener("change", () => {
            if (!el.checked) return;
            const nextMode = el.value === "topology" ? "topology" : "surface";
            if (nextMode !== state.labViewMode) syncCamerasForViewMode(state, nextMode);
            state.labViewMode = nextMode;
            applyLabViewMode(state);
            onChange();
        });
    });
    applyLabViewMode(state);
}
