/**
 * Libraries/Motion — pure top-down locomotion math.
 *
 * Scope: steering integration, damping, impulses, separation forces.
 * Data contract: Libraries/Agent (AgentPose, MobileAgent, SteeringResult).
 * Out of scope: Render/Kinematics (ragdoll, IK, gore), wall/pickup collision (Spatial/Motion/PhysicsSystem).
 *
 * Expansion roadmap:
 * 1. integrateSteering, applyVelocityDamping (done)
 * 2. applyImpulse / applyKnockback (done)
 * 3. separationForce (done)
 * 4. rigidBodyImpulse, staticSurfaceImpulse (done)
 *
 * Steering / desired-direction writes: Libraries/Agent.
 *
 * Game layer (Spatial/Motion/PhysicsSystem) keeps: wall collision, SAT, rigid-body response, damage.
 */
export { integrateSteering } from "./integrateSteering.js";
export { applyVelocityDamping } from "./applyDamping.js";
export { applyImpulse, applyKnockback } from "./applyImpulse.js";
export { massFromBody, inverseMassFromBody } from "./bodyMass.js";
export { applyRigidBodyImpulse } from "./rigidBodyImpulse.js";
export { applyStaticSurfaceImpulse } from "./staticSurfaceImpulse.js";
export { createSeparationAccum, accumulateSeparationFromPair, clampSeparationAccum } from "./separationForce.js";
export { SeparationEngine } from "./SeparationEngine.js";
export { createSeparationState, updateSeparation } from "./applySeparation.js";
export { applyMobileLocomotion } from "./applyLocomotion.js";
export { SLEEP_FRAMES, SLEEP_ANGULAR_EPS, isPushable, canSleepPushable, wakePushableBody, advancePushableSleep, hasSleepBlockingOverlap, evaluatePushableSleepEligible } from "./pushableSleep.js";
