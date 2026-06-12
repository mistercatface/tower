import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { castSteppedCircleRay } from "../Spatial/query/steppedCircleRayCast.js";
/**
 * @param {object} state
 * @param {{ source?: object | null, includeWorldProps?: boolean, includeActors?: object[] }} [options]
 */
export function buildLaserTargetCircles(state, { source = null, includeWorldProps = true, includeActors = [] } = {}) {
    /** @type {import("../Spatial/query/steppedCircleRayCast.js").SteppedCircleRayCircleTarget[]} */
    const circles = [];
    if (includeWorldProps)
        state.entityRegistry.forEachOfKind("worldProp", (prop) => {
            if (prop.isDead || !prop.strategy?.laserTargetable) return;
            if (source && prop === source) return;
            circles.push({ entity: prop, radius: prop.radius, hitKind: "worldProp" });
        });
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
