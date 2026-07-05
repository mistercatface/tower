import { traceClosedFlatPolygon } from "../../Canvas/CanvasPath.js";
import {  resolveElevationAlpha  } from "../../Spatial/spatial.js";
let sFlatProjectedVerts = new Float32Array(8);
function ensureFlatProjectedVertScratch(count) {
    if (sFlatProjectedVerts.length < count * 2) sFlatProjectedVerts = new Float32Array(count * 2);
}
export function projectPropVertexScalarsInto(out8, offset, prop, viewport, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (Math.abs(lz) <= 0.001) {
        out8[offset] = wx;
        out8[offset + 1] = wy;
        return;
    }
    const alpha = resolveElevationAlpha(lz, viewport);
    if (alpha <= 0) {
        out8[offset] = wx;
        out8[offset + 1] = wy;
    } else {
        out8[offset] = wx + (wx - viewport.x) * alpha;
        out8[offset + 1] = wy + (wy - viewport.y) * alpha;
    }
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
    ensureFlatProjectedVertScratch(count);
    for (let i = 0; i < count; i++) {
        const v = verts3d[i];
        projectPropVertexScalarsInto(sFlatProjectedVerts, i * 2, prop, viewport, v.lx, v.ly, v.z);
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sFlatProjectedVerts, count);
    ctx.fill();
    if (stroke != null && stroke !== false && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
}
