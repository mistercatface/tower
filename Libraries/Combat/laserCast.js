import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { castSteppedCircleRay } from "../Spatial/query/steppedCircleRayCast.js";

/**
 * @param {object} state
 * @param {{ source?: object | null, includePickups?: boolean, includeActors?: object[] }} [options]
 */
export function buildLaserTargetCircles(state, { source = null, includePickups = true, includeActors = [] } = {}) {
    /** @type {import("../Spatial/query/steppedCircleRayCast.js").SteppedCircleRayCircleTarget[]} */
    const circles = [];
    if (includePickups && state.pickups)
        for (const pickup of state.pickups) {
            if (pickup.isDead || !pickup.strategy?.laserTargetable) continue;
            if (source && pickup === source) continue;
            circles.push({ entity: pickup, radius: pickup.radius, hitKind: "pickup" });
        }
    for (const actor of includeActors) {
        if (actor.isDead) continue;
        if (source && actor === source) continue;
        circles.push({ entity: actor, radius: actor.radius, hitKind: "actor" });
    }
    return circles;
}

export function castLaserRay(startX, startY, angle, maxDist, state, beamRadius, circles) {
    return castSteppedCircleRay(startX, startY, angle, maxDist, beamRadius, { wallCtx: wallContextFromState(state), circles });
}
