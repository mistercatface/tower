import { resolveBodyAgainstWallSegments } from "../Spatial/collision/wallResolution.js";
/**
 * Per-frame cached wall resolution for one or many bodies.
 *
 * @typedef {(entity: object, hit: object) => void} WallDamageCallback
 */
/** Clear wall-resolve frame cache so entity-pair contacts can re-resolve against walls. */
export function invalidateWallResolveCache(...entities) {
    for (let i = 0; i < entities.length; i++) entities[i]._wallResolvedFrame = null;
}
export class WallCollisionResolver {
    /**
     * @param {{ onWallDamage?: WallDamageCallback | null }} [config]
     */
    constructor({ onWallDamage = null } = {}) {
        this.onWallDamage = onWallDamage;
    }
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
        const { collided, hits } = resolveBodyAgainstWallSegments(entity, entity.getShape(), candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9 });
        if (this.onWallDamage) for (let i = 0; i < hits.length; i++) this.onWallDamage(entity, hits[i]);
        entity._wallResolvedCollided = collided;
        return collided;
    }
}
