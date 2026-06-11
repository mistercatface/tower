const WALL_OVERLAY_THICKNESS = 20;
/** @typedef {{ canvas: OffscreenCanvas, minX: number, minY: number, maxX: number, maxY: number }} MapImageCache */
/** @typedef {MapImageCache} ObstacleOverviewCache */
function bakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return new OffscreenCanvas(w, h);
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
            const isBlocked = hnav.grid[row * hnav.cols + col] === 1;
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
                if (hnav.grid[idx] === 1) continue;
                const node = hnav.cellToNode[idx];
                if (!node) continue;
                const wx = hnav.minX + col * hnav.cellSize;
                const wy = hnav.minY + row * hnav.cellSize;
                const cellSize = hnav.cellSize;
                if (col + 1 < hnav.cols) {
                    const rIdx = idx + 1;
                    if (hnav.grid[rIdx] === 0) {
                        const rightNode = hnav.cellToNode[rIdx];
                        if (rightNode && rightNode.id !== node.id) {
                            ctx.moveTo(wx + cellSize, wy);
                            ctx.lineTo(wx + cellSize, wy + cellSize);
                        }
                    }
                }
                if (row + 1 < hnav.rows) {
                    const bIdx = idx + hnav.cols;
                    if (hnav.grid[bIdx] === 0) {
                        const bottomNode = hnav.cellToNode[bIdx];
                        if (bottomNode && bottomNode.id !== node.id) {
                            ctx.moveTo(wx, wy + cellSize);
                            ctx.lineTo(wx + cellSize, wy + cellSize);
                        }
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
                ctx.beginPath();
                const p0 = hnav.gridToWorld(edge.path[0].col, edge.path[0].row);
                ctx.moveTo(p0.x, p0.y);
                for (let k = 1; k < edge.path.length; k++) {
                    const pk = hnav.gridToWorld(edge.path[k].col, edge.path[k].row);
                    ctx.lineTo(pk.x, pk.y);
                }
                ctx.strokeStyle = "#ff9800";
                ctx.lineWidth = 2.5;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(node.x, node.y);
                ctx.lineTo(targetNode.x, targetNode.y);
                ctx.strokeStyle = "#ff9800";
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#00e5ff";
        ctx.fill();
    }
    return { canvas, minX, minY, maxX, maxY };
}
/** @param {{ cols: number, rows: number, grid: ArrayLike<number>, minX: number, minY: number, maxX: number, maxY: number }} obstacleGrid */
export function bakeObstacleOverviewCache(obstacleGrid) {
    if (!obstacleGrid.cols || !obstacleGrid.rows) return null;
    const canvas = new OffscreenCanvas(obstacleGrid.cols, obstacleGrid.rows);
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(obstacleGrid.cols, obstacleGrid.rows);
    const pixels = data.data;
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        const blocked = obstacleGrid.grid[i] === 1;
        const offset = i * 4;
        if (blocked) {
            pixels[offset] = 72;
            pixels[offset + 1] = 78;
            pixels[offset + 2] = 88;
            pixels[offset + 3] = 255;
        } else {
            pixels[offset] = 12;
            pixels[offset + 1] = 14;
            pixels[offset + 2] = 18;
            pixels[offset + 3] = 255;
        }
    }
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
/** @param {object} state */
export function rebuildLabMapCaches(state) {
    const grid = state.obstacleGrid;
    state.mapWallCache = bakeWallLayer(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapPathDebugCache = bakePathDebugLayer(state.hierarchicalNavigator, grid.minX, grid.minY, grid.maxX, grid.maxY);
    state.mapOverviewCache = bakeObstacleOverviewCache(grid);
}
