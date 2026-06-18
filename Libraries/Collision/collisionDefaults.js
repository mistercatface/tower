/**
 * Library baseline — games override via `gameDefinition.collisionSettings`, project via Config.
 */
/** @typedef {typeof LIBRARY_COLLISION_DEFAULTS} LibraryCollisionSettings */
export const LIBRARY_COLLISION_DEFAULTS = {
    kineticIterations: 4,
    /** Peak travel per physics substep (px) — see Libraries/Motion/motionSubsteps.js */
    motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 },
    restingSpeedSq: 4,
    restitution: { rigidBody: 0.15, kineticPair: 0.4 },
    /** Coulomb pair friction when strategy has no pairFriction / wallPhysics.friction. */
    pairFriction: 0.35,
    /** Prior-frame normal/tangent impulse decay for kinetic contact warm-start. */
    kineticWarmStartDecay: 0.8,
    mass: { kineticFallback: 15, worldPropFallback: 1 },
    /** Area-based mass for baked splittable footprints (~1.5 mass per 16×16 px). */
    material: { densityDefault: 1.5 / 256, minMass: 0.01 },
};
