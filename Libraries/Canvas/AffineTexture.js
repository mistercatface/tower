import { WORLD_SURFACE_DEFAULTS } from "../../Config/world.js";
const WALL_TEXTURE_SEAM_BLEED_PX = WORLD_SURFACE_DEFAULTS.wallTextureBleedPx;
const sPoint0 = { x: 0, y: 0 };
const sPoint1 = { x: 0, y: 0 };
const sPoint2 = { x: 0, y: 0 };
const sPoint3 = { x: 0, y: 0 };
export function drawImageTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
    let ts0_x = s0.x,
        ts0_y = s0.y;
    let ts1_x = s1.x,
        ts1_y = s1.y;
    let ts2_x = s2.x,
        ts2_y = s2.y;
    const cx = (d0.x + d1.x + d2.x) / 3;
    const cy = (d0.y + d1.y + d2.y) / 3;
    let dx = d0.x - cx;
    let dy = d0.y - cy;
    let len = Math.hypot(dx, dy) || 1;
    let r0_x = d0.x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r0_y = d0.y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d1.x - cx;
    dy = d1.y - cy;
    len = Math.hypot(dx, dy) || 1;
    let r1_x = d1.x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r1_y = d1.y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d2.x - cx;
    dy = d2.y - cy;
    len = Math.hypot(dx, dy) || 1;
    let r2_x = d2.x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r2_y = d2.y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let denom = ts0_x * (ts1_y - ts2_y) + ts1_x * (ts2_y - ts0_y) + ts2_x * (ts0_y - ts1_y);
    if (Math.abs(denom) < 0.001) return;
    if (denom < 0) {
        const tmp_sx = ts1_x;
        const tmp_sy = ts1_y;
        ts1_x = ts2_x;
        ts1_y = ts2_y;
        ts2_x = tmp_sx;
        ts2_y = tmp_sy;
        const tmp_rx = r1_x;
        const tmp_ry = r1_y;
        r1_x = r2_x;
        r1_y = r2_y;
        r2_x = tmp_rx;
        r2_y = tmp_ry;
        denom = -denom;
    }
    const m11 = (r0_x * (ts1_y - ts2_y) + r1_x * (ts2_y - ts0_y) + r2_x * (ts0_y - ts1_y)) / denom;
    const m12 = (r0_y * (ts1_y - ts2_y) + r1_y * (ts2_y - ts0_y) + r2_y * (ts0_y - ts1_y)) / denom;
    const m21 = (r0_x * (ts2_x - ts1_x) + r1_x * (ts0_x - ts2_x) + r2_x * (ts1_x - ts0_x)) / denom;
    const m22 = (r0_y * (ts2_x - ts1_x) + r1_y * (ts0_x - ts2_x) + r2_y * (ts1_x - ts0_x)) / denom;
    const offsetX = r0_x - m11 * ts0_x - m21 * ts0_y;
    const offsetY = r0_y - m12 * ts0_x - m22 * ts0_y;
    let srcMinX = Math.floor(Math.min(ts0_x, ts1_x, ts2_x));
    let srcMinY = Math.floor(Math.min(ts0_y, ts1_y, ts2_y));
    let srcMaxX = Math.ceil(Math.max(ts0_x, ts1_x, ts2_x));
    let srcMaxY = Math.ceil(Math.max(ts0_y, ts1_y, ts2_y));
    if (img.width !== undefined && img.height !== undefined) {
        srcMinX = Math.max(0, srcMinX);
        srcMinY = Math.max(0, srcMinY);
        srcMaxX = Math.min(img.width, srcMaxX);
        srcMaxY = Math.min(img.height, srcMaxY);
    }
    const srcW = srcMaxX - srcMinX;
    const srcH = srcMaxY - srcMinY;
    if (srcW <= 0 || srcH <= 0) return;
    const currentTransform = ctx.getTransform();
    ctx.transform(m11, m12, m21, m22, offsetX, offsetY);
    ctx.drawImage(img, srcMinX, srcMinY, srcW, srcH, srcMinX, srcMinY, srcW, srcH);
    ctx.setTransform(currentTransform);
}
export function drawImageQuad(ctx, img, sx0, sy0, sx1, sy1, d0, d1, d2, d3) {
    const diag02 = (d2.x - d0.x) ** 2 + (d2.y - d0.y) ** 2;
    const diag13 = (d3.x - d1.x) ** 2 + (d3.y - d1.y) ** 2;
    if (diag13 < diag02) {
        sPoint0.x = sx0;
        sPoint0.y = sy0;
        sPoint1.x = sx1;
        sPoint1.y = sy0;
        sPoint2.x = sx0;
        sPoint2.y = sy1;
        sPoint3.x = sx1;
        sPoint3.y = sy1;
        drawImageTriangle(ctx, img, sPoint0, sPoint1, sPoint2, d0, d1, d3);
        drawImageTriangle(ctx, img, sPoint1, sPoint3, sPoint2, d1, d2, d3);
        return;
    }
    sPoint0.x = sx0;
    sPoint0.y = sy0;
    sPoint1.x = sx1;
    sPoint1.y = sy0;
    sPoint2.x = sx1;
    sPoint2.y = sy1;
    sPoint3.x = sx0;
    sPoint3.y = sy1;
    drawImageTriangle(ctx, img, sPoint0, sPoint1, sPoint2, d0, d1, d2);
    drawImageTriangle(ctx, img, sPoint0, sPoint2, sPoint3, d0, d2, d3);
}
