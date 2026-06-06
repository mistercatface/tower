import { WallCollisionResolver } from "../../Libraries/Motion/WallCollisionResolver.js";
/**
 * @param {object} entity
 * @param {object} hit
 * @param {object | null} state
 */
function applyWallDamageHit(entity, hit, state) {
    if (!entity.canDamageWalls || !state) return;
    if (hit.approachDot >= 0) return;
    const impactSpeed = -hit.approachDot;
    if (impactSpeed <= 75) return;
    const ctx = state.fsm ? state.fsm.context : null;
    if (!ctx) return;
    hit.segment.handleHit(10, ctx);
    entity.vx += 0.25 * impactSpeed * hit.normalX;
    entity.vy += 0.25 * impactSpeed * hit.normalY;
}
/**
 * Game-side wall resolver — injects wall-damage policy into the library resolver.
 *
 * @param {() => object | null} getState
 * @returns {WallCollisionResolver}
 */
export function createCombatWallResolver(getState) {
    return new WallCollisionResolver({
        onWallDamage: (entity, hit) => {
            if (!entity.canDamageWalls) return;
            applyWallDamageHit(entity, hit, getState());
        },
    });
}
