import { massFromBody } from "../Physics/physicsSlabs.js";
/** @typedef {"tap" | "hold" | "toggle" | "massTap" | "massHold" | "massToggle"} ButtonInputMode */
export const DEFAULT_BUTTON_INPUT_MODE = /** @type {ButtonInputMode} */ ("tap");
export const DEFAULT_BUTTON_MASS_THRESHOLD = 0;
/** @param {object | null | undefined} entity */
export function isButtonEntity(entity) {
    return entity?.buttonLinks != null;
}
/** @param {ButtonInputMode} inputMode */
export function isMassButtonInputMode(inputMode) {
    return inputMode === "massTap" || inputMode === "massHold" || inputMode === "massToggle";
}
/** @param {ButtonInputMode} inputMode */
export function isToggleInputMode(inputMode) {
    return inputMode === "toggle" || inputMode === "massToggle";
}
/** @param {ButtonInputMode} inputMode */
export function isSustainedSpawnerButtonInputMode(inputMode) {
    return inputMode === "hold" || inputMode === "massHold";
}
/** @param {ButtonInputMode} inputMode */
export function isSustainedFlipperButtonInputMode(inputMode) {
    return inputMode === "hold" || inputMode === "massHold" || isToggleInputMode(inputMode);
}
/** @param {object} state @param {object} button */
export function buttonOccupantMass(state, button) {
    let total = 0;
    for (const entityId of button._occupants) {
        const prop = state.entityRegistry.get(entityId);
        if (!prop || prop.isDead) continue;
        total += massFromBody(prop);
    }
    return total;
}
/** @param {object} state @param {object} button */
export function isMassOverThreshold(state, button) {
    return buttonOccupantMass(state, button) > button.massThreshold;
}
/** @param {object} state @param {object} button */
export function isButtonActive(state, button) {
    if (isToggleInputMode(button.inputMode)) return Boolean(button._toggleLatched);
    if (isMassButtonInputMode(button.inputMode)) return isMassOverThreshold(state, button);
    return Boolean(button._pointerHeld);
}
/** @param {object} state @param {object} button */
export function buttonEffectiveActive(state, button) {
    const active = isButtonActive(state, button);
    return button.invert ? !active : active;
}
