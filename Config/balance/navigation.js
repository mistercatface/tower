export const navigationSettings = {
    arrivalDistance: 2,
    recenterThreshold: 400,
    stuckReplanFrames: 20,
    stuckMoveThreshold: 1.5,
    targetNodeLookahead: 10,
    pathClearanceMargin: 4,
    pathWaypointArrival: 10,
    hpaDamagePadding: 12,
};
export const NAV_PROFILES = {
    enemyToPlayer: { flowField: "enemy", hpaThreshold: 1000, replanMs: 1000, replanWhileMoving: true },
    playerClick: { flowField: "player", hpaThreshold: 0, replanMs: 500, replanWhileMoving: false, skipPathClearance: true },
    sidekickFollow: { flowField: "enemy", hpaThreshold: 60, replanMs: 250, replanWhileMoving: true },
};
