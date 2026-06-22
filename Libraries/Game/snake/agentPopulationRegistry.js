import { resolveAgentRelationship } from "./snakeAgentSession.js";
export function getAgentRelationship(seekerId, targetId, state, registry) {
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return "neutral";
    return resolveAgentRelationship(snakeGame, seekerId, targetId, state);
}
