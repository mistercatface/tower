import { distanceSqToLineSegment } from "./Segment2D.js";
const POLYGON_EDGE_EPS_SQ = 1e-10;
export function rotateXYInto(out, lx, ly, cos, sin) {
    out.x = lx * cos - ly * sin;
    out.y = lx * sin + ly * cos;
    return out;
}
export function rotateXY(lx, ly, cos, sin) {
    return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}
export function transformPoint2DInto(out, centerX, centerY, lx, ly, cos, sin) {
    out.x = centerX + lx * cos - ly * sin;
    out.y = centerY + lx * sin + ly * cos;
    return out;
}
/** Rotate local offset (lx, ly) around origin and translate to (centerX, centerY). */
export function rotatePoint(centerX, centerY, lx, ly, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto({ x: 0, y: 0 }, centerX, centerY, lx, ly, cos, sin);
}
export function rectCorners(centerX, centerY, halfSize, angle = 0) {
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corner = (lx, ly) => transformPoint2DInto({ x: 0, y: 0 }, centerX, centerY, lx, ly, cos, sin);
    return [corner(-hx, -hy), corner(hx, -hy), corner(hx, hy), corner(-hx, hy)];
}
function pointOnPolygonRing(px, py, count, xAt, yAt) {
    for (let i = 0, j = count - 1; i < count; j = i++) if (distanceSqToLineSegment(px, py, xAt(j), yAt(j), xAt(i), yAt(i)) <= POLYGON_EDGE_EPS_SQ) return true;
    return false;
}
function pointInPolygonRing(px, py, count, xAt, yAt) {
    if (pointOnPolygonRing(px, py, count, xAt, yAt)) return true;
    let inside = false;
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = xAt(i);
        const yi = yAt(i);
        const xj = xAt(j);
        const yj = yAt(j);
        const crosses = yi > py !== yj > py;
        if (!crosses) continue;
        if (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
/** Ray cast; boundary points (edges and vertices) count as inside. `polygon` is `{x,y}[]` or flat `[x0,y0,...]`. */
export function pointInPolygon(px, py, polygon) {
    if (!polygon || polygon.length < 3) return false;
    if (typeof polygon[0] === "number") {
        if (polygon.length < 6 || polygon.length % 2 !== 0) return false;
        const count = polygon.length / 2;
        return pointInPolygonRing(
            px,
            py,
            count,
            (i) => polygon[i * 2],
            (i) => polygon[i * 2 + 1],
        );
    }
    return pointInPolygonRing(
        px,
        py,
        polygon.length,
        (i) => polygon[i].x,
        (i) => polygon[i].y,
    );
}
