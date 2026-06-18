import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { randomPropTintHue, setPropTint } from "../../Props/propTint.js";

export function applySnakeChainTint(members, hue) {
    for (let i = 0; i < members.length; i++) setPropTint(members[i], hue);
}

export function tintSnakeChain(state, headId, hue) {
    const memberIds = getChainMemberIds(state, headId);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.getLive(memberIds[i]);
        if (prop && !prop.isDead) setPropTint(prop, hue);
    }
}

export function copySnakeChainTintFromHead(state, headId, prop) {
    const head = state.entityRegistry.getLive(headId);
    if (head?.propTint != null) setPropTint(prop, head.propTint);
}

export function pickSnakeChainTintHue(rng = Math.random) {
    return randomPropTintHue(rng);
}
