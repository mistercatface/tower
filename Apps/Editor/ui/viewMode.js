import { paintMapOverviewFrame } from "./mapOverview.js";
/** @param {string} panelId @param {boolean} visible */
function setEditorPanelVisible(panelId, visible) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle("is-visible", visible);
    panel.hidden = !visible;
}
/** @param {boolean} visible */
function setAnimationPreviewVisible(visible) {
    const stage = document.getElementById("animationStage");
    stage.classList.toggle("is-visible", visible);
    stage.hidden = !visible;
}
/** @param {boolean} visible */
function setMapOverviewVisible(visible) {
    const stage = document.getElementById("mapOverviewStage");
    stage.classList.toggle("is-visible", visible);
    stage.hidden = !visible;
}
/** @param {import("../state.js").TileLabGameState} state */
export function applyLabViewChrome(state) {
    setEditorPanelVisible("sandboxPanel", state.editor.showSandboxPanel);
    setEditorPanelVisible("surfaceEditorPanel", state.editor.showProfilePanel);
    setEditorPanelVisible("mapPanel", state.editor.showMapPanel);
    setAnimationPreviewVisible(state.editor.showAnimationPreview);
    setMapOverviewVisible(state.editor.showMapOverview);
    const editor = document.querySelector(".col-editor");
    const active = [];
    if (state.editor.showSandboxPanel) active.push("sandbox");
    if (state.editor.showProfilePanel) active.push("profile");
    if (state.editor.showMapPanel) active.push("map");
    editor.dataset.activePanels = active.join(" ");
    document.getElementById("showSandboxPanelInput").checked = state.editor.showSandboxPanel;
    document.getElementById("showProfilePanelInput").checked = state.editor.showProfilePanel;
    document.getElementById("showMapPanelInput").checked = state.editor.showMapPanel;
    document.getElementById("showAnimationPreviewInput").checked = state.editor.showAnimationPreview;
    document.getElementById("showMapOverviewInput").checked = state.editor.showMapOverview;
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onChange @param {(() => void) | null} [onLayoutChange] */
export function bindViewModeControls(state, onChange, onLayoutChange = null) {
    document.getElementById("showSandboxPanelInput").addEventListener("change", (e) => {
        state.editor.showSandboxPanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showProfilePanelInput").addEventListener("change", (e) => {
        state.editor.showProfilePanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showMapPanelInput").addEventListener("change", (e) => {
        state.editor.showMapPanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showAnimationPreviewInput").addEventListener("change", (e) => {
        state.editor.showAnimationPreview = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onLayoutChange?.();
    });
    document.getElementById("showMapOverviewInput").addEventListener("change", (e) => {
        state.editor.showMapOverview = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onLayoutChange?.();
        if (state.editor.showMapOverview) paintMapOverviewFrame(state);
    });
    applyLabViewChrome(state);
}
