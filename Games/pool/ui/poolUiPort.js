import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
import { getUiProfile } from "../../../Core/GameUiProfile.js";
import { applyChromeProfile } from "../../../UI/Core/shellChrome.js";
import { wireShellControls } from "../../../UI/Core/wireShellControls.js";
import { mountSpeedControl, syncSpeedControlDisplay, wireSpeedControl } from "../../../Libraries/Playback/index.js";
import { ensurePoolState } from "../balls.js";
import { getPoolStatusMessage } from "../poolHud.js";
import { getPoolSpeedOverlayHost, mountPoolChrome } from "./mountPoolChrome.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */
/** @typedef {import("../../../Libraries/Playback/speedControlUi.js").SpeedControlElements} SpeedControlElements */
/** @type {{ status: HTMLElement | null, ballsLeft: HTMLElement | null }} */
const poolHud = { status: null, ballsLeft: null };
/** @type {SpeedControlElements | null} */
let poolSpeedControl = null;
function bindPoolHudElements() {
    poolHud.status = document.getElementById("poolHudStatus");
    poolHud.ballsLeft = document.getElementById("poolHudBallsLeft");
}
function mountPoolSpeedControl() {
    const host = getPoolSpeedOverlayHost();
    if (!host || poolSpeedControl) return;
    poolSpeedControl = mountSpeedControl(host, { buttonClass: "control-btn", pauseButtonClass: "control-btn control-btn-large" });
    wireSpeedControl(poolSpeedControl, getActiveGameDefinition());
}
/** @param {object} state */
function updatePoolHud(state) {
    if (!poolHud.status) return;
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
/** @param {object} state */
function updatePoolSpeedControl(state) {
    if (!poolSpeedControl) return;
    syncSpeedControlDisplay(poolSpeedControl, state, getActiveGameDefinition());
}
/** @type {UiPort} */
export const poolUiPort = {
    mount(ctx) {
        mountPoolChrome();
        bindPoolHudElements();
        mountPoolSpeedControl();
        applyChromeProfile(getUiProfile());
        wireShellControls(ctx.state);
        updatePoolHud(ctx.state);
        updatePoolSpeedControl(ctx.state);
    },
    updateUI(ctx) {
        updatePoolHud(ctx.state);
        updatePoolSpeedControl(ctx.state);
    },
    updateHud(ctx) {
        updatePoolHud(ctx.state);
        updatePoolSpeedControl(ctx.state);
    },
};
