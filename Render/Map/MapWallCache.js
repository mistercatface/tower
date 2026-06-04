import { mapSettings } from "../../Config/Config.js";

function createBakeCanvas(width, height) {
    const canvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function drawGameMapWall(ctx, seg, baseSpawnX, baseSpawnY, scale) {
    const mx = (seg.x - baseSpawnX) / scale;
    const my = (seg.y - baseSpawnY) / scale;
    const msize = seg.size / scale;
    const mhalf = msize / 2;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(seg.angle);

    const theme = seg.theme || { r: 0, g: 188, b: 212 };
    ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.75)`;
    ctx.fillRect(-mhalf, -mhalf, msize, msize);

    ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.95)`;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-mhalf, -mhalf, msize, msize);

    ctx.restore();
}

function computeGameMapWallBounds(walls, baseSpawnX, baseSpawnY, scale) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const seg of walls) {
        if (seg.isDead) continue;

        const mx = (seg.x - baseSpawnX) / scale;
        const my = (seg.y - baseSpawnY) / scale;
        const mhalf = seg.size / scale / 2;

        minX = Math.min(minX, mx - mhalf);
        maxX = Math.max(maxX, mx + mhalf);
        minY = Math.min(minY, my - mhalf);
        maxY = Math.max(maxY, my + mhalf);
    }

    if (minX === Infinity) {
        return null;
    }

    return { minX, minY, maxX, maxY };
}

function bakeGameMapWallCache(walls, baseSpawnX, baseSpawnY, scale) {
    const bounds = computeGameMapWallBounds(walls, baseSpawnX, baseSpawnY, scale);
    if (!bounds) return null;

    const width = Math.ceil(bounds.maxX - bounds.minX);
    const height = Math.ceil(bounds.maxY - bounds.minY);
    if (width <= 0 || height <= 0) return null;

    const canvas = createBakeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.translate(-bounds.minX, -bounds.minY);

    for (const seg of walls) {
        if (seg.isDead) continue;
        drawGameMapWall(ctx, seg, baseSpawnX, baseSpawnY, scale);
    }

    return {
        canvas,
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        wallsCount: walls.length,
        baseSpawnX,
        baseSpawnY,
        scale,
    };
}

export function invalidateMapWallCache(state) {
    state.mapWallCache = null;
}

export function getGameMapWallCache(state) {
    const { x: baseSpawnX, y: baseSpawnY } = state.getCombatSpawnOrigin();
    const scale = mapSettings.combatCoordScale;
    const cache = state.mapWallCache;

    if (cache
        && cache.wallsCount === state.walls.length
        && cache.baseSpawnX === baseSpawnX
        && cache.baseSpawnY === baseSpawnY
        && cache.scale === scale
    ) {
        return cache;
    }

    const nextCache = bakeGameMapWallCache(state.walls, baseSpawnX, baseSpawnY, scale);
    state.mapWallCache = nextCache;
    return nextCache;
}

export function drawGameMapWallCache(ctx, cache) {
    if (!cache?.canvas) return;
    ctx.drawImage(cache.canvas, cache.minX, cache.minY);
}
