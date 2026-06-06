import { buildLongAxisBoxMesh } from "../../Spatial/transforms/longAxisBox3d.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
/**
 * Low-poly long-axis box: tumble (rollAngle, local X) + spin (facing), iso projected.
 */
export function drawLoFiRollingBox(ctx, prop, px, py, options) {
    const hx = options.halfExtents.x;
    const hy = options.halfExtents.y;
    const height = options.height;
    const colors = options.colors;
    const stroke = "stroke" in options ? options.stroke : "#3E2723";
    const lineWidth = options.lineWidth ?? 1.0;
    const facing = prop.facing ?? 0;
    const rollAngle = prop.rollAngle ?? 0;
    const panelFill = { bottom: colors.bottom, top: colors.top, sideA: colors.side, sideB: colors.sideAlt ?? colors.side, endA: colors.end, endB: colors.endAlt ?? colors.end };
    const mesh = buildLongAxisBoxMesh(hx, hy, height, facing, rollAngle);
    const backFaces = [];
    const frontFaces = [];
    for (const face of mesh)
        if (isPropMeshFaceVisible(prop, px, py, face.verts)) frontFaces.push(face);
        else backFaces.push(face);
    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) {
            const fill = panelFill[face.panel] ?? colors.side;
            drawPropMeshFace(ctx, prop, px, py, face.verts, fill, stroke, lineWidth);
        }
    };
    drawPass(backFaces);
    drawPass(frontFaces);
}
