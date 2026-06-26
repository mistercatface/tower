import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
/** Apply preselected locomotion/presentation spec to a spawned chain segment. */
export function applyAgentGameplay(spec, prop) {
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
