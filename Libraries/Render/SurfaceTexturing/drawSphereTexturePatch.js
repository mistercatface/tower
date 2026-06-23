import { resolveBodyRadius } from "../../Motion/bodyDefaults.js";
import { IDENTITY_ROLL_QUAT } from "../../Props/rollingMotion.js";
import { isPropMeshFaceVisible, projectPropVertexInto } from "../Props3D/propMesh.js";
import { tessellateSphereCapQuads, tessellateSphereQuads } from "./sphereSurface.js";
import { drawTexturedQuadCells, gatherTexturedQuadCells } from "./texturedCells.js";
/** @type {{ depth: number, u0: number, u1: number, v0: number, v1: number, d0: { x: number, y: number }, d1: { x: number, y: number }, d2: { x: number, y: number }, d3: { x: number, y: number } }[]} */
const sProjectedSphereCells = [];
/** @param {number} index */
function borrowProjectedSphereCell(index) {
    while (sProjectedSphereCells.length <= index) sProjectedSphereCells.push({ depth: 0, u0: 0, u1: 0, v0: 0, v1: 0, d0: { x: 0, y: 0 }, d1: { x: 0, y: 0 }, d2: { x: 0, y: 0 }, d3: { x: 0, y: 0 } });
    return sProjectedSphereCells[index];
}
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
 * @param {ReturnType<typeof borrowProjectedSphereCell>} out
 * @param {object} cell
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 */
function projectSphereCellInto(out, cell, prop, px, py) {
    const [v00, v01, v11, v10] = cell.verts;
    out.depth = cell.depth;
    out.u0 = cell.u0;
    out.u1 = cell.u1;
    out.v0 = cell.v0;
    out.v1 = cell.v1;
    projectPropVertexInto(out.d0, prop, px, py, v00.lx, v00.ly, v00.z);
    projectPropVertexInto(out.d1, prop, px, py, v01.lx, v01.ly, v01.z);
    projectPropVertexInto(out.d2, prop, px, py, v11.lx, v11.ly, v11.z);
    projectPropVertexInto(out.d3, prop, px, py, v10.lx, v10.ly, v10.z);
    return out;
}
/**
 * Map an image onto a rolled spherical patch in world iso space.
 * Uses the same quad + affine texture path as inspect cylindrical labels.
 *
 * Prefer `capAngle` for circular decals (pool numbers).
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
 * }} [options]
 */
export function drawSphereTexturePatch(ctx, prop, px, py, img, options = {}) {
    const radius = options.baseRadius ?? resolveBodyRadius(prop);
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
    let projectedCount = 0;
    for (let i = 0; i < rawCells.length; i++) {
        const cell = rawCells[i];
        if (!isSphereQuadVisible(prop, px, py, cell.verts)) continue;
        projectSphereCellInto(borrowProjectedSphereCell(projectedCount), cell, prop, px, py);
        projectedCount++;
    }
    sProjectedSphereCells.length = projectedCount;
    const cells = gatherTexturedQuadCells(sProjectedSphereCells, img, options.uvBleed ?? 1);
    drawTexturedQuadCells(ctx, cells, img);
}
