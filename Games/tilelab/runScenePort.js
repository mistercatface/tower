import { registerEditorProfiles } from "./ui/preview.js";
import { syncTilelabWorld, readControls, applyToolbarDefaults, syncPreviewZoomToStage } from "./ui/toolbar.js";

/** @type {import("../../Core/GameDefinitionTypes.js").RunScenePort} */
export const tilelabRunScenePort = {
    getLayout: () => null,
    onSimulationEnter(ctx) {
        const { state } = ctx;
        const ctrl = readControls(state);
        syncTilelabWorld(state, ctrl, true);
        registerEditorProfiles(state).then(() => {
            applyToolbarDefaults();
            syncPreviewZoomToStage();
        });
    },
    onTick() {},
};
