import { renderTilelabPreview } from "./preview.js";
import { readControls } from "./toolbar.js";

/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function renderActiveLabView(state) {
    renderTilelabPreview(state, readControls(state));
}
