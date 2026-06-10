import { roguelikeProceduralDesign } from "../../../Libraries/WorldGen/presets/roguelikeMap.js";
import { generateTilelabMap } from "../world/mapWorld.js";
import { fitLabStageToView } from "./labViewport.js";
export function readControls(state) {
    return { showVignette: document.getElementById("showVignetteInput").checked, state };
}
/** @param {import("../state.js").TileLabGameState} state */
export function syncPreviewZoomToStage(state) {
    fitLabStageToView(state);
}
export function rollRandomMapSeed() {
    return Math.floor(1 + Math.random() * 1_000_000_000);
}
/**
 * Roll new map + floor seeds and regenerate the lab world.
 * @param {import("../state.js").TileLabGameState} state
 */
export function rollRandomTilelabMap(state) {
    const seed = rollRandomMapSeed();
    generateTilelabMap(state, { mapSeed: seed, floorSeed: seed });
}
export function initPresetSelect(profileIds) {
    const select = document.getElementById("presetSelect");
    for (const id of profileIds) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = roguelikeProceduralDesign.surfaceProfileId;
}
/** @param {import("../state.js").TileLabGameState} state */
export function initToolbarDefaults(state) {
    syncPreviewZoomToStage(state);
}
/**
 * @param {{ onRefresh: () => void, onRandomMap: () => void, onStageResize: () => void }} handlers
 */
export function bindToolbarControls(handlers) {
    const { onRefresh, onRandomMap, onStageResize } = handlers;
    document.getElementById("showVignetteInput").addEventListener("input", onRefresh);
    document.getElementById("showVignetteInput").addEventListener("change", onRefresh);
    document.getElementById("regenerateBtn").addEventListener("click", onRefresh);
    document.getElementById("randomMapBtn").addEventListener("click", onRandomMap);
    const stage = document.getElementById("mapStage");
    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(onStageResize);
        ro.observe(stage);
    }
}
