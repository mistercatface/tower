/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk clip helpers live in ChunkDrawPass.js.
 */
import {  forEachObstacleGridCellInAabb  } from "../Spatial/spatial.js";
import { aabbWidth } from "../Math/math.js";
import {  resolveCellWallHeightAtIdx  } from "../Spatial/spatial.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { createOffscreenCanvas } from "../Canvas/canvas.js";
export function chunkHasBlockedCells(obstacleGrid, bounds) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (idx) => {
        if (obstacleGrid.grid[idx] !== 0) found = true;
    });
    return found;
}
export function buildStaticRoofMaskCanvas(obstacleGrid, bounds, zLevel, settings) {
    const surfaceBakeScale = settings.surfaceBakeScale;
    const bakeSize = bakePixelsForWorldSpan(aabbWidth(bounds), surfaceBakeScale);
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, surfaceBakeScale);
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) !== zLevel) return;
        const cellBounds = obstacleGrid.getCellBoundsByIdx(idx);
        const x = Math.round((cellBounds.minX - bounds.minX) * surfaceBakeScale);
        const y = Math.round((cellBounds.minY - bounds.minY) * surfaceBakeScale);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    });
    return any ? canvas : null;
}
