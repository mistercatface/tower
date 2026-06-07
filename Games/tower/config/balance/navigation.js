/** Tower combat steering profiles — base nav tuning lives in Libraries/Navigation/createRoguelikeNavRuntime.js */
export const NAV_PROFILES = {
    enemyToPlayer: { flowField: "enemy", hpaThreshold: 1000, replanMs: 1000, replanWhileMoving: true },
    playerClick: { flowField: "player", hpaThreshold: 0, replanMs: 500, replanWhileMoving: false, skipPathClearance: true },
    sidekickFollow: { flowField: "enemy", hpaThreshold: 60, replanMs: 250, replanWhileMoving: true },
};
