export function drawMapLabGridBounds(ctx, grid, zoom) {
    if (grid.minX === undefined || grid.maxX === undefined) return;

    ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
    ctx.lineWidth = 10 / zoom;
    ctx.setLineDash([20, 20]);
    ctx.strokeRect(grid.minX, grid.minY, grid.maxX - grid.minX, grid.maxY - grid.minY);
    ctx.setLineDash([]);
}

export function drawMapLabRoomZones(ctx, state, zoom) {
    for (const node of state.mapNodes) {
        const coords = state.getNodeCombatCoords(node);
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

export function drawMapLabPathTest(ctx, { playerPos, targetPos, currentPath, zoom }) {
    if (currentPath && currentPath.length > 0) {
        ctx.beginPath();
        ctx.moveTo(playerPos.x, playerPos.y);
        for (const wp of currentPath) {
            ctx.lineTo(wp.x, wp.y);
        }
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 4;
        ctx.stroke();

        for (const wp of currentPath) {
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = "#00e5ff";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    if (playerPos) {
        drawPathTestMarker(ctx, playerPos.x, playerPos.y, 16 / zoom, "#00bcd4", "P", zoom);
    }

    if (targetPos) {
        drawPathTestMarker(ctx, targetPos.x, targetPos.y, 16 / zoom, "#e91e63", "T", zoom);
    }
}

export function drawMapLabOverlays(ctx, state, config) {
    const { labOptions, camera, playerPos, targetPos, currentPath } = config;
    if (!labOptions || !camera) return;

    if (labOptions.showGridBounds && state.obstacleGrid) {
        drawMapLabGridBounds(ctx, state.obstacleGrid, camera.zoom);
    }

    if (labOptions.showRoomZones) {
        drawMapLabRoomZones(ctx, state, camera.zoom);
    }

    if (labOptions.showPathTest) {
        drawMapLabPathTest(ctx, { playerPos, targetPos, currentPath, zoom: camera.zoom });
    }
}
