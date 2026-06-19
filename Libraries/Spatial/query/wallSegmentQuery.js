export function resolveWallSegmentQueryRadius(obstacleGrid, ...clearanceRadii) {
    const clearance = Math.max(...clearanceRadii, 0);
    return Math.max(clearance, obstacleGrid.cellSize + clearance);
}
export function collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, queryRadius) {
    obstacleGrid.resetStaticWallProxyPool();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / 8));
    const seen = new Set();
    const result = [];
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const batch = [];
        obstacleGrid.appendStaticWallProxiesNearWorld(x1 + dx * t, y1 + dy * t, queryRadius, batch);
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
