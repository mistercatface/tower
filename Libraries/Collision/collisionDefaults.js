/**
 * Library baseline — games override via `gameDefinition.collisionSettings`, project via Config.
 */
import { mergeObjectTree } from "../Config/mergeConfig.js";
/** @typedef {typeof LIBRARY_COLLISION_DEFAULTS} LibraryCollisionSettings */
export const LIBRARY_COLLISION_DEFAULTS = {
    kineticIterations: 4,
    /** Peak travel per physics substep (px) — see Libraries/Motion/motionSubsteps.js */
    motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 },
    /** Shared still/moving thresholds for sleep, contact resolve, and wall queries. */
    kineticActivity: { movingSpeedSq: 0.25, rotatingSpeedRad: 0.1, neighborQueryPad: 15 },
    kineticSleep: { frames: 30 },
    restitution: { rigidBody: 0.15, kineticPair: 0.4 },
    /** Coulomb pair friction when strategy has no pairFriction / wallPhysics.friction. */
    pairFriction: 0.35,
    /** Prior-frame normal/tangent impulse decay for kinetic contact warm-start. */
    kineticWarmStartDecay: 0.8,
    /** Area-based kinetic mass: mass = density × collision footprint area. */
    material: { densityDefault: 1.5 / 256, minMass: 0.01 },
    /** Post-contact distance joints — separate from kinetic pair stream. */
    kineticConstraints: { iterations: 4, velocityBias: 0.2 },
    /** Stop outer kinetic iterations when constraints + velocities settle. */
    kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactImpulseEpsilon: 0.05 },
    /** Resting contacts skip re-solve iterations after warm-start. */
    kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 },
};
let activeCollisionSettings = structuredClone(LIBRARY_COLLISION_DEFAULTS);
export function getCollisionSettings() {
    return activeCollisionSettings;
}
export function applyGameCollisionSettings(definition) {
    activeCollisionSettings = structuredClone(mergeObjectTree(LIBRARY_COLLISION_DEFAULTS, definition?.collisionSettings));
}
