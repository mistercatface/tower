import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
import { bindSpeedControl, speedControlHtml, syncSpeedControlDisplay, wireSpeedControl } from "../../../Libraries/Playback/index.js";
import { ensurePoolState } from "../balls.js";
import { getPoolStatusMessage } from "../poolHud.js";
import { bindShellElements } from "../../../UI/Core/shellElements.js";
import { setUiRegionVisible } from "../../../UI/Core/shellChrome.js";
import { getUiRoot } from "../../../UI/Core/uiRoot.js";
import { wireSettingsModal } from "../../../UI/Core/wireSettingsModal.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */
/** @typedef {import("../../../Libraries/Playback/speedControlUi.js").SpeedControlElements} SpeedControlElements */
const POOL_SPEED_CONTROL_HTML = speedControlHtml({ rootClass: "speed-control chrome-control-panel", buttonClass: "control-btn", pauseButtonClass: "control-btn control-btn-large" });
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
<div id="poolSpeedOverlay" class="pool-speed-overlay">${POOL_SPEED_CONTROL_HTML}</div>`;
/** @type {{ status: HTMLElement | null, ballsLeft: HTMLElement | null }} */
const poolHud = { status: null, ballsLeft: null };
/** @type {SpeedControlElements | null} */
let poolSpeedControl = null;
function mountPoolChrome() {
    const uiRoot = getUiRoot();
    if (!uiRoot) throw new Error("mountPoolChrome: #ui-root missing");
    uiRoot.innerHTML = POOL_UI_HTML;
}
function bindPoolElements() {
    poolHud.status = document.getElementById("poolHudStatus");
    poolHud.ballsLeft = document.getElementById("poolHudBallsLeft");
    poolSpeedControl = bindSpeedControl(document.getElementById("poolSpeedOverlay"));
}
/** @param {object} state */
function updatePoolHud(state) {
    if (poolHud.status) {
        const pool = ensurePoolState(state);
        const status = getPoolStatusMessage(state);
        if (poolHud.status.textContent !== status) poolHud.status.textContent = status;
        if (poolHud.ballsLeft) {
            const showBalls = !pool.won && pool.objectRemaining > 0;
            const ballsText = `Object balls left: ${pool.objectRemaining}`;
            if (showBalls) {
                if (poolHud.ballsLeft.style.display !== "block") poolHud.ballsLeft.style.display = "block";
                if (poolHud.ballsLeft.textContent !== ballsText) poolHud.ballsLeft.textContent = ballsText;
            } else if (poolHud.ballsLeft.style.display !== "none") poolHud.ballsLeft.style.display = "none";
        }
    }
    if (poolSpeedControl) syncSpeedControlDisplay(poolSpeedControl, state, getActiveGameDefinition());
}
/** @type {UiPort} */
export const poolUiPort = {
    mount(ctx) {
        mountPoolChrome();
        bindShellElements();
        bindPoolElements();
        if (poolSpeedControl) wireSpeedControl(poolSpeedControl, getActiveGameDefinition());
        wireSettingsModal(ctx.state);
        setUiRegionVisible("settings", true);
        updatePoolHud(ctx.state);
    },
    updateUI(ctx) {
        updatePoolHud(ctx.state);
    },
    updateHud(ctx) {
        poolUiPort.updateUI(ctx);
    },
};
