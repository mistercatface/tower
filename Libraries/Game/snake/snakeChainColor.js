import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getPropVisualTint, randomVisualTintHex, setPropVisualTint } from "../../Color/visualOverride.js";
export function applySnakeChainTint(members, tintHex) {
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function tintSnakeChain(state, headId, tintHex) {
    const memberIds = getConnectedBodyIds(state.sandbox, headId);
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
