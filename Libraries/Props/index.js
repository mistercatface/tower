export { PROP_STRATEGY_DEFAULTS, withPropStrategyDefaults, resolvePropQuantizeSteps } from "./propStrategy.js";
export { integratePropMotion } from "./propMotion.js";
export { integrateStandTipMotion, integrateStandTip, integrateStandTipsAfterCollisions, initStandTipState, isStandTipActive, needsStandTipIntegration } from "./standTipMotion.js";
export { applyActorPushTipImpulse } from "./actorPushTip.js";
export { syncLongAxisCollisionShape, usesLongAxisCollisionShape } from "./longAxisCollision.js";
export { measureTipFallWallBlock } from "./tipWallSupport.js";
export { applyProjectileImpulseToPickup, applyTipImpulseFromForce } from "./projectileImpulse.js";
export { HIT_BEHAVIOR_HANDLERS, damageOnHit, impulseOnHit } from "./hitBehaviors.js";
export {
    IDENTITY_ROLL_QUAT,
    integrateRollOrientation,
    integrateLongAxisRoll,
    absorbCollisionRollImpulse,
    getRollRadius,
    quantizeRollQuat,
    buildRollOrientKey,
    transformRollVertex,
} from "./rollingMotion.js";
export { spawnStartProps } from "./spawnStartProps.js";
export { getWorldPropDefinitions, getWorldPropRecipes, getPropAsset } from "./PropCatalog.js";
export { loadPropAssets } from "./loadPropAssets.js";
export { PROP_RECIPE_BUILDERS } from "./recipes/index.js";
export { PROP_PRIMITIVE_BUILDERS } from "./primitives/index.js";
