import { applyVelocityDamping } from "../Physics/physics.js";
import { lengthXY } from "../Math/Vec2.js";
import { absorbCollisionRollImpulse, integrateRollOrientation } from "./rollingMotion.js";
function resolveRollingFriction(strategy, body) {
    const base = strategy.friction ?? 8;
    const threshold = strategy.lowSpeedFrictionThreshold;
    const boosted = strategy.lowSpeedFriction;
    if (threshold == null || boosted == null) return base;
    const speed = lengthXY(body.vx ?? 0, body.vy ?? 0);
    if (speed >= threshold) return base;
    const t = 1 - speed / threshold;
    return base + (boosted - base) * t * t;
}
export function integratePropMotion(body, dtMs) {
    const strategy = body.strategy ?? {};
    const friction = resolveRollingFriction(strategy, body);
    const snapSpeed = strategy.snapSpeed ?? 1;
    absorbCollisionRollImpulse(body, dtMs);
    integrateRollOrientation(body, dtMs);
    body.angularVelocity = 0;
    applyVelocityDamping(body, dtMs, { friction, integrateFacing: false, snapSpeed });
}
