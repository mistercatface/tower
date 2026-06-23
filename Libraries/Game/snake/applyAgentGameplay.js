import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
function resolveLeaderGameplay(profileId, profile) {
    const gameplay = profile.gameplay?.leader ?? {};
    if (profileId === AGENT_PROFILE.snake)
        return {
            maxSpeed: profile.headMaxSpeed ?? gameplay.maxSpeed,
            accel: profile.headAccel ?? gameplay.accel,
            friction: profile.headFriction ?? gameplay.friction,
            brainSyncPass: gameplay.brainSyncPass ?? true,
        };
    if (profileId === AGENT_PROFILE.flee)
        return {
            maxSpeed: profile.maxSpeed ?? gameplay.maxSpeed,
            accel: profile.accel ?? gameplay.accel,
            friction: profile.friction ?? gameplay.friction,
            brainSyncPass: gameplay.brainSyncPass ?? false,
        };
    if (profileId === AGENT_PROFILE.squid)
        return {
            maxSpeed: profile.brainMaxSpeed ?? gameplay.maxSpeed,
            accel: profile.brainAccel ?? gameplay.accel,
            friction: profile.brainFriction ?? gameplay.friction,
            brainSyncPass: gameplay.brainSyncPass ?? true,
        };
    return gameplay;
}
function resolveBodyGameplay(profile) {
    const gameplay = profile.gameplay?.body ?? {};
    return { friction: profile.segmentFriction ?? gameplay.friction, density: profile.segmentDensity ?? gameplay.density };
}
/** Apply profile locomotion/presentation to a spawned chain segment. role: "leader" | "body". */
export function applyAgentGameplay(profileId, prop, role, config = getSnakeGameConfig()) {
    const profile = getAgentProfile(profileId, config);
    const spec = role === "leader" ? resolveLeaderGameplay(profileId, profile) : resolveBodyGameplay(profile);
    if (spec.brainSyncPass) prop._brainSyncPass = 0;
    if (spec.maxSpeed != null) prop.strategy.groundNav = { ...(prop.strategy.groundNav ?? {}), maxSpeed: spec.maxSpeed };
    if (spec.accel != null) prop.strategy.groundNav = { ...(prop.strategy.groundNav ?? {}), accel: spec.accel };
    if (spec.friction != null) prop.strategy.friction = spec.friction;
    if (spec.density != null) {
        prop.strategy.density = spec.density;
        if (prop.strategy.isKinetic) syncKineticRigidBody(prop);
    }
}
export function applyAgentGameplayForIndex(profileId, prop, segmentIndex, leaderIndex, config = getSnakeGameConfig()) {
    applyAgentGameplay(profileId, prop, segmentIndex === leaderIndex ? "leader" : "body", config);
}
