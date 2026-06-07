import { getUiProfile } from "../../../Core/GameUiProfile.js";
import { applyChromeProfile } from "../../../UI/Core/shellChrome.js";
import { wireShellControls } from "../../../UI/Core/wireShellControls.js";
import { ensurePoolState } from "../balls.js";
import { getPoolStatusMessage } from "../poolHud.js";
import { mountPoolChrome } from "./mountPoolChrome.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */
/** @type {{ status: HTMLElement | null, ballsLeft: HTMLElement | null }} */
const poolHud = { status: null, ballsLeft: null };
function bindPoolHudElements() {
    poolHud.status = document.getElementById("poolHudStatus");
    poolHud.ballsLeft = document.getElementById("poolHudBallsLeft");
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
/** @type {UiPort} */
export const poolUiPort = {
    mount(ctx) {
        mountPoolChrome();
        bindPoolHudElements();
        applyChromeProfile(getUiProfile());
        wireShellControls(ctx.state);
        updatePoolHud(ctx.state);
    },
    updateUI(ctx) {
        updatePoolHud(ctx.state);
    },
    updateHud(ctx) {
        updatePoolHud(ctx.state);
    },
};
