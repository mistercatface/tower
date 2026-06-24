export function resolveFocusedAgentDebugContext(state, focusedHeadId) {
    if (focusedHeadId == null) return null;
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return null;
    const instance = snakeGame.instancesByHeadId.get(focusedHeadId);
    if (!instance || instance.lifecycle !== "alive") return null;
    const head = instance.head;
    if (head.isDead) return null;
    const autosim = instance.autosim;
    if (!autosim || typeof autosim.getBrain !== "function") return null;
    return {
        headId: focusedHeadId,
        head,
        instance,
        session: snakeGame,
        species: instance.profileId,
        getBrain: () => autosim.getBrain(),
        getPathOverlay: () => autosim.getPathOverlay?.() ?? null,
        getIntentTarget: () => ({ mode: autosim.getMode?.() ?? null, targetId: autosim.getTargetId?.() ?? null, destination: autosim.getDestination?.() ?? null }),
    };
}
