import { getUiRoot } from "../../../UI/Core/uiRoot.js";
const POOL_UI_HTML = `
<div id="poolHud" class="pool-hud">
    <div id="poolHudStatus" class="pool-hud-status"></div>
    <div id="poolHudBallsLeft" class="pool-hud-balls-left"></div>
</div>
<div id="topUI">
    <div class="top-right-controls pool-top-controls">
        <button id="settingsBtn" class="settings-gear-btn" type="button" title="Settings" data-ui-region="settings">⚙️</button>
    </div>
</div>`;
/** @returns {HTMLElement | null} Bottom-right overlay host for speed controls. */
export function getPoolSpeedOverlayHost() {
    return document.getElementById("poolSpeedOverlay");
}
/** Inject pool-only DOM into the shell (not loaded for tower). */
export function mountPoolChrome() {
    const uiRoot = getUiRoot();
    if (!uiRoot) throw new Error("mountPoolChrome: #ui-root missing");
    uiRoot.innerHTML = POOL_UI_HTML;
    const poolHud = document.getElementById("poolHud");
    if (poolHud) poolHud.style.display = "flex";
    const wrapper = document.getElementById("gameWrapper");
    if (wrapper && !getPoolSpeedOverlayHost()) {
        const overlay = document.createElement("div");
        overlay.id = "poolSpeedOverlay";
        overlay.className = "pool-speed-overlay";
        wrapper.appendChild(overlay);
    }
}
