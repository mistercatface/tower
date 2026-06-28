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
    const out = new Float32Array(8);
    // (-hx, -hy)
    out[0] = centerX - hx * cos + hy * sin;
    out[1] = centerY - hx * sin - hy * cos;
    // (hx, -hy)
    out[2] = centerX + hx * cos + hy * sin;
    out[3] = centerY + hx * sin - hy * cos;
    // (hx, hy)
    out[4] = centerX + hx * cos - hy * sin;
    out[5] = centerY + hx * sin + hy * cos;
    // (-hx, hy)
    out[6] = centerX - hx * cos - hy * sin;
    out[7] = centerY - hx * sin + hy * cos;
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
export function convexFootprintHalfExtents(vertices) {
    let hx = 0;
    let hy = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        hx = Math.max(hx, Math.abs(vertices[i]));
        hy = Math.max(hy, Math.abs(vertices[i + 1]));
    }
    return { x: hx, y: hy };
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
export function polygonCentroid2D(vertices, out = CENTROID_SCRATCH) {
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
    out.cx = cx;
    out.cy = cy;
    out.signedArea = signedArea;
    return out;
}
export function polygonSecondMomentAboutCentroid2D(vertices) {
    const count = vertices.length / 2;
    if (count < 3) return 0;
    const { cx, cy, signedArea } = polygonCentroid2D(vertices, CENTROID_SCRATCH);
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
