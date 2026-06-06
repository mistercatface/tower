import { applyVelocityDamping } from "../Motion/index.js";
import { absorbCollisionRollImpulse, integrateRollOrientation } from "./rollingMotion.js";
import { integrateStandTipMotion } from "./standTipMotion.js";
import { isStandTipFallen, isStandTipProp } from "../Spatial/transforms/longAxisBox3d.js";

/**
 * Single motion entry for pushable props — lifecycle states (on_fire, etc.) do not branch here.
 *
 * @param {object} body
 * @param {number} dtMs
 */
export function integratePropMotion(body, dtMs) {
    const strategy = body.strategy ?? {};
    const friction = strategy.friction ?? 8;
    const axis = strategy.rollAxis ?? "ground";

    if (isStandTipProp(body)) {
        if (isStandTipFallen(body)) {
            integrateStandTipMotion(body, dtMs);
        }
        applyVelocityDamping(body, dtMs, { friction, integrateFacing: false });
        return;
    }

    if (!strategy.rolls) {
        applyVelocityDamping(body, dtMs, { friction });
        return;
    }

    if (axis === "long") {
        integrateRollOrientation(body, dtMs);
        applyVelocityDamping(body, dtMs, { friction, integrateFacing: false });
        if (body.angularVelocity) {
            const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
            body.angularVelocity *= angularDrag;
            if (Math.abs(body.angularVelocity) < 0.1) {
                body.angularVelocity = 0;
            }
        }
        return;
    }

    absorbCollisionRollImpulse(body, dtMs);
    integrateRollOrientation(body, dtMs);
    body.angularVelocity = 0;
    applyVelocityDamping(body, dtMs, { friction, integrateFacing: false });
}
