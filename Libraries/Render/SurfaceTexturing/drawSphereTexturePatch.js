import { resolveBodyRadius } from "../../Physics/physics.js";
import { IDENTITY_ROLL_QUAT } from "../../Physics/physics.js";
import { projectPropVertexScalarsInto } from "../Props3D/propMesh.js";
import { tessellateSphereCapQuadsFlat, tessellateSphereQuadsFlat } from "./sphereSurface.js";
import { drawTexturedQuadCellsFlat, gatherTexturedQuadCellsFlat } from "./texturedCells.js";
let sProjectedSphereCellsData = new Float32Array(1024 * 13);
let sCellIndices = new Int32Array(1024);
let sRawCellsData = new Float32Array(1024 * 17);
function ensureProjectedCapacity(count) {
    if (sProjectedSphereCellsData.length < count * 13) {
        const newLen = Math.max(sProjectedSphereCellsData.length * 2, count * 13);
        sProjectedSphereCellsData = new Float32Array(newLen);
        sCellIndices = new Int32Array(newLen / 13);
    }
}
function ensureRawCapacity(count) {
    if (sRawCellsData.length < count * 17) {
        const newLen = Math.max(sRawCellsData.length * 2, count * 17);
        sRawCellsData = new Float32Array(newLen);
    }
}
function isFaceVisibleScalars(prop, viewport, v0lx, v0ly, v0z, v1lx, v1ly, v1z, v2lx, v2ly, v2z) {
    const ax = v1lx - v0lx;
    const ay = v1ly - v0ly;
    const az = v1z - v0z;
    const bx = v2lx - v0lx;
    const by = v2ly - v0ly;
    const bz = v2z - v0z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const cx = prop.x + (v0lx + v1lx + v2lx) / 3;
    const cy = prop.y + (v0ly + v1ly + v2ly) / 3;
    const cz = (v0z + v1z + v2z) / 3;
    const vx = viewport.x - cx;
    const vy = viewport.y - cy;
    const vz = viewport.cameraHeight - cz;
    return nx * vx + ny * vy + nz * vz > 0;
}
function isSphereQuadVisibleFlat(prop, viewport, data, base) {
    return (
        isFaceVisibleScalars(prop, viewport, data[base + 5], data[base + 6], data[base + 7], data[base + 8], data[base + 9], data[base + 10], data[base + 11], data[base + 12], data[base + 13]) ||
        isFaceVisibleScalars(prop, viewport, data[base + 5], data[base + 6], data[base + 7], data[base + 11], data[base + 12], data[base + 13], data[base + 14], data[base + 15], data[base + 16])
    );
}
function projectSphereCellIntoFlat(dest, destIndex, src, srcIndex, prop, viewport) {
    const sBase = srcIndex * 17;
    const dBase = destIndex * 13;
    dest[dBase + 0] = src[sBase + 0];
    dest[dBase + 1] = src[sBase + 1];
    dest[dBase + 2] = src[sBase + 2];
    dest[dBase + 3] = src[sBase + 3];
    dest[dBase + 4] = src[sBase + 4];
    projectPropVertexScalarsInto(dest, dBase + 5, prop, viewport, src[sBase + 5], src[sBase + 6], src[sBase + 7]);
    projectPropVertexScalarsInto(dest, dBase + 7, prop, viewport, src[sBase + 8], src[sBase + 9], src[sBase + 10]);
    projectPropVertexScalarsInto(dest, dBase + 9, prop, viewport, src[sBase + 11], src[sBase + 12], src[sBase + 13]);
    projectPropVertexScalarsInto(dest, dBase + 11, prop, viewport, src[sBase + 14], src[sBase + 15], src[sBase + 16]);
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
    let rawCount = 0;
    if (options.capAngle != null) {
        const gridSegments = options.gridSegments ?? 18;
        const subSegments = options.subSegments ?? 2;
        const totalCapSegments = gridSegments * subSegments * gridSegments * subSegments;
        ensureRawCapacity(totalCapSegments);
        rawCount = tessellateSphereCapQuadsFlat(sRawCellsData, radius, rollQuat, phiCenter, thetaCenter, options.capAngle, gridSegments, subSegments, radiusInflate);
    } else {
        const phiSegments = options.phiSegments ?? 12;
        const thetaSegments = options.thetaSegments ?? 12;
        const subPhi = options.subPhi ?? 2;
        const subTheta = options.subTheta ?? 2;
        const totalSegments = phiSegments * subPhi * thetaSegments * subTheta;
        ensureRawCapacity(totalSegments);
        rawCount = tessellateSphereQuadsFlat(
            sRawCellsData,
            radius,
            rollQuat,
            phiCenter - (options.phiHalf ?? 0.42),
            phiCenter + (options.phiHalf ?? 0.42),
            thetaCenter - (options.thetaHalf ?? 0.42),
            thetaCenter + (options.thetaHalf ?? 0.42),
            phiSegments,
            thetaSegments,
            subPhi,
            subTheta,
            radiusInflate,
        );
    }
    ensureProjectedCapacity(rawCount);
    let projectedCount = 0;
    for (let i = 0; i < rawCount; i++) {
        const base = i * 17;
        if (!isSphereQuadVisibleFlat(prop, viewport, sRawCellsData, base)) continue;
        projectSphereCellIntoFlat(sProjectedSphereCellsData, projectedCount, sRawCellsData, i, prop, viewport);
        sCellIndices[projectedCount] = projectedCount;
        projectedCount++;
    }
    gatherTexturedQuadCellsFlat(sProjectedSphereCellsData, projectedCount, img, options.uvBleed ?? 1);
    drawTexturedQuadCellsFlat(ctx, sProjectedSphereCellsData, sCellIndices, projectedCount, img);
}
