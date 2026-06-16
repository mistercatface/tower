import { fillCircle, strokeSegment, traceSegment } from "../../Canvas/CanvasPath.js";
import { fillRgbaBuffer, fillRgbaRect, strokeAxisLineRgba } from "../../Canvas/imageDataBuffer.js";
import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { isRailWallEdge } from "../../Spatial/grid/CellEdge.js";
import { forEachCellEdge } from "../../Spatial/grid/gridCellTopology.js";
/** Pixels per grid cell in the map overview bake — edges draw on boundaries, not as cell fills. */
const OVERVIEW_PIXELS_PER_CELL = 4;
const OVERVIEW_FLOOR_RGB = [12, 14, 18];
const OVERVIEW_WALL_RGB = [72, 78, 88];
const OVERVIEW_RAIL_RGB = [224, 64, 251];
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D & { canvas: OffscreenCanvas }} MapImageCache */
/** @typedef {MapImageCache} ObstacleOverviewCache */
function bakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return createOffscreenCanvas(w, h);
}
function bakePathDebugLayer(debugView, minX, minY, maxX, maxY) {
    const canvas = bakeCanvas(maxX - minX, maxY - minY);
    if (!canvas || !debugView.grid) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);
    const endCol = debugView.cols - 1;
    const endRow = debugView.rows - 1;
    const cellToRegion = debugView.cellToRegion;
    for (let row = 0; row <= endRow; row++)
        for (let col = 0; col <= endCol; col++) {
            const isBlocked = debugView.grid[row * debugView.cols + col] !== 0;
            const wx = debugView.minX + col * debugView.cellSize;
            const wy = debugView.minY + row * debugView.cellSize;
            if (isBlocked) {
                ctx.fillStyle = "rgba(244, 67, 54, 0.25)";
                ctx.fillRect(wx, wy, debugView.cellSize, debugView.cellSize);
            } else if (!cellToRegion || cellToRegion[row * debugView.cols + col] < 0) {
                ctx.fillStyle = "rgba(76, 175, 80, 0.05)";
                ctx.fillRect(wx, wy, debugView.cellSize, debugView.cellSize);
            }
        }
    if (cellToRegion) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
        ctx.lineWidth = 1.5;
        for (let row = 0; row <= endRow; row++)
            for (let col = 0; col <= endCol; col++) {
                const idx = row * debugView.cols + col;
                if (debugView.grid[idx]) continue;
                const region = cellToRegion[idx];
                if (region < 0) continue;
                const wx = debugView.minX + col * debugView.cellSize;
                const wy = debugView.minY + row * debugView.cellSize;
                const cellSize = debugView.cellSize;
                if (col + 1 < debugView.cols) {
                    const rIdx = idx + 1;
                    if (debugView.grid[rIdx] === 0) {
                        const rightRegion = cellToRegion[rIdx];
                        if (rightRegion >= 0 && rightRegion !== region && debugView.regionCanStep(col, row, col + 1, row)) traceSegment(ctx, wx + cellSize, wy, wx + cellSize, wy + cellSize);
                    }
                }
                if (row + 1 < debugView.rows) {
                    const bIdx = idx + debugView.cols;
                    if (debugView.grid[bIdx] === 0) {
                        const bottomRegion = cellToRegion[bIdx];
                        if (bottomRegion >= 0 && bottomRegion !== region && debugView.regionCanStep(col, row, col, row + 1)) traceSegment(ctx, wx, wy + cellSize, wx + cellSize, wy + cellSize);
                    }
                }
            }
        ctx.stroke();
    }
    const { nodeCol, nodeRow, nodeCount } = debugView;
    for (let i = 0; i < nodeCount; i++) {
        const world = debugView.gridToWorld(nodeCol[i], nodeRow[i]);
        ctx.fillStyle = "#00e5ff";
        fillCircle(ctx, world.x, world.y, 4);
    }
    for (const edge of debugView.edges) {
        const a = debugView.gridToWorld(nodeCol[edge.sourceIdx], nodeRow[edge.sourceIdx]);
        const b = debugView.gridToWorld(nodeCol[edge.targetIdx], nodeRow[edge.targetIdx]);
        ctx.strokeStyle = "#ff9800";
        ctx.lineWidth = 2.5;
        strokeSegment(ctx, a.x, a.y, b.x, b.y);
    }
    return { canvas, minX, minY, maxX, maxY };
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {OffscreenCanvas | null | undefined} [reuseCanvas] */
export function bakeObstacleOverviewCache(obstacleGrid, reuseCanvas = null) {
    const ppc = OVERVIEW_PIXELS_PER_CELL;
    const { cols, rows } = obstacleGrid;
    const w = cols * ppc;
    const h = rows * ppc;
    const canvas = reuseCanvas ?? createOffscreenCanvas(w, h);
    resizeOffscreenCanvas(canvas, w, h);
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(w, h);
    const px = data.data;
    fillRgbaBuffer(px, OVERVIEW_FLOOR_RGB);
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        if (obstacleGrid.grid[i] === 0) continue;
        const col = i % cols;
        const row = (i / cols) | 0;
        fillRgbaRect(px, w, h, col * ppc, row * ppc, ppc, ppc, OVERVIEW_WALL_RGB);
    }
    forEachCellEdge(
        obstacleGrid,
        (col, row, side) => {
            if (side === 0) strokeAxisLineRgba(px, w, h, col * ppc, row * ppc, (col + 1) * ppc - 1, row * ppc, OVERVIEW_RAIL_RGB);
            else if (side === 1) strokeAxisLineRgba(px, w, h, (col + 1) * ppc - 1, row * ppc, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else if (side === 2) strokeAxisLineRgba(px, w, h, col * ppc, (row + 1) * ppc - 1, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else strokeAxisLineRgba(px, w, h, col * ppc, row * ppc, col * ppc, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
        },
        { filter: isRailWallEdge, canonicalOnly: true },
    );
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
/** @param {object} state */
export function labPathDebugCacheKey(state) {
    const grid = state.obstacleGrid;
    return `${grid.gridTopologyEpoch}:${state.navigation.obstacleGeneration}:${grid.cols}x${grid.rows}`;
}
/** @param {object} state */
export async function ensureLabPathDebugCache(state) {
    const key = labPathDebugCacheKey(state);
    if (state._labPathDebugKey === key && state.mapPathDebugCache) return state.mapPathDebugCache;
    if (state._labPathDebugBake) return state._labPathDebugBake;
    state._labPathDebugBake = (async () => {
        const grid = state.obstacleGrid;
        await state.navigation.awaitWorkerNavReady();
        const debugView = state.hpaPathWorker.getRegionGraphDebugView(grid);
        state.mapPathDebugCache = debugView ? bakePathDebugLayer(debugView, grid.minX, grid.minY, grid.maxX, grid.maxY) : null;
        state._labPathDebugKey = key;
        state._labPathDebugBake = null;
        return state.mapPathDebugCache;
    })();
    return state._labPathDebugBake;
}
/** @param {object} state */
export function rebuildLabMapOverviewCache(state) {
    const grid = state.obstacleGrid;
    state.mapOverviewCache = bakeObstacleOverviewCache(grid, state.mapOverviewCache?.canvas);
}
/** @param {object} state */
export function rebuildLabMapCaches(state) {
    rebuildLabMapOverviewCache(state);
}
