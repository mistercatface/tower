import { renderMapTopologyView } from "../world/mapTopologyView.js";
import { renderTilelabPreview } from "./preview.js";
import { readMapControls } from "./mapInspector.js";
import { readControls } from "./toolbar.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function renderActiveLabView(state) {
    if (state.labViewMode === "topology") {
        const { mapLab, mapViewport } = state;
        renderMapTopologyView(state, mapViewport, readMapControls(), mapLab.selectedNodeId, mapLab.playerPos, mapLab.targetPos, mapLab.currentPath, mapLab.currentAbstractPath);
        return;
    }
    renderTilelabPreview(state, readControls(state));
}
