import { resolveBodyRadius } from "../../Motion/bodyDefaults.js";
import { IDENTITY_ROLL_QUAT } from "../../Props/rollingMotion.js";
import { isPropMeshFaceVisible, projectPropVertexInto, projectPropVertexScalarsInto } from "../Props3D/propMesh.js";
import { tessellateSphereCapQuads, tessellateSphereQuads } from "./sphereSurface.js";
import { drawTexturedQuadCells, gatherTexturedQuadCells, drawTexturedQuadCellsFlat, gatherTexturedQuadCellsFlat } from "./texturedCells.js";

let sProjectedSphereCellsData = new Float32Array(1024 * 13);
let sCellIndices = new Int32Array(1024);

function ensureProjectedCapacity(count) {
    if (sProjectedSphereCellsData.length < count * 13) {
        const newLen = Math.max(sProjectedSphereCellsData.length * 2, count * 13);
        sProjectedSphereCellsData = new Float32Array(newLen);
        sCellIndices = new Int32Array(newLen / 13);
    }
}

function isSphereQuadVisible(prop, viewport, verts) {
    const [v00, v01, v11, v10] = verts;
    return isPropMeshFaceVisible(prop, viewport, [v00, v01, v11]) || isPropMeshFaceVisible(prop, viewport, [v00, v11, v10]);
}

function projectSphereCellIntoFlat(data, index, cell, prop, viewport) {
    const [v00, v01, v11, v10] = cell.verts;
    const base = index * 13;
    data[base + 0] = cell.depth;
    data[base + 1] = cell.u0;
    data[base + 2] = cell.u1;
    data[base + 3] = cell.v0;
    data[base + 4] = cell.v1;
    projectPropVertexScalarsInto(data, base + 5, prop, viewport, v00.lx, v00.ly, v00.z);
    projectPropVertexScalarsInto(data, base + 7, prop, viewport, v01.lx, v01.ly, v01.z);
    projectPropVertexScalarsInto(data, base + 9, prop, viewport, v11.lx, v11.ly, v11.z);
    projectPropVertexScalarsInto(data, base + 11, prop, viewport, v10.lx, v10.ly, v10.z);
}

/**
 * Map an image onto a rolled spherical patch in radial elevation space.
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
export function drawSphereTexturePatch(ctx, prop, viewport, img, options = {}) {
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
    ensureProjectedCapacity(rawCells.length);
    for (let i = 0; i < rawCells.length; i++) {
        const cell = rawCells[i];
        if (!isSphereQuadVisible(prop, viewport, cell.verts)) continue;
        projectSphereCellIntoFlat(sProjectedSphereCellsData, projectedCount, cell, prop, viewport);
        sCellIndices[projectedCount] = projectedCount;
        projectedCount++;
    }
    gatherTexturedQuadCellsFlat(sProjectedSphereCellsData, projectedCount, img, options.uvBleed ?? 1);
    drawTexturedQuadCellsFlat(ctx, sProjectedSphereCellsData, sCellIndices, projectedCount, img);
}
