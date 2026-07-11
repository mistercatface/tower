import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_COUNT } from "../../../Core/engineEnums.js";
const WORLD_RENDER_MODE_LABELS = ["2D", "3D Spheres", "3D"];
function clampWorldRenderMode(mode) {
    const m = mode | 0;
    return m === mode && m >= 0 && m < WORLD_RENDER_MODE_COUNT ? m : WORLD_RENDER_MODE_FLAT2D;
}
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
export function bindWorldRenderModeToolbar(state, onChange) {
    const select = document.getElementById("worldRenderModeSelect");
    if (select) {
        select.replaceChildren();
        for (let i = 0; i < WORLD_RENDER_MODE_COUNT; i++) {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = WORLD_RENDER_MODE_LABELS[i];
            select.appendChild(option);
        }
        select.value = String(clampWorldRenderMode(state.worldRenderMode));
        select.addEventListener("change", () => {
            const mode = clampWorldRenderMode(+select.value);
            state.worldRenderMode = mode;
            onChange(mode);
        });
        return;
    }
    const btn = document.getElementById("worldRenderModeBtn");
    if (btn) {
        const updateBtnText = (mode) => {
            btn.textContent = `Draw: ${WORLD_RENDER_MODE_LABELS[mode]}`;
        };
        updateBtnText(clampWorldRenderMode(state.worldRenderMode));
        btn.addEventListener("click", () => {
            const nextMode = (clampWorldRenderMode(state.worldRenderMode) + 1) % WORLD_RENDER_MODE_COUNT;
            state.worldRenderMode = nextMode;
            updateBtnText(nextMode);
            onChange(nextMode);
        });
    }
}
export function bindToolbarControls(handlers, state) {
    const { onOverlayChange, onRedraw, onStageResize, onRenderModeChange } = handlers;
    const vignetteInput = document.getElementById("showVignetteInput");
    if (vignetteInput) vignetteInput.addEventListener("change", onOverlayChange);
    const vignetteBtn = document.getElementById("showVignetteBtn");
    if (vignetteBtn) vignetteBtn.addEventListener("click", onOverlayChange);
    document.getElementById("pathDebugModeBtn").addEventListener("click", onOverlayChange);
    bindWorldRenderModeToolbar(state, onRenderModeChange);
    const regenBtn = document.getElementById("regenerateBtn");
    if (regenBtn) regenBtn.addEventListener("click", onRedraw);
    const stage = document.getElementById("mapStage");
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(onStageResize).observe(stage);
}
export function syncWorldRenderModeUi(state) {
    const select = document.getElementById("worldRenderModeSelect");
    if (select) {
        select.value = String(clampWorldRenderMode(state.worldRenderMode));
        return;
    }
    const btn = document.getElementById("worldRenderModeBtn");
    if (btn) {
        const mode = clampWorldRenderMode(state.worldRenderMode);
        btn.textContent = `Draw: ${WORLD_RENDER_MODE_LABELS[mode]}`;
    }
}
