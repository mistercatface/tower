import { pointInPolygon } from "../Math/Poly2D.js";
export const GLASS_FRACTURE_IMPACT_THRESHOLD = 6;
export const GLASS_MIN_SHARD_AREA = 12;
function polygonSignedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return area * 0.5;
}
function polygonCentroid(points) {
    let cx = 0;
    let cy = 0;
    let signedArea = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const cross = points[i].x * points[j].y - points[j].x * points[i].y;
        signedArea += cross;
        cx += (points[i].x + points[j].x) * cross;
        cy += (points[i].y + points[j].y) * cross;
    }
    signedArea *= 0.5;
    if (Math.abs(signedArea) > 1e-6) {
        const inv = 1 / (6 * signedArea);
        cx *= inv;
        cy *= inv;
    } else {
        cx = 0;
        cy = 0;
    }
    return { cx, cy, signedArea };
}
function flatVertsToPoints(flatVerts) {
    const count = flatVerts.length / 2;
    const points = new Array(count);
    for (let i = 0; i < count; i++) points[i] = { x: flatVerts[i * 2], y: flatVerts[i * 2 + 1] };
    return points;
}
function closestPointOnPolygonBoundary(x, y, points) {
    let bestX = points[0].x;
    let bestY = points[0].y;
    let bestDistSq = Infinity;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const ax = points[i].x;
        const ay = points[i].y;
        const bx = points[j].x;
        const by = points[j].y;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = ax + dx * t;
        const py = ay + dy * t;
        const distSq = (x - px) * (x - px) + (y - py) * (y - py);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestX = px;
            bestY = py;
        }
    }
    return { x: bestX, y: bestY };
}
function resolveShatterApex(points, hitX, hitY) {
    if (pointInPolygon(hitX, hitY, points)) return { x: hitX, y: hitY };
    return closestPointOnPolygonBoundary(hitX, hitY, points);
}
function clipHalfPlane(points, ax, ay, nx, ny) {
    if (points.length === 0) return points;
    const inside = (p) => (p.x - ax) * nx + (p.y - ay) * ny >= -1e-9;
    const intersect = (a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const denom = dx * nx + dy * ny;
        const t = denom === 0 ? 0 : -((a.x - ax) * nx + (a.y - ay) * ny) / denom;
        return { x: a.x + dx * t, y: a.y + dy * t };
    };
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        const next = points[(i + 1) % points.length];
        const currIn = inside(curr);
        const nextIn = inside(next);
        if (currIn && nextIn) out.push(next);
        else if (currIn && !nextIn) out.push(intersect(curr, next));
        else if (!currIn && nextIn) {
            out.push(intersect(curr, next));
            out.push(next);
        }
    }
    return out;
}
function wedgePolygonIntersection(points, apexX, apexY, angle0, angle1) {
    const nx0 = -Math.sin(angle0);
    const ny0 = Math.cos(angle0);
    const nx1 = Math.sin(angle1);
    const ny1 = -Math.cos(angle1);
    let poly = points.map((p) => ({ x: p.x, y: p.y }));
    poly = clipHalfPlane(poly, apexX, apexY, nx0, ny0);
    poly = clipHalfPlane(poly, apexX, apexY, nx1, ny1);
    return poly;
}
function boundingRadiusFromFootprint(footprintVertices) {
    let maxRadiusSq = 0;
    const count = footprintVertices.length / 2;
    for (let i = 0; i < count; i++) {
        const vx = footprintVertices[i * 2];
        const vy = footprintVertices[i * 2 + 1];
        const distSq = vx * vx + vy * vy;
        if (distSq > maxRadiusSq) maxRadiusSq = distSq;
    }
    return Math.sqrt(maxRadiusSq);
}
function shardCountForPolygon(points, impactForce) {
    const area = Math.abs(polygonSignedArea(points));
    const span = Math.sqrt(area);
    let count = Math.max(4, Math.min(22, Math.round(span / 2) + Math.floor(impactForce * 0.06)));
    const maxFromArea = Math.max(2, Math.floor(area / (GLASS_MIN_SHARD_AREA * 1.25)));
    return Math.min(count, maxFromArea);
}
export function buildShardGeometry(points) {
    const { cx, cy, signedArea } = polygonCentroid(points);
    const count = points.length;
    const centered = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centered[i * 2] = points[i].x - cx;
        centered[i * 2 + 1] = points[i].y - cy;
    }
    return { footprintVertices: centered, footprintArea: Math.abs(signedArea), boundingRadius: boundingRadiusFromFootprint(centered), centroid: { cx, cy } };
}
export function shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10) {
    const points = flatVertsToPoints(flatVerts);
    if (points.length < 3) return [];
    const { x: apexX, y: apexY } = resolveShatterApex(points, hitX, hitY);
    const shardCount = shardCountForPolygon(points, impactForce);
    const baseStep = (Math.PI * 2) / shardCount;
    const offset = Math.random() * Math.PI * 2;
    const angles = [];
    for (let i = 0; i < shardCount; i++) {
        const jitter = (Math.random() - 0.5) * baseStep * 0.35;
        angles.push(offset + i * baseStep + jitter);
    }
    angles.sort((a, b) => a - b);
    const shards = [];
    for (let i = 0; i < angles.length; i++) {
        const a0 = angles[i];
        const a1 = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
        const poly = wedgePolygonIntersection(points, apexX, apexY, a0, a1);
        if (poly.length < 3) continue;
        if (Math.abs(polygonSignedArea(poly)) < GLASS_MIN_SHARD_AREA) continue;
        shards.push(buildShardGeometry(poly));
    }
    return shards;
}
export function shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10) {
    const flat = new Float32Array([-hx, -hy, hx, -hy, hx, hy, -hx, hy]);
    return shatterGlassPolygon(flat, hitX, hitY, impactForce);
}
