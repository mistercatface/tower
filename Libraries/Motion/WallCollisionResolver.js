import { resolveBodyAgainstWallSegments, resolveSlabAgainstWallSegments } from "../Spatial/collision/wallResolution.js";
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
    resolve(entity, spatialFrame, preSpeed = 0, wallBreakConfig = null) {
        if (entity._wallResolvedFrame === spatialFrame.frameId) return entity._wallResolvedCollided;
        entity._wallResolvedFrame = spatialFrame.frameId;
        const candidateWalls = spatialFrame.getWallCandidates(entity);
        /** @type {import("../Spatial/collision/wallResolution.js").WallHit[]} */
        const hits = entity._wallResolveHits ? entity._wallResolveHits.slice() : [];
        if (candidateWalls.length === 0) {
            entity._wallResolvedCollided = hits.length > 0;
            entity._wallResolveHits = hits.length ? hits : null;
            return entity._wallResolvedCollided;
        }
        const wp = entity.strategy?.wallPhysics;
        const parts = entity.getCollisionParts?.() ?? [entity.shape];
        let collided = hits.length > 0;
        const physId = entity._physId;
        const hasSlab = physId !== undefined && physId !== -1;
        for (let i = 0; i < parts.length; i++) {
            const result = hasSlab
                ? resolveSlabAgainstWallSegments(physId, entity, parts[i], candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9, preSpeed, wallBreakConfig })
                : resolveBodyAgainstWallSegments(entity, parts[i], candidateWalls, { restitution: wp?.restitution ?? 0.0, friction: wp?.friction ?? 0.9, preSpeed, wallBreakConfig });
            if (result.collided) collided = true;
            if (result.hits.length) hits.push(...result.hits);
        }
        entity._wallResolveHits = hits.length ? hits : null;
        if (collided) wakeKineticBody(entity);
        entity._wallResolvedCollided = collided;
        return collided;
    }
}
