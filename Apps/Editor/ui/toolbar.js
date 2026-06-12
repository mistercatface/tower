import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_LABELS, WORLD_RENDER_MODE_OPTIONS } from "../../../Render/WorldRenderMode.js";
export function initPresetSelect(profileIds) {
    const select = document.getElementById("presetSelect");
    for (const id of profileIds) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = SURFACE_PROFILE_ID.tomatoGarden;
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onChange */
export function bindVectorPropsToolbar(state, onChange) {
    const input = document.getElementById("showVectorPropsAllInput");
    if (!input) return;
    input.checked = state.editor.forceVectorPropsAll;
    input.addEventListener("change", () => {
        state.editor.forceVectorPropsAll = input.checked;
        onChange();
    });
}
/** @param {{ onOverlayChange: () => void, onRedraw: () => void, onStageResize: () => void, onRenderModeChange: (mode: import("../../../Render/WorldRenderMode.js").WorldRenderMode) => void }} handlers */
export function bindToolbarControls(handlers) {
    const { onOverlayChange, onRedraw, onStageResize, onRenderModeChange } = handlers;
    for (const id of ["showVignetteInput", "showWallsInput", "showPathDebugInput"]) document.getElementById(id).addEventListener("change", onOverlayChange);
    const renderModeSelect = document.getElementById("worldRenderModeSelect");
    for (const mode of WORLD_RENDER_MODE_OPTIONS) {
        const option = renderModeSelect.querySelector(`option[value="${mode}"]`);
        if (option) option.textContent = WORLD_RENDER_MODE_LABELS[mode];
    }
    renderModeSelect.addEventListener("change", () => onRenderModeChange(normalizeWorldRenderMode(renderModeSelect.value)));
    document.getElementById("regenerateBtn").addEventListener("click", onRedraw);
    const stage = document.getElementById("mapStage");
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(onStageResize).observe(stage);
}
/** @param {import("../state.js").TileLabGameState} state */
export function syncWorldRenderModeUi(state) {
    const select = document.getElementById("worldRenderModeSelect");
    if (!select) return;
    select.value = normalizeWorldRenderMode(state.worldRenderMode);
}
