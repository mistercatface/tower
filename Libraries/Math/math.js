export { ENGINE_F32, ENGINE_MATH_BASE, ENGINE_PHYS_BASE, ENGINE_FRAC_BASE, ENGINE_SPATIAL_BASE, ENGINE_NAV_BASE, M_VEC_A, M_VEC_B, M_VEC_C, M_VEC_D, M_OUT_NX, M_OUT_NY, M_OUT_LEN, M_OUT_CLOSEST_X, M_OUT_CLOSEST_Y, M_OUT_CLOSEST_T, M_OUT_CX, M_OUT_CY, M_OUT_AREA, M_OUT_QW, M_OUT_QX, M_OUT_QY, M_OUT_QZ, M_OUT_VX, M_OUT_VY, M_OUT_VZ, M_OUT_REFLECT_DX, M_OUT_REFLECT_DY, M_OUT_RECT, S_OUT_XY, S_OUT_SCREEN, S_AABB, S_QUAD, N_OUT_XY, N_OUT_FLOW, N_OUT_STEER } from "./engineF32.js";
import { ENGINE_F32, M_VEC_A, M_OUT_NX, M_OUT_NY, M_OUT_LEN, M_OUT_CLOSEST_X, M_OUT_CLOSEST_Y, M_OUT_CLOSEST_T, M_OUT_CX, M_OUT_CY, M_OUT_AREA, M_OUT_QW, M_OUT_QX, M_OUT_QY, M_OUT_QZ, M_OUT_VX, M_OUT_VY, M_OUT_VZ, M_OUT_REFLECT_DX, M_OUT_REFLECT_DY, M_OUT_RECT } from "./engineF32.js";
export function deterministicUnitRandom(seed) {
    let h = seed | 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** True when segments (ax, ay)–(bx, by) and (cx, cy)–(dx, dy) intersect (inclusive endpoints). */
export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const cross = d1x * (cy - ay) - d1y * (cx - ax);
    const cross2 = d1x * (dy - ay) - d1y * (dx - ax);
    const cross3 = d2x * (ay - cy) - d2y * (ax - cx);
    const cross4 = d2x * (by - cy) - d2y * (bx - cx);
    if (((cross >= 0 && cross2 <= 0) || (cross <= 0 && cross2 >= 0)) && ((cross3 >= 0 && cross4 <= 0) || (cross3 <= 0 && cross4 >= 0))) return true;
    return false;
}
/** Intersection of two segments, or null when they do not cross at a single point. */
export function segmentIntersectionPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: ax + t * d1x, y: ay + t * d1y, t, u };
}
/** Minimum distance between segments (ax, ay)–(bx, by) and (cx, cy)–(dx, dy). */
export function distanceSegmentToSegment(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax;
    const uy = by - ay;
    const vx = dx - cx;
    const vy = dy - cy;
    const wx = ax - cx;
    const wy = ay - cy;
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sc;
    let sN;
    let sD = D;
    let tc;
    let tN;
    let tD = D;
    if (D < 1e-10) {
        sN = 0;
        sD = 1;
        tN = e;
        tD = c;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0) {
            sN = 0;
            tN = e;
            tD = c;
        } else if (sN > sD) {
            sN = sD;
            tN = e + b;
            tD = c;
        }
    }
    if (tN < 0) {
        tN = 0;
        if (-d < 0) sN = 0;
        else if (-d > a) sN = sD;
        else {
            sN = -d;
            sD = a;
        }
    } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0) sN = 0;
        else if (-d + b > a) sN = sD;
        else {
            sN = -d + b;
            sD = a;
        }
    }
    sc = Math.abs(sN) < 1e-10 ? 0 : sN / sD;
    tc = Math.abs(tN) < 1e-10 ? 0 : tN / tD;
    const px = ax + sc * ux;
    const py = ay + sc * uy;
    const qx = cx + tc * vx;
    const qy = cy + tc * vy;
    return Math.hypot(px - qx, py - qy);
}
/** Closest point on segment (vx, vy)–(wx, wy) to point (px, py). Writes x,y,t at buf[o..o+2]. */
export function closestPointOnLineSegmentInto(buf, o, px, py, vx, vy, wx, wy) {
    const dx = wx - vx;
    const dy = wy - vy;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) {
        buf[o] = vx;
        buf[o + 1] = vy;
        buf[o + 2] = 0;
        return;
    }
    let t = ((px - vx) * dx + (py - vy) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    buf[o] = vx + t * dx;
    buf[o + 1] = vy + t * dy;
    buf[o + 2] = t;
}
/** Closest point on segment (vx, vy)–(wx, wy) to point (px, py). */
export function closestPointOnLineSegment(px, py, vx, vy, wx, wy) {
    closestPointOnLineSegmentInto(ENGINE_F32, M_OUT_CLOSEST_X, px, py, vx, vy, wx, wy);
    return { x: ENGINE_F32[M_OUT_CLOSEST_X], y: ENGINE_F32[M_OUT_CLOSEST_Y], t: ENGINE_F32[M_OUT_CLOSEST_T] };
}
export function distanceSqToLineSegment(px, py, vx, vy, wx, wy) {
    closestPointOnLineSegmentInto(ENGINE_F32, M_OUT_CLOSEST_X, px, py, vx, vy, wx, wy);
    const dx = px - ENGINE_F32[M_OUT_CLOSEST_X];
    const dy = py - ENGINE_F32[M_OUT_CLOSEST_Y];
    return dx * dx + dy * dy;
}
export function distanceToLineSegment(px, py, vx, vy, wx, wy) {
    return Math.sqrt(distanceSqToLineSegment(px, py, vx, vy, wx, wy));
}
const POLYGON_EDGE_EPS_SQ = 1e-10;
export function rotateXYInto(out, lx, ly, cos, sin) {
    out.x = lx * cos - ly * sin;
    out.y = lx * sin + ly * cos;
    return out;
}
export function rotateXYIntoF32(buf, o, lx, ly, cos, sin) {
    buf[o] = lx * cos - ly * sin;
    buf[o + 1] = lx * sin + ly * cos;
}
export function transformPoint2DInto(out, centerX, centerY, lx, ly, cos, sin) {
    out.x = centerX + lx * cos - ly * sin;
    out.y = centerY + lx * sin + ly * cos;
    return out;
}
export function rotatePoint(centerX, centerY, lx, ly, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto({ x: 0, y: 0 }, centerX, centerY, lx, ly, cos, sin);
}
export function rectCornersInto(buf, o, centerX, centerY, halfSize, angle = 0) {
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    buf[o] = centerX - hx * cos + hy * sin;
    buf[o + 1] = centerY - hx * sin - hy * cos;
    buf[o + 2] = centerX + hx * cos + hy * sin;
    buf[o + 3] = centerY + hx * sin - hy * cos;
    buf[o + 4] = centerX + hx * cos - hy * sin;
    buf[o + 5] = centerY + hx * sin + hy * cos;
    buf[o + 6] = centerX - hx * cos - hy * sin;
    buf[o + 7] = centerY - hx * sin + hy * cos;
}
export function rectCorners(centerX, centerY, halfSize, angle = 0) {
    const out = new Float32Array(8);
    rectCornersInto(out, 0, centerX, centerY, halfSize, angle);
    return out;
}
export function boxLocalFootprint(hx, hy) {
    return new Float32Array([-hx, -hy, hx, -hy, hx, hy, -hx, hy]);
}
export function regularConvexPolygonFootprint(sides, radius, startAngle = -Math.PI / 2) {
    const verts = new Float32Array(sides * 2);
    for (let i = 0; i < sides; i++) {
        const angle = startAngle + (i * Math.PI * 2) / sides;
        verts[i * 2] = Math.round(Math.cos(angle) * radius);
        verts[i * 2 + 1] = Math.round(Math.sin(angle) * radius);
    }
    return verts;
}
export function regularStarFootprint(points, outerRadius, innerRadius, startAngle = -Math.PI / 2) {
    const verts = new Float32Array(points * 4);
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
        const angle = startAngle + i * step;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        verts[i * 2] = Math.round(Math.cos(angle) * radius);
        verts[i * 2 + 1] = Math.round(Math.sin(angle) * radius);
    }
    return verts;
}
export function convexFootprintHalfExtents(buf, o, vertices) {
    let hx = 0;
    let hy = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        hx = Math.max(hx, Math.abs(vertices[i]));
        hy = Math.max(hy, Math.abs(vertices[i + 1]));
    }
    buf[o] = hx;
    buf[o + 1] = hy;
}
export function findExtremeVertexIndex(vertices, posX, posY, cos, sin, axisX, axisY, findMax = true) {
    let bestProj = findMax ? -Infinity : Infinity;
    let bestIndex = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
        const vx = posX + lx * cos - ly * sin;
        const vy = posY + lx * sin + ly * cos;
        const proj = vx * axisX + vy * axisY;
        if (findMax ? proj > bestProj : proj < bestProj) {
            bestProj = proj;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
export function findClosestWorldVertexIndex(vertices, posX, posY, cos, sin, targetX, targetY) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
        const vx = posX + lx * cos - ly * sin;
        const vy = posY + lx * sin + ly * cos;
        const dx = targetX - vx;
        const dy = targetY - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
export function findExtremeVertexInto(out, vertices, pos, cos, sin, axisX, axisY, findMax = true) {
    let bestProj = findMax ? -Infinity : Infinity;
    let bestIndex = 0;
    out.x = pos.x;
    out.y = pos.y;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
        const vx = pos.x + lx * cos - ly * sin;
        const vy = pos.y + lx * sin + ly * cos;
        const proj = vx * axisX + vy * axisY;
        if (findMax ? proj > bestProj : proj < bestProj) {
            bestProj = proj;
            out.x = vx;
            out.y = vy;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
export function findClosestWorldVertexInto(out, vertices, pos, cos, sin, targetX, targetY) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    out.x = pos.x;
    out.y = pos.y;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
        const vx = pos.x + lx * cos - ly * sin;
        const vy = pos.y + lx * sin + ly * cos;
        const dx = targetX - vx;
        const dy = targetY - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            out.x = vx;
            out.y = vy;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
export function findCircleRimGrabPointInto(out, posX, posY, facing, radius, targetX, targetY) {
    let dx = targetX - posX;
    let dy = targetY - posY;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
        dx = Math.cos(facing);
        dy = Math.sin(facing);
        len = 1;
    }
    const nx = dx / len;
    const ny = dy / len;
    const worldX = posX + nx * radius;
    const worldY = posY + ny * radius;
    const wdx = worldX - posX;
    const wdy = worldY - posY;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    out.worldX = worldX;
    out.worldY = worldY;
    out.x = worldX;
    out.y = worldY;
    out.localX = wdx * cos + wdy * sin;
    out.localY = -wdx * sin + wdy * cos;
    return out;
}
export function findClosestPolygonBoundaryGrabPointInto(out, vertices, posX, posY, facing, targetX, targetY) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const count = vertices.length / 2;
    let bestDistSq = Infinity;
    let bestWorldX = posX;
    let bestWorldY = posY;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const lax = vertices[i * 2];
        const lay = vertices[i * 2 + 1];
        const lbx = vertices[j * 2];
        const lby = vertices[j * 2 + 1];
        const ax = posX + lax * cos - lay * sin;
        const ay = posY + lax * sin + lay * cos;
        const bx = posX + lbx * cos - lby * sin;
        const by = posY + lbx * sin + lby * cos;
        const closest = closestPointOnLineSegment(targetX, targetY, ax, ay, bx, by);
        const dx = targetX - closest.x;
        const dy = targetY - closest.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestWorldX = closest.x;
            bestWorldY = closest.y;
        }
    }
    const wdx = bestWorldX - posX;
    const wdy = bestWorldY - posY;
    out.worldX = bestWorldX;
    out.worldY = bestWorldY;
    out.x = bestWorldX;
    out.y = bestWorldY;
    out.localX = wdx * cos + wdy * sin;
    out.localY = -wdx * sin + wdy * cos;
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
export function pointInPolygon(px, py, polygon) {
    if (!polygon || polygon.length < 6 || polygon.length % 2 !== 0) return false;
    const count = polygon.length / 2;
    return pointInPolygonRing(
        px,
        py,
        count,
        (i) => polygon[i * 2],
        (i) => polygon[i * 2 + 1],
    );
}
export function polygonSignedArea2D(vertices) {
    let area = 0;
    const count = vertices.length / 2;
    for (let i = 0; i < count; i++) {
        const nextIdx = ((i + 1) % count) * 2;
        area += vertices[i * 2] * vertices[nextIdx + 1] - vertices[nextIdx] * vertices[i * 2 + 1];
    }
    return area * 0.5;
}
const CENTROID_SCRATCH = { cx: 0, cy: 0, signedArea: 0 };
/** Writes cx, cy, signedArea at buf[o..o+2]. */
export function polygonCentroid2DInto(buf, o, vertices) {
    let cx = 0;
    let cy = 0;
    let signedArea = 0;
    const count = vertices.length / 2;
    for (let i = 0; i < count; i++) {
        const x1 = vertices[i * 2];
        const y1 = vertices[i * 2 + 1];
        const nextIdx = ((i + 1) % count) * 2;
        const x2 = vertices[nextIdx];
        const y2 = vertices[nextIdx + 1];
        const cross = x1 * y2 - x2 * y1;
        signedArea += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    signedArea *= 0.5;
    if (Math.abs(signedArea) > 1e-10) {
        const invArea6 = 1 / (6 * signedArea);
        cx *= invArea6;
        cy *= invArea6;
    } else {
        cx = 0;
        cy = 0;
    }
    buf[o] = cx;
    buf[o + 1] = cy;
    buf[o + 2] = signedArea;
}
export function polygonCentroid2D(vertices, out = CENTROID_SCRATCH) {
    polygonCentroid2DInto(ENGINE_F32, M_OUT_CX, vertices);
    out.cx = ENGINE_F32[M_OUT_CX];
    out.cy = ENGINE_F32[M_OUT_CY];
    out.signedArea = ENGINE_F32[M_OUT_AREA];
    return out;
}
export function polygonSecondMomentAboutCentroid2D(vertices) {
    const count = vertices.length / 2;
    if (count < 3) return 0;
    polygonCentroid2DInto(ENGINE_F32, M_OUT_CX, vertices);
    const cx = ENGINE_F32[M_OUT_CX];
    const cy = ENGINE_F32[M_OUT_CY];
    const signedArea = ENGINE_F32[M_OUT_AREA];
    if (Math.abs(signedArea) < 1e-10) return 0;
    let inertia = 0;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const x0 = vertices[i * 2] - cx;
        const y0 = vertices[i * 2 + 1] - cy;
        const x1 = vertices[j * 2] - cx;
        const y1 = vertices[j * 2 + 1] - cy;
        const cross = x0 * y1 - x1 * y0;
        const dot = x0 * x1 + y0 * y1;
        const sq0 = x0 * x0 + y0 * y0;
        const sq1 = x1 * x1 + y1 * y1;
        inertia += cross * (sq0 + dot + sq1);
    }
    return inertia / 12;
}
export const EMPTY_AABB = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
export function computeCompoundLocalBounds(parts, out) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const length = parts.length;
    for (let p = 0; p < length; p++) {
        const part = parts[p];
        if (part.type === "Circle") {
            const r = part.radius;
            if (-r < minX) minX = -r;
            if (r > maxX) maxX = r;
            if (-r < minY) minY = -r;
            if (r > maxY) maxY = r;
            continue;
        }
        const verts = part.vertices;
        const count = verts.length;
        for (let i = 0; i < count; i += 2) {
            const x = verts[i];
            const y = verts[i + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    out.minX = minX;
    out.maxX = maxX;
    out.minY = minY;
    out.maxY = maxY;
    return out;
}
export function ensureFlatVerts(input) {
    if (input instanceof Float32Array) return input;
    if (!input || input.length === 0) return new Float32Array(0);
    if (typeof input[0] === "number") return new Float32Array(input);
    const flat = new Float32Array(input.length * 2);
    for (let i = 0; i < input.length; i++) {
        flat[i * 2] = input[i].x;
        flat[i * 2 + 1] = input[i].y;
    }
    return flat;
}
export function scaleFlatVerts(flat, scale) {
    const count = flat.length;
    for (let i = 0; i < count; i++) flat[i] *= scale;
    return flat;
}
export function vertCount(flat) {
    return flat.length / 2;
}
export function reversePolygonWinding(vertices) {
    const count = vertices.length / 2;
    const reversed = new Float32Array(vertices.length);
    for (let i = 0; i < count; i++) {
        const src = i * 2;
        const dest = (count - 1 - i) * 2;
        reversed[dest] = vertices[src];
        reversed[dest + 1] = vertices[src + 1];
    }
    return reversed;
}
/** @typedef {{ minX: number; minY: number; maxX: number; maxY: number }} Aabb2D */
/** @typedef {'center' | 'circle' | 'aabb'} AabbEntityHitTest */
/** @returns {Aabb2D} */
export function createAabb() {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
/** @param {Aabb2D} out */
export function emptyAabbInto(out) {
    out.minX = Infinity;
    out.minY = Infinity;
    out.maxX = -Infinity;
    out.maxY = -Infinity;
    return out;
}
export function emptyAabb() {
    return emptyAabbInto(createAabb());
}
export function isEmptyAabb({ minX }) {
    return minX === Infinity;
}
export function aabbWidth(aabb) {
    return aabb.maxX - aabb.minX;
}
export function aabbHeight(aabb) {
    return aabb.maxY - aabb.minY;
}
export function aabbCenterX(aabb) {
    return (aabb.minX + aabb.maxX) / 2;
}
export function aabbCenterY(aabb) {
    return (aabb.minY + aabb.maxY) / 2;
}
/** @param {Aabb2D} out */
export function growAabbFromCenterInto(out, cx, cy, halfW, halfH) {
    out.minX = Math.min(out.minX, cx - halfW);
    out.minY = Math.min(out.minY, cy - halfH);
    out.maxX = Math.max(out.maxX, cx + halfW);
    out.maxY = Math.max(out.maxY, cy + halfH);
    return out;
}
/** @param {Aabb2D} out @param {Aabb2D} src @returns {Aabb2D} */
export function copyAabbInto(out, src) {
    out.minX = src.minX;
    out.minY = src.minY;
    out.maxX = src.maxX;
    out.maxY = src.maxY;
    return out;
}
export function pointInAabb(px, py, { minX, minY, maxX, maxY }) {
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}
export function aabbOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
export function aabbIntersectsScalars(minX, minY, maxX, maxY, box) {
    return minX <= box.maxX && maxX >= box.minX && minY <= box.maxY && maxY >= box.minY;
}
export function aabbContains(outer, inner) {
    return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function minCornerAabbInto(out, minX, minY, width, height) {
    out.minX = minX;
    out.minY = minY;
    out.maxX = minX + width;
    out.maxY = minY + height;
    return out;
}
/** Writes minX,minY,maxX,maxY at buf[o..o+3]. */
export function minCornerAabbF32(buf, o, minX, minY, width, height) {
    buf[o] = minX;
    buf[o + 1] = minY;
    buf[o + 2] = minX + width;
    buf[o + 3] = minY + height;
}
export function aabbFromF32(buf, o, out) {
    out.minX = buf[o];
    out.minY = buf[o + 1];
    out.maxX = buf[o + 2];
    out.maxY = buf[o + 3];
    return out;
}
export function minCornerAabb(minX, minY, width, height) {
    return minCornerAabbInto(createAabb(), minX, minY, width, height);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function aabbFromTwoPointsInto(out, x1, y1, x2, y2) {
    out.minX = Math.min(x1, x2);
    out.minY = Math.min(y1, y2);
    out.maxX = Math.max(x1, x2);
    out.maxY = Math.max(y1, y2);
    return out;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function unionAabbInto(out, a, b) {
    out.minX = Math.min(a.minX, b.minX);
    out.minY = Math.min(a.minY, b.minY);
    out.maxX = Math.max(a.maxX, b.maxX);
    out.maxY = Math.max(a.maxY, b.maxY);
    return out;
}
export function unionAabb(a, b) {
    return unionAabbInto(createAabb(), a, b);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function padAabbInto(out, { minX, minY, maxX, maxY }, pad) {
    out.minX = minX - pad;
    out.minY = minY - pad;
    out.maxX = maxX + pad;
    out.maxY = maxY + pad;
    return out;
}
export function padAabb(a, pad) {
    return padAabbInto(createAabb(), a, pad);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function corridorAabbInto(out, x1, y1, x2, y2, pad) {
    aabbFromTwoPointsInto(out, x1, y1, x2, y2);
    return padAabbInto(out, out, pad);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function insetAabbInto(out, { minX, minY, maxX, maxY }, inset) {
    out.minX = minX + inset;
    out.minY = minY + inset;
    out.maxX = maxX - inset;
    out.maxY = maxY - inset;
    return out;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centeredAabbInto(out, cx, cy, width, height) {
    const halfW = width / 2;
    const halfH = height / 2;
    out.minX = cx - halfW;
    out.minY = cy - halfH;
    out.maxX = cx + halfW;
    out.maxY = cy + halfH;
    return out;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centerHalfExtentsAabbInto(out, cx, cy, halfW, halfH, padding = 0) {
    out.minX = cx - halfW - padding;
    out.minY = cy - halfH - padding;
    out.maxX = cx + halfW + padding;
    out.maxY = cy + halfH + padding;
    return out;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centerReachAabbInto(out, cx, cy, reach) {
    out.minX = cx - reach;
    out.minY = cy - reach;
    out.maxX = cx + reach;
    out.maxY = cy + reach;
    return out;
}
/** @param {{ x: number, y: number }} p0 @param {{ x: number, y: number }} p1 @param {{ x: number, y: number }} p2 @param {{ x: number, y: number }} p3 @param {Aabb2D | null | undefined} box */
export function pointsAabbOverlapAabb(p0, p1, p2, p3, box) {
    if (!box) return true;
    const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
    const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
    const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
    const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
    return aabbIntersectsScalars(minX, minY, maxX, maxY, box);
}
/** @param {Aabb2D} out @param {{ x: number, y: number }[]} points @param {number} [padding] @returns {Aabb2D} */
export function expandPointsAabbInto(out, points, padding = 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    out.minX = minX - padding;
    out.minY = minY - padding;
    out.maxX = maxX + padding;
    out.maxY = maxY + padding;
    return out;
}
/** @returns {Aabb2D | null} */
export function intersectAabb(a, b) {
    const out = createAabb();
    return intersectAabbInto(out, a, b) ? out : null;
}
/** @param {Aabb2D} out @returns {boolean} */
export function intersectAabbInto(out, a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (minX >= maxX || minY >= maxY) return false;
    out.minX = minX;
    out.minY = minY;
    out.maxX = maxX;
    out.maxY = maxY;
    return true;
}
/** @param {Aabb2D} out @param {Aabb2D | null | undefined} a @param {Aabb2D | null | undefined} b @returns {boolean} */
export function intersectAabbOptionalInto(out, a, b) {
    if (!a) {
        if (!b) return false;
        copyAabbInto(out, b);
        return true;
    }
    if (!b) {
        copyAabbInto(out, a);
        return true;
    }
    return intersectAabbInto(out, a, b);
}
export function closestPointOnAabb(px, py, minX, minY, maxX, maxY) {
    return { x: Math.max(minX, Math.min(px, maxX)), y: Math.max(minY, Math.min(py, maxY)) };
}
export function distanceSqToAabb(px, py, minX, minY, maxX, maxY) {
    const cx = Math.max(minX, Math.min(px, maxX));
    const cy = Math.max(minY, Math.min(py, maxY));
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
}
export function distanceToAabb(px, py, minX, minY, maxX, maxY) {
    return Math.sqrt(distanceSqToAabb(px, py, minX, minY, maxX, maxY));
}
export function circleIntersectsAabb(x, y, radius, { minX, minY, maxX, maxY }) {
    return distanceSqToAabb(x, y, minX, minY, maxX, maxY) <= radius * radius;
}
/** @param {object} ref @param {Aabb2D} bounds @param {AabbEntityHitTest} hitTest */
export function entityIntersectsAabb(ref, bounds, hitTest) {
    if (hitTest === "center") return pointInAabb(ref.x, ref.y, bounds);
    if (hitTest === "aabb") {
        const aabb = ref.aabb;
        if (!aabb) return false;
        return aabbOverlap(aabb, bounds);
    }
    const radius = ref.radius ?? 0;
    return circleIntersectsAabb(ref.x, ref.y, radius, bounds);
}
const AABB_HASH_F64 = new Float64Array(4);
const AABB_HASH_U32 = new Uint32Array(AABB_HASH_F64.buffer);
/** @param {Aabb2D} bounds @returns {number} uint32 hash of exact float bit patterns */
export function aabbHash(bounds) {
    AABB_HASH_F64[0] = bounds.minX;
    AABB_HASH_F64[1] = bounds.minY;
    AABB_HASH_F64[2] = bounds.maxX;
    AABB_HASH_F64[3] = bounds.maxY;
    let h = AABB_HASH_U32[0];
    for (let i = 1; i < 8; i++) h = Math.imul(h ^ AABB_HASH_U32[i], 0x9e3779b1);
    return h >>> 0;
}
export function flatQuadOverlapAabb(x0, y0, x1, y1, x2, y2, x3, y3, box) {
    if (!box) return true;
    const minX = Math.min(x0, x1, x2, x3);
    const maxX = Math.max(x0, x1, x2, x3);
    const minY = Math.min(y0, y1, y2, y3);
    const maxY = Math.max(y0, y1, y2, y3);
    return aabbIntersectsScalars(minX, minY, maxX, maxY, box);
}
export function normalizeAngle(angle) {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    else if (a <= -Math.PI) a += Math.PI * 2;
    return a;
}
/** Shortest signed delta from `from` to `to`. */
export function angleDelta(from, to) {
    let delta = to - from;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    return delta;
}
export function turnAngleTowards(currentAngle, targetAngle, turnSpeed, dt) {
    const diff = normalizeAngle(targetAngle - currentAngle);
    const t = Math.min(1, turnSpeed * (dt / 1000));
    return normalizeAngle(currentAngle + diff * t);
}
/** Blend two angles along the shortest arc (radians). */
export function blendAngle(from, to, t) {
    return from + angleDelta(from, to) * t;
}
/** Map angle to [0, 2π). */
export function positiveAngle(angle) {
    let r = (angle ?? 0) % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    return r;
}
/** Bucket index in [0, steps) for angle quantization. */
export function quantizeAngleIndex(angle, steps) {
    if (steps <= 0) return 0;
    const step = (Math.PI * 2) / steps;
    return Math.floor(positiveAngle(angle) / step);
}
/** Snap angle to bucket start in [0, 2π). */
export function quantizeAngle(angle, steps) {
    if (steps <= 0) return positiveAngle(angle);
    const step = (Math.PI * 2) / steps;
    return quantizeAngleIndex(angle, steps) * step;
}
/** Cardinal belt / grid-facing props — 4 steps (E, S, W, N by increasing angle). */
export const CARDINAL_FACING_STEPS = 4;
/** @param {number} angle */
export function quantizeCardinalAngle(angle) {
    return quantizeAngle(angle, CARDINAL_FACING_STEPS);
}
/** @param {number} angle @param {number} [steps] quarter-turns to add */
export function stepCardinalFacing(angle, steps = 1) {
    return quantizeCardinalAngle(angle + steps * ((Math.PI * 2) / CARDINAL_FACING_STEPS));
}
export function rotateAngleTowards(from, to, maxStep) {
    const diff = angleDelta(from, to);
    if (Math.abs(diff) <= maxStep) return normalizeAngle(to);
    return normalizeAngle(from + Math.sign(diff) * maxStep);
}
/**
 * Penner easing equations for standard easing effects.
 * Each function maps a normalized time (0 to 1) to a normalized progress value (0 to 1).
 */
export const EASING_FUNCTIONS = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => {
        const t1 = t - 1;
        return t1 * t1 * t1 + 1;
    },
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => {
        const t1 = t - 1;
        return 1 - t1 * t1 * t1 * t1;
    },
    easeInOutQuart: (t) => {
        if (t < 0.5) return 8 * t * t * t * t;
        const t1 = t - 1;
        return 1 - 8 * t1 * t1 * t1 * t1;
    },
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => {
        const t1 = t - 1;
        return 1 + t1 * t1 * t1 * t1 * t1;
    },
    easeInOutQuint: (t) => {
        if (t < 0.5) return 16 * t * t * t * t * t;
        const t1 = t - 1;
        return 1 + 16 * t1 * t1 * t1 * t1 * t1;
    },
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
        return (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    easeInOutCirc: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
};
export const EASING_OPTIONS = Object.keys(EASING_FUNCTIONS);
/** Perlin smootherstep — C² continuous ease on [0, 1]. */
export function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}
/**
 * Applies a selected easing function by name to a normalized time t.
 * Falls back to linear if the function is not found.
 */
export function applyEasing(type, t) {
    const fn = EASING_FUNCTIONS[type] || EASING_FUNCTIONS.linear;
    return fn(t);
}
/**
 * Easing to use after reversing a stage (start/end swapped).
 * easeIn* ↔ easeOut* preserves perceived acceleration; linear and easeInOut* stay
 * (symmetric or directionless).
 */
export function mirrorEasingForReversedStage(type) {
    const easing = type ?? "linear";
    if (easing === "linear" || easing.includes("InOut")) return easing;
    const inMatch = /^easeIn(\w+)$/.exec(easing);
    if (inMatch) {
        const mirrored = `easeOut${inMatch[1]}`;
        return mirrored in EASING_FUNCTIONS ? mirrored : easing;
    }
    const outMatch = /^easeOut(\w+)$/.exec(easing);
    if (outMatch) {
        const mirrored = `easeIn${outMatch[1]}`;
        return mirrored in EASING_FUNCTIONS ? mirrored : easing;
    }
    return easing;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function scaleAtHeight(baseSize, alpha, t) {
    return baseSize * (1 + alpha * t);
}
/** Map normalized vertical band coords (0–1) to model-space Y. */
export function labelBandYRange(halfExtent, y0, y1) {
    return { yBot: -halfExtent + halfExtent * 2 * y0, yTop: -halfExtent + halfExtent * 2 * y1 };
}
/** @param {number} seed */
export function createSeededRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
/** @typedef {{ x: number; y: number }} Vec2 */
// --- Scalar core (zero alloc — use in physics / collision hot paths) ---
/** @returns {number} */
export function dotXY(vx, vy, nx, ny) {
    return vx * nx + vy * ny;
}
/** @returns {number} */
export function lengthXY(vx, vy) {
    return Math.hypot(vx, vy);
}
/** @returns {number} */
export function speedSqXY(vx, vy) {
    return vx * vx + vy * vy;
}
/** Squared distance between two points. */
export function distSqXY(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}
export function normalizeXYInto(buf, o, dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len <= 0) {
        buf[o] = 0;
        buf[o + 1] = 0;
        buf[o + 2] = 0;
        return;
    }
    buf[o] = dx / len;
    buf[o + 1] = dy / len;
    buf[o + 2] = len;
}
/** @param {{ x: number, y: number }} body */
export function addXY(body, dx, dy) {
    body.x += dx;
    body.y += dy;
}
/** Reflect direction `(dx, dy)` off a surface normal `(nx, ny)`. Writes dx,dy at buf[o..o+1]. */
export function reflect2Into(buf, o, dx, dy, nx, ny) {
    const dot = dotXY(dx, dy, nx, ny);
    buf[o] = dx - 2 * dot * nx;
    buf[o + 1] = dy - 2 * dot * ny;
}
/** @typedef {{ x: number; y: number; z: number }} Vec3 */
export function vec3(x, y, z) {
    return { x, y, z };
}
export function add(a, b) {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}
export function sub(a, b) {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function scale(v, s) {
    return vec3(v.x * s, v.y * s, v.z * s);
}
export function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function cross(a, b) {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
export function length(v) {
    return Math.hypot(v.x, v.y, v.z);
}
export function distance(a, b) {
    return length(sub(a, b));
}
export function normalize(v) {
    const len = length(v) || 1;
    return scale(v, 1 / len);
}
/** @param {string} str @returns {number} uint32 FNV-1a hash */
export function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return h >>> 0;
}
/**
 * Derive a uint32 sub-seed from a root seed and salt string (procedural / noise).
 * Not FNV — uses Knuth-style multiplier for stable field/noise derivation.
 * @param {number} rootSeed
 * @param {string} salt
 * @returns {number}
 */
export function hashSaltString(rootSeed, salt) {
    let h = rootSeed >>> 0 || 1;
    for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    return h || 1;
}
/** @param {number} a @param {number} b @param {number} c @param {number} d @returns {number} uint32 mixed hash */
export function mixHash4(a, b, c, d) {
    let h = a | 0;
    h = Math.imul(h ^ b, 0x9e3779b1);
    h = Math.imul(h ^ c, 0x9e3779b1);
    h = Math.imul(h ^ d, 0x9e3779b1);
    return h >>> 0;
}
// --- QUATERNION MATH ---
/** Writes w,x,y,z at buf[o..o+3]. */
export function multiplyQuatInto(buf, o, aw, ax, ay, az, bw, bx, by, bz) {
    buf[o] = aw * bw - ax * bx - ay * by - az * bz;
    buf[o + 1] = aw * bx + ax * bw + ay * bz - az * by;
    buf[o + 2] = aw * by - ax * bz + ay * bw + az * bx;
    buf[o + 3] = aw * bz + ax * by - ay * bx + az * bw;
}
export function multiplyQuat(a, b) {
    multiplyQuatInto(ENGINE_F32, M_OUT_QW, a.w, a.x, a.y, a.z, b.w, b.x, b.y, b.z);
    return { w: ENGINE_F32[M_OUT_QW], x: ENGINE_F32[M_OUT_QX], y: ENGINE_F32[M_OUT_QY], z: ENGINE_F32[M_OUT_QZ] };
}
/** Writes w,x,y,z at buf[o..o+3]. */
export function axisAngleQuatInto(buf, o, ax, ay, az, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    buf[o] = Math.cos(half);
    buf[o + 1] = ax * s;
    buf[o + 2] = ay * s;
    buf[o + 3] = az * s;
}
export function axisAngleQuat(ax, ay, az, angle) {
    axisAngleQuatInto(ENGINE_F32, M_OUT_QW, ax, ay, az, angle);
    return { w: ENGINE_F32[M_OUT_QW], x: ENGINE_F32[M_OUT_QX], y: ENGINE_F32[M_OUT_QY], z: ENGINE_F32[M_OUT_QZ] };
}
export function normalizeQuat(q) {
    const len = Math.hypot(q.w, q.x, q.y, q.z);
    if (len < 1e-8) {
        q.w = 1;
        q.x = 0;
        q.y = 0;
        q.z = 0;
        return q;
    }
    q.w /= len;
    q.x /= len;
    q.y /= len;
    q.z /= len;
    return q;
}
/** Writes x,y,z at buf[o..o+2]. */
export function rotateVecByQuatInto(buf, o, x, y, z, qw, qx, qy, qz) {
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    buf[o] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    buf[o + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    buf[o + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
}
export function rotateVecByQuat(x, y, z, q) {
    rotateVecByQuatInto(ENGINE_F32, M_OUT_VX, x, y, z, q.w, q.x, q.y, q.z);
    return { x: ENGINE_F32[M_OUT_VX], y: ENGINE_F32[M_OUT_VY], z: ENGINE_F32[M_OUT_VZ] };
}
export const CARDINAL_DCOL = Int8Array.from([0, 1, 0, -1]);
export const CARDINAL_DR = Int8Array.from([-1, 0, 1, 0]);
export const OCTILE_DCOL = Int8Array.from([0, 1, 0, -1, 1, 1, -1, -1]);
export const OCTILE_DR = Int8Array.from([-1, 0, 1, 0, -1, 1, 1, -1]);
export const OCTILE_STEP_COST = Float32Array.from([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);
export const OCTILE_DIR_COUNT = 8;
