import { getCirclePropRadius } from "../../../Props/propScale.js";

export function getSquidChainRadius(state, brainId) {
    const brain = state.entityRegistry.getLive(brainId);
    return getCirclePropRadius(brain);
}
