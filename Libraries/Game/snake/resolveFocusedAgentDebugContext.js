import { getSnakeInstance } from "./SnakeInstance.js";
function intentTargetFromAutosim(autosim) {
    if (!autosim) return null;
    return { mode: autosim.getMode?.() ?? null, targetId: autosim.getTargetId?.() ?? null, destination: autosim.getDestination?.() ?? null };
}
function buildFocusedAgentDebugContext(headId, head, species, getBrain, getPathOverlay, getIntentTarget) {
    return { headId, head, species, getBrain, getPathOverlay, getIntentTarget };
}
/** @param {object} state @param {number | null} focusedHeadId */
export function resolveFocusedAgentDebugContext(state, focusedHeadId) {
    if (focusedHeadId == null) return null;
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return null;
    const head = state.entityRegistry.getLive(focusedHeadId);
    if (!head || head.isDead) return null;
    const meta = snakeGame.registry.aliveByHeadId.get(focusedHeadId);
    const instance = snakeGame.instancesByHeadId.get(focusedHeadId);
    const autosim = instance?.autosim ?? snakeGame.autosimsByHeadId.get(focusedHeadId);
    if (autosim && typeof autosim.getBrain === "function")
        return buildFocusedAgentDebugContext(
            focusedHeadId,
            head,
            meta?.species ?? "snake",
            () => autosim.getBrain(),
            () => autosim.getPathOverlay?.() ?? null,
            () => intentTargetFromAutosim(autosim),
        );
    const snake = getSnakeInstance(snakeGame, focusedHeadId);
    if (snake?.autosim && typeof snake.autosim.getBrain === "function")
        return buildFocusedAgentDebugContext(
            focusedHeadId,
            head,
            meta?.species ?? "snake",
            () => snake.autosim.getBrain(),
            () => snake.autosim.getPathOverlay?.() ?? null,
            () => intentTargetFromAutosim(snake.autosim),
        );
    return null;
}
