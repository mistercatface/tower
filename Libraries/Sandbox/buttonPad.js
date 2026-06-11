import { massFromBody } from "../Motion/bodyMass.js";
/** @typedef {"tap" | "hold" | "massTap" | "massHold"} ButtonInputMode */
export const BUTTON_INPUT_MODES = /** @type {const} */ (["tap", "hold", "massTap", "massHold"]);
export const DEFAULT_BUTTON_INPUT_MODE = /** @type {ButtonInputMode} */ ("tap");
export const DEFAULT_BUTTON_MASS_THRESHOLD = 0;
/** @param {string | undefined} inputMode */
export function normalizeButtonInputMode(inputMode) {
    if (inputMode === "mass") return "massTap";
    return BUTTON_INPUT_MODES.includes(inputMode) ? inputMode : DEFAULT_BUTTON_INPUT_MODE;
}
/** @param {string | undefined} inputMode */
export function isMassButtonInputMode(inputMode) {
    return inputMode === "massTap" || inputMode === "massHold" || inputMode === "mass";
}
/** @param {object} state @param {object} pad */
export function buttonPadMass(state, pad) {
    let total = 0;
    for (const entityId of pad._occupants) {
        const pickup = state.pickups.find((entry) => entry.id === entityId);
        if (!pickup || pickup.isDead) continue;
        total += massFromBody(pickup);
    }
    return total;
}
/** @param {object} state @param {object} pad */
function isButtonPadMassActive(state, pad) {
    return buttonPadMass(state, pad) > (pad.massThreshold ?? DEFAULT_BUTTON_MASS_THRESHOLD);
}
/** @param {object} state @param {object} pad */
export function isButtonPadActive(state, pad) {
    if (isMassButtonInputMode(pad.inputMode)) return isButtonPadMassActive(state, pad);
    return Boolean(pad._pointerHeld);
}
