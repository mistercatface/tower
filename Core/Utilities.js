import { distanceToSegment } from "../Spatial/Navigation/WallGeometry.js";

export class Utilities {
    static distToSegment(px, py, vx, vy, wx, wy) {
        const l2 = (wx - vx) ** 2 + (wy - vy) ** 2;
        if (l2 === 0) return Math.hypot(px - vx, py - vy);
        let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (vx + t * (wx - vx)), py - (vy + t * (wy - vy)));
    }

    static getSegmentsAlongLine(x1, y1, x2, y2, obstacleGrid) {
        return obstacleGrid.getSegmentsAlongLine(x1, y1, x2, y2);
    }

    static hasLineOfSight(x1, y1, x2, y2, segments, sourceRadius = 0, targetRadius) {
        if (targetRadius === undefined) {
            targetRadius = sourceRadius;
        }

        let candidateWalls = segments;
        if (segments?.obstacleGrid) {
            candidateWalls = this.getSegmentsAlongLine(x1, y1, x2, y2, segments.obstacleGrid);
        }

        const dx = x2 - x1;
        const dy = y2 - y1;
        const lineLen = Math.hypot(dx, dy);
        if (lineLen === 0) return true;

        const corridorRadius = Math.max(sourceRadius, targetRadius);
        const steps = Math.max(2, Math.ceil(lineLen / 8));

        for (let step = 1; step < steps; step++) {
            const t = step / steps;
            const px = x1 + dx * t;
            const py = y1 + dy * t;

            for (const seg of candidateWalls) {
                if (seg.isDead) continue;
                if (distanceToSegment(seg, px, py) < corridorRadius) {
                    return false;
                }
            }
        }

        return true;
    }

    static normalizeAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    static turnAngleTowards(currentAngle, targetAngle, turnSpeed, dt) {
        let diff = targetAngle - currentAngle;
        diff = this.normalizeAngle(diff);
        const t = Math.min(1, turnSpeed * (dt / 1000));
        return this.normalizeAngle(currentAngle + diff * t);
    }

    static normalizeVector(dx, dy) {
        const len = Math.hypot(dx, dy);
        if (len <= 0) {
            return { x: 0, y: 0, len: 0 };
        }
        return { x: dx / len, y: dy / len, len };
    }

    static setDesiredDirection(entity, dx, dy) {
        const vec = this.normalizeVector(dx, dy);
        entity.desiredX = vec.x;
        entity.desiredY = vec.y;
        return vec;
    }
}
