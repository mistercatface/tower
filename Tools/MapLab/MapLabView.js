import { drawLabMapGraph, drawLabMapWallLayer } from "../../Render/Map/MapViewRenderer.js";
import { drawMapLabPathDebugCache, getMapLabPathDebugCache } from "./MapLabPathDebugCache.js";

export function renderMapLabView(ctx, width, height, world, camera, options, selectedNodeId, playerPos, targetPos, currentPath) {
    ctx.save();
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, width, height);

    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    if (world.obstacleGrid) {
        if (options.showPathDebug) {
            drawMapLabPathDebugCache(ctx, getMapLabPathDebugCache(world));
        }
        if (options.showWalls) {
            drawLabMapWallLayer(ctx, world);
        }
    }

    if (options.showGridBounds && world.obstacleGrid) {
        const grid = world.obstacleGrid;
        if (grid.minX !== undefined && grid.maxX !== undefined) {
            ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
            ctx.lineWidth = 10 / camera.zoom;
            ctx.setLineDash([20, 20]);
            ctx.strokeRect(grid.minX, grid.minY, grid.maxX - grid.minX, grid.maxY - grid.minY);
            ctx.setLineDash([]);
        }
    }

    if (options.showRoomZones) {
        for (const node of world.mapNodes) {
            const coords = world.getNodeCombatCoords(node);
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, 540, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.lineWidth = 2 / camera.zoom;
            ctx.stroke();
        }
    }

    if (options.showNodes) {
        drawLabMapGraph(ctx, world, {
            zoom: camera.zoom,
            selectedNodeId,
        });
    }

    if (options.showPathTest) {
        if (currentPath && currentPath.length > 0) {
            ctx.save();
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
            ctx.restore();
        }

        if (playerPos) {
            ctx.save();
            ctx.beginPath();
            const r = 16 / camera.zoom;
            ctx.arc(playerPos.x, playerPos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = "#00bcd4";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 3 / camera.zoom;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${16 / camera.zoom}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("P", playerPos.x, playerPos.y);
            ctx.restore();
        }

        if (targetPos) {
            ctx.save();
            ctx.beginPath();
            const r = 16 / camera.zoom;
            ctx.arc(targetPos.x, targetPos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = "#e91e63";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 3 / camera.zoom;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${16 / camera.zoom}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("T", targetPos.x, targetPos.y);
            ctx.restore();
        }
    }

    ctx.restore();
}
