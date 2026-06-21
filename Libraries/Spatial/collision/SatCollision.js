import { findClosestWorldVertexInto, findExtremeVertexInto, rotateXY } from "../../Math/Poly2D.js";
import { dotXY } from "../../Math/Vec2.js";
import { COINCIDENT_CIRCLE_EPS } from "./penetration.js";
const contactA = { x: 0, y: 0 };
const contactB = { x: 0, y: 0 };
const closestVertex = { x: 0, y: 0 };
const MANIFOLD_MAX_POINTS = 2;
const clipX = new Float32Array(4);
const clipY = new Float32Array(4);
const manifoldPoints = [
    { cx: 0, cy: 0, featureA: 0, featureB: 0 },
    { cx: 0, cy: 0, featureA: 0, featureB: 0 },
];
function worldVertexInto(out, vertex, pos, cos, sin) {
    out.x = pos.x + vertex.x * cos - vertex.y * sin;
    out.y = pos.y + vertex.x * sin + vertex.y * cos;
}
function findEdgeMostAligned(normals, cos, sin, axisX, axisY, wantMax) {
    let bestDot = wantMax ? -Infinity : Infinity;
    let bestIndex = 0;
    for (let i = 0; i < normals.length; i++) {
        const n = normals[i];
        const rx = n.x * cos - n.y * sin;
        const ry = n.x * sin + n.y * cos;
        const dot = rx * axisX + ry * axisY;
        if (wantMax ? dot > bestDot : dot < bestDot) {
            bestDot = dot;
            bestIndex = i;
        }
    }
    return bestIndex;
}
function clipSegmentToHalfPlane(x0, y0, x1, y1, nx, ny, offset, outX, outY, outStart) {
    let count = outStart;
    const d0 = x0 * nx + y0 * ny - offset;
    const d1 = x1 * nx + y1 * ny - offset;
    if (d0 <= 0) {
        outX[count] = x0;
        outY[count] = y0;
        count++;
    }
    if (d1 <= 0) {
        outX[count] = x1;
        outY[count] = y1;
        count++;
    }
    if (d0 * d1 < 0) {
        const t = d0 / (d0 - d1);
        outX[count] = x0 + t * (x1 - x0);
        outY[count] = y0 + t * (y1 - y0);
        count++;
    }
    return count;
}
function nearestIncidentVertexIndex(vertices, pos, cos, sin, px, py) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const vx = pos.x + v.x * cos - v.y * sin;
        const vy = pos.y + v.x * sin + v.y * cos;
        const dx = px - vx;
        const dy = py - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i;
        }
    }
    return bestIndex;
}
function worldEdgeNormalInto(out, normals, edgeIndex, cos, sin) {
    const n = normals[edgeIndex];
    out.x = n.x * cos - n.y * sin;
    out.y = n.x * sin + n.y * cos;
}
function buildPolyPolyContactManifold(posA, shapeA, posB, shapeB, nx, ny, refPolyIsA, refEdgeIndex) {
    const refShape = refPolyIsA ? shapeA : shapeB;
    const refPos = refPolyIsA ? posA : posB;
    const incShape = refPolyIsA ? shapeB : shapeA;
    const incPos = refPolyIsA ? posB : posA;
    const refAngle = entityFacing(refPos);
    const incAngle = entityFacing(incPos);
    const refCos = Math.cos(refAngle);
    const refSin = Math.sin(refAngle);
    const incCos = Math.cos(incAngle);
    const incSin = Math.sin(incAngle);
    const refFaceNx = refPolyIsA ? nx : -nx;
    const refFaceNy = refPolyIsA ? ny : -ny;
    const refCount = refShape.vertices.length;
    const refEdgeNext = (refEdgeIndex + 1) % refCount;
    const sideEdgeA = (refEdgeIndex + refCount - 1) % refCount;
    const sideEdgeB = refEdgeNext;
    worldVertexInto(contactA, refShape.vertices[refEdgeIndex], refPos, refCos, refSin);
    worldVertexInto(contactB, refShape.vertices[refEdgeNext], refPos, refCos, refSin);
    worldEdgeNormalInto(closestVertex, refShape.normals, sideEdgeA, refCos, refSin);
    const sideANx = -closestVertex.x;
    const sideANy = -closestVertex.y;
    const sideAOffset = sideANx * contactA.x + sideANy * contactA.y;
    worldEdgeNormalInto(closestVertex, refShape.normals, sideEdgeB, refCos, refSin);
    const sideBNx = -closestVertex.x;
    const sideBNy = -closestVertex.y;
    const sideBOffset = sideBNx * contactB.x + sideBNy * contactB.y;
    const incidentEdge = findEdgeMostAligned(incShape.normals, incCos, incSin, refFaceNx, refFaceNy, true);
    const incCount = incShape.vertices.length;
    const incEdgeNext = (incidentEdge + 1) % incCount;
    worldVertexInto(closestVertex, incShape.vertices[incidentEdge], incPos, incCos, incSin);
    const incX0 = closestVertex.x;
    const incY0 = closestVertex.y;
    worldVertexInto(closestVertex, incShape.vertices[incEdgeNext], incPos, incCos, incSin);
    let clipCount = clipSegmentToHalfPlane(incX0, incY0, closestVertex.x, closestVertex.y, sideANx, sideANy, sideAOffset, clipX, clipY, 0);
    if (clipCount === 0) return null;
    if (clipCount === 1) {
        clipX[1] = clipX[0];
        clipY[1] = clipY[0];
        clipCount = 2;
    }
    clipCount = clipSegmentToHalfPlane(clipX[0], clipY[0], clipX[1], clipY[1], sideBNx, sideBNy, sideBOffset, clipX, clipY, 0);
    if (clipCount === 0) return null;
    const frontOffset = refFaceNx * contactA.x + refFaceNy * contactA.y;
    if (clipCount === 1) {
        clipX[1] = clipX[0];
        clipY[1] = clipY[0];
    }
    clipCount = clipSegmentToHalfPlane(clipX[0], clipY[0], clipX[1], clipY[1], refFaceNx, refFaceNy, frontOffset, clipX, clipY, 0);
    if (clipCount === 0) return null;
    let pointCount = 0;
    for (let i = 0; i < clipCount && pointCount < MANIFOLD_MAX_POINTS; i++) {
        const px = clipX[i];
        const py = clipY[i];
        if (i > 0 && Math.hypot(px - clipX[i - 1], py - clipY[i - 1]) <= 1e-6) continue;
        const incFeature = nearestIncidentVertexIndex(incShape.vertices, incPos, incCos, incSin, px, py);
        const refFeature = nearestIncidentVertexIndex(refShape.vertices, refPos, refCos, refSin, px, py);
        const pt = manifoldPoints[pointCount];
        pt.cx = px;
        pt.cy = py;
        if (refPolyIsA) {
            pt.featureA = refFeature;
            pt.featureB = incFeature;
        } else {
            pt.featureA = incFeature;
            pt.featureB = refFeature;
        }
        pointCount++;
    }
    if (pointCount === 0) return null;
    return pointCount;
}
function entityFacing(entity) {
    if (entity._collisionFacing != null) return entity._collisionFacing;
    return entity.facing ?? entity.angle ?? 0;
}
export function getEntityCollisionParts(entity) {
    if (entity.collisionParts?.length) return entity.collisionParts;
    const shape = entity.getShape?.() ?? entity.shape;
    return shape ? [shape] : [];
}
export function circleCircleContact(posA, shapeA, posB, shapeB) {
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const distSq = dx * dx + dy * dy;
    const radii = shapeA.radius + shapeB.radius;
    if (distSq >= radii * radii) return null;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) return { overlap: radii, nx: 0, ny: 0, cx: posA.x, cy: posA.y, coincident: true };
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    return { overlap, nx: dx / dist, ny: dy / dist, cx: posA.x + (dx / dist) * (shapeA.radius - overlap / 2), cy: posA.y + (dy / dist) * (shapeA.radius - overlap / 2) };
}
export function checkEntityPairCollision(bodyA, bodyB) {
    const partsA = getEntityCollisionParts(bodyA);
    const partsB = getEntityCollisionParts(bodyB);
    let best = null;
    for (let i = 0; i < partsA.length; i++)
        for (let j = 0; j < partsB.length; j++) {
            const info = SatCollision.checkCollision(bodyA, partsA[i], bodyB, partsB[j]);
            if (!info) continue;
            if (!best || info.overlap > best.info.overlap) best = { info, shapeA: partsA[i], shapeB: partsB[j] };
        }
    return best;
}
export class SatCollision {
    static checkCollision(posA, shapeA, posB, shapeB) {
        if (!shapeA || !shapeB) return null;
        if (shapeA.type === "Circle" && shapeB.type === "Circle") return circleCircleContact(posA, shapeA, posB, shapeB);
        if (shapeA.type === "Polygon" && shapeB.type === "Polygon") return this._polygonPolygon(posA, shapeA, posB, shapeB);
        if (shapeA.type === "Circle" && shapeB.type === "Polygon") return this._circlePolygon(posA, shapeA, posB, shapeB);
        if (shapeA.type === "Polygon" && shapeB.type === "Circle") {
            const res = this._circlePolygon(posB, shapeB, posA, shapeA);
            if (res) {
                res.nx = -res.nx;
                res.ny = -res.ny;
                return res;
            }
            return null;
        }
        return null;
    }
    static _polygonPolygon(posA, shapeA, posB, shapeB) {
        let minOverlap = Infinity;
        let minNormal = null;
        let refPolyIsA = true;
        let refEdgeIndex = 0;
        const checkAxes = (poly, p, isPolyA) => {
            const angleA = entityFacing(p);
            const cosA = Math.cos(angleA);
            const sinA = Math.sin(angleA);
            for (let i = 0; i < poly.normals.length; i++) {
                const n = poly.normals[i];
                const rotatedNormal = rotateXY(n.x, n.y, cosA, sinA);
                const projA = this._projectPolygon(rotatedNormal, shapeA, posA, entityFacing(posA));
                const projB = this._projectPolygon(rotatedNormal, shapeB, posB, entityFacing(posB));
                if (projA.min >= projB.max || projB.min >= projA.max) return false;
                const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    minNormal = rotatedNormal;
                    refPolyIsA = isPolyA;
                    refEdgeIndex = i;
                }
            }
            return true;
        };
        if (!checkAxes(shapeA, posA, true)) return null;
        if (!checkAxes(shapeB, posB, false)) return null;
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        if (dx * minNormal.x + dy * minNormal.y < 0) minNormal = { x: -minNormal.x, y: -minNormal.y };
        const pointCount = buildPolyPolyContactManifold(posA, shapeA, posB, shapeB, minNormal.x, minNormal.y, refPolyIsA, refEdgeIndex);
        if (pointCount == null) {
            const facingB = entityFacing(posB);
            const cosB = Math.cos(facingB);
            const sinB = Math.sin(facingB);
            const featureB = findExtremeVertexInto(contactB, shapeB.vertices, posB, cosB, sinB, minNormal.x, minNormal.y, false);
            const facingA = entityFacing(posA);
            const cosA = Math.cos(facingA);
            const sinA = Math.sin(facingA);
            const featureA = findExtremeVertexInto(contactA, shapeA.vertices, posA, cosA, sinA, minNormal.x, minNormal.y, true);
            const cx = (contactA.x + contactB.x) / 2;
            const cy = (contactA.y + contactB.y) / 2;
            return { overlap: minOverlap, nx: minNormal.x, ny: minNormal.y, cx, cy, featureA, featureB, points: [{ cx, cy, featureA, featureB }] };
        }
        const first = manifoldPoints[0];
        const points = pointCount === 1 ? [manifoldPoints[0]] : [manifoldPoints[0], manifoldPoints[1]];
        return { overlap: minOverlap, nx: minNormal.x, ny: minNormal.y, cx: first.cx, cy: first.cy, featureA: first.featureA, featureB: first.featureB, points };
    }
    static _circlePolygon(posCircle, circleShape, posPoly, polyShape) {
        const polyAngle = entityFacing(posPoly);
        if (isNaN(posCircle.x) || isNaN(posCircle.y) || isNaN(posPoly.x) || isNaN(posPoly.y)) return null;
        let minOverlap = Infinity;
        let minNormal = null;
        const cosP = Math.cos(polyAngle);
        const sinP = Math.sin(polyAngle);
        for (let i = 0; i < polyShape.normals.length; i++) {
            const n = polyShape.normals[i];
            const rotatedNormal = rotateXY(n.x, n.y, cosP, sinP);
            const projCircle = this._projectCircle(rotatedNormal, posCircle, circleShape);
            const projPoly = this._projectPolygon(rotatedNormal, polyShape, posPoly, polyAngle);
            if (projCircle.min >= projPoly.max || projPoly.min >= projCircle.max) return null;
            const overlap = Math.min(projCircle.max - projPoly.min, projPoly.max - projCircle.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormal = rotatedNormal;
            }
        }
        const featureB = findClosestWorldVertexInto(closestVertex, polyShape.vertices, posPoly, cosP, sinP, posCircle.x, posCircle.y);
        const dx = closestVertex.x - posCircle.x;
        const dy = closestVertex.y - posCircle.y;
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            const n = { x: dx / len, y: dy / len };
            const projCircle = this._projectCircle(n, posCircle, circleShape);
            const projPoly = this._projectPolygon(n, polyShape, posPoly, polyAngle);
            if (projCircle.min >= projPoly.max || projPoly.min >= projCircle.max) return null;
            const overlap = Math.min(projCircle.max - projPoly.min, projPoly.max - projCircle.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormal = n;
            }
        }
        const cx = posPoly.x - posCircle.x;
        const cy = posPoly.y - posCircle.y;
        if (cx * minNormal.x + cy * minNormal.y < 0) minNormal = { x: -minNormal.x, y: -minNormal.y };
        return {
            overlap: minOverlap,
            nx: minNormal.x,
            ny: minNormal.y,
            cx: posCircle.x + minNormal.x * (circleShape.radius - minOverlap / 2),
            cy: posCircle.y + minNormal.y * (circleShape.radius - minOverlap / 2),
            featureA: 0,
            featureB,
            points: [{ cx: posCircle.x + minNormal.x * (circleShape.radius - minOverlap / 2), cy: posCircle.y + minNormal.y * (circleShape.radius - minOverlap / 2), featureA: 0, featureB }],
        };
    }
    static _projectPolygon(axis, shape, pos, angle = 0) {
        let min = Infinity;
        let max = -Infinity;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < shape.vertices.length; i++) {
            const v = shape.vertices[i];
            const r = rotateXY(v.x, v.y, cos, sin);
            const vx = pos.x + r.x;
            const vy = pos.y + r.y;
            const projection = dotXY(vx, vy, axis.x, axis.y);
            if (projection < min) min = projection;
            if (projection > max) max = projection;
        }
        return { min, max };
    }
    static _projectCircle(axis, pos, shape) {
        const projection = pos.x * axis.x + pos.y * axis.y;
        return { min: projection - shape.radius, max: projection + shape.radius };
    }
}
