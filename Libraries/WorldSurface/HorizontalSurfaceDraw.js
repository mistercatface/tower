/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk draw helpers live in ChunkDrawPass.js.
 */
export {
    createChunkDrawPass,
    projectHorizontalSurfaceCornersInto,
    clipChunkToRoofFootprints,
    clipChunkToBlockedCells,
    clipChunkToWallFootprints,
    drawRoofSegmentDamageOverlays,
    drawStaticRoofDamageOverlays,
    drawStaticWallFootprintDamageOverlays,
    drawWallFootprintDamageOverlays,
} from "./ChunkDrawPass.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabb } from "../Spatial/grid/GridCoords.js";
import { resolveStaticWallHeightAtCell } from "../World/staticOccupancyLayers.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
/**
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasWallSegments(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) if (!segments[i].isDead) return true;
    return false;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!obstacleGrid?.cols) return false;
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabb(chunkOriginX, chunkOriginY, chunkSizePx), (col, row) => {
        if (obstacleGrid.isBlocked(col, row)) found = true;
    });
    return found;
}
/**
 * World-aligned alpha mask for static stamp roofs in one chunk (baked once per invalidation).
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {import("../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} staticOccupancyLayers
 * @param {number} texelResolution
 * @returns {OffscreenCanvas | null}
 */
export function buildStaticRoofMaskCanvas(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, staticOccupancyLayers, texelResolution) {
    if (!obstacleGrid?.cols || !staticOccupancyLayers?.length) return null;
    const bakeSize = bakePixelsForWorldSpan(chunkSizePx, { texelResolution });
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, { texelResolution });
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabb(chunkOriginX, chunkOriginY, chunkSizePx), (col, row) => {
        if (resolveStaticWallHeightAtCell(obstacleGrid, col, row, staticOccupancyLayers) !== zLevel) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const x = Math.round((bounds.minX - chunkOriginX) * texelResolution);
        const y = Math.round((bounds.minY - chunkOriginY) * texelResolution);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    });
    return any ? canvas : null;
}
/** @param {CanvasImageSource} roofCanvas @param {CanvasImageSource} maskCanvas */
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
