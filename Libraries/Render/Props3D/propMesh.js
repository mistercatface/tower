import { traceClosedPolygonCount } from "../../Canvas/CanvasPath.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH, projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
const sProjectedVerts = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/** @param {number} count */
function ensureProjectedVertScratch(count) {
    while (sProjectedVerts.length < count) sProjectedVerts.push({ x: 0, y: 0 });
}
/**
 * Iso-project a local prop vertex (ground origin at prop base, z = height above ground).
 *
 * @param {{ x: number, y: number, depth?: number }} out
 * @returns {typeof out}
 */
export function projectPropVertexInto(out, prop, px, py, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (Math.abs(lz) <= 0.001) {
        out.x = wx;
        out.y = wy;
        out.depth = lz;
        return out;
    }
    projectWorldPointInto(out, wx, wy, px, py, lz, CAMERA_HEIGHT, PERSPECTIVE_STRENGTH);
    out.depth = lz + Math.hypot(wx - px, wy - py) * 0.001;
    return out;
}
/** @returns {{ x: number, y: number, depth: number }} Allocates — prefer `projectPropVertexInto`. */
export function projectPropVertex(prop, px, py, lx, ly, lz) {
    return projectPropVertexInto({ x: 0, y: 0, depth: 0 }, prop, px, py, lx, ly, lz);
}
/** Cull back-facing mesh triangles using 3D face normal vs camera position. */
export function isPropMeshFaceVisible(prop, px, py, verts3d) {
    const v0 = verts3d[0];
    const v1 = verts3d[1];
    const v2 = verts3d[2];
    const ax = v1.lx - v0.lx;
    const ay = v1.ly - v0.ly;
    const az = v1.z - v0.z;
    const bx = v2.lx - v0.lx;
    const by = v2.ly - v0.ly;
    const bz = v2.z - v0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const cx = prop.x + (v0.lx + v1.lx + v2.lx) / 3;
    const cy = prop.y + (v0.ly + v1.ly + v2.ly) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;
    const vx = px - cx;
    const vy = py - cy;
    const vz = CAMERA_HEIGHT - cz;
    return nx * vx + ny * vy + nz * vz > 0;
}
export function drawPropMeshFace(ctx, prop, px, py, verts3d, fill, stroke, lineWidth) {
    const count = verts3d.length;
    ensureProjectedVertScratch(count);
    for (let i = 0; i < count; i++) {
        const v = verts3d[i];
        projectPropVertexInto(sProjectedVerts[i], prop, px, py, v.lx, v.ly, v.z);
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    traceClosedPolygonCount(ctx, sProjectedVerts, count);
    ctx.fill();
    if (stroke != null && stroke !== false && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
}
