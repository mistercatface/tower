import { WORLD_SURFACE_DEFAULTS } from "../../Config/world.js";
const WALL_TEXTURE_SEAM_BLEED_PX = WORLD_SURFACE_DEFAULTS.wallTextureBleedPx;
export function drawImageTriangleScalars(ctx, img, s0x, s0y, s1x, s1y, s2x, s2y, d0x, d0y, d1x, d1y, d2x, d2y) {
    let ts0_x = s0x;
    let ts0_y = s0y;
    let ts1_x = s1x;
    let ts1_y = s1y;
    let ts2_x = s2x;
    let ts2_y = s2y;
    const cx = (d0x + d1x + d2x) / 3;
    const cy = (d0y + d1y + d2y) / 3;
    let dx = d0x - cx;
    let dy = d0y - cy;
    let len = Math.hypot(dx, dy) || 1;
    let r0_x = d0x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r0_y = d0y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d1x - cx;
    dy = d1y - cy;
    len = Math.hypot(dx, dy) || 1;
    let r1_x = d1x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r1_y = d1y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    dx = d2x - cx;
    dy = d2y - cy;
    len = Math.hypot(dx, dy) || 1;
    let r2_x = d2x + (dx / len) * WALL_TEXTURE_SEAM_BLEED_PX;
    let r2_y = d2y + (dy / len) * WALL_TEXTURE_SEAM_BLEED_PX;
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
    srcMinX = Math.max(0, srcMinX);
    srcMinY = Math.max(0, srcMinY);
    srcMaxX = Math.min(img.width, srcMaxX);
    srcMaxY = Math.min(img.height, srcMaxY);
    const srcW = srcMaxX - srcMinX;
    const srcH = srcMaxY - srcMinY;
    if (srcW <= 0 || srcH <= 0) return;
    const currentTransform = ctx.getTransform();
    ctx.transform(m11, m12, m21, m22, offsetX, offsetY);
    ctx.drawImage(img, srcMinX, srcMinY, srcW, srcH, srcMinX, srcMinY, srcW, srcH);
    ctx.setTransform(currentTransform);
}
export function drawImageTriangleFlat(ctx, img, srcFlat, dstFlat, i0, i1, i2) {
    drawImageTriangleScalars(
        ctx,
        img,
        srcFlat[i0 * 2],
        srcFlat[i0 * 2 + 1],
        srcFlat[i1 * 2],
        srcFlat[i1 * 2 + 1],
        srcFlat[i2 * 2],
        srcFlat[i2 * 2 + 1],
        dstFlat[i0 * 2],
        dstFlat[i0 * 2 + 1],
        dstFlat[i1 * 2],
        dstFlat[i1 * 2 + 1],
        dstFlat[i2 * 2],
        dstFlat[i2 * 2 + 1],
    );
}
export function drawImageQuadScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y) {
    const diag02 = (d2x - d0x) ** 2 + (d2y - d0y) ** 2;
    const diag13 = (d3x - d1x) ** 2 + (d3y - d1y) ** 2;
    if (diag13 < diag02) {
        drawImageTriangleScalars(ctx, img, sx0, sy0, sx1, sy0, sx0, sy1, d0x, d0y, d1x, d1y, d3x, d3y);
        drawImageTriangleScalars(ctx, img, sx1, sy0, sx1, sy1, sx0, sy1, d1x, d1y, d2x, d2y, d3x, d3y);
        return;
    }
    drawImageTriangleScalars(ctx, img, sx0, sy0, sx1, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y);
    drawImageTriangleScalars(ctx, img, sx0, sy0, sx1, sy1, sx0, sy1, d0x, d0y, d2x, d2y, d3x, d3y);
}
export function drawImageQuadFromFlatRings(ctx, img, sx0, sy0, sx1, sy1, baseRing, topRing, edgeIndex, count) {
    const ai = edgeIndex * 2;
    const bi = ((edgeIndex + 1) % count) * 2;
    drawImageQuadScalars(ctx, img, sx0, sy0, sx1, sy1, baseRing[ai], baseRing[ai + 1], baseRing[bi], baseRing[bi + 1], topRing[bi], topRing[bi + 1], topRing[ai], topRing[ai + 1]);
}
