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

function drawPathTestMarker(ctx, x, y, radius, fillStyle, label, zoom) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3 / zoom;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${16 / zoom}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
}

export function drawTopologyAbstractPath(ctx, abstractPath, zoom) {
    if (!abstractPath || abstractPath.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(abstractPath[0].x, abstractPath[0].y);
    for (let i = 1; i < abstractPath.length; i++) ctx.lineTo(abstractPath[i].x, abstractPath[i].y);
    ctx.strokeStyle = "#ffeb3b";
    ctx.lineWidth = 5 / zoom;
    ctx.setLineDash([12 / zoom, 8 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const node of abstractPath) {
        const isEndpoint = node.id === "start" || node.id === "target";
        const radius = (isEndpoint ? 8 : 10) / zoom;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isEndpoint ? "#ff9800" : "#ffeb3b";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }
}

export function drawTopologyPathTest(ctx, { playerPos, targetPos, currentPath, abstractPath, zoom }) {
    if (abstractPath) drawTopologyAbstractPath(ctx, abstractPath, zoom);
    if (currentPath?.length > 0) {
        ctx.beginPath();
        ctx.moveTo(playerPos.x, playerPos.y);
        for (const wp of currentPath) ctx.lineTo(wp.x, wp.y);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 4 / zoom;
        ctx.stroke();
        for (const wp of currentPath) {
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 6 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = "#00e5ff";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
        }
    }
    if (playerPos) drawPathTestMarker(ctx, playerPos.x, playerPos.y, 16 / zoom, "#00bcd4", "P", zoom);
    if (targetPos) drawPathTestMarker(ctx, targetPos.x, targetPos.y, 16 / zoom, "#e91e63", "T", zoom);
}

export function drawTopologyOverlays(ctx, state, config) {
    const { topologyOptions, viewport, playerPos, targetPos, currentPath, abstractPath } = config;
    if (!topologyOptions || !viewport) return;
    if (topologyOptions.showGridBounds && state.obstacleGrid) drawTopologyGridBounds(ctx, state.obstacleGrid, viewport.zoom);
    if (topologyOptions.showRoomZones) drawTopologyRoomZones(ctx, state, viewport.zoom);
    if (topologyOptions.showPathTest) drawTopologyPathTest(ctx, { playerPos, targetPos, currentPath, abstractPath, zoom: viewport.zoom });
}
