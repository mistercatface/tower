import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
/** Apply profile locomotion/presentation to a spawned chain segment. role: "leader" | "body". */
export function applyAgentGameplay(profile, prop, role) {
    const spec = role === "leader" ? (profile.gameplay?.leader ?? {}) : (profile.gameplay?.body ?? {});
    if (spec.maxSpeed != null || spec.accel != null) {
        if (!prop.strategy.groundNav) prop.strategy.groundNav = {};
        if (spec.maxSpeed != null) prop.strategy.groundNav.maxSpeed = spec.maxSpeed;
        if (spec.accel != null) prop.strategy.groundNav.accel = spec.accel;
    }
    if (spec.friction != null) prop.strategy.friction = spec.friction;
    if (spec.density != null) {
        prop.strategy.density = spec.density;
        if (prop.strategy.isKinetic) syncKineticRigidBody(prop);
    }
}
export function applyAgentGameplayForIndex(profile, prop, segmentIndex, leaderIndex) {
    applyAgentGameplay(profile, prop, segmentIndex === leaderIndex ? "leader" : "body");
}
