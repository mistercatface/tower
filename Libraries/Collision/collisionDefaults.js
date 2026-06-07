/**
 * Library baseline — games override via `gameDefinition.collisionSettings`, project via Config.
 */
/** @typedef {typeof LIBRARY_COLLISION_DEFAULTS} LibraryCollisionSettings */
export const LIBRARY_COLLISION_DEFAULTS = {
    pushableIterations: 4,
    /** Peak travel per physics substep (px) — see Libraries/Motion/motionSubsteps.js */
    motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 },
    restingSpeedSq: 4,
    restitution: { rigidBody: 0.15, actorPushable: 0.15, pushablePair: 0.4, combatant: 0.15, circlePair: 0.5 },
    mass: { pushableFallback: 15, pickupFallback: 1 },
    chargeImpactDamage: 0,
};
