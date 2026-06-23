export function getGroundNavFsmSnapshot({ intent, locomotion, agent, state, intentMemory, lastBlackboard, lastDecisionSnapshot }) {
    const loco = locomotion.getStatus(agent, state);
    const dest = locomotion.getDestination();
    let replanReason = null;
    if (loco.lastReplanReason) replanReason = loco.lastReplanReason;
    else if (loco.replanPending) replanReason = "pending";
    else if (dest && !loco.hasRoute) replanReason = "no_route";
    return {
        mode: intent.getMode(),
        destCell: dest ? { col: dest.col, row: dest.row } : null,
        pathLen: loco.pathLen,
        replanReason,
        navPhase: loco.navPhase,
        routeGoal: loco.routeGoal,
        terminalGoal: loco.terminalGoal,
        routeCommitFrames: loco.routeCommitFrames,
        routeId: loco.routeId,
        lastAcceptedRouteReason: loco.lastAcceptedRouteReason,
        lastAcceptedPathLen: loco.lastAcceptedPathLen,
        lastAcceptedProgressIdx: loco.lastAcceptedProgressIdx,
        lastAcceptedTarget: loco.lastAcceptedTargetX == null || loco.lastAcceptedTargetY == null ? null : { x: loco.lastAcceptedTargetX, y: loco.lastAcceptedTargetY },
        targetDistance: loco.targetDistance,
        targetLos: loco.targetLos,
        stuckFrames: loco.stuckFrames,
        vx: agent.vx,
        vy: agent.vy,
        lastTransition: intent.getLastTransitionReason(),
        intentMemory: intentMemory.snapshot(),
        intentEvents: lastBlackboard?.events ?? [],
        decision: lastDecisionSnapshot,
    };
}
