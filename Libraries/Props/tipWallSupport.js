import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { collectWallSegmentsForEntity } from "../Spatial/query/wallSegmentQuery.js";
import { SpatialQuery } from "../Spatial/query/SpatialQuery.js";
import { distanceToSegment } from "../Spatial/geometry/WallGeometry.js";
const wallProbeQuery = new SpatialQuery();
/**
 * 0 = clear to fall, 1 = fully blocked in tipDir.
 *
 * @param {object} prop
 * @param {import("../Spatial/query/wallContext.js").WallContext | null} [wallCtx]
 */
export function measureTipFallWallBlock(prop, wallCtx = null) {
    if (prop.isFallen || !prop.strategy?.standTip) return 0;
    const tipDir = prop.facing ?? 0;
    const height = prop.strategy?.rollHeight ?? prop.strategy?.uprightHeight ?? resolveBodyRadius(prop) * 2.5;
    const radius = resolveBodyRadius(prop);
    const probeLen = height + radius * 0.35;
    const dx = Math.cos(tipDir);
    const dy = Math.sin(tipDir);
    const steps = 7;
    let firstBlock = steps + 1;
    for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * probeLen;
        const px = prop.x + dx * t;
        const py = prop.y + dy * t;
        if (wallCtx?.obstacleGrid?.isBlockedWorld?.(px, py)) {
            firstBlock = Math.min(firstBlock, i);
            break;
        }
        let segments = [];
        if (wallCtx?.obstacleGrid?.getNearbySegments) segments = collectWallSegmentsForEntity(wallProbeQuery, wallCtx, { x: px, y: py, radius: radius * 0.85 });
        else if (wallCtx?.walls?.length) segments = wallCtx.walls;
        for (let s = 0; s < segments.length; s++) {
            const wall = segments[s];
            if (wall.isDead) continue;
            if (distanceToSegment(wall, px, py) < radius * 0.55) {
                firstBlock = Math.min(firstBlock, i);
                break;
            }
        }
        if (firstBlock <= i) break;
    }
    if (firstBlock > steps) return 0;
    return 1 - (firstBlock - 1) / steps;
}
/**
 * @param {object} state
 * @param {object} prop
 */
export function measureTipFallWallBlockFromState(state, prop) {
    return measureTipFallWallBlock(prop, wallContextFromState(state));
}
