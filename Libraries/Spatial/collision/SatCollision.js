import { CircleShape, PolygonShape } from "./Shapes.js";
import { findClosestWorldVertexInto, findExtremeVertexInto, rotateXY } from "../../Math/Poly2D.js";
import { dotXY } from "../../Math/Vec2.js";
import { COINCIDENT_CIRCLE_EPS } from "./penetration.js";
const contactA = { x: 0, y: 0 };
const contactB = { x: 0, y: 0 };
const closestVertex = { x: 0, y: 0 };
function entityFacing(entity) {
    if (entity._collisionFacing != null) return entity._collisionFacing;
    return entity.facing ?? entity.angle ?? 0;
}
export function getEntityCollisionParts(entity) {
    if (entity.collisionParts?.length) return entity.collisionParts;
    const shape = entity.getShape?.() ?? entity.shape;
    return shape ? [shape] : [];
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
    /**
     * @returns {Object|null} Collision info { overlap, nx, ny } pointing from A to B, or null if no collision.
     */
    static checkCollision(posA, shapeA, posB, shapeB) {
        if (!shapeA || !shapeB) return null;
        if (shapeA.type === "Circle" && shapeB.type === "Circle") return this._circleCircle(posA, shapeA, posB, shapeB);
        else if (shapeA.type === "Polygon" && shapeB.type === "Polygon") return this._polygonPolygon(posA, shapeA, posB, shapeB);
        else if (shapeA.type === "Circle" && shapeB.type === "Polygon") return this._circlePolygon(posA, shapeA, posB, shapeB);
        else if (shapeA.type === "Polygon" && shapeB.type === "Circle") {
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
    static _circleCircle(posA, shapeA, posB, shapeB) {
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distSq = dx * dx + dy * dy;
        const radii = shapeA.radius + shapeB.radius;
        if (distSq >= radii * radii) return null;
        if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) return { overlap: radii, nx: 0, ny: 0, cx: posA.x, cy: posA.y, coincident: true };
        const dist = Math.sqrt(distSq);
        const overlap = radii - dist;
        return { overlap: overlap, nx: dx / dist, ny: dy / dist, cx: posA.x + (dx / dist) * (shapeA.radius - overlap / 2), cy: posA.y + (dy / dist) * (shapeA.radius - overlap / 2) };
    }
    static _polygonPolygon(posA, shapeA, posB, shapeB) {
        let minOverlap = Infinity;
        let minNormal = null;
        const checkAxes = (polyA, pA, polyB, pB) => {
            const angleA = entityFacing(pA);
            const cosA = Math.cos(angleA);
            const sinA = Math.sin(angleA);
            for (let i = 0; i < polyA.normals.length; i++) {
                const n = polyA.normals[i];
                const rotatedNormal = rotateXY(n.x, n.y, cosA, sinA);
                const projA = this._projectPolygon(rotatedNormal, polyA, pA, angleA);
                const projB = this._projectPolygon(rotatedNormal, polyB, pB, entityFacing(pB));
                if (projA.min >= projB.max || projB.min >= projA.max) return false;
                const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    minNormal = rotatedNormal;
                }
            }
            return true;
        };
        if (!checkAxes(shapeA, posA, shapeB, posB)) return null;
        if (!checkAxes(shapeB, posB, shapeA, posA)) return null;
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        if (dx * minNormal.x + dy * minNormal.y < 0) minNormal = { x: -minNormal.x, y: -minNormal.y };
        const facingB = entityFacing(posB);
        const cosB = Math.cos(facingB);
        const sinB = Math.sin(facingB);
        findExtremeVertexInto(contactB, shapeB.vertices, posB, cosB, sinB, minNormal.x, minNormal.y, false);
        const facingA = entityFacing(posA);
        const cosA = Math.cos(facingA);
        const sinA = Math.sin(facingA);
        findExtremeVertexInto(contactA, shapeA.vertices, posA, cosA, sinA, minNormal.x, minNormal.y, true);
        return { overlap: minOverlap, nx: minNormal.x, ny: minNormal.y, cx: (contactA.x + contactB.x) / 2, cy: (contactA.y + contactB.y) / 2 };
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
        findClosestWorldVertexInto(closestVertex, polyShape.vertices, posPoly, cosP, sinP, posCircle.x, posCircle.y);
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
