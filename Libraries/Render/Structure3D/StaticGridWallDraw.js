/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { forEachObstacleGridCellInAabb } from "../../Spatial/grid/GridCoords.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { cellIsStaticBlocked, resolveStaticWallHeightAtCell } from "../../World/staticOccupancyLayers.js";
import { computeProjectedFace, drawFaceTexture } from "./ProjectedWallDraw.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge */
function staticCellEdgeOpen(grid, col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return true;
    return !grid.isBlocked(nc, nr);
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
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} layers
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridWallDrawables(obstacleGrid, viewport, layers, settings, viewerX, viewerY, out) {
    out.length = 0;
    if (!obstacleGrid?.cols || !layers?.length) return out;
    const defaultWallHeight = getWallHeight(settings);
    const bounds = viewport.boundsQuery;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row) => {
        if (!cellIsStaticBlocked(obstacleGrid, col, row)) return;
        const stampedHeight = resolveStaticWallHeightAtCell(obstacleGrid, col, row, layers);
        if (stampedHeight === undefined) return;
        const faceHeight = stampedHeight ?? defaultWallHeight;
        const cellBounds = obstacleGrid.getCellBounds(col, row);
        const cx = (cellBounds.minX + cellBounds.maxX) / 2;
        const cy = (cellBounds.minY + cellBounds.maxY) / 2;
        for (let edge = 0; edge < 4; edge++) {
            if (!staticCellEdgeOpen(obstacleGrid, col, row, edge)) continue;
            staticCellEdgeEndpoints(obstacleGrid, col, row, edge, sP1, sP2);
            const ecx = (sP1.x + sP2.x) / 2;
            const ecy = (sP1.y + sP2.y) / 2;
            const outX = ecx - cx;
            const outY = ecy - cy;
            const viewX = ecx - viewerX;
            const viewY = ecy - viewerY;
            if (outX * viewX + outY * viewY >= 0) continue;
            out.push({
                staticGrid: true,
                p1: { x: sP1.x, y: sP1.y },
                p2: { x: sP2.x, y: sP2.y },
                wallHeight: faceHeight,
                cx: ecx,
                cy: ecy,
                outX,
                outY,
                _distSq: (ecx - viewerX) ** 2 + (ecy - viewerY) ** 2,
            });
        }
    });
    return out;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof collectStaticGridWallDrawables>[number]} face
 * @param {import("../WorldSceneTypes.js").WorldSceneDrawInput} input
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {import("../../Math/Aabb2D.js").Aabb2D} worldBounds
 * @param {string} fillStyle
 */
export function drawStaticGridWallFace(ctx, face, input, viewport, viewerX, viewerY, worldBounds, fillStyle) {
    const worldSurfaces = input.worldSurfaces;
    const settings = worldSurfaces?.settings;
    if (!settings) return;
    const projected = computeProjectedFace(face.p1, face.p2, viewerX, viewerY, face.wallHeight, settings, undefined, viewport);
    ctx.beginPath();
    ctx.moveTo(face.p1.x, face.p1.y);
    ctx.lineTo(projected.proj1X, projected.proj1Y);
    ctx.lineTo(projected.proj2X, projected.proj2Y);
    ctx.lineTo(face.p2.x, face.p2.y);
    ctx.closePath();
    if (worldSurfaces && input.proceduralSurfaceDraw)
        drawFaceTexture(ctx, face.p1, face.p2, projected, worldSurfaces, input.proceduralSurfaceDraw, { x: viewerX, y: viewerY }, viewport, face.wallHeight, fillStyle, face, worldBounds);
    else {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}
