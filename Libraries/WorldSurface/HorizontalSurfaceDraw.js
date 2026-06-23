/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk clip helpers live in ChunkDrawPass.js.
 */
export { projectHorizontalSurfaceCornersInto, clipChunkToBlockedCells, clipChunkToStaticEdgeRails, clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { bakePixelsForWorldSpan, getSurfaceBakeScale } from "./WorldSurfaceResolution.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
export function chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (obstacleGrid.grid[idx] !== 0) found = true;
    });
    return found;
}
export function buildStaticRoofMaskCanvas(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, settings) {
    const surfaceBakeScale = getSurfaceBakeScale(settings);
    const bakeSize = bakePixelsForWorldSpan(chunkSizePx, surfaceBakeScale);
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, surfaceBakeScale);
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) !== zLevel) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const x = Math.round((bounds.minX - chunkOriginX) * surfaceBakeScale);
        const y = Math.round((bounds.minY - chunkOriginY) * surfaceBakeScale);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    });
    return any ? canvas : null;
}
