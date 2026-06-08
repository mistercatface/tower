import { renderTilelabPreview } from "./preview.js";
import { readControls } from "./toolbar.js";
/** @param {import("../index.js").TileLabGameState} state */
export function renderActiveLabView(state) {
    renderTilelabPreview(state, readControls(state));
}
