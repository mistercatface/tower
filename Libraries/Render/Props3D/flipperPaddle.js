import { getPropAsset } from "../../Props/PropCatalog.js";
import { rotateXY } from "../../Math/Poly2D.js";
import { getFlipperSpec } from "../../Sandbox/behaviors/flipperBehavior.js";
import { resolveVisualOverrideColorTree } from "../../Color/visualOverride.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
/** @param {number} length @param {number} halfW @param {number} height @param {number} facing @param {number} extendDir */
function buildFlipperPaddleMesh(length, halfW, height, pivotRadius, facing, extendDir) {
    const R1 = pivotRadius;
    const R2 = Math.max(1, halfW * 0.45);
    const D = length - R2;
    const theta = Math.asin(Math.max(0, Math.min(1, (R1 - R2) / D)));
    const footprint = [];
    const startBase = Math.PI / 2 - theta;
    const endBase = Math.PI * 1.5 + theta;
    const numBaseSegments = 6;
    for (let i = 0; i <= numBaseSegments; i++) {
        const a = startBase + (endBase - startBase) * (i / numBaseSegments);
        footprint.push({ lx: R1 * Math.cos(a), ly: R1 * Math.sin(a) });
    }
    const startTip = -Math.PI / 2 + theta;
    const endTip = Math.PI / 2 - theta;
    const numTipSegments = 5;
    for (let i = 0; i <= numTipSegments; i++) {
        const a = startTip + (endTip - startTip) * (i / numTipSegments);
        footprint.push({ lx: D + R2 * Math.cos(a), ly: R2 * Math.sin(a) });
    }
    const N = footprint.length;
    const local = [];
    for (let p of footprint) local.push({ ...p, z: 0 });
    for (let p of footprint) local.push({ ...p, z: height });
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const flipX = extendDir < 0;
    const corners = local.map((v) => {
        const lx0 = flipX ? -v.lx : v.lx;
        const r = rotateXY(lx0, v.ly, cos, sin);
        return { lx: r.x, ly: r.y, z: v.z };
    });
    const face = (indices, panel) => {
        const verts = indices.map((i) => corners[i]);
        if (flipX) verts.reverse();
        return { verts, panel, depth: verts.reduce((sum, v) => sum + v.z, 0) / verts.length };
    };
    const mesh = [];
    const bottomIndices = [];
    for (let i = 0; i < N; i++) bottomIndices.push(N - 1 - i);
    mesh.push(face(bottomIndices, "bottom"));
    const topIndices = [];
    for (let i = 0; i < N; i++) topIndices.push(i + N);
    mesh.push(face(topIndices, "top"));
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        let panel = "sideA";
        if (i < numBaseSegments) panel = "pivot";
        else if (i === numBaseSegments) panel = "sideA";
        else if (i > numBaseSegments && i < N - 1) panel = "tip";
        else panel = "sideB";
        mesh.push(face([i, next, next + N, i + N], panel));
    }
    return mesh;
}
/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {number} px @param {number} py @param {object} options */
export function drawFlipperPaddle(ctx, prop, px, py, options) {
    const asset = getPropAsset(prop.type);
    const spec = getFlipperSpec(prop, asset);
    const length = spec.length;
    const halfW = spec.width * 0.5;
    const height = spec.height;
    const pivotRadius = spec.pivotRadius;
    const angle = prop._flipperAngle ?? spec.restAngle;
    const colors = options.colors;
    const stroke = colors.stroke ?? "#263238";
    const lineWidth = options.lineWidth ?? 0.9;
    const mesh = buildFlipperPaddleMesh(length, halfW, height, pivotRadius, angle, spec.extendDir);
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
/** @param {object} visuals */
export function createFlipperPrimitive(visuals) {
    const { world, colors, activeColors } = visuals;
    return (ctx, prop, px, py) => {
        const active = prop._flipperTarget === "active" || prop._flipperButtonPressed;
        const base = active && activeColors ? activeColors : colors;
        drawFlipperPaddle(ctx, prop, px, py, { world, colors: resolveVisualOverrideColorTree(prop, base), lineWidth: visuals.lineWidth ?? 0.9 });
    };
}
