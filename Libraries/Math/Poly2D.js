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
export function boxLocalFootprint(hx, hy) {
    return [
        { x: -hx, y: -hy },
        { x: hx, y: -hy },
        { x: hx, y: hy },
        { x: -hx, y: hy },
    ];
}
export function regularConvexPolygonFootprint(sides, radius, startAngle = -Math.PI / 2) {
    const verts = [];
    for (let i = 0; i < sides; i++) {
        const angle = startAngle + (i * Math.PI * 2) / sides;
        verts.push({ x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) });
    }
    return verts;
}
export function convexFootprintHalfExtents(vertices) {
    let hx = 0;
    let hy = 0;
    for (let i = 0; i < vertices.length; i++) {
        hx = Math.max(hx, Math.abs(vertices[i].x));
        hy = Math.max(hy, Math.abs(vertices[i].y));
    }
    return { x: hx, y: hy };
}
export function convexHull2D(points) {
    if (points.length <= 1) return points.slice();
    const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}
export function findExtremeVertexInto(out, vertices, pos, cos, sin, axisX, axisY, findMax = true) {
    let bestProj = findMax ? -Infinity : Infinity;
    out.x = pos.x;
    out.y = pos.y;
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const vx = pos.x + v.x * cos - v.y * sin;
        const vy = pos.y + v.x * sin + v.y * cos;
        const proj = vx * axisX + vy * axisY;
        if (findMax ? proj > bestProj : proj < bestProj) {
            bestProj = proj;
            out.x = vx;
            out.y = vy;
        }
    }
    return out;
}
export function findClosestWorldVertexInto(out, vertices, pos, cos, sin, targetX, targetY) {
    let bestDistSq = Infinity;
    out.x = pos.x;
    out.y = pos.y;
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const vx = pos.x + v.x * cos - v.y * sin;
        const vy = pos.y + v.x * sin + v.y * cos;
        const dx = targetX - vx;
        const dy = targetY - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            out.x = vx;
            out.y = vy;
        }
    }
    return out;
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
export function polygonSignedArea2D(vertices) {
    let area = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return area * 0.5;
}
export function polygonSecondMomentAboutCentroid2D(vertices) {
    const count = vertices.length;
    if (count < 3) return 0;
    const signedArea = polygonSignedArea2D(vertices);
    if (Math.abs(signedArea) < 1e-10) return 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
        cx += (vertices[i].x + vertices[j].x) * cross;
        cy += (vertices[i].y + vertices[j].y) * cross;
    }
    cx /= 6 * signedArea;
    cy /= 6 * signedArea;
    let inertia = 0;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const x0 = vertices[i].x - cx;
        const y0 = vertices[i].y - cy;
        const x1 = vertices[j].x - cx;
        const y1 = vertices[j].y - cy;
        const cross = x0 * y1 - x1 * y0;
        const dot = x0 * x1 + y0 * y1;
        const sq0 = x0 * x0 + y0 * y0;
        const sq1 = x1 * x1 + y1 * y1;
        inertia += cross * (sq0 + dot + sq1);
    }
    return inertia / 12;
}
