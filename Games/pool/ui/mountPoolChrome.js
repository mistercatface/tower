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
</div>
<div id="bottomArea">
    <div id="controlsBar">
        <button id="pauseBtn" class="control-btn control-btn-large" type="button">
            <span id="pauseText">PAUSE</span>
        </button>
    </div>
</div>`;
/** Inject pool-only DOM into the shell (not loaded for tower). */
export function mountPoolChrome() {
    const uiRoot = getUiRoot();
    if (!uiRoot) throw new Error("mountPoolChrome: #ui-root missing");
    uiRoot.innerHTML = POOL_UI_HTML;
    const poolHud = document.getElementById("poolHud");
    if (poolHud) poolHud.style.display = "flex";
}
