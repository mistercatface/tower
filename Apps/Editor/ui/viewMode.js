import { paintMapOverviewFrame } from "./mapOverview.js";
/** @param {string} panelId @param {boolean} visible */
function setEditorPanelVisible(panelId, visible) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle("is-visible", visible);
    panel.hidden = !visible;
}
/** @param {boolean} visible */
function setMapOverviewVisible(visible) {
    const stage = document.getElementById("mapOverviewStage");
    stage.classList.toggle("is-visible", visible);
    stage.hidden = !visible;
}
/** @param {import("../state.js").TileLabGameState} state */
export function applyLabViewChrome(state) {
    const panel = state.editor.sidebarPanel;
    setEditorPanelVisible("sandboxPanel", panel === "sandbox");
    setEditorPanelVisible("surfaceEditorPanel", panel === "profile");
    setEditorPanelVisible("jsonPanel", panel === "json");
    setMapOverviewVisible(state.editor.showMapOverview);
    const editor = document.querySelector(".col-editor");
    editor.dataset.activePanels = panel;
    const activeInput = document.querySelector(`input[name="editorSidebarPanel"][value="${panel}"]`);
    if (activeInput) /** @type {HTMLInputElement} */ (activeInput).checked = true;
    document.getElementById("showMapOverviewInput").checked = state.editor.showMapOverview;
    document.getElementById("showSelectionRingsInput").checked = state.editor.showSelectionRings;
    document.getElementById("showPropTileCellsInput").checked = state.editor.showPropTileCells;
    document.getElementById("showRoomNodesAlwaysInput").checked = state.editor.showRoomNodesAlways;
    document.getElementById("debugInspectInput").checked = state.editor.debugInspect;
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onChange @param {(() => void) | null} [onLayoutChange] */
export function bindViewModeControls(state, onChange, onLayoutChange = null) {
    for (const input of document.querySelectorAll('input[name="editorSidebarPanel"]'))
        input.addEventListener("change", (e) => {
            if (!(/** @type {HTMLInputElement} */ (e.target).checked)) return;
            state.editor.sidebarPanel = /** @type {HTMLInputElement} */ (e.target).value;
            applyLabViewChrome(state);
        });
    document.getElementById("showMapOverviewInput").addEventListener("change", (e) => {
        state.editor.showMapOverview = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onLayoutChange?.();
        if (state.editor.showMapOverview) paintMapOverviewFrame(state);
    });
    document.getElementById("showSelectionRingsInput").addEventListener("change", (e) => {
        state.editor.showSelectionRings = /** @type {HTMLInputElement} */ (e.target).checked;
    });
    document.getElementById("showPropTileCellsInput").addEventListener("change", (e) => {
        state.editor.showPropTileCells = /** @type {HTMLInputElement} */ (e.target).checked;
    });
    document.getElementById("showRoomNodesAlwaysInput").addEventListener("change", (e) => {
        state.editor.showRoomNodesAlways = /** @type {HTMLInputElement} */ (e.target).checked;
    });
    document.getElementById("debugInspectInput").addEventListener("change", (e) => {
        state.editor.debugInspect = /** @type {HTMLInputElement} */ (e.target).checked;
        onChange();
    });
    applyLabViewChrome(state);
}
