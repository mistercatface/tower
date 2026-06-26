import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
export function resolveAliveAgentInstanceFromProp(state, propId) {
    const snakeGame = state.sandbox.snakeGame;
    const direct = snakeGame.instancesByHeadId.get(propId);
    if (direct?.lifecycle === "alive") return direct;
    const memberIds = getConnectedBodyIds(state.kinetic, propId);
    for (let i = 0; i < memberIds.length; i++) {
        const instance = snakeGame.instancesByHeadId.get(memberIds[i]);
        if (instance?.lifecycle === "alive") return instance;
    }
    return null;
}
