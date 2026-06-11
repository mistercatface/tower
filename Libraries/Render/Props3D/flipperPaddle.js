import { drawExtrudedRadial } from "./SolidDraw.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
/** @param {number} length @param {number} halfW @param {number} height @param {number} facing */
function buildFlipperPaddleMesh(length, halfW, height, pivotRadius, facing) {
    const R1 = pivotRadius;
    const R2 = Math.max(1, halfW * 0.45);
    const D = length - R2;
    const theta = Math.asin(Math.max(0, Math.min(1, (R1 - R2) / D)));
    const footprint = [];
    // Base semi-circle (from bottom-left around back to top-left)
    const startBase = Math.PI / 2 - theta;
    const endBase = Math.PI * 1.5 + theta;
    const numBaseSegments = 6;
    for (let i = 0; i <= numBaseSegments; i++) {
        const a = startBase + (endBase - startBase) * (i / numBaseSegments);
        footprint.push({ lx: R1 * Math.cos(a), ly: R1 * Math.sin(a) });
    }
    // Tip semi-circle (from top-right around front to bottom-right)
    const startTip = -Math.PI / 2 + theta;
    const endTip = Math.PI / 2 - theta;
    const numTipSegments = 5;
    for (let i = 0; i <= numTipSegments; i++) {
        const a = startTip + (endTip - startTip) * (i / numTipSegments);
        footprint.push({ lx: D + R2 * Math.cos(a), ly: R2 * Math.sin(a) });
    }
    const N = footprint.length;
    const local = [];
    for (let p of footprint) local.push({ ...p, z: 0 }); // Bottom
    for (let p of footprint) local.push({ ...p, z: height }); // Top
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const corners = local.map((v) => ({ lx: v.lx * cos - v.ly * sin, ly: v.lx * sin + v.ly * cos, z: v.z }));
    const face = (indices, panel) => {
        const verts = indices.map((i) => corners[i]);
        return { verts, panel, depth: verts.reduce((sum, v) => sum + v.z, 0) / verts.length };
    };
    const mesh = [];
    // Bottom face (reverse to face down)
    const bottomIndices = [];
    for (let i = 0; i < N; i++) bottomIndices.push(N - 1 - i);
    mesh.push(face(bottomIndices, "bottom"));
    // Top face
    const topIndices = [];
    for (let i = 0; i < N; i++) topIndices.push(i + N);
    mesh.push(face(topIndices, "top"));
    // Sides
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        let panel = "sideA";
        if (i < numBaseSegments)
            panel = "pivot"; // Rounded back
        else if (i === numBaseSegments)
            panel = "sideA"; // Straight top edge
        else if (i > numBaseSegments && i < N - 1)
            panel = "tip"; // Rounded front
        else panel = "sideB"; // Straight bottom edge
        mesh.push(face([i, next, next + N, i + N], panel));
    }
    return mesh;
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
    const mesh = buildFlipperPaddleMesh(length, halfW, height, pivotRadius, angle);
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
    drawPass(frontFaces);
}
