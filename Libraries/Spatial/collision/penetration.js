/**
 * Position correction along contact normals (no velocity change).
 */
/**
 * @param {{ x: number, y: number }} body — mutated in place
 */
export function applyPositionCorrection(body, normalX, normalY, overlap) {
    body.x += normalX * overlap;
    body.y += normalY * overlap;
}
/**
 * Mass-weighted separation of two overlapping bodies.
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB) {
    const totalMass = massA + massB;
    a.x -= normalX * overlap * (massB / totalMass);
    a.y -= normalY * overlap * (massB / totalMass);
    b.x += normalX * overlap * (massA / totalMass);
    b.y += normalY * overlap * (massA / totalMass);
}
/** Circle centers closer than this share no valid contact normal — unstack only, no impulse. */
export const COINCIDENT_CIRCLE_EPS = 1e-10;
/**
 * Positional unstack when circle centers coincide (invalid state; breaks symmetry for next pass).
 * @param {{ x: number, y: number }} a — mutated in place
 * @param {{ x: number, y: number }} b — mutated in place
 */
export function separateCoincidentCirclePair(a, b, overlap, massA, massB) {
    const totalMass = massA + massB;
    a.x -= overlap * (massB / totalMass);
    b.x += overlap * (massA / totalMass);
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
