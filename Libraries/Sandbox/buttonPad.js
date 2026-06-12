import { massFromBody } from "../Motion/bodyMass.js";
/** @typedef {"tap" | "hold" | "toggle" | "massTap" | "massHold" | "massToggle"} ButtonInputMode */
export const DEFAULT_BUTTON_INPUT_MODE = /** @type {ButtonInputMode} */ ("tap");
export const DEFAULT_BUTTON_MASS_THRESHOLD = 0;
/** @param {ButtonInputMode} inputMode */
export function isMassButtonInputMode(inputMode) {
    return inputMode === "massTap" || inputMode === "massHold" || inputMode === "massToggle";
}
/** @param {ButtonInputMode} inputMode */
export function isToggleInputMode(inputMode) {
    return inputMode === "toggle" || inputMode === "massToggle";
}
/** @param {ButtonInputMode} inputMode */
export function isSustainedFlipperButtonInputMode(inputMode) {
    return inputMode === "hold" || inputMode === "massHold" || isToggleInputMode(inputMode);
}
/** @param {object} state @param {object} pad */
export function buttonPadMass(state, pad) {
    let total = 0;
    for (const entityId of pad._occupants) {
        const prop = state.entityRegistry.get(entityId);
        if (!prop || prop.isDead) continue;
        total += massFromBody(prop);
    }
    return total;
}
/** @param {object} state @param {object} pad */
export function isButtonPadActive(state, pad) {
    if (isToggleInputMode(pad.inputMode)) return Boolean(pad._toggleLatched);
    if (isMassButtonInputMode(pad.inputMode)) return buttonPadMass(state, pad) > pad.massThreshold;
    return Boolean(pad._pointerHeld);
}
/** @param {object} state @param {object} pad */
export function buttonEffectiveActive(state, pad) {
    const active = isButtonPadActive(state, pad);
    return pad.invert ? !active : active;
}
