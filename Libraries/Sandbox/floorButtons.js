import { createAabb } from "../Math/math.js";
import { visitLiveWorldProps } from "../../GameState/EntityRegistry.js";
import { syncFloorTriggerAabb } from "../Props/props.js";
import { processFloorShapes, syncFloorPropCollisionShape } from "../Spatial/spatial.js";;
import { isButtonActive, isButtonEntity, isMassButtonInputMode, isMassOverThreshold, isSustainedFlipperButtonInputMode, isToggleInputMode } from "./buttonInput.js";
import { runButtonTapLinks, syncButtonFlipperLinks, tickButtonSpawnerLinks } from "./floorEffects.js";
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
export function hitTestFloorButton(state, wx, wy, padding = POINTER_HIT_PADDING) {
    let hit = null;
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (!isButtonEntity(prop)) return;
        if (Math.hypot(wx - prop.x, wy - prop.y) <= prop.radius + padding) hit = prop;
    });
    return hit;
}
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
export function releaseButtonPointerHold(state) {
    visitLiveWorldProps(state.worldProps, (button) => {
        if (!isButtonEntity(button) || isMassButtonInputMode(button.inputMode) || button.inputMode === "toggle") return;
        if (button.inputMode === "tap" && button.invert) runButtonTapLinks(state, button);
        button._pointerHeld = false;
    });
}
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
export function tickFloorButtons(state, spatialFrame) {
    const massButtons = [];
    const buttons = [];
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead || !isButtonEntity(prop)) continue;
        buttons.push(prop);
        if (isMassButtonInputMode(prop.inputMode)) massButtons.push(prop);
    }
    if (!buttons.length) return;
    if (massButtons.length) processFloorShapes(spatialFrame, massButtons, { onEnter() {}, onExit() {} });
    for (let i = 0; i < buttons.length; i++) tickFloorButton(state, buttons[i]);
}
