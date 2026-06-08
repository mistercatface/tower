import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
import { applySpeedControl } from "../../../Libraries/Playback/index.js";
import { ensurePoolState } from "../balls.js";
import { getPoolStatusMessage } from "../poolHud.js";
import { getUiRoot } from "../../../UI/Core/uiRoot.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */
const POOL_UI_HTML = `
<div id="poolHud" class="pool-hud">
    <div id="poolHudStatus" class="pool-hud-status"></div>
    <div id="poolHudBallsLeft" class="pool-hud-balls-left"></div>
</div>
<div id="poolSpeedOverlay" class="pool-speed-overlay"></div>`;
/** @type {{ status: HTMLElement | null, ballsLeft: HTMLElement | null }} */
const poolHud = { status: null, ballsLeft: null };
/** @type {import("../../../Libraries/Playback/speedControl.js").SpeedControlHandle | null} */
let poolSpeedControl = null;
function mountPoolChrome() {
    const uiRoot = getUiRoot();
    if (!uiRoot) throw new Error("mountPoolChrome: #ui-root missing");
    uiRoot.innerHTML = POOL_UI_HTML;
}
function bindPoolElements() {
    poolHud.status = document.getElementById("poolHudStatus");
    poolHud.ballsLeft = document.getElementById("poolHudBallsLeft");
    poolSpeedControl = applySpeedControl(document.getElementById("poolSpeedOverlay"), {
        inject: true,
        definition: getActiveGameDefinition(),
        classNames: { root: "speed-control chrome-control-panel", button: "control-btn", pause: "control-btn control-btn-large" },
    });
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
    poolSpeedControl?.refresh(state);
}
function unmountPoolChrome() {
    getUiRoot()?.replaceChildren();
    poolHud.status = null;
    poolHud.ballsLeft = null;
    poolSpeedControl = null;
}
/** @type {UiPort} */
export const poolUiPort = {
    mount(ctx) {
        mountPoolChrome();
        bindPoolElements();
        updatePoolHud(ctx.state);
    },
    unmount() {
        unmountPoolChrome();
    },
    updateUI(ctx) {
        updatePoolHud(ctx.state);
    },
    updateHud(ctx) {
        poolUiPort.updateUI(ctx);
    },
};
