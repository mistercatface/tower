import { resolveBodyAgainstWallSegments } from "../Spatial/collision/wallResolution.js";

/**
 * Resolve one body against wall segments with per-frame cache.
 *
 * @param {object} entity
 * @param {{ frameId: number, getWallCandidates: (entity: object) => object[] }} spatialFrame
 * @param {{ onWallDamage?: (hit: object) => void }} [options]
 * @returns {boolean}
 */
export function resolveWallCollisions(entity, spatialFrame, { onWallDamage = null } = {}) {
    if (entity._wallResolvedFrame === spatialFrame.frameId) return entity._wallResolvedCollided;
    entity._wallResolvedFrame = spatialFrame.frameId;
    const candidateWalls = spatialFrame.getWallCandidates(entity);
    if (candidateWalls.length === 0) {
        entity._wallResolvedCollided = false;
        return false;
    }
    const wp = entity.strategy?.wallPhysics;
    const { collided, hits } = resolveBodyAgainstWallSegments(entity, entity.getShape(), candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9 });
    if (onWallDamage) {
        for (let i = 0; i < hits.length; i++) {
            onWallDamage(hits[i]);
        }
    }
    entity._wallResolvedCollided = collided;
    return collided;
}
