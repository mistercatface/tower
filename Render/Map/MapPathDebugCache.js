function createBakeCanvas(width, height) {
    const canvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function bakePathDebugLayer(hnav, minX, minY, maxX, maxY) {
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);
    if (width <= 0 || height <= 0 || !hnav.grid) return null;

    const canvas = createBakeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);

    const startCol = 0;
    const endCol = hnav.cols - 1;
    const startRow = 0;
    const endRow = hnav.rows - 1;

    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
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
    }

    if (hnav.cellToNode) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
        ctx.lineWidth = 1.5;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
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

    return {
        canvas,
        minX,
        minY,
        maxX,
        maxY,
    };
}

export function bakeMapPathDebugCache(state) {
    const grid = state.obstacleGrid;
    const hnav = state.hierarchicalNavigator;
    if (!grid || !hnav) return null;

    return bakePathDebugLayer(hnav, grid.minX, grid.minY, grid.maxX, grid.maxY);
}

export function drawMapPathDebugCache(ctx, cache) {
    if (!cache?.canvas) return;
    ctx.drawImage(cache.canvas, cache.minX, cache.minY);
}
