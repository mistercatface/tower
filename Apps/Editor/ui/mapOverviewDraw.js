/**
 * @param {number} wx
 * @param {number} wy
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 */
export function worldToScreen(wx, wy, cache, displayW, displayH) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    return { x: ((wx - cache.minX) / mapW) * displayW, y: ((wy - cache.minY) / mapH) * displayH };
}
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 */
export function screenToWorld(sx, sy, cache, displayW, displayH) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    return { x: cache.minX + (sx / displayW) * mapW, y: cache.minY + (sy / displayH) * mapH };
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache @param {number} displayW @param {number} displayH @param {string} strokeStyle @param {number} [lineWidth] @param {number[]} [dash] */
export function drawWorldCircle(ctx, cx, cy, radius, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0 || radius <= 0) return;
    const center = worldToScreen(cx, cy, cache, displayW, displayH);
    const rx = (radius / mapW) * displayW;
    const ry = (radius / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @param {string} strokeStyle
 * @param {number} [lineWidth]
 * @param {number[]} [dash]
 */
export function drawWorldBoundsBox(ctx, bounds, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0) return;
    const x = ((bounds.minX - cache.minX) / mapW) * displayW;
    const y = ((bounds.minY - cache.minY) / mapH) * displayH;
    const w = ((bounds.maxX - bounds.minX) / mapW) * displayW;
    const h = ((bounds.maxY - bounds.minY) / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}
