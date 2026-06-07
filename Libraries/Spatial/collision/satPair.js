import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { applyRigidBodyImpulse } from "../../Motion/rigidBodyImpulse.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { SatCollision } from "./SatCollision.js";
import { separateAlongNormal, separateCoincidentCirclePair } from "./penetration.js";
/**
 * SAT detect → mass-weighted separation → rigid-body impulse.
 * @returns {{ nx: number, ny: number, overlap: number, cx?: number, cy?: number } | null}
 */
export function resolveSatPair(posA, shapeA, posB, shapeB, options = {}) {
    const { massA = massFromBody(posA), massB = massFromBody(posB), restitution = getCollisionSettings().restitution.rigidBody } = options;
    const collisionInfo = SatCollision.checkCollision(posA, shapeA, posB, shapeB);
    if (!collisionInfo) return null;
    if (collisionInfo.coincident) {
        separateCoincidentCirclePair(posA, posB, collisionInfo.overlap, massA, massB);
        return collisionInfo;
    }
    separateAlongNormal(posA, posB, collisionInfo.nx, collisionInfo.ny, collisionInfo.overlap, massA, massB);
    applyRigidBodyImpulse(posA, posB, collisionInfo, restitution);
    return collisionInfo;
}
