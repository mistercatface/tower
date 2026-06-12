/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { forEachObstacleGridCellInAabb } from "../../Spatial/grid/GridCoords.js";
import { cellIsStaticWallAtIdx, resolveCellWallHeightAtIdx } from "../../World/wallGridCells.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/** @type {{ grid: object | null, wallGridRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, faces: object[] }} */
const sGeomCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: [] };
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function geomCacheHit(cache, grid, wallGridRevision, bounds) {
    return (
        cache.grid === grid &&
        cache.wallGridRevision === wallGridRevision &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function storeGeomCache(cache, grid, wallGridRevision, bounds) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx @returns {number | null} null = open air */
function capHeightPxAtIdx(grid, idx) {
    const px = resolveCellWallHeightAtIdx(grid, idx);
    return px > 0 ? px : null;
}
/** @param {number} col @param {number} row @param {number} edge */
function staticCellNeighbor(col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
/** @param {number | null} neighborCap @param {number} faceHeight */
function staticCellEdgeShouldShowFace(neighborCap, faceHeight) {
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
/** @param {number | null} neighborCap @param {number} faceHeight @returns {number} */
function staticCellEdgeWallBaseZ(neighborCap, faceHeight) {
    if (neighborCap == null || faceHeight <= neighborCap) return 0;
    return neighborCap;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {typeof sP1} p1 @param {typeof sP2} p2 */
function staticCellEdgeEndpoints(grid, col, row, edge, p1, p2) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (edge === 0) {
        p1.x = minX;
        p1.y = minY;
        p2.x = maxX;
        p2.y = minY;
    } else if (edge === 1) {
        p1.x = maxX;
        p1.y = minY;
        p2.x = maxX;
        p2.y = maxY;
    } else if (edge === 2) {
        p1.x = maxX;
        p1.y = maxY;
        p2.x = minX;
        p2.y = maxY;
    } else {
        p1.x = minX;
        p1.y = maxY;
        p2.x = minX;
        p2.y = minY;
    }
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Math/Aabb2D.js").Aabb2D} bounds
 * @param {object[]} out
 */
function collectStaticGridWallFaceCandidates(obstacleGrid, bounds, out) {
    out.length = 0;
    const cols = obstacleGrid.cols;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row, idx) => {
        if (!cellIsStaticWallAtIdx(obstacleGrid, idx)) return;
        const faceHeight = resolveCellWallHeightAtIdx(obstacleGrid, idx);
        const cellBounds = obstacleGrid.getCellBounds(col, row);
        const cx = (cellBounds.minX + cellBounds.maxX) / 2;
        const cy = (cellBounds.minY + cellBounds.maxY) / 2;
        for (let edge = 0; edge < 4; edge++) {
            const { nc, nr } = staticCellNeighbor(col, row, edge);
            let neighborCap = null;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < obstacleGrid.rows) neighborCap = capHeightPxAtIdx(obstacleGrid, nc + nr * cols);
            if (!staticCellEdgeShouldShowFace(neighborCap, faceHeight)) continue;
            staticCellEdgeEndpoints(obstacleGrid, col, row, edge, sP1, sP2);
            const ecx = (sP1.x + sP2.x) / 2;
            const ecy = (sP1.y + sP2.y) / 2;
            const wallBaseZ = staticCellEdgeWallBaseZ(neighborCap, faceHeight);
            out.push({
                staticGrid: true,
                gridCol: col,
                gridRow: row,
                p1: { x: sP1.x, y: sP1.y },
                p2: { x: sP2.x, y: sP2.y },
                wallBaseZ,
                wallHeight: faceHeight - wallBaseZ,
                wallCapHeight: faceHeight,
                cx: ecx,
                cy: ecy,
                outX: ecx - cx,
                outY: ecy - cy,
            });
        }
    });
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridWallDrawables(obstacleGrid, viewport, viewerX, viewerY, out) {
    out.length = 0;
    const bounds = viewport.boundsQuery;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!geomCacheHit(sGeomCache, obstacleGrid, wallGridRevision, bounds)) {
        collectStaticGridWallFaceCandidates(obstacleGrid, bounds, sGeomCache.faces);
        storeGeomCache(sGeomCache, obstacleGrid, wallGridRevision, bounds);
    }
    const faces = sGeomCache.faces;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const viewX = face.cx - viewerX;
        const viewY = face.cy - viewerY;
        if (face.outX * viewX + face.outY * viewY >= 0) continue;
        face._distSq = viewX * viewX + viewY * viewY;
        out.push(face);
    }
    return out;
}
