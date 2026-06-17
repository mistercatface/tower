/**
 * Low-level Canvas2D path tracing — geometry only, no fill/stroke/style.
 * Call inside ctx.beginPath() (or use helpers that call beginPath for you).
 *
 * Compound clips: call traceClosedPolygon / traceAabbRect multiple times on one path, then clip once.
 */
export const TAU = Math.PI * 2;
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function traceCircle(ctx, cx, cy, radius) {
    ctx.arc(cx, cy, radius, 0, TAU);
}
/** @param {CanvasRenderingContext2D} ctx */
export function traceSegment(ctx, x0, y0, x1, y1) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function traceOpenPolyline(ctx, points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
}
/**
 * Closed ring from points. Safe to call multiple times on one path for compound clips.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }[]} points
 */
export function traceClosedPolygon(ctx, points) {
    traceClosedPolygonCount(ctx, points, points.length);
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points @param {number} count */
export function traceClosedPolygonCount(ctx, points, count) {
    if (count < 3) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < count; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} ox @param {number} oy @param {{ x: number, y: number }[]} points */
export function traceClosedPolygonTranslated(ctx, ox, oy, points) {
    if (points.length < 3) return;
    ctx.moveTo(ox + points[0].x, oy + points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(ox + points[i].x, oy + points[i].y);
    ctx.closePath();
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }} p0 @param {{ x: number, y: number }} p1 @param {{ x: number, y: number }} p2 @param {{ x: number, y: number }} p3 */
export function traceQuad(ctx, p0, p1, p2, p3) {
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
}
/** Flat [x0,y0, x1,y1, ...] quad with consistent winding; does not close the path. */
export function traceWoundFlatQuad(ctx, flatVerts, vertCount) {
    const cross = (flatVerts[2] - flatVerts[0]) * (flatVerts[5] - flatVerts[3]) - (flatVerts[3] - flatVerts[1]) * (flatVerts[4] - flatVerts[2]);
    ctx.moveTo(flatVerts[0], flatVerts[1]);
    if (cross >= 0) for (let p = 1; p < vertCount; p++) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
    else for (let p = vertCount - 1; p > 0; p--) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {{ x: number, y: number }[] | null | undefined} points @param {number} endX @param {number} endY */
export function tracePolylineFrom(ctx, x0, y0, points, endX, endY) {
    ctx.moveTo(x0, y0);
    if (points?.length) {
        for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        const last = points[points.length - 1];
        if (Math.hypot(last.x - endX, last.y - endY) > 0.5) ctx.lineTo(endX, endY);
    } else ctx.lineTo(endX, endY);
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../Math/Aabb2D.js").Aabb2D} box */
export function traceAabbRect(ctx, { minX, minY, maxX, maxY }) {
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius @param {number} startAngle @param {number} endAngle @param {boolean} [counterclockwise] */
export function traceArc(ctx, cx, cy, radius, startAngle, endAngle, counterclockwise = false) {
    ctx.arc(cx, cy, radius, startAngle, endAngle, counterclockwise);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function strokeCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function fillCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.fill();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} radius */
export function fillStrokeCircle(ctx, cx, cy, radius) {
    ctx.beginPath();
    traceCircle(ctx, cx, cy, radius);
    ctx.fill();
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
export function strokeSegment(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    traceSegment(ctx, x0, y0, x1, y1);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function strokeOpenPolyline(ctx, points) {
    ctx.beginPath();
    traceOpenPolyline(ctx, points);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {{ x: number, y: number }[] | null | undefined} points @param {number} endX @param {number} endY */
export function strokePolylineFrom(ctx, x0, y0, points, endX, endY) {
    ctx.beginPath();
    tracePolylineFrom(ctx, x0, y0, points, endX, endY);
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function fillClosedPolygon(ctx, points) {
    ctx.beginPath();
    traceClosedPolygon(ctx, points);
    ctx.fill();
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} points */
export function fillStrokeClosedPolygon(ctx, points) {
    ctx.beginPath();
    traceClosedPolygon(ctx, points);
    ctx.fill();
    ctx.stroke();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} ox @param {number} oy @param {{ x: number, y: number }[]} points */
export function fillStrokeClosedPolygonTranslated(ctx, ox, oy, points) {
    ctx.beginPath();
    traceClosedPolygonTranslated(ctx, ox, oy, points);
    ctx.fill();
    ctx.stroke();
}
/**
 * One path, one clip. `buildPath` traces subpaths on a fresh path; return false to skip clip.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx: CanvasRenderingContext2D) => boolean | void} buildPath
 * @returns {boolean}
 */
export function clipToPath(ctx, buildPath) {
    ctx.beginPath();
    if (buildPath(ctx) === false) return false;
    ctx.clip();
    return true;
}
/** @param {CanvasRenderingContext2D} ctx @param {import("../Math/Aabb2D.js").Aabb2D} box */
export function clipToAabb(ctx, box) {
    clipToPath(ctx, (ctx) => {
        traceAabbRect(ctx, box);
    });
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx: CanvasRenderingContext2D) => boolean | void} buildPath
 * @param {(ctx: CanvasRenderingContext2D) => void} draw
 * @returns {boolean}
 */
export function withClip(ctx, buildPath, draw) {
    ctx.save();
    if (!clipToPath(ctx, buildPath)) {
        ctx.restore();
        return false;
    }
    draw(ctx);
    ctx.restore();
    return true;
}
