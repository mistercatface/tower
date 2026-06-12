/**
 * Inspect-view drawing for cylindrical props (body shell + label band).
 */
import { createInspectCamera } from "../camera/InspectCamera.js";
import { tessellateCylinderQuads, drawSolidQuad } from "../geometry/CylinderSurface.js";
import { labelBandYRange } from "../../Math/Interpolate.js";
import { drawTexturedQuadCells, gatherTexturedQuadCells } from "../../Render/SurfaceTexturing/texturedCells.js";
import { traceClosedPolygon } from "../../Canvas/CanvasPath.js";
const DEFAULT_SUBDIV = { subRadial: 2, subVertical: 2 };
const DEFAULT_BLEED = { uvBleed: 2, screenBleed: 2.5 };
function inspectCamera(cx, cy, scale, { referenceDepth = 420, screenScale = scale * 88 } = {}) {
    return createInspectCamera(cx, cy, scale, 0, 0, { referenceDepth, screenScale });
}
function sortAndDrawCells(ctx, cells, drawCell) {
    if (!cells.length) return;
    cells.sort((a, b) => b.depth - a.depth);
    for (let i = 0; i < cells.length; i++) drawCell(ctx, cells[i]);
}
function drawBackingHull(ctx, points, color) {
    if (points.length < 3) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    traceClosedPolygon(ctx, points);
    ctx.fill();
    ctx.restore();
}
/** Draw a soda-can body shell using cylindrical quad tessellation. */
export function drawInspectCylindricalBody(
    ctx,
    cx,
    cy,
    scale,
    yaw,
    pitch,
    {
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
    } = {},
) {
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
export function drawInspectCylindricalLabel(
    ctx,
    cx,
    cy,
    scale,
    yaw,
    pitch,
    {
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
    } = {},
) {
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
    const { cells, hull } = gatherTexturedQuadCells(rawCells, img, uvBleed, { collectHull: true });
    if (!cells.length) return;
    drawBackingHull(ctx, hull, underlay);
    drawTexturedQuadCells(ctx, cells, img, { bleedPx: screenBleed });
}
