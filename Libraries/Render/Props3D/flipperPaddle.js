import { drawExtrudedRadial } from "./SolidDraw.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
/** @param {number} length @param {number} halfW @param {number} height @param {number} facing */
function buildFlipperPaddleMesh(length, halfW, height, facing) {
    const local = [
        { lx: 0, ly: -halfW, z: 0 },
        { lx: length, ly: -halfW, z: 0 },
        { lx: length, ly: halfW, z: 0 },
        { lx: 0, ly: halfW, z: 0 },
        { lx: 0, ly: -halfW, z: height },
        { lx: length, ly: -halfW, z: height },
        { lx: length, ly: halfW, z: height },
        { lx: 0, ly: halfW, z: height },
    ];
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const corners = local.map((v) => ({ lx: v.lx * cos - v.ly * sin, ly: v.lx * sin + v.ly * cos, z: v.z }));
    const tri = (i0, i1, i2, panel) => {
        const verts = [corners[i0], corners[i1], corners[i2]];
        return { verts, panel, depth: (verts[0].z + verts[1].z + verts[2].z) / 3 };
    };
    const quad = (a, b, c, d, panel) => [tri(a, b, c, panel), tri(a, c, d, panel)];
    return [...quad(0, 1, 2, 3, "bottom"), ...quad(4, 5, 6, 7, "top"), ...quad(0, 1, 5, 4, "sideA"), ...quad(1, 2, 6, 5, "tip"), ...quad(2, 3, 7, 6, "sideB"), ...quad(3, 0, 4, 7, "pivot")];
}
/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {number} px @param {number} py @param {object} options */
export function drawFlipperPaddle(ctx, prop, px, py, options) {
    const length = options.length ?? 32;
    const halfW = (options.width ?? 8) * 0.5;
    const height = options.height ?? 10;
    const pivotRadius = options.pivotRadius ?? 5;
    const angle = prop._flipperAngle ?? options.restAngle ?? 0.45;
    const colors = options.colors;
    const stroke = colors.stroke ?? "#263238";
    const lineWidth = options.lineWidth ?? 0.9;
    const mesh = buildFlipperPaddleMesh(length, halfW, height, angle);
    const panelFill = {
        bottom: colors.bottom?.mid ?? colors.side.mid,
        top: colors.top?.mid ?? colors.side.highlight,
        sideA: colors.side.mid,
        sideB: colors.side.shadow,
        tip: colors.tip?.mid ?? colors.side.highlight,
        pivot: colors.pivot?.mid ?? colors.side.shadow,
    };
    const backFaces = [];
    const frontFaces = [];
    for (const face of mesh)
        if (isPropMeshFaceVisible(prop, px, py, face.verts)) frontFaces.push(face);
        else backFaces.push(face);
    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) drawPropMeshFace(ctx, prop, px, py, face.verts, panelFill[face.panel] ?? colors.side.mid, stroke, lineWidth);
    };
    drawPass(backFaces);
    drawExtrudedRadial(ctx, prop, px, py, { baseRadius: pivotRadius, height: height * 0.85, facing: angle, colors: colors.pivot ?? colors.side, stroke });
    drawPass(frontFaces);
}
