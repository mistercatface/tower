/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk draw helpers live in ChunkDrawPass.js.
 */
export {
    projectHorizontalSurfaceCornersInto,
    clipChunkToBlockedCells,
    clipChunkToWallFootprints,
    drawStaticRoofDamageOverlays,
    drawStaticWallFootprintDamageOverlays,
    drawWallFootprintDamageOverlays,
} from "./ChunkDrawPass.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { resolveCellWallHeightAtIdx } from "../World/wallGridCells.js";
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
    const segments = wallSpatialIndex.collectInBounds(chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx));
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
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (obstacleGrid.grid[idx] !== 0) {
            found = true;
            return;
        }
        if (obstacleGrid.edgeGrid)
            if (obstacleGrid.edgeGrid[idx * 4] !== 0 || obstacleGrid.edgeGrid[idx * 4 + 1] !== 0 || obstacleGrid.edgeGrid[idx * 4 + 2] !== 0 || obstacleGrid.edgeGrid[idx * 4 + 3] !== 0) found = true;
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
 * @param {number} texelResolution
 * @returns {OffscreenCanvas | null}
 */
export function buildStaticRoofMaskCanvas(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, texelResolution) {
    const bakeSize = bakePixelsForWorldSpan(chunkSizePx, { texelResolution });
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, { texelResolution });
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        const fillHeight = resolveCellWallHeightAtIdx(obstacleGrid, idx);
        const bounds = obstacleGrid.getCellBounds(col, row);
        if (fillHeight === zLevel) {
            const x = Math.round((bounds.minX - chunkOriginX) * texelResolution);
            const y = Math.round((bounds.minY - chunkOriginY) * texelResolution);
            ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
            any = true;
        }
        if (obstacleGrid.edgeGrid)
            for (let side = 0; side < 4; side++) {
                if (side === 1 || side === 2) continue;
                if (obstacleGrid.edgeGrid[idx * 4 + side] * obstacleGrid.cellSize !== zLevel) continue;
                const thickness = obstacleGrid.edgeThicknessGrid[idx * 4 + side];
                const drawThickness = Math.max(1, thickness || 2);
                const halfT = drawThickness / 2;
                let rx, ry, rw, rh;
                if (side === 0) {
                    rx = bounds.minX;
                    ry = bounds.minY - halfT;
                    rw = obstacleGrid.cellSize;
                    rh = drawThickness;
                } else {
                    rx = bounds.minX - halfT;
                    ry = bounds.minY;
                    rw = drawThickness;
                    rh = obstacleGrid.cellSize;
                }
                const px = Math.round((rx - chunkOriginX) * texelResolution);
                const py = Math.round((ry - chunkOriginY) * texelResolution);
                const pw = Math.max(1, Math.round(rw * texelResolution));
                const ph = Math.max(1, Math.round(rh * texelResolution));
                ctx.fillRect(px, py, pw, ph);
                any = true;
            }
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
