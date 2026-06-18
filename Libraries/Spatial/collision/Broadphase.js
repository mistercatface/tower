import { normalizeXY } from "../../Math/Vec2.js";
import { convexFootprintHalfExtents } from "../../Math/Poly2D.js";
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
const BROADPHASE_UNION_PROXY = {
    type: "Polygon",
    vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ],
};
export function broadphaseBoundsFromCollisionPartsInto(out, parts, cx, cy, angle = 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let p = 0; p < parts.length; p++) {
        const verts = parts[p].vertices;
        for (let i = 0; i < verts.length; i++) {
            minX = Math.min(minX, verts[i].x);
            maxX = Math.max(maxX, verts[i].x);
            minY = Math.min(minY, verts[i].y);
            maxY = Math.max(maxY, verts[i].y);
        }
    }
    const proxy = BROADPHASE_UNION_PROXY;
    proxy.vertices[0].x = minX;
    proxy.vertices[0].y = minY;
    proxy.vertices[1].x = maxX;
    proxy.vertices[1].y = minY;
    proxy.vertices[2].x = maxX;
    proxy.vertices[2].y = maxY;
    proxy.vertices[3].x = minX;
    proxy.vertices[3].y = maxY;
    return broadphaseBoundsFromShapeInto(out, proxy, cx, cy, angle);
}
export function broadphaseBoundsFromShapeInto(out, shape, cx, cy, angle = 0) {
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
        const span = convexFootprintHalfExtents(shape.vertices);
        out.hx = span.x;
        out.hy = span.y;
        return out;
    }
    out.kind = "circle";
    out.cx = cx;
    out.cy = cy;
    out.r = shape.radius || 0;
    return out;
}
export function broadphaseBoundsFromShape(shape, cx, cy, angle = 0) {
    return broadphaseBoundsFromShapeInto(createBroadphaseBounds(), shape, cx, cy, angle);
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
