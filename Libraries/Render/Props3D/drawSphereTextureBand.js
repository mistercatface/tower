import { drawImageTriangle } from "../../Canvas/AffineTexture.js";
import { IDENTITY_ROLL_QUAT } from "../../Props/rollingMotion.js";
import { buildSphereMesh } from "./sphereMesh.js";
import { isPropMeshFaceVisible, projectPropVertex } from "./propMesh.js";

/**
 * Map an image onto a latitudinal band of a rolled sphere in world iso space.
 * Reuses the same affine texture path as inspect cylindrical labels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {CanvasImageSource} img
 * @param {{
 *   baseRadius?: number,
 *   latBands?: number,
 *   lonBands?: number,
 *   vMin?: number,
 *   vMax?: number,
 *   uvBleed?: number,
 *   imageSmoothing?: boolean | null,
 * }} [options]
 */
export function drawSphereTextureBand(ctx, prop, px, py, img, options = {}) {
    const radius = options.baseRadius ?? prop.radius ?? 8;
    const latBands = Math.max(3, options.latBands ?? 8);
    const lonBands = Math.max(4, options.lonBands ?? 12);
    const vMin = options.vMin ?? 0.35;
    const vMax = options.vMax ?? 0.65;
    const uvBleed = options.uvBleed ?? 1.5;
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;

    const iw = img.width;
    const ih = img.height;
    const mesh = buildSphereMesh(radius, latBands, lonBands, rollQuat);
    const cells = [];

    for (const face of mesh) {
        if (face.lat1 < vMin || face.lat0 > vMax) continue;
        if (!isPropMeshFaceVisible(prop, px, py, face.verts)) continue;

        const d0 = projectPropVertex(prop, px, py, face.verts[0].lx, face.verts[0].ly, face.verts[0].z);
        const d1 = projectPropVertex(prop, px, py, face.verts[1].lx, face.verts[1].ly, face.verts[1].z);
        const d2 = projectPropVertex(prop, px, py, face.verts[2].lx, face.verts[2].ly, face.verts[2].z);

        const sx0 = face.lon0 * iw - (face.lon0 > 0 ? uvBleed : 0);
        const sx1 = face.lon1 * iw + (face.lon1 < 1 ? uvBleed : 0);
        const sy0 = face.lat0 * ih - (face.lat0 > vMin ? uvBleed : 0);
        const sy1 = face.lat1 * ih + (face.lat1 < vMax ? uvBleed : 0);

        const s0 = { x: sx0, y: sy0 };
        const s1 = { x: sx1, y: sy0 };
        const s2 = { x: sx0, y: sy1 };

        cells.push({ depth: face.depth, s0, s1, s2, d0, d1, d2 });
    }

    if (!cells.length) return;

    cells.sort((a, b) => a.depth - b.depth);
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (options.imageSmoothing != null) ctx.imageSmoothingEnabled = options.imageSmoothing;

    for (const cell of cells) {
        drawImageTriangle(ctx, img, cell.s0, cell.s1, cell.s2, cell.d0, cell.d1, cell.d2);
    }

    if (options.imageSmoothing != null) ctx.imageSmoothingEnabled = prevSmooth;
}
