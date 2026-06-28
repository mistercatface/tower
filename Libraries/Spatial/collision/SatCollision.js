import { findClosestWorldVertexInto, findExtremeVertexInto, rotateXY, rotateXYInto, transformPoint2DInto } from "../../Math/Poly2D.js";
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
export const SAT_RESULT = new Float32Array(25);
export const SAT_BEST_RESULT = new Float32Array(25);
const PROJ_A = new Float32Array(2);
const PROJ_B = new Float32Array(2);
const posScratch = { x: 0, y: 0 };
function findEdgeMostAligned(normals, cos, sin, axisX, axisY, wantMax) {
    let bestDot = wantMax ? -Infinity : Infinity;
    let bestIndex = 0;
    const count = normals.length;
    for (let i = 0; i < count; i += 2) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const rx = nx * cos - ny * sin;
        const ry = nx * sin + ny * cos;
        const dot = rx * axisX + ry * axisY;
        if (wantMax ? dot > bestDot : dot < bestDot) {
            bestDot = dot;
            bestIndex = i / 2;
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
function nearestIncidentVertexIndex(vertices, pxVal, pyVal, cos, sin, px, py) {
    let bestDistSq = Infinity;
    let bestIndex = 0;
    const count = vertices.length;
    for (let i = 0; i < count; i += 2) {
        const lx = vertices[i];
        const ly = vertices[i + 1];
        const vx = pxVal + lx * cos - ly * sin;
        const vy = pyVal + lx * sin + ly * cos;
        const dx = px - vx;
        const dy = py - vy;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i / 2;
        }
    }
    return bestIndex;
}
function worldEdgeNormalInto(out, normals, edgeIndex, cos, sin) {
    return rotateXYInto(out, normals[edgeIndex * 2], normals[edgeIndex * 2 + 1], cos, sin);
}
function buildPolyPolyContactManifold(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB, nx, ny, refPolyIsA, refEdgeIndex) {
    const refShape = refPolyIsA ? shapeA : shapeB;
    const refX = refPolyIsA ? xA : xB;
    const refY = refPolyIsA ? yA : yB;
    const incShape = refPolyIsA ? shapeB : shapeA;
    const incX = refPolyIsA ? xB : xA;
    const incY = refPolyIsA ? yB : yA;
    const refAngle = refPolyIsA ? angleA : angleB;
    const incAngle = refPolyIsA ? angleB : angleA;
    const refCos = Math.cos(refAngle);
    const refSin = Math.sin(refAngle);
    const incCos = Math.cos(incAngle);
    const incSin = Math.sin(incAngle);
    const refFaceNx = refPolyIsA ? nx : -nx;
    const refFaceNy = refPolyIsA ? ny : -ny;
    const refCount = refShape.vertices.length / 2;
    const refEdgeNext = (refEdgeIndex + 1) % refCount;
    const sideEdgeA = (refEdgeIndex + refCount - 1) % refCount;
    const sideEdgeB = refEdgeNext;
    transformPoint2DInto(contactA, refX, refY, refShape.vertices[refEdgeIndex * 2], refShape.vertices[refEdgeIndex * 2 + 1], refCos, refSin);
    transformPoint2DInto(contactB, refX, refY, refShape.vertices[refEdgeNext * 2], refShape.vertices[refEdgeNext * 2 + 1], refCos, refSin);
    worldEdgeNormalInto(closestVertex, refShape.normals, sideEdgeA, refCos, refSin);
    const sideANx = -closestVertex.x;
    const sideANy = -closestVertex.y;
    const sideAOffset = sideANx * contactA.x + sideANy * contactA.y;
    worldEdgeNormalInto(closestVertex, refShape.normals, sideEdgeB, refCos, refSin);
    const sideBNx = -closestVertex.x;
    const sideBNy = -closestVertex.y;
    const sideBOffset = sideBNx * contactB.x + sideBNy * contactB.y;
    const incidentEdge = findEdgeMostAligned(incShape.normals, incCos, incSin, refFaceNx, refFaceNy, true);
    const incCount = incShape.vertices.length / 2;
    const incEdgeNext = (incidentEdge + 1) % incCount;
    transformPoint2DInto(closestVertex, incX, incY, incShape.vertices[incidentEdge * 2], incShape.vertices[incidentEdge * 2 + 1], incCos, incSin);
    const incX0 = closestVertex.x;
    const incY0 = closestVertex.y;
    transformPoint2DInto(closestVertex, incX, incY, incShape.vertices[incEdgeNext * 2], incShape.vertices[incEdgeNext * 2 + 1], incCos, incSin);
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
        const incFeature = nearestIncidentVertexIndex(incShape.vertices, incX, incY, incCos, incSin, px, py);
        const refFeature = nearestIncidentVertexIndex(refShape.vertices, refX, refY, refCos, refSin, px, py);
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
export function entityFacing(entity) {
    if (entity == null) return 0;
    if (entity._collisionFacing != null) return entity._collisionFacing;
    return entity.facing ?? entity.angle ?? 0;
}
const EMPTY_ARRAY = [];
export function getEntityCollisionParts(entity) {
    if (entity.collisionParts?.length) return entity.collisionParts;
    const shape = entity.shape;
    if (shape) {
        if (entity._cachedCollisionPartsShape !== shape) {
            entity._cachedCollisionPartsShape = shape;
            entity._cachedCollisionPartsArray = [shape];
        }
        return entity._cachedCollisionPartsArray;
    }
    return EMPTY_ARRAY;
}
export function circleCircleContact(xA, yA, shapeA, xB, yB, shapeB) {
    const dx = xB - xA;
    const dy = yB - yA;
    const distSq = dx * dx + dy * dy;
    const radii = shapeA.radius + shapeB.radius;
    if (distSq >= radii * radii) return false;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) {
        SAT_RESULT[0] = radii;
        SAT_RESULT[1] = 0;
        SAT_RESULT[2] = 0;
        SAT_RESULT[3] = xA;
        SAT_RESULT[4] = yA;
        SAT_RESULT[5] = 1;
        SAT_RESULT[6] = 0;
        SAT_RESULT[7] = 0;
        SAT_RESULT[8] = 0;
        return true;
    }
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const cx = xA + nx * (shapeA.radius - overlap / 2);
    const cy = yA + ny * (shapeA.radius - overlap / 2);
    SAT_RESULT[0] = overlap;
    SAT_RESULT[1] = nx;
    SAT_RESULT[2] = ny;
    SAT_RESULT[3] = cx;
    SAT_RESULT[4] = cy;
    SAT_RESULT[5] = 0;
    SAT_RESULT[6] = 0;
    SAT_RESULT[7] = 0;
    SAT_RESULT[8] = 1;
    SAT_RESULT[9] = cx;
    SAT_RESULT[10] = cy;
    SAT_RESULT[11] = 0;
    SAT_RESULT[12] = 0;
    return true;
}
export function checkEntityPairCollision(bodyA, bodyB, xA = bodyA.x, yA = bodyA.y, xB = bodyB.x, yB = bodyB.y) {
    const partsA = getEntityCollisionParts(bodyA);
    const partsB = getEntityCollisionParts(bodyB);
    let bestOverlap = -Infinity;
    let found = false;
    for (let i = 0; i < partsA.length; i++)
        for (let j = 0; j < partsB.length; j++)
            if (SatCollision.checkCollision(xA, yA, entityFacing(bodyA), partsA[i], xB, yB, entityFacing(bodyB), partsB[j])) {
                const overlap = SAT_RESULT[0];
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    found = true;
                    SAT_BEST_RESULT.set(SAT_RESULT);
                }
            }
    if (found) {
        SAT_RESULT.set(SAT_BEST_RESULT);
        return true;
    }
    return false;
}
export function checkEntityPairCollisionAt(bodyA, xA, yA, bodyB, xB, yB) {
    return checkEntityPairCollision(bodyA, bodyB, xA, yA, xB, yB);
}
export class SatCollision {
    static checkCollision(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
        if (!shapeA || !shapeB) return false;
        if (shapeA.type === "Circle" && shapeB.type === "Circle") return circleCircleContact(xA, yA, shapeA, xB, yB, shapeB);
        if (shapeA.type === "Polygon" && shapeB.type === "Polygon") return this._polygonPolygon(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB);
        if (shapeA.type === "Circle" && shapeB.type === "Polygon") return this._circlePolygon(xA, yA, shapeA, xB, yB, angleB, shapeB);
        if (shapeA.type === "Polygon" && shapeB.type === "Circle") {
            const res = this._circlePolygon(xB, yB, shapeB, xA, yA, angleA, shapeA);
            if (res) {
                SAT_RESULT[1] = -SAT_RESULT[1];
                SAT_RESULT[2] = -SAT_RESULT[2];
                const featA = SAT_RESULT[6];
                SAT_RESULT[6] = SAT_RESULT[7];
                SAT_RESULT[7] = featA;
                const pointCount = SAT_RESULT[8];
                for (let p = 0; p < pointCount; p++) {
                    const offset = 9 + p * 4;
                    const fA = SAT_RESULT[offset + 2];
                    SAT_RESULT[offset + 2] = SAT_RESULT[offset + 3];
                    SAT_RESULT[offset + 3] = fA;
                }
                return true;
            }
            return false;
        }
        return false;
    }
    static _polygonPolygon(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
        let minOverlap = Infinity;
        let minNormalX = 0;
        let minNormalY = 0;
        let refPolyIsA = true;
        let refEdgeIndex = 0;
        // Check shapeA axes
        let cos = Math.cos(angleA);
        let sin = Math.sin(angleA);
        const normalsCountA = shapeA.normals.length;
        for (let i = 0; i < normalsCountA; i += 2) {
            const nx = shapeA.normals[i];
            const ny = shapeA.normals[i + 1];
            const rNx = nx * cos - ny * sin;
            const rNy = nx * sin + ny * cos;
            this._projectPolygon(PROJ_A, rNx, rNy, shapeA, xA, yA, angleA);
            this._projectPolygon(PROJ_B, rNx, rNy, shapeB, xB, yB, angleB);
            if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
            const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormalX = rNx;
                minNormalY = rNy;
                refPolyIsA = true;
                refEdgeIndex = i / 2;
            }
        }
        // Check shapeB axes
        cos = Math.cos(angleB);
        sin = Math.sin(angleB);
        const normalsCountB = shapeB.normals.length;
        for (let i = 0; i < normalsCountB; i += 2) {
            const nx = shapeB.normals[i];
            const ny = shapeB.normals[i + 1];
            const rNx = nx * cos - ny * sin;
            const rNy = nx * sin + ny * cos;
            this._projectPolygon(PROJ_A, rNx, rNy, shapeA, xA, yA, angleA);
            this._projectPolygon(PROJ_B, rNx, rNy, shapeB, xB, yB, angleB);
            if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
            const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormalX = rNx;
                minNormalY = rNy;
                refPolyIsA = false;
                refEdgeIndex = i / 2;
            }
        }
        const dx = xB - xA;
        const dy = yB - yA;
        if (dx * minNormalX + dy * minNormalY < 0) {
            minNormalX = -minNormalX;
            minNormalY = -minNormalY;
        }
        const pointCount = buildPolyPolyContactManifold(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB, minNormalX, minNormalY, refPolyIsA, refEdgeIndex);
        if (pointCount == null) {
            const cosB = Math.cos(angleB);
            const sinB = Math.sin(angleB);
            posScratch.x = xB;
            posScratch.y = yB;
            const featureB = findExtremeVertexInto(contactB, shapeB.vertices, posScratch, cosB, sinB, minNormalX, minNormalY, false);
            const cosA = Math.cos(angleA);
            const sinA = Math.sin(angleA);
            posScratch.x = xA;
            posScratch.y = yA;
            const featureA = findExtremeVertexInto(contactA, shapeA.vertices, posScratch, cosA, sinA, minNormalX, minNormalY, true);
            const cx = (contactA.x + contactB.x) / 2;
            const cy = (contactA.y + contactB.y) / 2;
            SAT_RESULT[0] = minOverlap;
            SAT_RESULT[1] = minNormalX;
            SAT_RESULT[2] = minNormalY;
            SAT_RESULT[3] = cx;
            SAT_RESULT[4] = cy;
            SAT_RESULT[5] = 0;
            SAT_RESULT[6] = featureA;
            SAT_RESULT[7] = featureB;
            SAT_RESULT[8] = 1;
            SAT_RESULT[9] = cx;
            SAT_RESULT[10] = cy;
            SAT_RESULT[11] = featureA;
            SAT_RESULT[12] = featureB;
            return true;
        }
        const first = manifoldPoints[0];
        SAT_RESULT[0] = minOverlap;
        SAT_RESULT[1] = minNormalX;
        SAT_RESULT[2] = minNormalY;
        SAT_RESULT[3] = first.cx;
        SAT_RESULT[4] = first.cy;
        SAT_RESULT[5] = 0;
        SAT_RESULT[6] = first.featureA;
        SAT_RESULT[7] = first.featureB;
        SAT_RESULT[8] = pointCount;
        for (let p = 0; p < pointCount; p++) {
            const offset = 9 + p * 4;
            const pt = manifoldPoints[p];
            SAT_RESULT[offset + 0] = pt.cx;
            SAT_RESULT[offset + 1] = pt.cy;
            SAT_RESULT[offset + 2] = pt.featureA;
            SAT_RESULT[offset + 3] = pt.featureB;
        }
        return true;
    }
    static _circlePolygon(cxCircle, cyCircle, circleShape, pxPoly, pyPoly, anglePoly, polyShape) {
        if (isNaN(cxCircle) || isNaN(cyCircle) || isNaN(pxPoly) || isNaN(pyPoly)) return false;
        let minOverlap = Infinity;
        let minNormalX = 0;
        let minNormalY = 0;
        const cosP = Math.cos(anglePoly);
        const sinP = Math.sin(anglePoly);
        const normalsCount = polyShape.normals.length;
        for (let i = 0; i < normalsCount; i += 2) {
            const nx = polyShape.normals[i];
            const ny = polyShape.normals[i + 1];
            const rNx = nx * cosP - ny * sinP;
            const rNy = nx * sinP + ny * cosP;
            this._projectCircle(PROJ_A, rNx, rNy, cxCircle, cyCircle, circleShape);
            this._projectPolygon(PROJ_B, rNx, rNy, polyShape, pxPoly, pyPoly, anglePoly);
            if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
            const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormalX = rNx;
                minNormalY = rNy;
            }
        }
        posScratch.x = pxPoly;
        posScratch.y = pyPoly;
        const featureB = findClosestWorldVertexInto(closestVertex, polyShape.vertices, posScratch, cosP, sinP, cxCircle, cyCircle);
        const dx = closestVertex.x - cxCircle;
        const dy = closestVertex.y - cyCircle;
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            const nX = dx / len;
            const nY = dy / len;
            this._projectCircle(PROJ_A, nX, nY, cxCircle, cyCircle, circleShape);
            this._projectPolygon(PROJ_B, nX, nY, polyShape, pxPoly, pyPoly, anglePoly);
            if (PROJ_A[0] >= PROJ_B[1] || PROJ_B[0] >= PROJ_A[1]) return false;
            const overlap = Math.min(PROJ_A[1] - PROJ_B[0], PROJ_B[1] - PROJ_A[0]);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormalX = nX;
                minNormalY = nY;
            }
        }
        const cx = pxPoly - cxCircle;
        const cy = pyPoly - cyCircle;
        if (cx * minNormalX + cy * minNormalY < 0) {
            minNormalX = -minNormalX;
            minNormalY = -minNormalY;
        }
        const contactX = cxCircle + minNormalX * (circleShape.radius - minOverlap / 2);
        const contactY = cyCircle + minNormalY * (circleShape.radius - minOverlap / 2);
        SAT_RESULT[0] = minOverlap;
        SAT_RESULT[1] = minNormalX;
        SAT_RESULT[2] = minNormalY;
        SAT_RESULT[3] = contactX;
        SAT_RESULT[4] = contactY;
        SAT_RESULT[5] = 0;
        SAT_RESULT[6] = 0;
        SAT_RESULT[7] = featureB;
        SAT_RESULT[8] = 1;
        SAT_RESULT[9] = contactX;
        SAT_RESULT[10] = contactY;
        SAT_RESULT[11] = 0;
        SAT_RESULT[12] = featureB;
        return true;
    }
    static _projectPolygon(out, axisX, axisY, shape, px, py, angle = 0) {
        let min = Infinity;
        let max = -Infinity;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const count = shape.vertices.length;
        for (let i = 0; i < count; i += 2) {
            const vx_local = shape.vertices[i];
            const vy_local = shape.vertices[i + 1];
            const rx = vx_local * cos - vy_local * sin;
            const ry = vx_local * sin + vy_local * cos;
            const vx = px + rx;
            const vy = py + ry;
            const projection = vx * axisX + vy * axisY;
            if (projection < min) min = projection;
            if (projection > max) max = projection;
        }
        out[0] = min;
        out[1] = max;
    }
    static _projectCircle(out, axisX, axisY, cx, cy, shape) {
        const projection = cx * axisX + cy * axisY;
        out[0] = projection - shape.radius;
        out[1] = projection + shape.radius;
    }
}
