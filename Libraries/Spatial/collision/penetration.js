import { addXY } from "../../Math/Vec2.js";
import { kineticDynamicSlab } from "./kineticBodySlab.js";
/**
 * Position correction along contact normals (no velocity change).
 */
/**
 * @param {{ x: number, y: number, _physId?: number }} body — mutated in place
 */
export function applyPositionCorrection(body, normalX, normalY, overlap) {
    if (body.strategy?.pinned) return;
    const physId = body._physId;
    if (physId !== undefined && physId !== -1) {
        kineticDynamicSlab.x[physId] += normalX * overlap;
        kineticDynamicSlab.y[physId] += normalY * overlap;
    } else addXY(body, normalX * overlap, normalY * overlap);
}
/**
 * Mass-weighted separation of two overlapping bodies.
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB, pinnedA = false, pinnedB = false) {
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        addXY(b, normalX * overlap, normalY * overlap);
        return;
    }
    if (pinnedB) {
        addXY(a, -normalX * overlap, -normalY * overlap);
        return;
    }
    const totalMass = massA + massB;
    addXY(a, -normalX * overlap * (massB / totalMass), -normalY * overlap * (massB / totalMass));
    addXY(b, normalX * overlap * (massA / totalMass), normalY * overlap * (massA / totalMass));
}
/** Circle centers closer than this share no valid contact normal — unstack only, no impulse. */
export const COINCIDENT_CIRCLE_EPS = 1e-10;
/**
 * Positional unstack when circle centers coincide (invalid state; breaks symmetry for next pass).
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateCoincidentCirclePair(a, b, overlap, massA, massB, pinnedA = false, pinnedB = false) {
    if (pinnedA && pinnedB) return;
    if (pinnedA) {
        addXY(b, overlap, 0);
        return;
    }
    if (pinnedB) {
        addXY(a, -overlap, 0);
        return;
    }
    const totalMass = massA + massB;
    addXY(a, -overlap * (massB / totalMass), 0);
    addXY(b, overlap * (massA / totalMass), 0);
}
/**
 * @param {{ x: number, y: number }} entity
 * @returns {{ cx: number, cy: number }}
 */
export function computeCircleWallContact(entity, normalX, normalY, radius) {
    return { cx: entity.x - normalX * radius, cy: entity.y - normalY * radius };
}
/**
 * @param {{ x: number, y: number }} entity
 * @param {number} normalX
 * @param {number} normalY
 * @param {number} overlap
 * @param {number} cx
 * @param {number} cy
 * @returns {{ cx: number, cy: number }}
 */
export function computePolygonWallContact(entity, normalX, normalY, overlap, cx = NaN, cy = NaN) {
    return { cx: !isNaN(cx) ? cx : entity.x - normalX * overlap, cy: !isNaN(cy) ? cy : entity.y - normalY * overlap };
}
