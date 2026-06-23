import { traceClosedPolygonCount } from "../../Canvas/CanvasPath.js";
import { projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
/** @type {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} */
const sPropCamera = { viewerX: 0, viewerY: 0, cameraHeight: 0, strength: 0 };
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
export function projectPropVertexInto(out, prop, viewport, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (Math.abs(lz) <= 0.001) {
        out.x = wx;
        out.y = wy;
        out.depth = lz;
        return out;
    }
    sPropCamera.viewerX = viewport.x;
    sPropCamera.viewerY = viewport.y;
    sPropCamera.cameraHeight = viewport.cameraHeight;
    sPropCamera.strength = viewport.perspectiveStrength;
    projectWorldPointInto(out, wx, wy, lz, sPropCamera);
    out.depth = lz + Math.hypot(wx - viewport.x, wy - viewport.y) * 0.001;
    return out;
}
export function projectPropVertex(prop, viewport, lx, ly, lz) {
    return projectPropVertexInto({ x: 0, y: 0, depth: 0 }, prop, viewport, lx, ly, lz);
}
export function isPropMeshFaceVisible(prop, viewport, verts3d) {
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
    const vx = viewport.x - cx;
    const vy = viewport.y - cy;
    const vz = viewport.cameraHeight - cz;
    return nx * vx + ny * vy + nz * vz > 0;
}
export function drawPropMeshFace(ctx, prop, viewport, verts3d, fill, stroke, lineWidth) {
    const count = verts3d.length;
    ensureProjectedVertScratch(count);
    for (let i = 0; i < count; i++) {
        const v = verts3d[i];
        projectPropVertexInto(sProjectedVerts[i], prop, viewport, v.lx, v.ly, v.z);
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
