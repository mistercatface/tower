import { getChunkSizePx, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
const WALL_CHUNK_TEXTURE_SAMPLE_CHUNK = -9999;
export class SurfaceSpatialMap {
    constructor(settings) {
        this.settings = settings;
    }
    chunkSizePx(obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        return getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
    }
    cellBoundsToChunkRange(bounds, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        const cellSize = obstacleGrid.cellSize;
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const minX = obstacleGrid.minX + bounds.startCol * cellSize;
        const minY = obstacleGrid.minY + bounds.startRow * cellSize;
        const maxX = obstacleGrid.minX + (bounds.endCol + 1) * cellSize;
        const maxY = obstacleGrid.minY + (bounds.endRow + 1) * cellSize;
        return worldBoundsToChunkRange(minX, minY, maxX, maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    viewportChunkRange(bounds, obstacleGrid, chunkSizePx) {
        return {
            minChunkCol: worldToChunkCol(bounds.minX, obstacleGrid.minX, chunkSizePx),
            maxChunkCol: worldToChunkCol(bounds.maxX - 1, obstacleGrid.minX, chunkSizePx),
            minChunkRow: worldToChunkRow(bounds.minY, obstacleGrid.minY, chunkSizePx),
            maxChunkRow: worldToChunkRow(bounds.maxY - 1, obstacleGrid.minY, chunkSizePx),
        };
    }
    chunkOrigin(obstacleGrid, chunkCol, chunkRow, chunkSizePx = this.chunkSizePx(obstacleGrid)) {
        return { originX: obstacleGrid.minX + chunkCol * chunkSizePx, originY: obstacleGrid.minY + chunkRow * chunkSizePx };
    }
    groundChunk(obstacleGrid, chunkCol, chunkRow, cellsPerChunk = this.settings.cellsPerChunk) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const origin = this.chunkOrigin(obstacleGrid, chunkCol, chunkRow, chunkSizePx);
        return {
            chunkCol,
            chunkRow,
            chunkSizePx,
            minX: obstacleGrid.minX,
            minY: obstacleGrid.minY,
            originX: origin.originX,
            originY: origin.originY,
            centerX: origin.originX + chunkSizePx / 2,
            centerY: origin.originY + chunkSizePx / 2,
        };
    }
    wallAtlas(p1, p2) {
        const chunkWorldSize = this.settings.chunkWorldSize;
        const wx1 = ((p1.x % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const wy1 = ((p1.y % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        return { wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, keyX1: wx1.toFixed(1), keyY1: wy1.toFixed(1), keyX2: wx2.toFixed(1), keyY2: wy2.toFixed(1) };
    }
    wallCenter(p1, p2) {
        return { centerX: (p1.x + p2.x) / 2, centerY: (p1.y + p2.y) / 2 };
    }
    horizontalSample(worldCorners, obstacleGrid) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid);
        let minX = worldCorners[0].x;
        let minY = worldCorners[0].y;
        for (let i = 1; i < worldCorners.length; i++) {
            if (worldCorners[i].x < minX) minX = worldCorners[i].x;
            if (worldCorners[i].y < minY) minY = worldCorners[i].y;
        }
        const chunkCol = worldToChunkCol(minX, obstacleGrid.minX, chunkSizePx);
        const chunkRow = worldToChunkRow(minY, obstacleGrid.minY, chunkSizePx);
        const origin = this.chunkOrigin(obstacleGrid, chunkCol, chunkRow, chunkSizePx);
        return { chunkCol, chunkRow, chunkSizePx, originX: origin.originX, originY: origin.originY };
    }
    wallChunkTextureSample(cellSize) {
        const chunkSizePx = cellSize * this.settings.cellsPerChunk;
        const chunkCol = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const chunkRow = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const minX = -chunkCol * chunkSizePx;
        const minY = -chunkRow * chunkSizePx;
        return { chunkCol, chunkRow, chunkSizePx, minX, minY, centerX: minX + chunkCol * chunkSizePx + chunkSizePx / 2, centerY: minY + chunkRow * chunkSizePx + chunkSizePx / 2 };
    }
}
export function createWallFaceAxes(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const edgeLen = Math.hypot(dx, dy);
    if (edgeLen <= 0) return { edgeLen: 0, dirX: 0, dirY: 0, foldX: 0, foldY: 0 };
    const dirX = dx / edgeLen;
    const dirY = dy / edgeLen;
    return { edgeLen, dirX, dirY, foldX: -dirY, foldY: dirX };
}
export function writeFloorPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + y * invBakeScale;
    samples.wallU[idx] = 0;
    samples.wallV[idx] = 0;
}
export function fillWallFaceRows(samples, width, height, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    const H = mapCtx.wallHeight;
    const W = mapCtx.wallWidth;
    const heightPx = mapCtx.height;
    const dirX = mapCtx.dirX;
    const dirY = mapCtx.dirY;
    const foldX = mapCtx.foldX;
    const foldY = mapCtx.foldY;
    const invEdgeLen = mapCtx.invEdgeLen;
    const p1x = mapCtx.p1x;
    const p1y = mapCtx.p1y;
    let idx = 0;
    for (let y = 0; y < height; y++) {
        const v = (heightPx - 1 - y) * invBakeScale;
        let evalXBase;
        let evalYBase;
        let wallV;
        if (v < W) {
            const foldOffset = H + v;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = 1;
        } else {
            const z = H + W - v;
            const foldOffset = z;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = z / H;
        }
        for (let x = 0; x < width; x++, idx++) {
            const dist = x * invBakeScale;
            samples.evalX[idx] = evalXBase + dist * dirX;
            samples.evalY[idx] = evalYBase + dist * dirY;
            samples.wallU[idx] = dist * invEdgeLen;
            samples.wallV[idx] = wallV;
        }
    }
}
export function writeWallFacePixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    const v = (mapCtx.height - 1 - y) * invBakeScale;
    const dist = x * invBakeScale;
    const H = mapCtx.wallHeight;
    const W = mapCtx.wallWidth;
    let foldOffset = 0;
    let wallV = 0;
    if (v < W) {
        foldOffset = H + v;
        wallV = 1.0;
    } else {
        const z = H + W - v;
        foldOffset = z;
        wallV = z / H;
    }
    samples.evalX[idx] = mapCtx.p1x + dist * mapCtx.dirX + mapCtx.foldX * foldOffset;
    samples.evalY[idx] = mapCtx.p1y + dist * mapCtx.dirY + mapCtx.foldY * foldOffset;
    samples.wallU[idx] = dist * mapCtx.invEdgeLen;
    samples.wallV[idx] = wallV;
}
export function writeWallCellPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + (mapCtx.cellSize - y * invBakeScale) + mapCtx.zOffset;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = (mapCtx.height - 1 - y) * mapCtx.invWallCellVSpan;
}
export function writeRoofPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + y * invBakeScale;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = 1;
}
