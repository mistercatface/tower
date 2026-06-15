import { resolveBodyAgainstWallSegments } from "../Spatial/collision/wallResolution.js";

/** Clear wall-resolve frame cache so entity-pair contacts can re-resolve against walls. */
export function invalidateWallResolveCache(...entities) {
    for (let i = 0; i < entities.length; i++) entities[i]._wallResolvedFrame = null;
}
export class WallCollisionResolver {
    /**
     * @param {object} entity
     * @param {{ frameId: number, getWallCandidates: (entity: object) => object[] }} spatialFrame
     * @returns {boolean}
     */
    resolve(entity, spatialFrame) {
        if (entity._wallResolvedFrame === spatialFrame.frameId) return entity._wallResolvedCollided;
        entity._wallResolvedFrame = spatialFrame.frameId;
        const candidateWalls = spatialFrame.getWallCandidates(entity);
        if (candidateWalls.length === 0) {
            entity._wallResolvedCollided = false;
            return false;
        }
        const wp = entity.strategy?.wallPhysics;
        const { collided } = resolveBodyAgainstWallSegments(entity, entity.getShape(), candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9 });
        entity._wallResolvedCollided = collided;
        return collided;
    }
}
