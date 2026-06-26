import { pointInPolygon } from "../Math/Poly2D.js";
export const GLASS_FRACTURE_IMPACT_THRESHOLD = 6;
export const GLASS_MIN_SHARD_AREA = 12;
export const GLASS_MAX_SHARDS_PER_SHATTER = 18;
export const GLASS_MAX_SLIVER_ASPECT = 10;
export const GLASS_MIN_WEDGE_ANGLE = Math.PI / 12;
export const GLASS_FRACTURE_COOLDOWN_STEPS = 8;
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
function polygonSpan(points) {
    return Math.sqrt(Math.abs(polygonSignedArea(points)));
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
    return { x: bestX, y: bestY, dist: Math.sqrt(bestDistSq) };
}
function minDistToPolygonBoundary(x, y, points) {
    return closestPointOnPolygonBoundary(x, y, points).dist;
}
export function minShardAreaForPolygon(points) {
    const area = Math.abs(polygonSignedArea(points));
    return Math.max(GLASS_MIN_SHARD_AREA, area / GLASS_MAX_SHARDS_PER_SHATTER);
}
function minThinEdgeForPolygon(points) {
    return Math.max(3, polygonSpan(points) * 0.08);
}
export function measureGlassShard(flatVerts) {
    const points = flatVertsToPoints(flatVerts);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        minX = Math.min(minX, points[i].x);
        maxX = Math.max(maxX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxY = Math.max(maxY, points[i].y);
    }
    const thick = Math.max(maxX - minX, maxY - minY);
    const thin = Math.min(maxX - minX, maxY - minY);
    return { area: Math.abs(polygonSignedArea(points)), thin, thick, aspect: thick / Math.max(1e-6, thin) };
}
function resolveShatterApex(points, hitX, hitY) {
    const { cx, cy } = polygonCentroid(points);
    const span = polygonSpan(points);
    let ax = hitX;
    let ay = hitY;
    if (!pointInPolygon(ax, ay, points)) {
        const onEdge = closestPointOnPolygonBoundary(hitX, hitY, points);
        ax = onEdge.x;
        ay = onEdge.y;
    }
    const inset = Math.min(span * 0.18, 18);
    const dx = cx - ax;
    const dy = cy - ay;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
        const push = Math.min(inset, dist * 0.4);
        ax += (dx / dist) * push;
        ay += (dy / dist) * push;
    }
    if (!pointInPolygon(ax, ay, points)) {
        ax = cx;
        ay = cy;
    }
    return { x: ax, y: ay };
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
export function wedgePolygonIntersection(points, apexX, apexY, angle0, angle1) {
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
function acceptGlassShard(poly, parentPoints) {
    const area = Math.abs(polygonSignedArea(poly));
    if (area < GLASS_MIN_SHARD_AREA) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < poly.length; i++) {
        minX = Math.min(minX, poly[i].x);
        maxX = Math.max(maxX, poly[i].x);
        minY = Math.min(minY, poly[i].y);
        maxY = Math.max(maxY, poly[i].y);
    }
    const thick = Math.max(maxX - minX, maxY - minY);
    const thin = Math.min(maxX - minX, maxY - minY);
    if (thin < minThinEdgeForPolygon(parentPoints)) return false;
    if (thick / Math.max(1e-6, thin) > GLASS_MAX_SLIVER_ASPECT) return false;
    return true;
}
function buildGlassShards(points, apexX, apexY, shardCount, random) {
    const baseStep = (Math.PI * 2) / shardCount;
    const offset = random() * Math.PI * 2;
    const angles = [];
    for (let i = 0; i < shardCount; i++) {
        const jitter = (random() - 0.5) * baseStep * 0.25;
        angles.push(offset + i * baseStep + jitter);
    }
    angles.sort((a, b) => a - b);
    const shards = [];
    let startIndex = 0;
    let lastStartIdx = -1;
    while (startIndex < angles.length) {
        let accepted = false;
        let endIndex = startIndex + 1;
        for (; endIndex <= angles.length; endIndex++) {
            const a0 = angles[startIndex];
            const a1 = endIndex < angles.length ? angles[endIndex] : angles[0] + Math.PI * 2;
            const poly = wedgePolygonIntersection(points, apexX, apexY, a0, a1);
            if (poly.length < 3) continue;
            if (acceptGlassShard(poly, points)) {
                shards.push(buildShardGeometry(poly));
                lastStartIdx = startIndex;
                accepted = true;
                break;
            }
        }
        if (accepted) startIndex = endIndex;
        else {
            if (lastStartIdx !== -1) {
                shards.pop();
                const a0 = angles[lastStartIdx];
                const a1 = angles[0] + Math.PI * 2;
                const poly = wedgePolygonIntersection(points, apexX, apexY, a0, a1);
                if (poly.length >= 3) shards.push(buildShardGeometry(poly));
            }
            break;
        }
    }
    return shards;
}
function shardCountForPolygon(points, impactForce, apexX, apexY) {
    const area = Math.abs(polygonSignedArea(points));
    const span = polygonSpan(points);
    const minArea = minShardAreaForPolygon(points);
    const areaCap = Math.max(2, Math.floor(area / minArea));
    const angleCap = Math.floor((Math.PI * 2) / GLASS_MIN_WEDGE_ANGLE);
    const minShardsAllowed = Math.min(4, areaCap);
    let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 8) + Math.floor(impactForce * 0.04)));
    count = Math.min(count, areaCap, angleCap);
    const boundaryDist = minDistToPolygonBoundary(apexX, apexY, points);
    const boundaryFactor = Math.min(1, boundaryDist / (span * 0.14));
    count = Math.max(minShardsAllowed, Math.round(count * (0.35 + 0.65 * boundaryFactor)));
    return count;
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
export function shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random) {
    const points = flatVertsToPoints(flatVerts);
    if (points.length < 3) return [];
    const parentArea = Math.abs(polygonSignedArea(points));
    const { x: apexX, y: apexY } = resolveShatterApex(points, hitX, hitY);
    let shardCount = shardCountForPolygon(points, impactForce, apexX, apexY);
    let shards = buildGlassShards(points, apexX, apexY, shardCount, random);
    const minArea = minShardAreaForPolygon(points);
    const areaCap = Math.max(2, Math.floor(parentArea / minArea));
    const minShardsAllowed = Math.min(4, areaCap);
    for (let attempt = 0; attempt < 4; attempt++) {
        let totalArea = 0;
        for (let i = 0; i < shards.length; i++) totalArea += shards[i].footprintArea;
        if (shards.length >= 2 && totalArea >= parentArea * 0.92) return shards;
        shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
        shards = buildGlassShards(points, apexX, apexY, shardCount, random);
    }
    return shards.length >= 2 ? shards : [];
}
export function shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
    const flat = new Float32Array([-hx, -hy, hx, -hy, hx, hy, -hx, hy]);
    return shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
}
