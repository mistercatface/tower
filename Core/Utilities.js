import { normalizeVector } from "../Math/Vec2.js";
import { distanceToSegment } from "../Spatial/Geometry/WallGeometry.js";
import { getWallsAlongLine } from "../Spatial/World/WallContext.js";

export class Utilities {
    static hasLineOfSight(x1, y1, x2, y2, wallCtx, sourceRadius = 0, targetRadius) {
        if (targetRadius === undefined) {
            targetRadius = sourceRadius;
        }
        if (!wallCtx) return true;

        const candidateWalls = wallCtx.obstacleGrid
            ? getWallsAlongLine(x1, y1, x2, y2, wallCtx)
            : wallCtx.walls;

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

    static setDesiredDirection(entity, dx, dy) {
        const vec = normalizeVector(dx, dy);
        entity.desiredX = vec.x;
        entity.desiredY = vec.y;
        return vec;
    }
}
