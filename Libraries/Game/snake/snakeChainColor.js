import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getPropVisualTint, randomVisualTintHex, setPropVisualTint } from "../../Color/visualOverride.js";
export const SNAKE_INTENT_MODE_TINT = { explore: "#2d9cff", seek_food: "#2ecc71", seek_prey: "#ff3b30", flee: "#ffd23f" };
/** Condition tint: a well-fed snake that is only exploring reads as purple. */
export const SNAKE_SATISFIED_EXPLORE_TINT = "#a855f7";
export function resolveSnakeChainTintHex(mode, satisfied = false) {
    if (mode === "explore" && satisfied) return SNAKE_SATISFIED_EXPLORE_TINT;
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
export function pickSnakeChainTintHex(rng = Math.random) {
    return randomVisualTintHex(rng);
}
