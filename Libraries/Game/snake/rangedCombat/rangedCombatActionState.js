export function createRangedCombatActionState() {
    return { phase: "idle", targetId: null, timerMs: 0, aimAngle: 0 };
}
export function resetRangedCombatAction(action) {
    if (!action) return;
    action.phase = "idle";
    action.targetId = null;
    action.timerMs = 0;
    action.aimAngle = 0;
}
export function rangedCombatActionOnCooldown(action) {
    return action?.phase === "cooldown" && action.timerMs > 0;
}
export function rangedCombatActionIsBusy(action) {
    return action?.phase === "charging" || rangedCombatActionOnCooldown(action);
}
