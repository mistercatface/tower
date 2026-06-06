import { transformRollVertex } from "../../Props/rollingMotion.js";
/**
 * Local sphere vertex resting on the ground (phi=π touches z=0).
 * phi=0 is the top pole; theta is azimuth in the ground plane.
 *
 * @param {number} radius
 * @param {number} phi 0…π colatitude from top pole
 * @param {number} theta 0…2π azimuth
 */
export function sphereLocalVertex(radius, phi, theta) {
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    return { lx: radius * sinPhi * Math.cos(theta), ly: radius * sinPhi * Math.sin(theta), z: radius * (1 + cosPhi) };
}
/**
 * @param {number} radius
 * @param {number} phi
 * @param {number} theta
 * @param {{ w: number, x: number, y: number, z: number }} rollQuat
 */
export function sphereRolledVertex(radius, phi, theta, rollQuat) {
    const v = sphereLocalVertex(radius, phi, theta);
    return transformRollVertex(v.lx, v.ly, v.z, radius, rollQuat);
}
/**
 * Tessellate a spherical UV patch into model-space quads (before world projection).
 *
 * @param {{
 *   radius: number,
 *   rollQuat: { w: number, x: number, y: number, z: number },
 *   phiMin: number,
 *   phiMax: number,
 *   thetaMin: number,
 *   thetaMax: number,
 *   phiSegments?: number,
 *   thetaSegments?: number,
 *   subPhi?: number,
 *   subTheta?: number,
 *   radiusInflate?: number,
 * }} spec
 * @returns {{ depth: number, u0: number, u1: number, v0: number, v1: number, verts: object[] }[]}
 */
export function tessellateSphereQuads({ radius, rollQuat, phiMin, phiMax, thetaMin, thetaMax, phiSegments = 8, thetaSegments = 8, subPhi = 2, subTheta = 2, radiusInflate = 1 } = {}) {
    const r = radius * radiusInflate;
    const cells = [];
    for (let pi = 0; pi < phiSegments; pi++)
        for (let spi = 0; spi < subPhi; spi++) {
            const v0 = (pi + spi / subPhi) / phiSegments;
            const v1 = (pi + (spi + 1) / subPhi) / phiSegments;
            const phi0 = phiMin + v0 * (phiMax - phiMin);
            const phi1 = phiMin + v1 * (phiMax - phiMin);
            for (let ti = 0; ti < thetaSegments; ti++)
                for (let sti = 0; sti < subTheta; sti++) {
                    const u0 = (ti + sti / subTheta) / thetaSegments;
                    const u1 = (ti + (sti + 1) / subTheta) / thetaSegments;
                    const theta0 = thetaMin + u0 * (thetaMax - thetaMin);
                    const theta1 = thetaMin + u1 * (thetaMax - thetaMin);
                    const m00 = sphereRolledVertex(r, phi0, theta0, rollQuat);
                    const m01 = sphereRolledVertex(r, phi0, theta1, rollQuat);
                    const m11 = sphereRolledVertex(r, phi1, theta1, rollQuat);
                    const m10 = sphereRolledVertex(r, phi1, theta0, rollQuat);
                    cells.push({ depth: (m00.z + m01.z + m11.z + m10.z) * 0.25, u0, u1, v0, v1, verts: [m00, m01, m11, m10] });
                }
        }
    return cells;
}
/**
 * Tessellate a circular spherical cap (tangent-plane patch) for decal-style wrapping.
 * Chordal bulge is minimized with dense cells; use radiusInflate=1 so quads sit on the body.
 *
 * @param {{
 *   radius: number,
 *   rollQuat: { w: number, x: number, y: number, z: number },
 *   phiCenter: number,
 *   thetaCenter: number,
 *   capAngle: number,
 *   gridSegments?: number,
 *   subSegments?: number,
 *   radiusInflate?: number,
 * }} spec
 */
export function tessellateSphereCapQuads({ radius, rollQuat, phiCenter, thetaCenter, capAngle, gridSegments = 16, subSegments = 2, radiusInflate = 1 } = {}) {
    const r = radius * radiusInflate;
    const sinPhi = Math.max(Math.sin(phiCenter), 0.35);
    const cells = [];
    const cornerToSphere = (lx, ly) => {
        const dPhi = ly * capAngle;
        const dTheta = (lx * capAngle) / sinPhi;
        return sphereRolledVertex(r, phiCenter + dPhi, thetaCenter + dTheta, rollQuat);
    };
    for (let gi = 0; gi < gridSegments; gi++)
        for (let sgi = 0; sgi < subSegments; sgi++) {
            const v0 = (gi + sgi / subSegments) / gridSegments;
            const v1 = (gi + (sgi + 1) / subSegments) / gridSegments;
            const ly0 = (v0 - 0.5) * 2;
            const ly1 = (v1 - 0.5) * 2;
            for (let ti = 0; ti < gridSegments; ti++)
                for (let sti = 0; sti < subSegments; sti++) {
                    const u0 = (ti + sti / subSegments) / gridSegments;
                    const u1 = (ti + (sti + 1) / subSegments) / gridSegments;
                    const lx0 = (u0 - 0.5) * 2;
                    const lx1 = (u1 - 0.5) * 2;
                    const midX = (lx0 + lx1) * 0.5;
                    const midY = (ly0 + ly1) * 0.5;
                    if (midX * midX + midY * midY > 1.04) continue;
                    const corners = [
                        [lx0, ly0],
                        [lx1, ly0],
                        [lx1, ly1],
                        [lx0, ly1],
                    ];
                    if (corners.every(([x, y]) => x * x + y * y > 1.02)) continue;
                    const m00 = cornerToSphere(lx0, ly0);
                    const m01 = cornerToSphere(lx1, ly0);
                    const m11 = cornerToSphere(lx1, ly1);
                    const m10 = cornerToSphere(lx0, ly1);
                    cells.push({ depth: (m00.z + m01.z + m11.z + m10.z) * 0.25, u0: (lx0 + 1) * 0.5, u1: (lx1 + 1) * 0.5, v0: (ly0 + 1) * 0.5, v1: (ly1 + 1) * 0.5, verts: [m00, m01, m11, m10] });
                }
        }
    return cells;
}
