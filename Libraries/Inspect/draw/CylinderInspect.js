/**
 * Inspect-view drawing for cylindrical props (body shell + label band).
 */
import { createInspectCamera } from "../camera/InspectCamera.js";
import { drawImageQuad } from "./AffineTexture.js";
import { tessellateCylinderQuads, drawSolidQuad } from "../geometry/CylinderSurface.js";
import { labelBandYRange } from "../../../../Math/Interpolate.js";

const DEFAULT_SUBDIV = { subRadial: 2, subVertical: 2 };
const DEFAULT_BLEED = { uvBleed: 2, screenBleed: 2.5 };

function inspectCamera(cx, cy, scale, { referenceDepth = 420, screenScale = scale * 88 } = {}) {
    return createInspectCamera(cx, cy, scale, 0, 0, { referenceDepth, screenScale });
}

function sortAndDrawCells(ctx, cells, drawCell, { imageSmoothing = null } = {}) {
    if (!cells.length) return;
    cells.sort((a, b) => b.depth - a.depth);
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (imageSmoothing != null) ctx.imageSmoothingEnabled = imageSmoothing;
    for (const cell of cells) drawCell(ctx, cell);
    if (imageSmoothing != null) ctx.imageSmoothingEnabled = prevSmooth;
}

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

function gatherLabelCells(rawCells, img, uvBleed) {
    const iw = img.width;
    const ih = img.height;
    const cells = [];
    const hullTop = [];
    const hullBot = [];

    for (const cell of rawCells) {
        const { u0, u1, v0, v1, d0, d1, d2, d3, depth } = cell;
        const sx0 = u0 * iw - (u0 > 0 ? uvBleed : 0);
        const sx1 = u1 * iw + (u1 < 1 ? uvBleed : 0);
        const sy0 = v0 * ih - (v0 > 0 ? uvBleed : 0);
        const sy1 = v1 * ih + (v1 < 1 ? uvBleed : 0);

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

    return { cells, hull: [...hullTop, ...hullBot.slice().reverse()] };
}

/** Draw a soda-can body shell using cylindrical quad tessellation. */
export function drawInspectCylindricalBody(ctx, cx, cy, scale, yaw, pitch, {
    halfHeight = 1.05,
    bodyRadius = 0.5,
    rings = null,
    color = "#B4BAC2",
    radialSegments = 24,
    verticalSegments = 32,
    screenBleed = DEFAULT_BLEED.screenBleed,
    referenceDepth = 420,
    screenScale = scale * 88,
    ...subdiv
} = {}) {
    const cells = tessellateCylinderQuads({
        halfHeight,
        bodyRadius,
        rings,
        yaw,
        pitch,
        camera: inspectCamera(cx, cy, scale, { referenceDepth, screenScale }),
        yBot: -halfHeight,
        yTop: halfHeight,
        angleSpan: Math.PI * 2,
        radialSegments,
        verticalSegments,
        ...DEFAULT_SUBDIV,
        ...subdiv,
    });

    sortAndDrawCells(ctx, cells, (ctx, cell) => {
        drawSolidQuad(ctx, cell.d0, cell.d1, cell.d2, cell.d3, color, screenBleed);
    });
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
    uvBleed = DEFAULT_BLEED.uvBleed,
    screenBleed = DEFAULT_BLEED.screenBleed,
    referenceDepth = 420,
    screenScale = scale * 88,
    ...subdiv
} = {}) {
    if (!img) return;

    const { yBot, yTop } = labelBandYRange(halfHeight, y0, y1);
    const rawCells = tessellateCylinderQuads({
        halfHeight,
        bodyRadius,
        yaw,
        pitch,
        camera: inspectCamera(cx, cy, scale, { referenceDepth, screenScale }),
        yBot,
        yTop,
        angleCenter,
        angleSpan,
        radialSegments,
        verticalSegments,
        radiusInflate,
        ...DEFAULT_SUBDIV,
        ...subdiv,
    });

    const { cells, hull } = gatherLabelCells(rawCells, img, uvBleed);
    if (!cells.length) return;

    drawBackingHull(ctx, hull, underlay);

    const textureOpts = { underlay: null, bleedPx: screenBleed };
    sortAndDrawCells(ctx, cells, (ctx, cell) => {
        drawImageQuad(
            ctx, img,
            cell.sx0, cell.sy0, cell.sx1, cell.sy1,
            cell.d0, cell.d1, cell.d2, cell.d3,
            textureOpts,
        );
    }, { imageSmoothing: true });
}
