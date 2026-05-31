import { normalizeAngle as wrapAngle, turnAngleTowards as turnTowards } from "../Math/Angle.js";
import { normalizeVector as normalizeVec2 } from "../Math/Vec2.js";
import { distanceToLineSegment } from "../Math/Segment2D.js";
import { distanceToSegment } from "../Spatial/Geometry/WallGeometry.js";

export class Utilities {
    static distToSegment(px, py, vx, vy, wx, wy) {
        return distanceToLineSegment(px, py, vx, vy, wx, wy);
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
        return wrapAngle(angle);
    }

    static turnAngleTowards(currentAngle, targetAngle, turnSpeed, dt) {
        return turnTowards(currentAngle, targetAngle, turnSpeed, dt);
    }

    static normalizeVector(dx, dy) {
        return normalizeVec2(dx, dy);
    }

    static setDesiredDirection(entity, dx, dy) {
        const vec = this.normalizeVector(dx, dy);
        entity.desiredX = vec.x;
        entity.desiredY = vec.y;
        return vec;
    }
}
