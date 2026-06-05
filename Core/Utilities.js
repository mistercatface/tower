import { distanceToSegment } from "../Libraries/Spatial/geometry/WallGeometry.js";
import { getWallsAlongLine } from "../Spatial/World/WallContext.js";

export class Utilities {
    static hasLineOfSight(x1, y1, x2, y2, wallCtx, sourceRadius = 0, targetRadius) {
        if (targetRadius === undefined) {
            targetRadius = sourceRadius;
        }
        if (!wallCtx) return true;

        const corridorRadius = Math.max(sourceRadius, targetRadius);

        let candidateWalls;
        if (wallCtx.obstacleGrid) {
            candidateWalls = getWallsAlongLine(x1, y1, x2, y2, wallCtx);
        } else if (wallCtx.wallSpatialIndex) {
            const minX = Math.min(x1, x2) - corridorRadius;
            const minY = Math.min(y1, y2) - corridorRadius;
            const maxX = Math.max(x1, x2) + corridorRadius;
            const maxY = Math.max(y1, y2) + corridorRadius;
            candidateWalls = wallCtx.wallSpatialIndex.collectInBounds(minX, minY, maxX, maxY);
        } else {
            candidateWalls = wallCtx.walls;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;
        const lineLen = Math.hypot(dx, dy);
        if (lineLen === 0) return true;

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

}
