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
    bakeWidth,
    zOffset,
    wallFace,
}) {
    if (surfaceKind === "wallFace") {
        const z = (height - 1 - y) / pixelsPerUnit;
        const dist = x / pixelsPerUnit;
        const maxZ = height > 1 ? (height - 1) / pixelsPerUnit : 0;
        const edgeLen = wallFace.edgeLen > 0 ? wallFace.edgeLen : dist || 1;
        const { p1, dirX, dirY, foldX, foldY } = wallFace;
        return {
            evalX: p1.x + dist * dirX + foldX * z,
            evalY: p1.y + dist * dirY + foldY * z,
            wallU: dist / edgeLen,
            wallV: maxZ > 0 ? z / maxZ : 0,
        };
    }

    const ppwu = pixelsPerUnit;

    if (surfaceKind === "wallCell") {
        const wallV = height > 1 ? (height - 1 - y) / (height - 1) : 0;
        const spanU = bakeWidth > 1 ? bakeWidth - 1 : 1;
        return {
            evalX: startWorldX + x / ppwu,
            evalY: startWorldY + (cellSize - y / ppwu) + zOffset,
            wallU: x / spanU,
            wallV,
        };
    }

    return {
        evalX: startWorldX + x / ppwu,
        evalY: startWorldY + y / ppwu,
        wallU: null,
        wallV: null,
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
