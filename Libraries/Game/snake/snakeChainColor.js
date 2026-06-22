import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getPropVisualTint, randomVisualTintHex, setPropVisualTint } from "../../Color/visualOverride.js";
import { hueToPickerHex } from "../../Color/hex.js";
export const SNAKE_INTENT_MODE_TINT = { explore: "#2d9cff", seek_food: "#2ecc71", seek_prey: "#ff3b30", seek_ally: "#c084fc", flee: "#ffd23f" };
/** Condition tints for an exploring snake: well-fed reads purple, hungry reads orange. */
export const SNAKE_SATISFIED_EXPLORE_TINT = "#a855f7";
export const SNAKE_HUNGRY_EXPLORE_TINT = "#ff8c00";
export function resolveSnakeChainTintHex(mode, hungerState = null) {
    if (mode === "explore" && hungerState) {
        if (hungerState.satisfied) return SNAKE_SATISFIED_EXPLORE_TINT;
        return SNAKE_HUNGRY_EXPLORE_TINT;
    }
    return SNAKE_INTENT_MODE_TINT[mode];
}
export function applySnakeChainTint(members, tintHex) {
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function tintSnakeChain(state, headId, tintHex) {
    const memberIds = getConnectedBodyIds(state.kinetic, headId);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.getLive(memberIds[i]);
        if (prop && !prop.isDead) setPropVisualTint(prop, tintHex);
    }
}
export function copySnakeChainTintFromHead(state, headId, prop) {
    const head = state.entityRegistry.getLive(headId);
    const tint = getPropVisualTint(head);
    if (tint != null) setPropVisualTint(prop, tint);
}
export function pickSnakeChainTintHex(faction = null, rng = Math.random) {
    let resolvedFaction = faction;
    let resolvedRng = rng;
    if (typeof faction === "function") {
        resolvedRng = faction;
        resolvedFaction = null;
    }
    if (resolvedFaction === "red") {
        const hue = (350 + resolvedRng() * 30) % 360;
        const sat = 70 + resolvedRng() * 15;
        const light = 45 + resolvedRng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    if (resolvedFaction === "blue") {
        const hue = 205 + resolvedRng() * 40;
        const sat = 70 + resolvedRng() * 15;
        const light = 45 + resolvedRng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    return randomVisualTintHex(resolvedRng);
}
