import { fillCircle, strokeOpenPolyline, strokeSegment, traceSegment } from "../../Canvas/CanvasPath.js";
import { createOffscreenCanvas } from "../../Canvas/offscreenCanvas.js";
import { isRailWallEdge } from "../../Spatial/grid/CellEdge.js";
import { forEachGridEdge } from "../../World/wallGridCells.js";
const WALL_OVERLAY_THICKNESS = 20;
/** Pixels per grid cell in the map overview bake — edges draw on boundaries, not as cell fills. */
const OVERVIEW_PIXELS_PER_CELL = 4;
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
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid */
export function bakeObstacleOverviewCache(obstacleGrid) {
    const ppc = OVERVIEW_PIXELS_PER_CELL;
    const { cols, rows } = obstacleGrid;
    const canvas = createOffscreenCanvas(cols * ppc, rows * ppc);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#484e58";
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        if (obstacleGrid.grid[i] === 0) continue;
        const col = i % cols;
        const row = (i / cols) | 0;
        ctx.fillRect(col * ppc, row * ppc, ppc, ppc);
    }
    ctx.strokeStyle = "#e040fb";
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    forEachGridEdge(
        obstacleGrid,
        (col, row, side) => {
            ctx.beginPath();
            if (side === 0) {
                ctx.moveTo(col * ppc, row * ppc);
                ctx.lineTo((col + 1) * ppc, row * ppc);
            } else if (side === 1) {
                ctx.moveTo((col + 1) * ppc, row * ppc);
                ctx.lineTo((col + 1) * ppc, (row + 1) * ppc);
            } else if (side === 2) {
                ctx.moveTo(col * ppc, (row + 1) * ppc);
                ctx.lineTo((col + 1) * ppc, (row + 1) * ppc);
            } else {
                ctx.moveTo(col * ppc, row * ppc);
                ctx.lineTo(col * ppc, (row + 1) * ppc);
            }
            ctx.stroke();
        },
        { filter: isRailWallEdge, canonicalOnly: true },
    );
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
/** @param {object} state */
export function rebuildLabMapCaches(state) {
    const grid = state.obstacleGrid;
    state.mapWallCache = bakeWallLayer(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapPathDebugCache = bakePathDebugLayer(state.hierarchicalNavigator, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapOverviewCache = bakeObstacleOverviewCache(grid);
}
