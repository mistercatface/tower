import { roguelikeProceduralDesign } from "../../../Libraries/WorldGen/presets/roguelikeMap.js";
import { generateTilelabMap } from "../world/mapWorld.js";
import { fitLabStageToView } from "./labViewport.js";
import { invalidateMapPreviewBakes } from "../world/surfacePreview.js";
export function readControls(state) {
    return {
        seed: Number(document.getElementById("seedInput")?.value) || 0,
        mapSeed: Number(document.getElementById("mapSeedInput")?.value) || 0,
        showVignette: document.getElementById("showVignetteInput")?.checked ?? false,
        state,
    };
}
/** @param {import("../index.js").TileLabGameState} state */
export function syncPreviewZoomToStage(state) {
    fitLabStageToView(state);
}
export function initPresetSelect(profileIds) {
    const select = document.getElementById("presetSelect");
    if (!select) return;
    for (const id of profileIds) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = roguelikeProceduralDesign.surfaceProfileId;
}
/** @param {import("../index.js").TileLabGameState} state */
export function initToolbarDefaults(state) {
    document.getElementById("mapSeedInput").value = "";
    document.getElementById("seedInput").value = "";
    syncPreviewZoomToStage(state);
}
/**
 * @param {import("../index.js").TileLabGameState} state
 * @param {{ mapSeed: number, floorSeed: number }} ctrl
 * @param {boolean} [forceRegen]
 */
export function syncTilelabWorld(state, ctrl, forceRegen = false) {
    const mapSeed = ctrl.mapSeed;
    if (forceRegen || state.mapSeed !== mapSeed) {
        generateTilelabMap(state, { mapSeed, floorSeed: ctrl.seed });
        return;
    }
    if (state.floorSeed !== ctrl.seed) {
        state.floorSeed = ctrl.seed;
        state.worldSurfaces.worldSurfaceSeed = ctrl.seed;
        state.worldSurfaces.clearBakeCache();
        invalidateMapPreviewBakes();
    }
}
/**
 * @param {{ onRefresh: () => void, onStageResize: () => void }} handlers
 */
export function bindToolbarControls(handlers) {
    const { onRefresh, onStageResize } = handlers;
    const ids = ["seedInput", "mapSeedInput", "showVignetteInput"];
    for (const id of ids) {
        document.getElementById(id)?.addEventListener("input", onRefresh);
        document.getElementById(id)?.addEventListener("change", onRefresh);
    }
    document.getElementById("regenerateBtn")?.addEventListener("click", onRefresh);
    document.getElementById("randomSeedBtn")?.addEventListener("click", () => {
        document.getElementById("seedInput").value = String(Math.floor(Math.random() * 1_000_000));
        onRefresh();
    });
    document.getElementById("regenMapBtn")?.addEventListener("click", () => {
        handlers.onRegenMap?.();
        onRefresh();
    });
    const stage = document.getElementById("mapStage");
    if (stage && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(onStageResize);
        ro.observe(stage);
    }
}
