import { CAMERA_HEIGHT } from "../../Spatial/iso/IsometricProjection.js";

/**
 * Iso-project a local prop vertex (ground origin at prop base, z = height above ground).
 */
export function projectPropVertex(prop, px, py, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (lz <= 0.001) {
        return { x: wx, y: wy, depth: lz };
    }
    const dx = wx - px;
    const dy = wy - py;
    const dist = Math.hypot(dx, dy);
    const alpha = lz / (CAMERA_HEIGHT - lz);
    const sx = dist === 0 ? wx : wx + dx * alpha;
    const sy = dist === 0 ? wy : wy + dy * alpha;
    return { x: sx, y: sy, depth: lz + dist * 0.001 };
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
    const projected = verts3d.map((v) => projectPropVertex(prop, px, py, v.lx, v.ly, v.z));

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.closePath();
    ctx.fill();
    if (stroke != null && stroke !== false && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
}
