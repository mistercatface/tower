export function readAgentRouteStatus(locomotion, agent, state) {
    const dest = locomotion.getDestination();
    const status = locomotion.getStatus(agent, state);
    const grid = state.obstacleGrid;
    return {
        hasDestination: !!dest,
        hasRoute: status.hasRoute,
        replanPending: status.replanPending,
        routeFailed: !!dest && locomotion.needsRetry(agent, state),
        destReached: !!dest && (locomotion.hasArrivedAtDest(agent, grid) || locomotion.hasReachedDest(agent, grid)),
        stuckFrames: status.stuckFrames,
        pathLen: status.pathLen,
    };
}
