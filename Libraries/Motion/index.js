/**
 * Libraries/Motion — pure top-down locomotion math.
 *
 * Scope: steering integration, damping, impulses, separation forces.
 * Data contract: Libraries/Agent (AgentPose, MobileAgent, SteeringResult).
 * Out of scope: Render/Kinematics (ragdoll, IK, gore), rigid-body/circle response (Spatial/Motion/PhysicsSystem).
 *
 * Expansion roadmap:
 * 1. integrateSteering, applyVelocityDamping (done)
 * 2. applyImpulse / applyKnockback (done)
 * 3. separationForce (done)
 * 4. rigidBodyImpulse, staticSurfaceImpulse (done)
 *
 * Steering / desired-direction writes: Libraries/Agent.
 *
 * Game layer wires WallCollisionResolver damage callbacks; PhysicsSystem keeps rigid-body + circle response.
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
export { applyEntityLocomotion } from "./applyEntityLocomotion.js";
export { WallCollisionResolver } from "./WallCollisionResolver.js";
export { runPushablePhysicsPass, tickPushableSleep, wakeAllPushables } from "./pushablePhysicsPass.js";
export { SLEEP_FRAMES, SLEEP_ANGULAR_EPS, isPushable, canSleepPushable, wakePushableBody, advancePushableSleep, hasSleepBlockingOverlap, evaluatePushableSleepEligible } from "./pushableSleep.js";
