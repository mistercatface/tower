import { applyVelocityDamping } from "../Motion/index.js";
import { lengthXY } from "../Math/Vec2.js";
import { absorbCollisionRollImpulse, integrateRollOrientation } from "./rollingMotion.js";
import { isStandTipFallen, isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";
/**
 * @param {object} strategy
 * @param {object} body
 */
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
/**
 * Single motion entry for pushable props — lifecycle states do not branch here.
 *
 * @param {object} body
 * @param {number} dtMs
 */
export function integratePropMotion(body, dtMs) {
    const strategy = body.strategy ?? {};
    const friction = resolveRollingFriction(strategy, body);
    const snapSpeed = strategy.snapSpeed ?? 1;
    const axis = strategy.rollAxis ?? "ground";
    if (isStandTipProp(body)) {
        if (isStandTipFallen(body)) {
            integrateRollOrientation(body, dtMs);
            if (body.angularVelocity) {
                const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
                body.angularVelocity *= angularDrag;
                if (Math.abs(body.angularVelocity) < 0.1) body.angularVelocity = 0;
            }
        }
        applyVelocityDamping(body, dtMs, { friction, integrateFacing: false, snapSpeed });
        return;
    }
    if (!strategy.rolls) {
        applyVelocityDamping(body, dtMs, { friction, snapSpeed });
        return;
    }
    if (axis === "long") {
        integrateRollOrientation(body, dtMs);
        applyVelocityDamping(body, dtMs, { friction, integrateFacing: false, snapSpeed });
        if (body.angularVelocity) {
            const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
            body.angularVelocity *= angularDrag;
            if (Math.abs(body.angularVelocity) < 0.1) body.angularVelocity = 0;
        }
        return;
    }
    absorbCollisionRollImpulse(body, dtMs);
    integrateRollOrientation(body, dtMs);
    body.angularVelocity = 0;
    applyVelocityDamping(body, dtMs, { friction, integrateFacing: false, snapSpeed });
}
