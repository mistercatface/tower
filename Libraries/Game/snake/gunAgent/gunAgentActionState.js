export function createGunAgentActionState() {
    return { phase: "idle", targetId: null, timerMs: 0, aimAngle: 0 };
}
export function resetGunAgentActionState(action) {
    action.phase = "idle";
    action.targetId = null;
    action.timerMs = 0;
    action.aimAngle = 0;
}
export function gunAgentActionOnCooldown(action) {
    return action.phase === "cooldown" && action.timerMs > 0;
}
export function gunAgentActionIsBusy(action) {
    return action.phase === "charging" || gunAgentActionOnCooldown(action);
}
