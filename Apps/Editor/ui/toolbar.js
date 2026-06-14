import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_LABELS, WORLD_RENDER_MODE_OPTIONS } from "../../../Render/WorldRenderMode.js";
import { PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex, applyPlayAreaConfig } from "../world/mapWorld.js";
/** @typedef {{ label: HTMLLabelElement, input: HTMLInputElement, value: HTMLSpanElement }} PlayAreaToolbarControl */
/** @type {{ cols: PlayAreaToolbarControl, rows: PlayAreaToolbarControl } | null} */
let playAreaToolbar = null;
/** @param {string} labelText @param {number} initialIndex */
function createPlayAreaToolbarControl(labelText, initialIndex) {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(PLAY_AREA_CELL_OPTIONS.length - 1);
    input.step = "1";
    input.value = String(initialIndex);
    const value = document.createElement("span");
    value.className = "hint-inline";
    const syncDisplay = () => {
        value.textContent = String(PLAY_AREA_CELL_OPTIONS[Number(input.value)]);
    };
    syncDisplay();
    input.addEventListener("input", syncDisplay);
    label.appendChild(name);
    label.appendChild(input);
    label.appendChild(value);
    return { label, input, value };
}
/** @param {import("../state.js").TileLabGameState} state */
export function mountPlayAreaToolbarControls(state) {
    const { playConfig } = state.editor;
    playAreaToolbar = {
        cols: createPlayAreaToolbarControl("Play width", playAreaCellsToIndex(playConfig.playAreaCols)),
        rows: createPlayAreaToolbarControl("Play height", playAreaCellsToIndex(playConfig.playAreaRows)),
    };
    document.getElementById("playAreaColsToolbar").appendChild(playAreaToolbar.cols.label);
    document.getElementById("playAreaRowsToolbar").appendChild(playAreaToolbar.rows.label);
}
/** @param {import("../state.js").TileLabGameState} state */
export function commitPlayAreaFromToolbar(state) {
    const { playConfig } = state.editor;
    playConfig.playAreaCols = PLAY_AREA_CELL_OPTIONS[Number(playAreaToolbar.cols.input.value)];
    playConfig.playAreaRows = PLAY_AREA_CELL_OPTIONS[Number(playAreaToolbar.rows.input.value)];
    applyPlayAreaConfig(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function syncPlayAreaToolbarUi(state) {
    if (!playAreaToolbar) return;
    const { playConfig } = state.editor;
    playAreaToolbar.cols.input.value = String(playAreaCellsToIndex(playConfig.playAreaCols));
    playAreaToolbar.rows.input.value = String(playAreaCellsToIndex(playConfig.playAreaRows));
    playAreaToolbar.cols.value.textContent = String(playConfig.playAreaCols);
    playAreaToolbar.rows.value.textContent = String(playConfig.playAreaRows);
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
