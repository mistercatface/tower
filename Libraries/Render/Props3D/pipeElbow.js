import { getPropAsset } from "../../Props/PropCatalog.js";
import { buildPipeElbowCenterline3D, getPipeElbowSpec } from "../../Props/pipeElbowGeometry.js";
import { resolveVisualOverrideColorTree } from "../../Color/visualOverride.js";
import { rotateXY } from "../../Math/Poly2D.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
/** @param {number} lx @param {number} ly @param {number} lz @param {number} facing */
function yawLocal(lx, ly, lz, facing) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const r = rotateXY(lx, ly, cos, sin);
    return { lx: r.x, ly: r.y, z: lz };
}
/**
 * @param {{ x: number, y: number, z: number }} p
 * @param {{ x: number, y: number, z: number }} t
 * @param {number} radius
 * @param {number} ringIndex
 * @param {number} ringCount
 */
function ringAt(p, t, radius, ringIndex, ringCount) {
    const tLen = Math.hypot(t.x, t.y, t.z) || 1;
    const tx = t.x / tLen;
    const ty = t.y / tLen;
    const tz = t.z / tLen;
    let nx = -tz;
    let ny = 0;
    let nz = tx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const a = (ringIndex / ringCount) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return { x: p.x + radius * (nx * ca + bx * sa), y: p.y + radius * (ny * ca + by * sa), z: p.z + radius * (nz * ca + bz * sa) };
}
/**
 * @param {{ x: number, y: number, z: number }[]} centerline
 * @param {number} radius
 * @param {number} ringSegments
 */
function buildTubeMesh(centerline, radius, ringSegments = 8, { capStart = true, capEnd = true } = {}) {
    const n = centerline.length;
    /** @type {{ x: number, y: number, z: number }[][]} */
    const rings = [];
    for (let i = 0; i < n; i++) {
        const prev = centerline[Math.max(0, i - 1)];
        const next = centerline[Math.min(n - 1, i + 1)];
        const tangent = { x: next.x - prev.x, y: next.y - prev.y, z: next.z - prev.z };
        /** @type {{ x: number, y: number, z: number }[]} */
        const ring = [];
        for (let j = 0; j < ringSegments; j++) ring.push(ringAt(centerline[i], tangent, radius, j, ringSegments));
        rings.push(ring);
    }
    const face = (verts, panel) => ({ verts, panel, depth: verts.reduce((sum, v) => sum + v.z, 0) / verts.length });
    /** @type {ReturnType<typeof face>[]} */
    const mesh = [];
    for (let i = 0; i < n - 1; i++)
        for (let j = 0; j < ringSegments; j++) {
            const jn = (j + 1) % ringSegments;
            mesh.push(
                face(
                    [
                        { lx: rings[i][j].x, ly: rings[i][j].y, z: rings[i][j].z },
                        { lx: rings[i][jn].x, ly: rings[i][jn].y, z: rings[i][jn].z },
                        { lx: rings[i + 1][jn].x, ly: rings[i + 1][jn].y, z: rings[i + 1][jn].z },
                        { lx: rings[i + 1][j].x, ly: rings[i + 1][j].y, z: rings[i + 1][j].z },
                    ],
                    "side",
                ),
            );
        }
    const base = rings[0].map((v) => ({ lx: v.x, ly: v.y, z: v.z }));
    if (capStart) mesh.push(face([...base].reverse(), "bottom"));
    const top = rings[n - 1].map((v) => ({ lx: v.x, ly: v.y, z: v.z }));
    if (capEnd) mesh.push(face(top, "top"));
    return mesh;
}
/**
 * @param {number} radius
 * @param {number} height
 * @param {number} facing
 * @param {number} segments
 */
function buildFlangeMesh(radius, height, facing, segments = 10) {
    /** @type {{ lx: number, ly: number, z: number }[]} */
    const ring0 = [];
    /** @type {{ lx: number, ly: number, z: number }[]} */
    const ring1 = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ring0.push(yawLocal(radius * Math.cos(a), radius * Math.sin(a), 0, facing));
        ring1.push(yawLocal(radius * Math.cos(a), radius * Math.sin(a), height, facing));
    }
    const face = (verts, panel) => ({ verts, panel, depth: verts.reduce((sum, v) => sum + v.z, 0) / verts.length });
    /** @type {ReturnType<typeof face>[]} */
    const mesh = [];
    mesh.push(face([...ring0].reverse(), "bottom"));
    mesh.push(face(ring1, "top"));
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        mesh.push(face([ring0[i], ring0[next], ring1[next], ring1[i]], "side"));
    }
    return mesh;
}
/** @param {ReturnType<typeof getPipeElbowSpec>} spec @param {number} facing */
function buildPipeElbowMesh(spec, facing) {
    const centerline = buildPipeElbowCenterline3D(spec);
    const tube = buildTubeMesh(centerline, spec.pipeRadius, 8, { capStart: true, capEnd: false });
    const yawed = tube.map((face) => ({ ...face, verts: face.verts.map((v) => yawLocal(v.lx, v.ly, v.z, facing)) }));
    return [...buildFlangeMesh(spec.flangeRadius, spec.flangeHeight, facing), ...yawed];
}
/** @param {CanvasRenderingContext2D} ctx @param {object} prop @param {number} px @param {number} py @param {object} options */
export function drawPipeElbow(ctx, prop, px, py, options) {
    const asset = getPropAsset(prop.type);
    const spec = getPipeElbowSpec(prop, asset);
    const facing = prop.facing ?? 0;
    const colors = options.colors;
    const stroke = colors.stroke ?? "#3E2723";
    const lineWidth = options.lineWidth ?? 0.9;
    const mesh = buildPipeElbowMesh(spec, facing);
    const panelFill = { bottom: colors.bottom?.mid ?? colors.side.shadow, top: colors.top?.mid ?? colors.side.highlight, side: colors.side.mid };
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
export function createPipeElbowPrimitive(visuals) {
    return (ctx, prop, px, py) => {
        drawPipeElbow(ctx, prop, px, py, { colors: resolveVisualOverrideColorTree(prop, visuals.colors), lineWidth: visuals.lineWidth ?? 0.9 });
    };
}
