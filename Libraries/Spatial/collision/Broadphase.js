import { normalizeXY } from "../../Math/Vec2.js";
/** @typedef {{ kind: "circle", cx: number, cy: number, r: number, hx: number, hy: number, cos: number, sin: number }} BroadphaseBounds */
/** @returns {BroadphaseBounds} */
export function createBroadphaseBounds() {
    return { kind: "circle", cx: 0, cy: 0, r: 0, hx: 0, hy: 0, cos: 1, sin: 0 };
}
function projectCircle(axisX, axisY, circle) {
    const c = circle.cx * axisX + circle.cy * axisY;
    return { min: c - circle.r, max: c + circle.r };
}
function projectObb(axisX, axisY, obb) {
    const ux = obb.cos;
    const uy = obb.sin;
    const vx = -obb.sin;
    const vy = obb.cos;
    const c = obb.cx * axisX + obb.cy * axisY;
    const radius = obb.hx * Math.abs(ux * axisX + uy * axisY) + obb.hy * Math.abs(vx * axisX + vy * axisY);
    return { min: c - radius, max: c + radius };
}
function intervalsSeparated(a, b) {
    return a.min > b.max || b.min > a.max;
}
function obbObbOverlap(a, b) {
    const axes = [
        [a.cos, a.sin],
        [-a.sin, a.cos],
        [b.cos, b.sin],
        [-b.sin, b.cos],
    ];
    for (let i = 0; i < axes.length; i++) {
        const ax = axes[i][0];
        const ay = axes[i][1];
        if (intervalsSeparated(projectObb(ax, ay, a), projectObb(ax, ay, b))) return false;
    }
    return true;
}
function circleObbOverlap(circle, obb) {
    const axes = [
        [obb.cos, obb.sin],
        [-obb.sin, obb.cos],
    ];
    const { nx, ny, len } = normalizeXY(circle.cx - obb.cx, circle.cy - obb.cy);
    if (len > 1e-6) axes.push([nx, ny]);
    for (let i = 0; i < axes.length; i++) {
        const ax = axes[i][0];
        const ay = axes[i][1];
        if (intervalsSeparated(projectCircle(ax, ay, circle), projectObb(ax, ay, obb))) return false;
    }
    return true;
}
/**
 * @param {BroadphaseBounds} out
 * @param {{ type: string, radius?: number, vertices?: { x: number, y: number }[], boundingRadius?: number, getBoundingRadius?: () => number }} shape
 * @param {number} cx
 * @param {number} cy
 * @param {number} [angle]
 * @param {{ x: number, y: number } | null} [halfExtents]
 * @returns {BroadphaseBounds}
 */
export function broadphaseBoundsFromShapeInto(out, shape, cx, cy, angle = 0, halfExtents = null) {
    if (shape.type === "Circle") {
        out.kind = "circle";
        out.cx = cx;
        out.cy = cy;
        out.r = shape.radius;
        return out;
    }
    if (shape.type === "Polygon") {
        out.kind = "obb";
        out.cx = cx;
        out.cy = cy;
        out.cos = Math.cos(angle);
        out.sin = Math.sin(angle);
        if (halfExtents) {
            out.hx = halfExtents.x;
            out.hy = halfExtents.y;
        } else {
            let hx = 0;
            let hy = 0;
            for (let i = 0; i < shape.vertices.length; i++) {
                const v = shape.vertices[i];
                hx = Math.max(hx, Math.abs(v.x));
                hy = Math.max(hy, Math.abs(v.y));
            }
            out.hx = hx;
            out.hy = hy;
        }
        return out;
    }
    out.kind = "circle";
    out.cx = cx;
    out.cy = cy;
    out.r = shape.radius || 0;
    return out;
}
export function broadphaseBoundsFromShape(shape, cx, cy, angle = 0, halfExtents = null) {
    return broadphaseBoundsFromShapeInto(createBroadphaseBounds(), shape, cx, cy, angle, halfExtents);
}
export function pairBroadphaseBoundsOverlap(a, b) {
    if (a.kind === "circle" && b.kind === "circle") {
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const radii = a.r + b.r;
        return dx * dx + dy * dy < radii * radii;
    }
    if (a.kind === "circle" && b.kind === "obb") return circleObbOverlap(a, b);
    if (a.kind === "obb" && b.kind === "circle") return circleObbOverlap(b, a);
    if (a.kind === "obb" && b.kind === "obb") return obbObbOverlap(a, b);
    return false;
}
