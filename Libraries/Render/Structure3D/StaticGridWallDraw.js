/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { forEachObstacleGridCellInAabb } from "../../Spatial/grid/GridCoords.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { cellIsStaticBlocked, resolveStaticWallHeightAtCell } from "../../World/staticOccupancyLayers.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/** @type {{ grid: object | null, layers: object[] | null, occupancyRevision: number, defaultWallHeight: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, faces: object[] }} */
const sGeomCache = { grid: null, layers: null, occupancyRevision: -1, defaultWallHeight: 0, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: [] };
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers @param {number} occupancyRevision @param {number} defaultWallHeight @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function geomCacheHit(cache, grid, layers, occupancyRevision, defaultWallHeight, bounds) {
    return (
        cache.grid === grid &&
        cache.layers === layers &&
        cache.occupancyRevision === occupancyRevision &&
        cache.defaultWallHeight === defaultWallHeight &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers @param {number} occupancyRevision @param {number} defaultWallHeight @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function storeGeomCache(cache, grid, layers, occupancyRevision, defaultWallHeight, bounds) {
    cache.grid = grid;
    cache.layers = layers ?? null;
    cache.occupancyRevision = occupancyRevision;
    cache.defaultWallHeight = defaultWallHeight;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers @param {number} defaultWallHeight @returns {number | null} null = open air */
function staticCellCapHeight(grid, col, row, layers, defaultWallHeight) {
    if (!grid.isBlocked(col, row)) return null;
    const stamped = resolveStaticWallHeightAtCell(grid, col, row, layers);
    if (stamped !== undefined) return stamped ?? defaultWallHeight;
    return defaultWallHeight;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge */
function staticCellNeighbor(grid, col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers @param {number} faceHeight @param {number} defaultWallHeight */
function staticCellEdgeShouldShowFace(grid, col, row, edge, layers, faceHeight, defaultWallHeight) {
    const { nc, nr } = staticCellNeighbor(grid, col, row, edge);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return true;
    const neighborCap = staticCellCapHeight(grid, nc, nr, layers, defaultWallHeight);
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers @param {number} faceHeight @param {number} defaultWallHeight @returns {number} */
function staticCellEdgeWallBaseZ(grid, col, row, edge, layers, faceHeight, defaultWallHeight) {
    const { nc, nr } = staticCellNeighbor(grid, col, row, edge);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return 0;
    const neighborCap = staticCellCapHeight(grid, nc, nr, layers, defaultWallHeight);
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
 * @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers
 * @param {number} defaultWallHeight
 * @param {object[]} out
 */
function collectStaticGridWallFaceCandidates(obstacleGrid, bounds, layers, defaultWallHeight, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row) => {
        if (!cellIsStaticBlocked(obstacleGrid, col, row)) return;
        const stampedHeight = resolveStaticWallHeightAtCell(obstacleGrid, col, row, layers);
        if (stampedHeight === undefined) return;
        const faceHeight = stampedHeight ?? defaultWallHeight;
        const cellBounds = obstacleGrid.getCellBounds(col, row);
        const cx = (cellBounds.minX + cellBounds.maxX) / 2;
        const cy = (cellBounds.minY + cellBounds.maxY) / 2;
        for (let edge = 0; edge < 4; edge++) {
            if (!staticCellEdgeShouldShowFace(obstacleGrid, col, row, edge, layers, faceHeight, defaultWallHeight)) continue;
            staticCellEdgeEndpoints(obstacleGrid, col, row, edge, sP1, sP2);
            const ecx = (sP1.x + sP2.x) / 2;
            const ecy = (sP1.y + sP2.y) / 2;
            const wallBaseZ = staticCellEdgeWallBaseZ(obstacleGrid, col, row, edge, layers, faceHeight, defaultWallHeight);
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
 * @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} occupancyRevision
 * @param {object[]} out
 */
export function collectStaticGridWallDrawables(obstacleGrid, viewport, layers, settings, viewerX, viewerY, occupancyRevision, out) {
    out.length = 0;
    if (!obstacleGrid?.cols || !layers?.length) return out;
    const bounds = viewport.boundsQuery;
    const defaultWallHeight = getWallHeight(settings);
    if (!geomCacheHit(sGeomCache, obstacleGrid, layers, occupancyRevision, defaultWallHeight, bounds)) {
        collectStaticGridWallFaceCandidates(obstacleGrid, bounds, layers, defaultWallHeight, sGeomCache.faces);
        storeGeomCache(sGeomCache, obstacleGrid, layers, occupancyRevision, defaultWallHeight, bounds);
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
