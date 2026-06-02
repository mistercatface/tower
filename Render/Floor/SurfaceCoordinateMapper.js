export function createWallFaceAxes(p1, p2) {
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const dirX = (p2.x - p1.x) / edgeLen;
    const dirY = (p2.y - p1.y) / edgeLen;
    return { dirX, dirY, foldX: -dirY, foldY: dirX };
}

/**
 * @param {"floor" | "wallCell" | "wallFace"} surfaceKind
 */
export function mapPixelToEval({
    x,
    y,
    startWorldX,
    startWorldY,
    cellSize,
    surfaceKind,
    height,
    pixelsPerUnit,
    zOffset,
    wallFace,
}) {
    if (surfaceKind === "wallFace") {
        const z = (height - 1 - y) / pixelsPerUnit;
        const dist = x / pixelsPerUnit;
        const { p1, dirX, dirY, foldX, foldY } = wallFace;
        return {
            evalX: p1.x + dist * dirX + foldX * z,
            evalY: p1.y + dist * dirY + foldY * z,
        };
    }

    if (surfaceKind === "wallCell") {
        return {
            evalX: startWorldX + x,
            evalY: startWorldY + (cellSize - y) + zOffset,
        };
    }

    return {
        evalX: startWorldX + x,
        evalY: startWorldY + y,
    };
}

export function queryObstacleBlocked(evalX, evalY, obstacleGrid) {
    const { minX, minY, cols, rows, cellSize, grid } = obstacleGrid;
    const col = Math.floor((evalX - minX) / cellSize);
    const row = Math.floor((evalY - minY) / cellSize);
    const inGrid = col >= 0 && row >= 0 && col < cols && row < rows;
    if (!inGrid) {
        return false;
    }
    return grid[row * cols + col] === 1;
}
