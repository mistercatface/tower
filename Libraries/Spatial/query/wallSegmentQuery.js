/** @typedef {import("./wallContext.js").WallContext} WallContext */
/**
 * @param {import("./SpatialQuery.js").SpatialQuery} _wallQuery
 * @param {WallContext | null} wallCtx
 * @param {object} entity
 * @returns {object[]}
 */
export function collectWallSegmentsForEntity(_wallQuery, wallCtx, entity) {
    if (!wallCtx?.obstacleGrid) return [];
    const segments = [];
    wallCtx.obstacleGrid.appendStaticWallProxiesNear(entity, segments);
    return segments;
}
/**
 * @param {WallContext | null} wallCtx
 * @returns {object[]}
 */
export function collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2, queryRadius) {
    if (!wallCtx?.obstacleGrid) return [];
    const grid = wallCtx.obstacleGrid;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / 8));
    const seen = new Set();
    const result = [];
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const batch = [];
        grid.appendStaticWallProxiesNearWorld(x1 + dx * t, y1 + dy * t, queryRadius, batch);
        for (let i = 0; i < batch.length; i++) {
            const seg = batch[i];
            if (!seen.has(seg)) {
                seen.add(seg);
                result.push(seg);
            }
        }
    }
    return result;
}
