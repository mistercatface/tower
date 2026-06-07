import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
import { bindSpeedControl, syncSpeedControlDisplay, wireSpeedControl } from "../../../Libraries/Playback/index.js";
import { ensurePoolState } from "../balls.js";
import { getPoolStatusMessage } from "../poolHud.js";
import { mountPoolChrome } from "./mountPoolChrome.js";
import { setUiRegionVisible } from "../../../UI/Core/shellChrome.js";
import { wireSettingsModal } from "../../../UI/Core/wireSettingsModal.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */
/** @typedef {import("../../../Libraries/Playback/speedControlUi.js").SpeedControlElements} SpeedControlElements */
/** @type {{ status: HTMLElement | null, ballsLeft: HTMLElement | null }} */
const poolHud = { status: null, ballsLeft: null };
/** @type {SpeedControlElements | null} */
let poolSpeedControl = null;
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
        updatePoolHud(ctx.state);
    },
};
