/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk draw helpers live in ChunkDrawPass.js.
 */
export { projectHorizontalSurfaceCornersInto, clipChunkToBlockedCells, clipChunkToStaticEdgeRails, clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
export function chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (obstacleGrid.grid[idx] !== 0) found = true;
    });
    return found;
}
export function buildStaticRoofMaskCanvas(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, texelResolution) {
    const bakeSize = bakePixelsForWorldSpan(chunkSizePx, { texelResolution });
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, { texelResolution });
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) !== zLevel) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const x = Math.round((bounds.minX - chunkOriginX) * texelResolution);
        const y = Math.round((bounds.minY - chunkOriginY) * texelResolution);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    });
    return any ? canvas : null;
}
export function applyStaticRoofMaskToCanvas(roofCanvas, maskCanvas) {
    const w = roofCanvas.width;
    const h = roofCanvas.height;
    const out = createOffscreenCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.drawImage(roofCanvas, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    return out;
}
