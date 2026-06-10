import { roguelikeProceduralDesign } from "../../../Libraries/WorldGen/presets/roguelikeMap.js";
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
/** @param {{ onRefresh: () => void, onStageResize: () => void }} handlers */
export function bindToolbarControls(handlers) {
    const { onRefresh, onStageResize } = handlers;
    for (const id of ["showVignetteInput", "showWallsInput", "showPathDebugInput"]) document.getElementById(id).addEventListener("change", onRefresh);
    document.getElementById("regenerateBtn").addEventListener("click", onRefresh);
    const stage = document.getElementById("mapStage");
    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(onStageResize);
        ro.observe(stage);
    }
}
