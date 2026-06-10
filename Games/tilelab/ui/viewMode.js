/** @param {string} panelId @param {boolean} visible */
function setEditorPanelVisible(panelId, visible) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.toggle("is-visible", visible);
    panel.hidden = !visible;
}
/** @param {boolean} visible */
function setAnimationPreviewVisible(visible) {
    const stage = document.getElementById("animationStage");
    if (!stage) return;
    stage.classList.toggle("is-visible", visible);
    stage.hidden = !visible;
}
/** @param {import("../index.js").TileLabGameState} state */
export function applyLabViewChrome(state) {
    setEditorPanelVisible("sandboxPanel", state.labShowSandboxPanel);
    setEditorPanelVisible("surfaceEditorPanel", state.labShowProfilePanel);
    setEditorPanelVisible("topologyEditorPanel", state.labShowTopologyOverlay);
    setAnimationPreviewVisible(state.labShowAnimationPreview);
    const editor = document.querySelector(".col-editor");
    if (editor) {
        const active = [];
        if (state.labShowSandboxPanel) active.push("sandbox");
        if (state.labShowProfilePanel) active.push("profile");
        if (state.labShowTopologyOverlay) active.push("map");
        editor.dataset.activePanels = active.join(" ");
    }
    const mapStatus = document.getElementById("mapStatusLine");
    if (mapStatus) mapStatus.style.display = state.labShowTopologyOverlay ? "block" : "none";
    const sandboxToggle = document.getElementById("showSandboxPanelInput");
    if (sandboxToggle) sandboxToggle.checked = state.labShowSandboxPanel;
    const profileToggle = document.getElementById("showProfilePanelInput");
    if (profileToggle) profileToggle.checked = state.labShowProfilePanel;
    const topologyToggle = document.getElementById("showTopologyOverlayInput");
    if (topologyToggle) topologyToggle.checked = state.labShowTopologyOverlay;
    const animationToggle = document.getElementById("showAnimationPreviewInput");
    if (animationToggle) animationToggle.checked = state.labShowAnimationPreview;
}
/** @param {import("../index.js").TileLabGameState} state @param {() => void} onChange @param {(() => void) | null} [onLayoutChange] */
export function bindViewModeControls(state, onChange, onLayoutChange = null) {
    document.getElementById("showSandboxPanelInput")?.addEventListener("change", (e) => {
        state.labShowSandboxPanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showProfilePanelInput")?.addEventListener("change", (e) => {
        state.labShowProfilePanel = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
    });
    document.getElementById("showTopologyOverlayInput")?.addEventListener("change", (e) => {
        state.labShowTopologyOverlay = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onChange();
    });
    document.getElementById("showAnimationPreviewInput")?.addEventListener("change", (e) => {
        state.labShowAnimationPreview = /** @type {HTMLInputElement} */ (e.target).checked;
        applyLabViewChrome(state);
        onLayoutChange?.();
    });
    applyLabViewChrome(state);
}
