import { releaseFlipper, triggerFlipper } from "./behaviors/flipperBehavior.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive, isSustainedFlipperButtonInputMode, isSustainedSpawnerButtonInputMode } from "./buttonInput.js";
import { fireSpawner, isSpawnerWorldProp } from "./spawnerConfig.js";
/** @typedef {{ when?: FloorTriggerWhen, effect: string, force?: number, forceX?: number, forceY?: number }} FloorTriggerDef */
/** @typedef {"enter" | "exit" | "occupied" | "empty"} FloorTriggerWhen */
/**
 * @typedef {object} FloorEffectContext
 * @property {object} [entity]
 * @property {number} [entityId]
 * @property {number} [dtSec]
 * @property {{ x: number, y: number }} [world]
 */
/** @param {object} state @param {import("./buttonLinks.js").ButtonLinkTarget} link @param {object} button */
function runButtonWorldPropLink(state, link, button) {
    const prop = state.entityRegistry.getLive(link.id);
    if (!prop || isSpawnerWorldProp(prop)) return;
    if (isSustainedFlipperButtonInputMode(button.inputMode)) return;
    if (button.invert) releaseFlipper(prop);
    else triggerFlipper(prop, { hold: false });
}
/** @param {object} state @param {object} button @param {FloorEffectContext} [ctx] */
export function runButtonTapLinks(state, button, ctx = {}) {
    const links = getButtonLinks(button);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type === "worldProp") runButtonWorldPropLink(state, link, button);
    }
}
/** @param {object} state @param {object} button */
export function tickButtonSpawnerLinks(state, button) {
    const active = buttonEffectiveActive(state, button);
    const wasActive = button._spawnerButtonWasActive ?? false;
    const sustained = isSustainedSpawnerButtonInputMode(button.inputMode);
    if (active && (sustained || !wasActive)) {
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "worldProp") continue;
            const prop = state.entityRegistry.getLive(link.id);
            if (!prop || !isSpawnerWorldProp(prop)) continue;
            fireSpawner(state, prop);
        }
    }
    button._spawnerButtonWasActive = active;
}
/** @param {object} state @param {object} button */
export function syncButtonFlipperLinks(state, button) {
    const active = buttonEffectiveActive(state, button);
    const links = getButtonLinks(button);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type !== "worldProp") continue;
        const prop = state.entityRegistry.getLive(link.id);
        if (!prop || isSpawnerWorldProp(prop)) continue;
        if (active) triggerFlipper(prop);
        else releaseFlipper(prop);
    }
}
/** @type {Record<string, { run: (state: object, floorProp: object, trigger: FloorTriggerDef, ctx: FloorEffectContext) => void }>} */
const FLOOR_EFFECTS = {};
/** @param {object} state @param {object} floorProp @param {FloorTriggerDef} trigger @param {FloorEffectContext} ctx */
export function runFloorEffect(state, floorProp, trigger, ctx) {
    const effect = FLOOR_EFFECTS[trigger.effect];
    if (!effect) throw new Error(`Unknown floor effect "${trigger.effect}"`);
    effect.run(state, floorProp, trigger, ctx);
}
