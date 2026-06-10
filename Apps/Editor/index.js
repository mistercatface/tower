export { LAB_PREVIEW_RANGE, TILELAB_SANDBOX_SPAWN_PROP, TileLabGameState, tilelabMapTopology } from "./state.js";
import { registerEditorProfiles } from "./ui/preview.js";
import { syncPreviewZoomToStage } from "./ui/toolbar.js";
import { initEmptyTilelabMap } from "./world/mapWorld.js";
/** @param {{ state: import("./state.js").TileLabGameState }} ctx */
export function initEditorSession(ctx) {
    const { state } = ctx;
    initEmptyTilelabMap(state);
    registerEditorProfiles(state).then(() => {
        syncPreviewZoomToStage(state);
    });
}
