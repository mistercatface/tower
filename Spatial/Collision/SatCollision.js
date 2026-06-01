import { CircleShape, PolygonShape } from '../Geometry/Shapes.js';

export class SatCollision {
    /**
     * Checks for collision between two shapes.
     * @returns {Object|null} Collision info { overlap, nx, ny } pointing from A to B, or null if no collision.
     */
    static checkCollision(posA, shapeA, posB, shapeB) {
        if (!shapeA || !shapeB) return null;

        if (shapeA.type === 'Circle' && shapeB.type === 'Circle') {
            return this._circleCircle(posA, shapeA, posB, shapeB);
        } else if (shapeA.type === 'Polygon' && shapeB.type === 'Polygon') {
            return this._polygonPolygon(posA, shapeA, posB, shapeB);
        } else if (shapeA.type === 'Circle' && shapeB.type === 'Polygon') {
            const res = this._circlePolygon(posA, shapeA, posB, shapeB);
            if (res) {
                // Invert normal to point from A to B (the function calculates Circle to Poly already)
                // wait, if we passed A as Circle and B as Poly, it returns normal pointing from Circle to Poly
                // which is A to B. So no inversion needed.
                return res;
            }
            return null;
        } else if (shapeA.type === 'Polygon' && shapeB.type === 'Circle') {
            const res = this._circlePolygon(posB, shapeB, posA, shapeA);
            if (res) {
                // Return value is normal pointing from Circle to Poly (B to A).
                // We need normal pointing from A to B, so invert it.
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
        if (distSq >= radii * radii || distSq === 0) {
            return null;
        }
        const dist = Math.sqrt(distSq);
        return {
            overlap: radii - dist,
            nx: dx / dist,
            ny: dy / dist
        };
    }

    static _polygonPolygon(posA, shapeA, posB, shapeB) {
        let minOverlap = Infinity;
        let minNormal = null;

        const checkAxes = (polyA, pA, polyB, pB) => {
            const angleA = pA.facing ?? pA.angle ?? 0;
            const cosA = Math.cos(angleA);
            const sinA = Math.sin(angleA);
            for (let i = 0; i < polyA.normals.length; i++) {
                const n = polyA.normals[i];
                const rx = n.x * cosA - n.y * sinA;
                const ry = n.x * sinA + n.y * cosA;
                const rotatedNormal = { x: rx, y: ry };

                const projA = this._projectPolygon(rotatedNormal, polyA, pA, angleA);
                const projB = this._projectPolygon(rotatedNormal, polyB, pB, pB.facing ?? pB.angle ?? 0);
                
                if (projA.min >= projB.max || projB.min >= projA.max) {
                    return false; // Separating axis found
                }
                
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

        // Ensure normal points from A to B
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        if (dx * minNormal.x + dy * minNormal.y < 0) {
            minNormal = { x: -minNormal.x, y: -minNormal.y };
        }

        return {
            overlap: minOverlap,
            nx: minNormal.x,
            ny: minNormal.y
        };
    }

    static _circlePolygon(posCircle, circleShape, posPoly, polyShape) {
        let minOverlap = Infinity;
        let minNormal = null;
        const polyAngle = posPoly.facing ?? posPoly.angle ?? 0;
        const cosP = Math.cos(polyAngle);
        const sinP = Math.sin(polyAngle);

        // Check polygon axes
        for (let i = 0; i < polyShape.normals.length; i++) {
            const n = polyShape.normals[i];
            const rx = n.x * cosP - n.y * sinP;
            const ry = n.x * sinP + n.y * cosP;
            const rotatedNormal = { x: rx, y: ry };

            const projCircle = this._projectCircle(rotatedNormal, posCircle, circleShape);
            const projPoly = this._projectPolygon(rotatedNormal, polyShape, posPoly, polyAngle);

            if (projCircle.min >= projPoly.max || projPoly.min >= projCircle.max) {
                return null;
            }

            const overlap = Math.min(projCircle.max - projPoly.min, projPoly.max - projCircle.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormal = rotatedNormal;
            }
        }

        // Find closest vertex to circle center for the circle's axis
        let closestDistSq = Infinity;
        let closestVertex = null;
        for (let i = 0; i < polyShape.vertices.length; i++) {
            const v = polyShape.vertices[i];
            const rx = v.x * cosP - v.y * sinP;
            const ry = v.x * sinP + v.y * cosP;
            const vx = posPoly.x + rx;
            const vy = posPoly.y + ry;
            const dx = posCircle.x - vx;
            const dy = posCircle.y - vy;
            const distSq = dx * dx + dy * dy;
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestVertex = { x: vx, y: vy };
            }
        }

        const dx = closestVertex.x - posCircle.x;
        const dy = closestVertex.y - posCircle.y;
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            const n = { x: dx / len, y: dy / len };
            const projCircle = this._projectCircle(n, posCircle, circleShape);
            const projPoly = this._projectPolygon(n, polyShape, posPoly, polyAngle);

            if (projCircle.min >= projPoly.max || projPoly.min >= projCircle.max) {
                return null;
            }

            const overlap = Math.min(projCircle.max - projPoly.min, projPoly.max - projCircle.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormal = n;
            }
        }

        // Ensure normal points from Circle to Poly
        const cx = posPoly.x - posCircle.x;
        const cy = posPoly.y - posCircle.y;
        if (cx * minNormal.x + cy * minNormal.y < 0) {
            minNormal = { x: -minNormal.x, y: -minNormal.y };
        }

        return {
            overlap: minOverlap,
            nx: minNormal.x,
            ny: minNormal.y
        };
    }

    static _projectPolygon(axis, shape, pos, angle = 0) {
        let min = Infinity;
        let max = -Infinity;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < shape.vertices.length; i++) {
            const v = shape.vertices[i];
            const rx = v.x * cos - v.y * sin;
            const ry = v.x * sin + v.y * cos;
            const vx = pos.x + rx;
            const vy = pos.y + ry;
            const projection = vx * axis.x + vy * axis.y;
            if (projection < min) min = projection;
            if (projection > max) max = projection;
        }
        return { min, max };
    }

    static _projectCircle(axis, pos, shape) {
        const projection = pos.x * axis.x + pos.y * axis.y;
        return {
            min: projection - shape.radius,
            max: projection + shape.radius
        };
    }
}
