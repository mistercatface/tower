import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";

/** Resolve the alive agent head id for any clicked chain segment or leader prop. */
export function resolveAliveAgentHeadId(state, propId) {
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return null;
    const { registry } = snakeGame;
    if (registry.aliveByHeadId.has(propId)) return propId;
    const memberIds = getConnectedBodyIds(state.kinetic, propId);
    for (let i = 0; i < memberIds.length; i++) {
        const id = memberIds[i];
        if (registry.aliveByHeadId.has(id)) return id;
    }
    return null;
}
