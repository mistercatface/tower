import { roguelikeProceduralDesign } from "../../../Libraries/WorldGen/presets/roguelikeMap.js";
import { getDefaultSimulationZoom } from "../../../Render/SimulationViewport.js";
import { LAB_PREVIEW_RANGE } from "../config.js";
import { focusLabNode, generateTilelabMap } from "../world/mapWorld.js";
import { applyZoomSliderToViewport, syncZoomSliderFromViewport } from "./zoomSlider.js";
import { invalidateMapPreviewBakes } from "../world/surfacePreview.js";
export function readControls(state) {
    applyZoomSliderToViewport(state);
    return {
        seed: Number(document.getElementById("seedInput")?.value) || 0,
        mapSeed: Number(document.getElementById("mapSeedInput")?.value) || 0,
        gameZoom: state.mapViewport.zoom,
        weaponRange: LAB_PREVIEW_RANGE,
        showRangeRing: document.getElementById("showRangeRingInput")?.checked ?? true,
        showVignette: document.getElementById("showVignetteInput")?.checked ?? false,
        state,
    };
}
/** @param {import("../TileLabGameState.js").TileLabGameState | null | undefined} [state] */
export function syncPreviewZoomToStage(state) {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const zoom = getDefaultSimulationZoom(viewW, viewH, LAB_PREVIEW_RANGE, LAB_PREVIEW_RANGE);
    if (state?.mapViewport) state.mapViewport.zoom = zoom;
    syncZoomSliderFromViewport(state);
}
export function applyToolbarDefaults() {
    const rangeMeta = document.getElementById("rangeMeta");
    if (rangeMeta) rangeMeta.textContent = `range ${LAB_PREVIEW_RANGE}`;
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
export function initToolbarDefaults(state) {
    document.getElementById("mapSeedInput").value = "42";
    document.getElementById("seedInput").value = "42";
    syncPreviewZoomToStage(state);
}
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
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
        state.worldSurfaceSeed = ctrl.seed;
        state.worldSurfaces.clear();
        invalidateMapPreviewBakes();
    }
    const nodeId = Number(document.getElementById("mapNodeSelect")?.value) || 0;
    if (state.currentNodeId !== nodeId) focusLabNode(state, nodeId);
}
/**
 * @param {{ onRefresh: () => void, onStageResize: () => void }} handlers
 */
export function bindToolbarControls(handlers) {
    const { onRefresh, onStageResize } = handlers;
    const ids = ["seedInput", "gameZoomInput", "mapSeedInput", "mapNodeSelect", "showRangeRingInput", "showVignetteInput"];
    for (const id of ids) {
        document.getElementById(id)?.addEventListener("input", onRefresh);
        document.getElementById(id)?.addEventListener("change", onRefresh);
    }
    document.getElementById("gameZoomInput")?.addEventListener("input", (e) => {
        document.getElementById("gameZoomValue").textContent = e.target.value;
        onRefresh();
    });
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
