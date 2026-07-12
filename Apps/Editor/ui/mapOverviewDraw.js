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
const EDGE_HIT_PX = 8;
/**
 * @param {number} sx
 * @param {number} sy
 * @param {import("../../../Libraries/Math/Aabb2D.js").Aabb2D} bounds
 * @param {import("../../../Libraries/Render/map/labMapCaches.js").ObstacleOverviewCache} cache
 * @param {number} displayW
 * @param {number} displayH
 * @param {{ moveOnly?: boolean }} [options]
 * @returns {"move" | "resize-e" | "resize-w" | "resize-n" | "resize-s" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw" | null}
 */
export function hitTestRectAabbF32(sx, sy, buf, o, cache, displayW, displayH, options = {}) {
    const { moveOnly = false } = options;
    const tl = worldToScreen(buf[o], buf[o + 1], cache, displayW, displayH);
    const br = worldToScreen(buf[o + 2], buf[o + 3], cache, displayW, displayH);
    const left = tl.x;
    const top = tl.y;
    const right = br.x;
    const bottom = br.y;
    const insideX = sx >= left && sx <= right;
    const insideY = sy >= top && sy <= bottom;
    if (!insideX || !insideY) return null;
    if (moveOnly) return "move";
    const nearLeft = Math.abs(sx - left) <= EDGE_HIT_PX;
    const nearRight = Math.abs(sx - right) <= EDGE_HIT_PX;
    const nearTop = Math.abs(sy - top) <= EDGE_HIT_PX;
    const nearBottom = Math.abs(sy - bottom) <= EDGE_HIT_PX;
    if (nearRight && nearBottom) return "resize-se";
    if (nearLeft && nearBottom) return "resize-sw";
    if (nearRight && nearTop) return "resize-ne";
    if (nearLeft && nearTop) return "resize-nw";
    if (nearRight) return "resize-e";
    if (nearLeft) return "resize-w";
    if (nearBottom) return "resize-s";
    if (nearTop) return "resize-n";
    return "move";
}
/** @param {"move" | "resize-e" | "resize-w" | "resize-n" | "resize-s" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw" | "resize-outer" | "resize-inner" | null} mode */
export function overviewBoundsCursor(mode) {
    if (!mode) return "default";
    if (mode === "move") return "move";
    if (mode === "resize-outer" || mode === "resize-inner") return "nwse-resize";
    if (mode === "resize-e" || mode === "resize-w") return "ew-resize";
    if (mode === "resize-n" || mode === "resize-s") return "ns-resize";
    return "nwse-resize";
}
export function drawWorldBoundsBoxF32(ctx, buf, o, cache, displayW, displayH, strokeStyle, lineWidth = 2, dash = null) {
    const mapW = cache.maxX - cache.minX;
    const mapH = cache.maxY - cache.minY;
    if (mapW <= 0 || mapH <= 0) return;
    const x = ((buf[o] - cache.minX) / mapW) * displayW;
    const y = ((buf[o + 1] - cache.minY) / mapH) * displayH;
    const w = ((buf[o + 2] - buf[o]) / mapW) * displayW;
    const h = ((buf[o + 3] - buf[o + 1]) / mapH) * displayH;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}
