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
/** @param {import("../state.js").TileLabGameState} state */
export function applyLabViewChrome(state) {
    setEditorPanelVisible("sandboxPanel", state.labShowSandboxPanel);
    setEditorPanelVisible("surfaceEditorPanel", state.labShowProfilePanel);
    setEditorPanelVisible("topologyEditorPanel", state.labShowTopologyOverlay);
    setAnimationPreviewVisible(state.labShowAnimationPreview);
    const editor = document.querySelector(".col-editor");
    const active = [];
    if (state.labShowSandboxPanel) active.push("sandbox");
    if (state.labShowProfilePanel) active.push("profile");
    if (state.labShowTopologyOverlay) active.push("map");
    editor.dataset.activePanels = active.join(" ");
    document.getElementById("mapStatusLine").style.display = state.labShowTopologyOverlay ? "block" : "none";
    document.getElementById("showSandboxPanelInput").checked = state.labShowSandboxPanel;
    document.getElementById("showProfilePanelInput").checked = state.labShowProfilePanel;
    document.getElementById("showTopologyOverlayInput").checked = state.labShowTopologyOverlay;
    document.getElementById("showAnimationPreviewInput").checked = state.labShowAnimationPreview;
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onChange @param {(() => void) | null} [onLayoutChange] */
export function bindViewModeControls(state, onChange, onLayoutChange = null) {
    document.getElementById("showSandboxPanelInput").addEventListener("change", (e) => {
        state.labShowSandboxPanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showProfilePanelInput").addEventListener("change", (e) => {
        state.labShowProfilePanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showTopologyOverlayInput").addEventListener("change", (e) => {
        state.labShowTopologyOverlay = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onChange();
    });
    document.getElementById("showAnimationPreviewInput").addEventListener("change", (e) => {
        state.labShowAnimationPreview = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onLayoutChange?.();
    });
    applyLabViewChrome(state);
}
