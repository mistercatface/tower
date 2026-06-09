export function drawTopologyGridBounds(ctx, grid, zoom) {
    if (grid.minX === undefined || grid.maxX === undefined) return;
    ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
    ctx.lineWidth = 10 / zoom;
    ctx.setLineDash([20, 20]);
    ctx.strokeRect(grid.minX, grid.minY, grid.maxX - grid.minX, grid.maxY - grid.minY);
    ctx.setLineDash([]);
}
export function drawTopologyRoomZones(ctx, state, zoom) {
    for (const node of state.mapNodes) {
        const coords = state.getNodeWorldCoords(node);
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, 540, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }
}
export function drawTopologyOverlays(ctx, state, config) {
    const { topologyOptions, viewport } = config;
    if (!topologyOptions || !viewport) return;
    if (topologyOptions.showGridBounds && state.obstacleGrid) drawTopologyGridBounds(ctx, state.obstacleGrid, viewport.zoom);
    if (topologyOptions.showRoomZones) drawTopologyRoomZones(ctx, state, viewport.zoom);
}
