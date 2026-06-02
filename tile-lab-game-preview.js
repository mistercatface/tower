import { combatVisualSettings } from "./Config/Config.js";
import { GamePhase } from "./GameState/GamePhase.js";
import { clearFlatWallFaceCache, drawProjectedWallFace } from "./Render/3D/WallFaceTexture.js";
import { FloorTileSystem } from "./Render/Floor/FloorTileSystem.js";
import { Viewport } from "./Render/Viewport.js";

const previewFloorTiles = new FloorTileSystem();
let previewCacheKey = "";

function buildObstacleGrid(cellSize, centerX, centerY) {
    const spanCells = 48;
    const half = (spanCells * cellSize) / 2;
    const minX = centerX - half;
    const minY = centerY - half;
    return {
        cellSize,
        minX,
        minY,
        cols: spanCells,
        rows: spanCells,
        grid: new Uint8Array(spanCells * spanCells),
    };
}

function buildMockState({ profileId, seed, centerX, centerY, cellSize, weaponRange }) {
    return {
        phase: GamePhase.COMBAT,
        floorTileSeed: seed,
        floorTiles: previewFloorTiles,
        obstacleGrid: buildObstacleGrid(cellSize, centerX, centerY),
        player: {
            x: centerX,
            y: centerY,
            weapon: { range: weaponRange },
            radius: 8,
        },
        getCurrentMapNode() {
            return { floorTextureProfileId: profileId };
        },
    };
}

function drawWeaponRangeRing(ctx, x, y, range) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 188, 212, 0.35)";
    ctx.lineWidth = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.stroke();
    ctx.restore();
}

function drawPreviewRoomWalls(ctx, state, viewport, centerX, centerY, cellSize, roomCells) {
    const half = (roomCells * cellSize) / 2;
    const x0 = centerX - half;
    const x1 = centerX + half;
    const y0 = centerY - half;
    const y1 = centerY + half;
    const px = state.player.x;
    const py = state.player.y;
    const fill = combatVisualSettings.floorFill;

    const segments = [
        [{ x: x0, y: y0 }, { x: x1, y: y0 }],
        [{ x: x1, y: y0 }, { x: x1, y: y1 }],
        [{ x: x1, y: y1 }, { x: x0, y: y1 }],
        [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ];

    for (const [p1, p2] of segments) {
        drawProjectedWallFace(ctx, p1, p2, px, py, fill, state.floorTiles, state, {
            viewport,
            textureEnabled: true,
        });
    }
}

function drawPlayerMarker(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = "#00bcd4";
    ctx.strokeStyle = "#003840";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/** Renders combat-style floor chunks, projected wall textures, and player marker. */
export function renderGamePreview(canvas, options) {
    const {
        profileId,
        seed,
        worldX,
        worldY,
        cellSize,
        gameZoom,
        showRangeRing,
        roomCells,
        weaponRange,
    } = options;

    const centerX = worldX;
    const centerY = worldY;
    const cacheKey = `${profileId}:${seed}:${cellSize}`;
    if (cacheKey !== previewCacheKey) {
        previewFloorTiles.clear();
        clearFlatWallFaceCache();
        previewCacheKey = cacheKey;
    }

    const state = buildMockState({
        profileId,
        seed,
        centerX,
        centerY,
        cellSize,
        weaponRange,
    });

    const viewport = new Viewport(centerX, centerY, gameZoom);
    viewport.cx = canvas.width / 2;
    viewport.cy = canvas.height / 2;
    viewport.zoom = gameZoom;

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    viewport.apply(ctx);

    state.floorTiles.draw(ctx, state, viewport);
    drawPreviewRoomWalls(ctx, state, viewport, centerX, centerY, cellSize, roomCells);

    if (showRangeRing) {
        drawWeaponRangeRing(ctx, centerX, centerY, weaponRange);
    }

    drawPlayerMarker(ctx, centerX, centerY);

    ctx.restore();

    return { zoom: gameZoom };
}
