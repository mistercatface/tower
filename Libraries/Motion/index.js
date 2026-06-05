/**
 * Libraries/Motion — pure top-down locomotion math.
 *
 * Scope: steering integration, damping, impulses, separation forces (math only).
 * Out of scope: Render/Kinematics (ragdoll, IK, gore), wall/pickup collision (Spatial/Motion/PhysicsSystem).
 *
 * Expansion roadmap:
 * 1. integrateSteering, applyVelocityDamping (done)
 * 2. applyImpulse / applyKnockback (done)
 * 3. separationForce — overlap weights from neighbor positions (no faction rules)
 * 4. seek / arrive / direct — normalized direction helpers
 *
 * Game layer (Spatial/Motion/PhysicsSystem) keeps: wall collision, SAT, rigid-body response, damage.
 * Import this module directly — no PhysicsSystem pass-through for pure motion.
 */
export { integrateSteering } from "./integrateSteering.js";
export { applyVelocityDamping } from "./applyDamping.js";
export { applyImpulse, applyKnockback } from "./applyImpulse.js";
