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
function staticCellEdgeEndpoints(grid, col, row, edge, p1, p2, inset = 0) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (edge === 0) {
        p1.x = minX;
        p1.y = minY + inset;
        p2.x = maxX;
        p2.y = minY + inset;
    } else if (edge === 1) {
        p1.x = maxX - inset;
        p1.y = minY;
        p2.x = maxX - inset;
        p2.y = maxY;
    } else if (edge === 2) {
        p1.x = maxX;
        p1.y = maxY - inset;
        p2.x = minX;
        p2.y = maxY - inset;
    } else {
        p1.x = minX + inset;
        p1.y = maxY;
        p2.x = minX + inset;
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
        const fillHeight = resolveCellWallHeightAtIdx(obstacleGrid, idx);
        // Quick skip if cell is completely empty (no fill, no edges)
        if (
            fillHeight === 0 &&
            obstacleGrid.edgeGrid[idx * 4] === 0 &&
            obstacleGrid.edgeGrid[idx * 4 + 1] === 0 &&
            obstacleGrid.edgeGrid[idx * 4 + 2] === 0 &&
            obstacleGrid.edgeGrid[idx * 4 + 3] === 0
        )
            return;
        const cellBounds = obstacleGrid.getCellBounds(col, row);
        const cx = (cellBounds.minX + cellBounds.maxX) / 2;
        const cy = (cellBounds.minY + cellBounds.maxY) / 2;
        for (let edge = 0; edge < 4; edge++) {
            const edgeLevel = obstacleGrid.edgeGrid[idx * 4 + edge];
            const edgeHeight = edgeLevel * obstacleGrid.cellSize;
            const isEdgeRail = edgeHeight > 0;
            const faceHeight = isEdgeRail ? edgeHeight : fillHeight;
            if (faceHeight === 0) continue;
            const { nc, nr } = staticCellNeighbor(col, row, edge);
            let neighborFillHeight = 0;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < obstacleGrid.rows) neighborFillHeight = resolveCellWallHeightAtIdx(obstacleGrid, nc + nr * cols);
            const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
            if (!staticCellEdgeShouldShowFace(neighborCap, faceHeight)) continue;
            const thickness = isEdgeRail ? obstacleGrid.edgeThicknessGrid[idx * 4 + edge] : 0;
            const inset = thickness / 2;
            staticCellEdgeEndpoints(obstacleGrid, col, row, edge, sP1, sP2, inset);
            const ecx = (sP1.x + sP2.x) / 2;
            const ecy = (sP1.y + sP2.y) / 2;
            const wallBaseZ = staticCellEdgeWallBaseZ(neighborCap, faceHeight);
            out.push({
                staticGrid: true,
                gridCol: col,
                gridRow: row,
                gridIdx: idx,
                p1: { x: sP1.x, y: sP1.y },
                p2: { x: sP2.x, y: sP2.y },
                wallBaseZ,
                wallHeight: faceHeight - wallBaseZ,
                wallCapHeight: faceHeight,
                cx: ecx,
                cy: ecy,
                outX: ecx - cx,
                outY: ecy - cy,
                isEdgeRail,
                edgeThickness: thickness,
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
