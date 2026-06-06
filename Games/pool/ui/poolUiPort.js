import { getUiProfile } from "../../../Core/GameUiProfile.js";
import { getShellElements } from "../../../UI/Core/shellElements.js";
import { wireShellControls } from "../../../UI/Core/wireShellControls.js";

/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */

function updateControls(state) {
    const chrome = getUiProfile().chrome;
    const elements = getShellElements();
    if (chrome.controls === "none") return;
    if (elements.pauseText) elements.pauseText.innerText = state.isPaused ? "PLAY" : "PAUSE";
}

/** @type {UiPort} */
export const poolUiPort = {
    mount(ctx) {
        wireShellControls(ctx.state);
        updateControls(ctx.state);
    },
    updateUI(ctx) {
        updateControls(ctx.state);
    },
    updateHud() {},
};
