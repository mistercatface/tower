const TOPOLOGY_WALL_THICKNESS = 20;
function createBakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
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
    const r = 0,
        g = 188,
        b = 212;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
    ctx.fillRect(-mhalf, -mhalf, msize, msize);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-mhalf, -mhalf, msize, msize);
    ctx.restore();
}
function drawTopologyMapWall(ctx, seg) {
    ctx.save();
    ctx.translate(seg.x, seg.y);
    ctx.rotate(seg.angle);
    const r = 120,
        g = 120,
        b = 120;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    const halfSize = seg.size / 2;
    ctx.fillRect(-halfSize, -TOPOLOGY_WALL_THICKNESS / 2, seg.size, TOPOLOGY_WALL_THICKNESS);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-halfSize, -TOPOLOGY_WALL_THICKNESS / 2, seg.size, TOPOLOGY_WALL_THICKNESS);
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
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
}
export function bakeGameMapWallCache(walls, baseSpawnX, baseSpawnY, scale) {
    if (!(scale > 0)) return null;
    const bounds = computeGameMapWallBounds(walls, baseSpawnX, baseSpawnY, scale);
    if (!bounds) return null;
    const width = Math.ceil(bounds.maxX - bounds.minX);
    const height = Math.ceil(bounds.maxY - bounds.minY);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const canvas = createBakeCanvas(width, height);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-bounds.minX, -bounds.minY);
    for (const seg of walls) {
        if (seg.isDead) continue;
        drawGameMapWall(ctx, seg, baseSpawnX, baseSpawnY, scale);
    }
    return { canvas, minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
}
export function bakeTopologyMapWallCache(walls, minX, minY, maxX, maxY) {
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const canvas = createBakeCanvas(width, height);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    ctx.translate(-minX, -minY);
    for (const seg of walls) {
        if (seg.isDead) continue;
        drawTopologyMapWall(ctx, seg);
    }
    return { canvas, minX, minY, maxX, maxY };
}
export function drawMapWallCache(ctx, cache) {
    if (!cache?.canvas) return;
    ctx.drawImage(cache.canvas, cache.minX, cache.minY);
}
