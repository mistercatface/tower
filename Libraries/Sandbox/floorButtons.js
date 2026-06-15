import { createAabb } from "../Math/Aabb2D.js";
import { processFloorShapes, syncFloorPropCollisionShape, syncFloorTriggerAabb } from "../Spatial/zones/floorShapes.js";
import { buttonEffectiveActive, isButtonActive, isButtonEntity, isMassButtonInputMode, isMassOverThreshold, isSustainedFlipperButtonInputMode, isToggleInputMode } from "./buttonInput.js";
import { runButtonTapLinks, syncButtonFlipperLinks, syncSandboxButtonPower, tickButtonSpawnerLinks } from "./floorEffects.js";
import { syncForcefieldButtonPower } from "./forcefieldPower.js";
const POINTER_HIT_PADDING = 4;
export function initFloorButtonProp(prop) {
    prop._occupants = new Set();
    prop._nextOccupants = new Set();
    prop.buttonLinks = prop.strategy.buttonLinks.map((link) => ({ ...link }));
    prop.inputMode = prop.strategy.inputMode;
    prop.massThreshold = prop.strategy.massThreshold;
    prop.invert = prop.strategy.invert === true;
    prop._toggleLatched = false;
    prop.aabb = createAabb();
    syncFloorPropCollisionShape(prop);
    syncFloorTriggerAabb(prop);
}
/** @param {object} state @param {number} wx @param {number} wy @param {number} [padding] */
export function hitTestFloorButton(state, wx, wy, padding = POINTER_HIT_PADDING) {
    /** @type {object | null} */
    let hit = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !isButtonEntity(prop)) return;
        if (Math.hypot(wx - prop.x, wy - prop.y) <= prop.radius + padding) hit = prop;
    });
    return hit;
}
/** @param {object} state @param {object} button @param {{ x: number, y: number }} world */
export function handleButtonPointerDown(state, button, world) {
    if (!isButtonEntity(button) || isMassButtonInputMode(button.inputMode)) return false;
    if (button.inputMode === "toggle") {
        button._toggleLatched = !button._toggleLatched;
        return true;
    }
    button._pointerHeld = true;
    if (button.inputMode === "tap" && button.invert) return true;
    runButtonTapLinks(state, button, { world });
    return true;
}
/** @param {object} state */
export function releaseButtonPointerHold(state) {
    state.entityRegistry.forEachOfKind("worldProp", (button) => {
        if (!isButtonEntity(button) || isMassButtonInputMode(button.inputMode) || button.inputMode === "toggle") return;
        if (button.inputMode === "tap" && button.invert) runButtonTapLinks(state, button);
        button._pointerHeld = false;
    });
}
/** @param {object} state @param {object} button */
function tickFloorButton(state, button) {
    if (button.inputMode === "massToggle") {
        const massActive = isMassOverThreshold(state, button);
        const wasMassActive = button._massWasActive ?? false;
        if (massActive && !wasMassActive) button._toggleLatched = !button._toggleLatched;
        button._massWasActive = massActive;
    }
    if (isSustainedFlipperButtonInputMode(button.inputMode)) syncButtonFlipperLinks(state, button);
    tickButtonSpawnerLinks(state, button);
    if (isToggleInputMode(button.inputMode)) {
        button._buttonDrawPressed = isButtonActive(state, button);
        return;
    }
    const active = isButtonActive(state, button);
    const wasActive = button._buttonWasActive ?? false;
    if (button.inputMode === "massTap" && active && !wasActive) runButtonTapLinks(state, button);
    button._buttonWasActive = active;
    button._buttonDrawPressed = active;
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame */
export function tickFloorButtons(state, spatialFrame) {
    /** @type {object[]} */
    const massButtons = [];
    /** @type {object[]} */
    const buttons = [];
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !isButtonEntity(prop)) return;
        buttons.push(prop);
        if (isMassButtonInputMode(prop.inputMode)) massButtons.push(prop);
    });
    if (!buttons.length) {
        syncSandboxButtonPower(state);
        syncForcefieldButtonPower(state);
        return;
    }
    if (massButtons.length) processFloorShapes(spatialFrame, massButtons, { onEnter() {}, onExit() {} });
    for (let i = 0; i < buttons.length; i++) tickFloorButton(state, buttons[i]);
    syncSandboxButtonPower(state);
    syncForcefieldButtonPower(state);
}
