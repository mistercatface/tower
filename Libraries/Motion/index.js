/**
 * Libraries/Motion — pure top-down locomotion math.
 *
 * Scope: steering integration, damping, impulses, separation forces, direct seek.
 * Out of scope: Render/Kinematics (ragdoll, IK, gore), wall/pickup collision (Spatial/Motion/PhysicsSystem).
 *
 * Expansion roadmap:
 * 1. integrateSteering, applyVelocityDamping (done)
 * 2. applyImpulse / applyKnockback (done)
 * 3. separationForce (done)
 * 4. directSeek (done)
 * 5. applyRigidBodyImpulse scalar math (future)
 *
 * Game layer (Spatial/Motion/PhysicsSystem) keeps: wall collision, SAT, rigid-body response, damage.
 */
export { integrateSteering } from "./integrateSteering.js";
export { applyVelocityDamping } from "./applyDamping.js";
export { applyImpulse, applyKnockback } from "./applyImpulse.js";
export {
    createSeparationAccum,
    accumulateSeparationFromPair,
    clampSeparationAccum,
} from "./separationForce.js";
export {
    seekDirection,
    seekDirectionToward,
    applyDesiredDirection,
    applyDesiredDirectionToward,
} from "./directSeek.js";
