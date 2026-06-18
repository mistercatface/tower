import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { randomSpherePanels, setPropSpherePanels } from "../../Props/propSpherePanels.js";
import { resolveSnakeChainColorOptions } from "./snakeGameConfig.js";

export function applySnakeChainPanels(members, panels) {
    for (let i = 0; i < members.length; i++) setPropSpherePanels(members[i], panels);
}

export function tintSnakeChain(state, headId, panels) {
    const memberIds = getChainMemberIds(state, headId);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.getLive(memberIds[i]);
        if (prop && !prop.isDead) setPropSpherePanels(prop, panels);
    }
}

export function copySnakeChainPanelsFromHead(state, headId, prop) {
    const head = state.entityRegistry.getLive(headId);
    if (head?.spherePanels) setPropSpherePanels(prop, head.spherePanels);
}

export function pickSnakeChainPanels(rng = Math.random) {
    return randomSpherePanels(rng, resolveSnakeChainColorOptions());
}
