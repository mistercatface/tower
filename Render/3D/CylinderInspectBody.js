/**
 * Cylindrical body surface for inspect view — same tessellation as the label overlay.
 */
import { tessellateCylinderQuads, drawSolidQuad } from "./CylinderSurface.js";

/** Draw a soda-can body shell using cylindrical quad tessellation. */
export function drawInspectCylindricalBody(ctx, cx, cy, scale, yaw, pitch, {
    halfHeight = 1.05,
    bodyRadius = 0.5,
    rings = null,
    color = "#B4BAC2",
    radialSegments = 24,
    verticalSegments = 32,
    subRadial = 2,
    subVertical = 2,
    screenBleed = 2.5,
    referenceDepth = 420,
    screenScale = scale * 88,
} = {}) {
    const camera = { cx, cy, referenceDepth, screenScale };
    const cells = tessellateCylinderQuads({
        halfHeight,
        bodyRadius,
        rings,
        yaw,
        pitch,
        camera,
        yBot: -halfHeight,
        yTop: halfHeight,
        angleCenter: 0,
        angleSpan: Math.PI * 2,
        radialSegments,
        verticalSegments,
        subRadial,
        subVertical,
    });

    if (cells.length === 0) return;

    cells.sort((a, b) => b.depth - a.depth);

    for (const cell of cells) {
        drawSolidQuad(ctx, cell.d0, cell.d1, cell.d2, cell.d3, color, screenBleed);
    }
}
