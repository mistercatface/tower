import { normalizeXY } from "../../Math/Vec2.js";
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
 * @param {{ type: string, radius?: number, vertices?: { x: number, y: number }[] }} shape
 * @param {number} cx
 * @param {number} cy
 * @param {number} [angle]
 * @param {{ x: number, y: number } | null} [halfExtents]
 * @returns {{ kind: 'circle', cx: number, cy: number, r: number } | { kind: 'obb', cx: number, cy: number, hx: number, hy: number, cos: number, sin: number }}
 */
export function broadphaseBoundsFromShape(shape, cx, cy, angle = 0, halfExtents = null) {
    if (shape.type === "Circle") return { kind: "circle", cx, cy, r: shape.radius };
    if (shape.type === "Polygon") {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let hx;
        let hy;
        if (halfExtents) {
            hx = halfExtents.x;
            hy = halfExtents.y;
        } else {
            hx = 0;
            hy = 0;
            for (let i = 0; i < shape.vertices.length; i++) {
                const v = shape.vertices[i];
                hx = Math.max(hx, Math.abs(v.x));
                hy = Math.max(hy, Math.abs(v.y));
            }
        }
        return { kind: "obb", cx, cy, hx, hy, cos, sin };
    }
    const r = shape.radius || 0;
    return { kind: "circle", cx, cy, r };
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
