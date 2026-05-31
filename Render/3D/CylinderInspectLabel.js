/**
 * Cylindrical label overlay for inspect view.
 */
import { tessellateCylinderQuads } from "./CylinderSurface.js";
import { drawImageQuad } from "./core/AffineTexture.js";

function drawBackingHull(ctx, points, color) {
    if (points.length < 3) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** Wrap a label image around a cylindrical band using the inspect camera. */
export function drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
    img,
    halfHeight = 1.05,
    bodyRadius = 0.5,
    y0 = 0.22,
    y1 = 0.78,
    angleCenter = -Math.PI / 2,
    angleSpan = Math.PI * 1.15,
    radialSegments = 10,
    verticalSegments = 18,
    radiusInflate = 1.006,
    underlay = "#B4BAC2",
    referenceDepth = 420,
    screenScale = scale * 88,
    uvBleed = 2,
    screenBleed = 2.5,
    subRadial = 2,
    subVertical = 2,
} = {}) {
    if (!img) return;

    const camera = { cx, cy, referenceDepth, screenScale };
    const yBot = -halfHeight + halfHeight * 2 * y0;
    const yTop = -halfHeight + halfHeight * 2 * y1;
    const iw = img.width;
    const ih = img.height;

    const rawCells = tessellateCylinderQuads({
        halfHeight,
        bodyRadius,
        yaw,
        pitch,
        camera,
        yBot,
        yTop,
        angleCenter,
        angleSpan,
        radialSegments,
        verticalSegments,
        subRadial,
        subVertical,
        radiusInflate,
    });

    const cells = [];
    const hullTop = [];
    const hullBot = [];

    for (const cell of rawCells) {
        const { u0, u1, v0, v1, d0, d1, d2, d3, depth } = cell;
        const innerU = u0 > 0;
        const outerU = u1 < 1;
        const innerV = v0 > 0;
        const outerV = v1 < 1;
        const sx0 = u0 * iw - (innerU ? uvBleed : 0);
        const sx1 = u1 * iw + (outerU ? uvBleed : 0);
        const sy0 = v0 * ih - (innerV ? uvBleed : 0);
        const sy1 = v1 * ih + (outerV ? uvBleed : 0);

        cells.push({ depth, sx0, sy0, sx1, sy1, d0, d1, d2, d3 });

        if (v0 === 0) {
            if (u0 === 0) hullTop.push(d0);
            hullTop.push(d1);
        }
        if (v1 === 1) {
            if (u0 === 0) hullBot.push(d3);
            hullBot.push(d2);
        }
    }

    if (cells.length === 0) return;

    drawBackingHull(ctx, [...hullTop, ...hullBot.slice().reverse()], underlay);

    cells.sort((a, b) => b.depth - a.depth);

    const textureOpts = { underlay: null, bleedPx: screenBleed };
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    for (const cell of cells) {
        drawImageQuad(
            ctx, img,
            cell.sx0, cell.sy0, cell.sx1, cell.sy1,
            cell.d0, cell.d1, cell.d2, cell.d3,
            textureOpts,
        );
    }
    ctx.imageSmoothingEnabled = prevSmooth;
}
