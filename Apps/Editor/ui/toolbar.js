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
/** @param {import("../state.js").TileLabGameState} state @param {(mode: import("../../../Render/WorldRenderMode.js").WorldRenderMode) => void} onChange */
export function bindWorldRenderModeToolbar(state, onChange) {
    const select = document.getElementById("worldRenderModeSelect");
    if (select) {
        for (const mode of WORLD_RENDER_MODE_OPTIONS) {
            const option = select.querySelector(`option[value="${mode}"]`);
            if (option) option.textContent = WORLD_RENDER_MODE_LABELS[mode];
        }
        select.value = normalizeWorldRenderMode(state.worldRenderMode);
        select.addEventListener("change", () => {
            const mode = normalizeWorldRenderMode(select.value);
            state.worldRenderMode = mode;
            onChange(mode);
        });
        return;
    }
    const btn = document.getElementById("worldRenderModeBtn");
    if (btn) {
        const updateBtnText = (mode) => {
            btn.textContent = `Render: ${WORLD_RENDER_MODE_LABELS[mode]}`;
        };
        updateBtnText(normalizeWorldRenderMode(state.worldRenderMode));
        btn.addEventListener("click", () => {
            const currentMode = normalizeWorldRenderMode(state.worldRenderMode);
            const nextMode = currentMode === "radial" ? "flat2d" : "radial";
            state.worldRenderMode = nextMode;
            updateBtnText(nextMode);
            onChange(nextMode);
        });
    }
}
/** @param {{ onOverlayChange: () => void, onRedraw: () => void, onStageResize: () => void, onRenderModeChange: (mode: import("../../../Render/WorldRenderMode.js").WorldRenderMode) => void }} handlers @param {import("../state.js").TileLabGameState} state */
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
/** @param {import("../state.js").TileLabGameState} state */
export function syncWorldRenderModeUi(state) {
    const select = document.getElementById("worldRenderModeSelect");
    if (select) {
        select.value = normalizeWorldRenderMode(state.worldRenderMode);
        return;
    }
    const btn = document.getElementById("worldRenderModeBtn");
    if (btn) {
        const mode = normalizeWorldRenderMode(state.worldRenderMode);
        btn.textContent = `Render: ${WORLD_RENDER_MODE_LABELS[mode]}`;
    }
}
