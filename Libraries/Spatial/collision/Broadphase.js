import { computeCompoundLocalBounds, convexFootprintHalfExtents } from "../../Math/Poly2D.js";
import { SHAPE_TYPE_ID } from "./Shapes.js";
export const BROADPHASE_KIND = { Circle: 1, Obb: 2 };
/** @typedef {{ kind: number, cx: number, cy: number, r: number, hx: number, hy: number, cos: number, sin: number }} BroadphaseBounds */
/** @returns {BroadphaseBounds} */
export function createBroadphaseBounds() {
    return { kind: BROADPHASE_KIND.Circle, cx: 0, cy: 0, r: 0, hx: 0, hy: 0, cos: 1, sin: 0 };
}
function intervalsSeparatedObbObb(ax, ay, a, b) {
    const ca = a.cx * ax + a.cy * ay;
    const ra = a.hx * Math.abs(a.cos * ax + a.sin * ay) + a.hy * Math.abs(-a.sin * ax + a.cos * ay);
    const cb = b.cx * ax + b.cy * ay;
    const rb = b.hx * Math.abs(b.cos * ax + b.sin * ay) + b.hy * Math.abs(-b.sin * ax + b.cos * ay);
    return Math.abs(ca - cb) > ra + rb;
}
function obbObbOverlap(a, b) {
    if (intervalsSeparatedObbObb(a.cos, a.sin, a, b)) return false;
    if (intervalsSeparatedObbObb(-a.sin, a.cos, a, b)) return false;
    if (intervalsSeparatedObbObb(b.cos, b.sin, a, b)) return false;
    if (intervalsSeparatedObbObb(-b.sin, b.cos, a, b)) return false;
    return true;
}
function intervalsSeparatedCircleObb(ax, ay, circle, obb) {
    const cc = circle.cx * ax + circle.cy * ay;
    const rc = circle.r;
    const cb = obb.cx * ax + obb.cy * ay;
    const rb = obb.hx * Math.abs(obb.cos * ax + obb.sin * ay) + obb.hy * Math.abs(-obb.sin * ax + obb.cos * ay);
    return Math.abs(cc - cb) > rc + rb;
}
function circleObbOverlap(circle, obb) {
    if (intervalsSeparatedCircleObb(obb.cos, obb.sin, circle, obb)) return false;
    if (intervalsSeparatedCircleObb(-obb.sin, obb.cos, circle, obb)) return false;
    const dx = circle.cx - obb.cx;
    const dy = circle.cy - obb.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1e-6) if (intervalsSeparatedCircleObb(dx / len, dy / len, circle, obb)) return false;
    return true;
}
const COMPOUND_BOUNDS_SCRATCH = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
export function broadphaseBoundsFromCollisionPartsInto(out, parts, cx, cy, angle = 0) {
    if (parts.length <= 1) return broadphaseBoundsFromShapeInto(out, parts[0], cx, cy, angle);
    const bounds = computeCompoundLocalBounds(parts, COMPOUND_BOUNDS_SCRATCH);
    const hx = (bounds.maxX - bounds.minX) * 0.5;
    const hy = (bounds.maxY - bounds.minY) * 0.5;
    const localCx = (bounds.minX + bounds.maxX) * 0.5;
    const localCy = (bounds.minY + bounds.maxY) * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    out.kind = BROADPHASE_KIND.Obb;
    out.cx = cx + localCx * cos - localCy * sin;
    out.cy = cy + localCx * sin + localCy * cos;
    out.cos = cos;
    out.sin = sin;
    out.hx = hx;
    out.hy = hy;
    return out;
}
export function broadphaseBoundsFromShapeInto(out, shape, cx, cy, angle = 0) {
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Circle) {
        out.kind = BROADPHASE_KIND.Circle;
        out.cx = cx;
        out.cy = cy;
        out.r = shape.radius;
        return out;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_ID.Polygon) {
        out.kind = BROADPHASE_KIND.Obb;
        out.cx = cx;
        out.cy = cy;
        out.cos = Math.cos(angle);
        out.sin = Math.sin(angle);
        const span = convexFootprintHalfExtents(shape.vertices);
        out.hx = span.x;
        out.hy = span.y;
        return out;
    }
    out.kind = BROADPHASE_KIND.Circle;
    out.cx = cx;
    out.cy = cy;
    out.r = shape.radius || 0;
    return out;
}
export function broadphaseBoundsFromShape(shape, cx, cy, angle = 0) {
    return broadphaseBoundsFromShapeInto(createBroadphaseBounds(), shape, cx, cy, angle);
}
export function pairBroadphaseBoundsOverlap(a, b) {
    if (a.kind === BROADPHASE_KIND.Circle && b.kind === BROADPHASE_KIND.Circle) {
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const radii = a.r + b.r;
        return dx * dx + dy * dy < radii * radii;
    }
    if (a.kind === BROADPHASE_KIND.Circle && b.kind === BROADPHASE_KIND.Obb) return circleObbOverlap(a, b);
    if (a.kind === BROADPHASE_KIND.Obb && b.kind === BROADPHASE_KIND.Circle) return circleObbOverlap(b, a);
    if (a.kind === BROADPHASE_KIND.Obb && b.kind === BROADPHASE_KIND.Obb) return obbObbOverlap(a, b);
    return false;
}
