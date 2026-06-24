import { addXY } from "../../Math/Vec2.js";
/**
 * Position correction along contact normals (no velocity change).
 */
/**
 * @param {{ x: number, y: number }} body — mutated in place
 */
export function applyPositionCorrection(body, normalX, normalY, overlap) {
    if (body.strategy?.pinned) return;
    addXY(body, normalX * overlap, normalY * overlap);
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
 * @param {{ cx?: number, cy?: number }} [satResult]
 * @returns {{ cx: number, cy: number }}
 */
export function computePolygonWallContact(entity, normalX, normalY, overlap, satResult = null) {
    return { cx: satResult?.cx !== undefined ? satResult.cx : entity.x - normalX * overlap, cy: satResult?.cy !== undefined ? satResult.cy : entity.y - normalY * overlap };
}
