/** @param {import("../../../Render/Render.js").Renderer} renderer */
export function drawTowerDebugOverlay(renderer, state, viewport) {
    const hnav = state.hierarchicalNavigator;
    if (!hnav || !hnav.grid || !viewport) return;
    const ctx = renderer.ctx;
    ctx.save();
    const pad = hnav.cellSize * 2;
    const screenW = state.canvasBounds.width || renderer.canvas.width;
    const screenH = state.canvasBounds.height || renderer.canvas.height;
    const wMin = viewport.screenToWorld(0, 0);
    const wMax = viewport.screenToWorld(screenW, screenH);
    const vxMin = Math.min(wMin.x, wMax.x) - pad;
    const vxMax = Math.max(wMin.x, wMax.x) + pad;
    const vyMin = Math.min(wMin.y, wMax.y) - pad;
    const vyMax = Math.max(wMin.y, wMax.y) + pad;
    const startGrid = hnav.worldToGrid(vxMin, vyMin);
    const endGrid = hnav.worldToGrid(vxMax, vyMax);
    const startCol = Math.max(0, Math.min(hnav.cols - 1, startGrid.col));
    const endCol = Math.max(0, Math.min(hnav.cols - 1, endGrid.col));
    const startRow = Math.max(0, Math.min(hnav.rows - 1, startGrid.row));
    const endRow = Math.max(0, Math.min(hnav.rows - 1, endGrid.row));
    for (let row = startRow; row <= endRow; row++)
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
    if (hnav.cellToNode) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
        ctx.lineWidth = 1.5;
        for (let row = startRow; row <= endRow; row++)
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
        ctx.stroke();
    }
    for (const id in hnav.nodesMap) {
        const node = hnav.nodesMap[id];
        for (const edge of node.edges) {
            const targetNode = hnav.nodesMap[edge.targetId];
            if (targetNode)
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
    const navigation = state.navigation;
    if (navigation && typeof state.getCombatants === "function")
        for (const actor of state.getCombatants()) {
            const color = actor.faction === "player" ? "#00e5ff" : "#ff007f";
            const path = navigation.getPath(actor);
            drawEntityNavigationPath(ctx, actor, path, color, color);
            drawNavigationDebugLabel(ctx, actor, navigation, color);
        }
    ctx.restore();
}

function drawNavigationDebugLabel(ctx, entity, navigation, color = "#ffffff") {
    const info = navigation.getDebugInfo(entity);
    if (!info) return;
    const replanText = info.replanReason ? ` ${info.replanReason}` : "";
    const label = `${info.mode} d=${Math.round(info.dist)} p=${info.pathLen}${replanText}`;
    ctx.save();
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(label, entity.x, entity.y - entity.radius - 8);
    ctx.restore();
}

function drawEntityNavigationPath(ctx, entity, path, strokeStyle, fillStyle) {
    if (!path || path.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(entity.x, entity.y);
    for (const wp of path) ctx.lineTo(wp.x, wp.y);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const wp of path) {
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}
