import { pointInPolygon, polygonSignedArea2D, polygonCentroid2D } from "../Math/Poly2D.js";
import { closestPointOnLineSegment } from "../Math/Segment2D.js";
export const GLASS_FRACTURE_IMPACT_THRESHOLD = 6;
export const GLASS_MIN_SHARD_AREA = 12;
export const GLASS_MAX_SHARDS_PER_SHATTER = 18;
export const GLASS_MAX_SLIVER_ASPECT = 10;
export const GLASS_MIN_WEDGE_ANGLE = Math.PI / 12;
export const GLASS_FRACTURE_COOLDOWN_STEPS = 8;
function polygonSpan(flatVerts) {
    return Math.sqrt(Math.abs(polygonSignedArea2D(flatVerts)));
}
function closestPointOnPolygonBoundary(x, y, flatVerts) {
    let bestX = flatVerts[0];
    let bestY = flatVerts[1];
    let bestDistSq = Infinity;
    const count = flatVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const ax = flatVerts[i * 2];
        const ay = flatVerts[i * 2 + 1];
        const bx = flatVerts[j * 2];
        const by = flatVerts[j * 2 + 1];
        const closest = closestPointOnLineSegment(x, y, ax, ay, bx, by);
        const distSq = (x - closest.x) * (x - closest.x) + (y - closest.y) * (y - closest.y);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestX = closest.x;
            bestY = closest.y;
        }
    }
    return { x: bestX, y: bestY, dist: Math.sqrt(bestDistSq) };
}
function minDistToPolygonBoundary(x, y, flatVerts) {
    return closestPointOnPolygonBoundary(x, y, flatVerts).dist;
}
export function minShardAreaForPolygon(flatVerts) {
    const area = Math.abs(polygonSignedArea2D(flatVerts));
    return Math.max(GLASS_MIN_SHARD_AREA, area / GLASS_MAX_SHARDS_PER_SHATTER);
}
function minThinEdgeForPolygon(flatVerts) {
    return Math.max(3, polygonSpan(flatVerts) * 0.08);
}
export function measureGlassShard(flatVerts) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const count = flatVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const x = flatVerts[i * 2];
        const y = flatVerts[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const thick = Math.max(maxX - minX, maxY - minY);
    const thin = Math.min(maxX - minX, maxY - minY);
    return { area: Math.abs(polygonSignedArea2D(flatVerts)), thin, thick, aspect: thick / Math.max(1e-6, thin) };
}
function resolveShatterApex(flatVerts, hitX, hitY) {
    const { cx, cy } = polygonCentroid2D(flatVerts);
    const span = polygonSpan(flatVerts);
    let ax = hitX;
    let ay = hitY;
    if (!pointInPolygon(ax, ay, flatVerts)) {
        const onEdge = closestPointOnPolygonBoundary(hitX, hitY, flatVerts);
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
    if (!pointInPolygon(ax, ay, flatVerts)) {
        ax = cx;
        ay = cy;
    }
    return { x: ax, y: ay };
}
function clipHalfPlane(flatVerts, ax, ay, nx, ny) {
    const len = flatVerts.length;
    if (len === 0) return flatVerts;
    const count = len / 2;
    const out = [];
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const cx = flatVerts[i * 2];
        const cy = flatVerts[i * 2 + 1];
        const nx_coord = flatVerts[j * 2];
        const ny_coord = flatVerts[j * 2 + 1];
        const currIn = (cx - ax) * nx + (cy - ay) * ny >= -1e-9;
        const nextIn = (nx_coord - ax) * nx + (ny_coord - ay) * ny >= -1e-9;
        if (currIn && nextIn) out.push(nx_coord, ny_coord);
        else if (currIn && !nextIn) {
            const dx = nx_coord - cx;
            const dy = ny_coord - cy;
            const denom = dx * nx + dy * ny;
            const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
            out.push(cx + dx * t, cy + dy * t);
        } else if (!currIn && nextIn) {
            const dx = nx_coord - cx;
            const dy = ny_coord - cy;
            const denom = dx * nx + dy * ny;
            const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
            out.push(cx + dx * t, cy + dy * t);
            out.push(nx_coord, ny_coord);
        }
    }
    return new Float32Array(out);
}
export function wedgePolygonIntersection(flatVerts, apexX, apexY, angle0, angle1) {
    const nx0 = -Math.sin(angle0);
    const ny0 = Math.cos(angle0);
    const nx1 = Math.sin(angle1);
    const ny1 = -Math.cos(angle1);
    let poly = flatVerts;
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
function acceptGlassShard(flatVerts, parentFlatVerts) {
    const area = Math.abs(polygonSignedArea2D(flatVerts));
    if (area < GLASS_MIN_SHARD_AREA) return false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const count = flatVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const x = flatVerts[i * 2];
        const y = flatVerts[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const thick = Math.max(maxX - minX, maxY - minY);
    const thin = Math.min(maxX - minX, maxY - minY);
    if (thin < minThinEdgeForPolygon(parentFlatVerts)) return false;
    if (thick / Math.max(1e-6, thin) > GLASS_MAX_SLIVER_ASPECT) return false;
    return true;
}
function buildGlassShards(flatVerts, apexX, apexY, shardCount, random) {
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
        const a0 = angles[startIndex];
        const a1 = startIndex === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[startIndex + 1];
        const poly = wedgePolygonIntersection(flatVerts, apexX, apexY, a0, a1);
        if (poly.length < 6) {
            startIndex++;
            continue;
        }
        if (acceptGlassShard(poly, flatVerts)) {
            shards.push(buildShardGeometry(poly));
            lastStartIdx = startIndex;
            startIndex++;
        } else {
            let merged = false;
            if (lastStartIdx !== -1) {
                const prevA0 = angles[lastStartIdx];
                const angleDiff = a1 - prevA0;
                if (angleDiff < Math.PI * 0.95) {
                    const mergedPoly = wedgePolygonIntersection(flatVerts, apexX, apexY, prevA0, a1);
                    if (mergedPoly.length >= 6) {
                        shards.pop();
                        shards.push(buildShardGeometry(mergedPoly));
                        merged = true;
                    }
                }
            }
            if (merged) startIndex++;
            else {
                shards.push(buildShardGeometry(poly));
                lastStartIdx = startIndex;
                startIndex++;
            }
        }
    }
    return shards;
}
function shardCountForPolygon(flatVerts, impactForce, apexX, apexY) {
    const area = Math.abs(polygonSignedArea2D(flatVerts));
    const span = polygonSpan(flatVerts);
    const minArea = minShardAreaForPolygon(flatVerts);
    const areaCap = Math.max(2, Math.floor(area / minArea));
    const angleCap = Math.floor((Math.PI * 2) / GLASS_MIN_WEDGE_ANGLE);
    const minShardsAllowed = Math.min(4, areaCap);
    let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 8) + Math.floor(impactForce * 0.04)));
    count = Math.min(count, areaCap, angleCap);
    const boundaryDist = minDistToPolygonBoundary(apexX, apexY, flatVerts);
    const boundaryFactor = Math.min(1, boundaryDist / (span * 0.14));
    count = Math.max(minShardsAllowed, Math.round(count * (0.35 + 0.65 * boundaryFactor)));
    return count;
}
export function buildShardGeometry(flatVerts) {
    const { cx, cy, signedArea } = polygonCentroid2D(flatVerts);
    const count = flatVerts.length / 2;
    const centered = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centered[i * 2] = flatVerts[i * 2] - cx;
        centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
    }
    return { footprintVertices: centered, footprintArea: Math.abs(signedArea), boundingRadius: boundingRadiusFromFootprint(centered), centroid: { cx, cy } };
}
export function shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random) {
    if (flatVerts.length < 6) return [];
    const parentArea = Math.abs(polygonSignedArea2D(flatVerts));
    const { x: apexX, y: apexY } = resolveShatterApex(flatVerts, hitX, hitY);
    let shardCount = shardCountForPolygon(flatVerts, impactForce, apexX, apexY);
    let shards = buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
    const minArea = minShardAreaForPolygon(flatVerts);
    const areaCap = Math.max(2, Math.floor(parentArea / minArea));
    const minShardsAllowed = Math.min(4, areaCap);
    for (let attempt = 0; attempt < 4; attempt++) {
        let totalArea = 0;
        for (let i = 0; i < shards.length; i++) totalArea += shards[i].footprintArea;
        if (shards.length >= 2 && totalArea >= parentArea * 0.92) return shards;
        shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
        shards = buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
    }
    return shards.length >= 2 ? shards : [];
}
export function shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
    const flat = new Float32Array([-hx, -hy, hx, -hy, hx, hy, -hx, hy]);
    return shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
}
