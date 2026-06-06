import { IDENTITY_ROLL_QUAT } from "../../Props/rollingMotion.js";
import { isPropMeshFaceVisible, projectPropVertex } from "../Props3D/propMesh.js";
import { tessellateSphereCapQuads, tessellateSphereQuads } from "./sphereSurface.js";
import { drawTexturedQuadCells, gatherTexturedQuadCells } from "./texturedCells.js";
/**
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {object[]} verts
 */
function isSphereQuadVisible(prop, px, py, verts) {
    const [v00, v01, v11, v10] = verts;
    return isPropMeshFaceVisible(prop, px, py, [v00, v01, v11]) || isPropMeshFaceVisible(prop, px, py, [v00, v11, v10]);
}
/**
 * @param {object} cell
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 */
function projectSphereCell(cell, prop, px, py) {
    const [v00, v01, v11, v10] = cell.verts;
    return {
        depth: cell.depth,
        u0: cell.u0,
        u1: cell.u1,
        v0: cell.v0,
        v1: cell.v1,
        d0: projectPropVertex(prop, px, py, v00.lx, v00.ly, v00.z),
        d1: projectPropVertex(prop, px, py, v01.lx, v01.ly, v01.z),
        d2: projectPropVertex(prop, px, py, v11.lx, v11.ly, v11.z),
        d3: projectPropVertex(prop, px, py, v10.lx, v10.ly, v10.z),
    };
}
/**
 * Map an image onto a rolled spherical patch in world iso space.
 * Uses the same quad + affine texture path as inspect cylindrical labels.
 *
 * Prefer `capAngle` for circular decals (pool numbers). Quads sit on the sphere at
 * radiusInflate=1 — no outward shell, no screen bleed (that was causing the funnel).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {CanvasImageSource} img
 * @param {{
 *   baseRadius?: number,
 *   phiCenter?: number,
 *   thetaCenter?: number,
 *   capAngle?: number,
 *   phiHalf?: number,
 *   thetaHalf?: number,
 *   gridSegments?: number,
 *   phiSegments?: number,
 *   thetaSegments?: number,
 *   subSegments?: number,
 *   subPhi?: number,
 *   subTheta?: number,
 *   radiusInflate?: number,
 *   uvBleed?: number,
 *   screenBleed?: number,
 *   imageSmoothing?: boolean | null,
 * }} [options]
 */
export function drawSphereTexturePatch(ctx, prop, px, py, img, options = {}) {
    const radius = options.baseRadius ?? prop.radius ?? 8;
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;
    const phiCenter = options.phiCenter ?? Math.PI * 0.5;
    const thetaCenter = options.thetaCenter ?? 0;
    const radiusInflate = options.radiusInflate ?? 1;
    const rawCells =
        options.capAngle != null
            ? tessellateSphereCapQuads({
                  radius,
                  rollQuat,
                  phiCenter,
                  thetaCenter,
                  capAngle: options.capAngle,
                  gridSegments: options.gridSegments ?? 18,
                  subSegments: options.subSegments ?? 2,
                  radiusInflate,
              })
            : tessellateSphereQuads({
                  radius,
                  rollQuat,
                  phiMin: phiCenter - (options.phiHalf ?? 0.42),
                  phiMax: phiCenter + (options.phiHalf ?? 0.42),
                  thetaMin: thetaCenter - (options.thetaHalf ?? 0.42),
                  thetaMax: thetaCenter + (options.thetaHalf ?? 0.42),
                  phiSegments: options.phiSegments ?? 12,
                  thetaSegments: options.thetaSegments ?? 12,
                  subPhi: options.subPhi ?? 2,
                  subTheta: options.subTheta ?? 2,
                  radiusInflate,
              });
    const projected = [];
    for (const cell of rawCells) {
        if (!isSphereQuadVisible(prop, px, py, cell.verts)) continue;
        projected.push(projectSphereCell(cell, prop, px, py));
    }
    const cells = gatherTexturedQuadCells(projected, img, options.uvBleed ?? 1);
    drawTexturedQuadCells(ctx, cells, img, { screenBleed: options.screenBleed ?? 0, imageSmoothing: options.imageSmoothing ?? true });
}
