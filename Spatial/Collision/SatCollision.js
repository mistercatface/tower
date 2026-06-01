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
            for (let i = 0; i < polyA.normals.length; i++) {
                const n = polyA.normals[i];
                const projA = this._projectPolygon(n, polyA, pA);
                const projB = this._projectPolygon(n, polyB, pB);
                
                if (projA.min >= projB.max || projB.min >= projA.max) {
                    return false; // Separating axis found
                }
                
                const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    minNormal = n;
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

        // Check polygon axes
        for (let i = 0; i < polyShape.normals.length; i++) {
            const n = polyShape.normals[i];
            const projCircle = this._projectCircle(n, posCircle, circleShape);
            const projPoly = this._projectPolygon(n, polyShape, posPoly);

            if (projCircle.min >= projPoly.max || projPoly.min >= projCircle.max) {
                return null;
            }

            const overlap = Math.min(projCircle.max - projPoly.min, projPoly.max - projCircle.min);
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minNormal = n;
            }
        }

        // Find closest vertex to circle center for the circle's axis
        let closestDistSq = Infinity;
        let closestVertex = null;
        for (let i = 0; i < polyShape.vertices.length; i++) {
            const v = polyShape.vertices[i];
            const vx = posPoly.x + v.x;
            const vy = posPoly.y + v.y;
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
            const projPoly = this._projectPolygon(n, polyShape, posPoly);

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

    static _projectPolygon(axis, shape, pos) {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < shape.vertices.length; i++) {
            const v = shape.vertices[i];
            const vx = pos.x + v.x;
            const vy = pos.y + v.y;
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
