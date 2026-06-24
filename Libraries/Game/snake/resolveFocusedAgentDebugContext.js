export function resolveFocusedAgentDebugContext(state, focusedHeadId) {
    if (focusedHeadId == null) return null;
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return null;
    const head = state.entityRegistry.getLive(focusedHeadId);
    if (!head || head.isDead) return null;
    const meta = snakeGame.registry.aliveByHeadId.get(focusedHeadId);
    const instance = snakeGame.instancesByHeadId.get(focusedHeadId);
    const autosim = instance?.autosim;
    if (!autosim || typeof autosim.getBrain !== "function") return null;
    return {
        headId: focusedHeadId,
        head,
        species: meta?.species ?? "snake",
        getBrain: () => autosim.getBrain(),
        getPathOverlay: () => autosim.getPathOverlay?.() ?? null,
        getIntentTarget: () => ({ mode: autosim.getMode?.() ?? null, targetId: autosim.getTargetId?.() ?? null, destination: autosim.getDestination?.() ?? null }),
    };
}
