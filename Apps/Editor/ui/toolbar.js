import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
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
/** @param {{ onOverlayChange: () => void, onRedraw: () => void, onStageResize: () => void }} handlers */
export function bindToolbarControls(handlers) {
    const { onOverlayChange, onRedraw, onStageResize } = handlers;
    for (const id of ["showVignetteInput", "showWallsInput", "showPathDebugInput"]) document.getElementById(id).addEventListener("change", onOverlayChange);
    document.getElementById("regenerateBtn").addEventListener("click", onRedraw);
    const stage = document.getElementById("mapStage");
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(onStageResize).observe(stage);
}
