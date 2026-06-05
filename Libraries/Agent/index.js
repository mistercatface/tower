/**
 * Libraries/Agent — shared locomotion / navigation data contract.
 *
 * AgentPose: pathfinding & steering compute (x, y, radius).
 * MobileAgent: motion integration (velocity, desired direction, speed, angle, …).
 * SteeringResult: pure compute output → applySteeringResult at game boundary.
 */
export { createMobileAgent, initMobileAgent, getMobileAgent, agentPose } from "./create.js";
export { seekDirection, seekDirectionToward, computeDirectSteering, applySteeringResult, applyDesiredDirection, applyDesiredDirectionToward } from "./steering.js";
