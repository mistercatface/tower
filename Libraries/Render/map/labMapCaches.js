import { fillCircle, strokeOpenPolyline, strokeSegment, traceSegment } from "../../Canvas/CanvasPath.js";
import { createOffscreenCanvas, resizeOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { isRailWallEdge } from "../../Spatial/grid/CellEdge.js";
import { forEachGridEdge } from "../../World/wallGridCells.js";
const WALL_OVERLAY_THICKNESS = 20;
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
function drawWallSegment(ctx, seg) {
    ctx.save();
    ctx.translate(seg.x, seg.y);
    ctx.rotate(seg.angle);
    ctx.fillStyle = "rgba(120, 120, 120, 0.8)";
    const halfSize = seg.size / 2;
    ctx.fillRect(-halfSize, -WALL_OVERLAY_THICKNESS / 2, seg.size, WALL_OVERLAY_THICKNESS);
    ctx.strokeStyle = "rgba(120, 120, 120, 1)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-halfSize, -WALL_OVERLAY_THICKNESS / 2, seg.size, WALL_OVERLAY_THICKNESS);
    ctx.restore();
}
function bakeWallLayer(walls, minX, minY, maxX, maxY) {
    const canvas = bakeCanvas(maxX - minX, maxY - minY);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);
    for (const seg of walls) {
        if (seg.isDead) continue;
        drawWallSegment(ctx, seg);
    }
    return { canvas, minX, minY, maxX, maxY };
}
function bakePathDebugLayer(hnav, minX, minY, maxX, maxY) {
    const canvas = bakeCanvas(maxX - minX, maxY - minY);
    if (!canvas || !hnav.grid) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);
    const endCol = hnav.cols - 1;
    const endRow = hnav.rows - 1;
    for (let row = 0; row <= endRow; row++)
        for (let col = 0; col <= endCol; col++) {
            const isBlocked = hnav.grid[row * hnav.cols + col] !== 0;
            const wx = hnav.minX + col * hnav.cellSize;
            const wy = hnav.minY + row * hnav.cellSize;
            if (isBlocked) {
                ctx.fillStyle = "rgba(244, 67, 54, 0.25)";
                ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
            } else if (!hnav.cellToNode || !hnav.cellToNode[row * hnav.cols + col]) {
                ctx.fillStyle = "rgba(76, 175, 80, 0.05)";
                ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
            }
        }
    if (hnav.cellToNode) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
        ctx.lineWidth = 1.5;
        for (let row = 0; row <= endRow; row++)
            for (let col = 0; col <= endCol; col++) {
                const idx = row * hnav.cols + col;
                if (hnav.grid[idx]) continue;
                const node = hnav.cellToNode[idx];
                if (!node) continue;
                const wx = hnav.minX + col * hnav.cellSize;
                const wy = hnav.minY + row * hnav.cellSize;
                const cellSize = hnav.cellSize;
                if (col + 1 < hnav.cols) {
                    const rIdx = idx + 1;
                    if (hnav.grid[rIdx] === 0) {
                        const rightNode = hnav.cellToNode[rIdx];
                        if (rightNode && rightNode.id !== node.id) traceSegment(ctx, wx + cellSize, wy, wx + cellSize, wy + cellSize);
                    }
                }
                if (row + 1 < hnav.rows) {
                    const bIdx = idx + hnav.cols;
                    if (hnav.grid[bIdx] === 0) {
                        const bottomNode = hnav.cellToNode[bIdx];
                        if (bottomNode && bottomNode.id !== node.id) traceSegment(ctx, wx, wy + cellSize, wx + cellSize, wy + cellSize);
                    }
                }
            }
        ctx.stroke();
    }
    for (const id in hnav.nodesMap) {
        const node = hnav.nodesMap[id];
        for (const edge of node.edges) {
            const targetNode = hnav.nodesMap[edge.targetId];
            if (!targetNode) continue;
            if (edge.path && edge.path.length > 0) {
                ctx.strokeStyle = "#ff9800";
                ctx.lineWidth = 2.5;
                strokeOpenPolyline(
                    ctx,
                    edge.path.map((cell) => hnav.gridToWorld(cell.col, cell.row)),
                );
            } else {
                ctx.strokeStyle = "#ff9800";
                ctx.lineWidth = 2.5;
                strokeSegment(ctx, node.x, node.y, targetNode.x, targetNode.y);
            }
        }
        ctx.fillStyle = "#00e5ff";
        fillCircle(ctx, node.x, node.y, 4);
    }
    return { canvas, minX, minY, maxX, maxY };
}
/** @param {Uint8ClampedArray} px @param {number} w @param {number} h @param {number} x @param {number} y @param {number[]} rgb */
function setOverviewPixel(px, w, h, x, y, rgb) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
    px[i + 3] = 255;
}
/** @param {Uint8ClampedArray} px @param {number} w @param {number} h @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number[]} rgb */
function strokeOverviewLine(px, w, h, x0, y0, x1, y1, rgb) {
    if (y0 === y1) {
        const lo = x0 < x1 ? x0 : x1;
        const hi = x0 < x1 ? x1 : x0;
        for (let x = lo; x <= hi; x++) setOverviewPixel(px, w, h, x, y0, rgb);
        return;
    }
    const lo = y0 < y1 ? y0 : y1;
    const hi = y0 < y1 ? y1 : y0;
    for (let y = lo; y <= hi; y++) setOverviewPixel(px, w, h, x0, y, rgb);
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
    for (let i = 0; i < px.length; i += 4) {
        px[i] = OVERVIEW_FLOOR_RGB[0];
        px[i + 1] = OVERVIEW_FLOOR_RGB[1];
        px[i + 2] = OVERVIEW_FLOOR_RGB[2];
        px[i + 3] = 255;
    }
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        if (obstacleGrid.grid[i] === 0) continue;
        const col = i % cols;
        const row = (i / cols) | 0;
        const x0 = col * ppc;
        const y0 = row * ppc;
        for (let dy = 0; dy < ppc; dy++) for (let dx = 0; dx < ppc; dx++) setOverviewPixel(px, w, h, x0 + dx, y0 + dy, OVERVIEW_WALL_RGB);
    }
    forEachGridEdge(
        obstacleGrid,
        (col, row, side) => {
            if (side === 0) strokeOverviewLine(px, w, h, col * ppc, row * ppc, (col + 1) * ppc - 1, row * ppc, OVERVIEW_RAIL_RGB);
            else if (side === 1) strokeOverviewLine(px, w, h, (col + 1) * ppc - 1, row * ppc, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else if (side === 2) strokeOverviewLine(px, w, h, col * ppc, (row + 1) * ppc - 1, (col + 1) * ppc - 1, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
            else strokeOverviewLine(px, w, h, col * ppc, row * ppc, col * ppc, (row + 1) * ppc - 1, OVERVIEW_RAIL_RGB);
        },
        { filter: isRailWallEdge, canonicalOnly: true },
    );
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
/** @param {object} state */
export function rebuildLabMapCaches(state) {
    const grid = state.obstacleGrid;
    state.mapWallCache = bakeWallLayer(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapPathDebugCache = bakePathDebugLayer(state.hierarchicalNavigator, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapOverviewCache = bakeObstacleOverviewCache(grid, state.mapOverviewCache?.canvas);
}
