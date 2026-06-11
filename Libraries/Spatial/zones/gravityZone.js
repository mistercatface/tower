import { createRectGroundZone } from "./groundZones.js";
import { NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
/**
 * @param {number} x
 * @param {number} y
 * @param {number} halfWidth
 * @param {number} halfHeight
 * @param {{ forceX?: number, forceY?: number, id?: string }} [options]
 */
export function createGravityZone(x, y, halfWidth, halfHeight, { forceX = 0, forceY = 1000, id = "gravity-zone" } = {}) {
    const zone = createRectGroundZone(x, y, halfWidth, halfHeight, { id });
    zone.kind = "gravity";
    zone.forceX = forceX;
    zone.forceY = forceY;
    // Expand AABB for broadphase queries
    const pad = NEIGHBOR_QUERY_PAD;
    zone.aabb = { minX: x - halfWidth - pad, minY: y - halfHeight - pad, maxX: x + halfWidth + pad, maxY: y + halfHeight + pad };
    return zone;
}
