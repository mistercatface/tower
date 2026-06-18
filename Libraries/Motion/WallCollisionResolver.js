import { resolveBodyAgainstWallSegments } from "../Spatial/collision/wallResolution.js";
import { wakeKineticBody } from "./kineticSleep.js";
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
        const parts = entity.getCollisionParts?.() ?? [entity.getShape()];
        let collided = false;
        for (let i = 0; i < parts.length; i++) {
            const result = resolveBodyAgainstWallSegments(entity, parts[i], candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9 });
            if (result.collided) collided = true;
        }
        if (collided) wakeKineticBody(entity);
        entity._wallResolvedCollided = collided;
        return collided;
    }
}
