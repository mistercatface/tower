import { inflateTri } from "../../../Math/Screen2D.js";

/**
 * Affine-map an image triangle onto a screen triangle.
 * @param {{ underlay?: string|null, bleedPx?: number, skipClip?: boolean }} [opts]
 */
export function drawImageTriangle(ctx, img, s0, s1, s2, d0, d1, d2, opts = {}) {
    const { underlay = null, bleedPx = 0, skipClip = false } = opts;

    let ts0 = s0;
    let ts1 = s1;
    let ts2 = s2;
    let [td0, td1, td2] = bleedPx > 0
        ? inflateTri(d0, d1, d2, bleedPx)
        : [d0, d1, d2];

    let denom = ts0.x * (ts1.y - ts2.y) + ts1.x * (ts2.y - ts0.y) + ts2.x * (ts0.y - ts1.y);
    if (Math.abs(denom) < 0.001) return;

    if (denom < 0) {
        ts1 = s2;
        ts2 = s1;
        td1 = td2;
        td2 = d1;
        denom = -denom;
    }

    const m11 = (td0.x * (ts1.y - ts2.y) + td1.x * (ts2.y - ts0.y) + td2.x * (ts0.y - ts1.y)) / denom;
    const m12 = (td0.y * (ts1.y - ts2.y) + td1.y * (ts2.y - ts0.y) + td2.y * (ts0.y - ts1.y)) / denom;
    const m21 = (td0.x * (ts2.x - ts1.x) + td1.x * (ts0.x - ts2.x) + td2.x * (ts1.x - ts0.x)) / denom;
    const m22 = (td0.y * (ts2.x - ts1.x) + td1.y * (ts0.x - ts2.x) + td2.y * (ts1.x - ts0.x)) / denom;
    const dx = td0.x - m11 * ts0.x - m21 * ts0.y;
    const dy = td0.y - m12 * ts0.x - m22 * ts0.y;

    if (skipClip) {
        ctx.save();
        if (underlay) {
            ctx.beginPath();
            ctx.moveTo(td0.x, td0.y);
            ctx.lineTo(td1.x, td1.y);
            ctx.lineTo(td2.x, td2.y);
            ctx.closePath();
            ctx.fillStyle = underlay;
            ctx.fill();
        }
        ctx.transform(m11, m12, m21, m22, dx, dy);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(td0.x, td0.y);
    ctx.lineTo(td1.x, td1.y);
    ctx.lineTo(td2.x, td2.y);
    ctx.closePath();
    ctx.clip();

    if (underlay) {
        ctx.fillStyle = underlay;
        ctx.fill();
    }

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

/** Affine-map an image quad onto a screen quad (two triangles). */
export function drawImageQuad(ctx, img, sx0, sy0, sx1, sy1, d0, d1, d2, d3, opts = {}) {
    const diag02 = (d2.x - d0.x) ** 2 + (d2.y - d0.y) ** 2;
    const diag13 = (d3.x - d1.x) ** 2 + (d3.y - d1.y) ** 2;
    if (diag13 < diag02) {
        drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx0, y: sy1 }, d0, d1, d3, opts);
        drawImageTriangle(ctx, img, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }, d1, d2, d3, opts);
        return;
    }
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }, d0, d1, d2, opts);
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }, d0, d2, d3, opts);
}
