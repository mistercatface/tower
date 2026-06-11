const TOPOLOGY_WALL_THICKNESS = 20;
function createBakeCanvas(width, height) {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return new OffscreenCanvas(w, h);
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
