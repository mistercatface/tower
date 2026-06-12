import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { castSteppedCircleRay } from "../Spatial/query/steppedCircleRayCast.js";
/** @param {object} entity */
function isLaserCircleTarget(entity) {
    if (entity.isDead) return false;
    if (entity.strategy != null) return Boolean(entity.strategy.laserTargetable);
    return true;
}
/**
 * @param {object} state
 * @param {{ source?: object | null, targets?: object[] }} [options]
 */
export function buildLaserTargetCircles(state, { source = null, targets = null } = {}) {
    /** @type {import("../Spatial/query/steppedCircleRayCast.js").SteppedCircleRayCircleTarget[]} */
    const circles = [];
    const add = (entity) => {
        if (entity === source || !isLaserCircleTarget(entity)) return;
        const hitKind = entity.strategy?.laserTargetable != null ? "worldProp" : "actor";
        circles.push({ entity, radius: entity.radius, hitKind });
    };
    if (targets) for (let i = 0; i < targets.length; i++) add(targets[i]);
    else state.entityRegistry.forEachOfKind("worldProp", add);
    return circles;
}
export function castLaserRay(startX, startY, angle, maxDist, state, beamRadius, circles) {
    return castSteppedCircleRay(startX, startY, angle, maxDist, beamRadius, { wallCtx: wallContextFromState(state), circles });
}
