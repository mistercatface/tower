import { transformLongAxisVertex } from "../../Spatial/transforms/longAxisBox3d.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
const DEFAULT_SEGMENTS = 12;
/**
 * Cylinder along local X (log long-axis frame) — uses physics facing + rollAngle directly.
 *
 * @param {number} hx — half-length along local X
 * @param {number} hy — cross-section radius
 * @param {number} height — roll pivot height (same role as log box)
 * @param {number} facing
 * @param {number} rollAngle
 */
export function buildLongAxisCylinderMesh(hx, hy, height, facing, rollAngle, segments = DEFAULT_SEGMENTS) {
    const ring = (lx) => {
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const ly = Math.cos(a) * hy;
            const lz = hy + Math.sin(a) * hy;
            pts.push(transformLongAxisVertex(lx, ly, lz, facing, height, rollAngle));
        }
        return pts;
    };
    const left = ring(-hx);
    const right = ring(hx);
    const mesh = [];
    const tri = (v0, v1, v2, panel) => {
        const verts = [v0, v1, v2];
        return { verts, panel, depth: (verts[0].z + verts[1].z + verts[2].z) / 3 };
    };
    for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        const shade = i % 2 === 0 ? "sideA" : "sideB";
        mesh.push(tri(left[i], left[j], right[j], shade));
        mesh.push(tri(left[i], right[j], right[i], shade));
    }
    for (let i = 1; i < segments - 1; i++) {
        mesh.push(tri(left[0], left[i], left[i + 1], "endA"));
        mesh.push(tri(right[0], right[i + 1], right[i], "endB"));
    }
    return mesh;
}
/**
 * Fallen stand-tip cylinder — same transform convention as log rolling box.
 */
export function drawLoFiLongAxisCylinder(ctx, prop, px, py, options) {
    const hx = options.hx;
    const hy = options.hy;
    const height = options.height;
    const colors = options.colors;
    const stroke = options.stroke ?? "#505860";
    const lineWidth = options.lineWidth ?? 0.85;
    const facing = prop.facing ?? 0;
    const rollAngle = prop.rollAngle ?? 0;
    const panelFill = { sideA: colors.side, sideB: colors.sideAlt ?? colors.side, endA: colors.top, endB: colors.bottom ?? colors.lip };
    const mesh = buildLongAxisCylinderMesh(hx, hy, height, facing, rollAngle, options.segments ?? DEFAULT_SEGMENTS);
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
/**
 * Upright cylinder tipping about local X (stand-tip phase only).
 *
 * @param {number} radius
 * @param {number} height
 * @param {number} facing
 * @param {number} rollAngle
 */
function buildTippedCylinderMesh(radius, height, facing, rollAngle) {
    const ring = (z) => {
        const pts = [];
        for (let i = 0; i < DEFAULT_SEGMENTS; i++) {
            const a = (i / DEFAULT_SEGMENTS) * Math.PI * 2;
            pts.push(transformLongAxisVertex(Math.cos(a) * radius, Math.sin(a) * radius, z, facing, height, rollAngle));
        }
        return pts;
    };
    const bottom = ring(0);
    const top = ring(height);
    const mesh = [];
    const tri = (v0, v1, v2, panel) => {
        const verts = [v0, v1, v2];
        return { verts, panel, depth: (verts[0].z + verts[1].z + verts[2].z) / 3 };
    };
    for (let i = 0; i < DEFAULT_SEGMENTS; i++) {
        const j = (i + 1) % DEFAULT_SEGMENTS;
        const shade = i % 2 === 0 ? "sideA" : "sideB";
        mesh.push(tri(bottom[i], bottom[j], top[j], shade));
        mesh.push(tri(bottom[i], top[j], top[i], shade));
    }
    for (let i = 1; i < DEFAULT_SEGMENTS - 1; i++) {
        mesh.push(tri(bottom[0], bottom[i], bottom[i + 1], "bottom"));
        mesh.push(tri(top[0], top[i + 1], top[i], "top"));
    }
    return mesh;
}
/**
 * Cylinder tipped via shared long-axis transform (rollAngle + facing).
 */
export function drawLoFiTippedCylinder(ctx, prop, px, py, options) {
    const radius = options.radius;
    const height = options.height;
    const colors = options.colors;
    const stroke = options.stroke ?? "#505860";
    const lineWidth = options.lineWidth ?? 0.85;
    const facing = prop.facing ?? 0;
    const rollAngle = prop.rollAngle ?? 0;
    const panelFill = { sideA: colors.side, sideB: colors.sideAlt ?? colors.side, top: colors.top, bottom: colors.bottom ?? colors.lip };
    const mesh = buildTippedCylinderMesh(radius, height, facing, rollAngle);
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
