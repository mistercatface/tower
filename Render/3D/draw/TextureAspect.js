/**
 * Aspect helpers for affine-mapped label quads.
 * d0–d3: BL, BR, TR, TL (same order as drawImageQuad).
 */

function lerpPt(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function labeledQuadScreenAspect(d0, d1, d2, d3) {
    const topW = Math.hypot(d1.x - d0.x, d1.y - d0.y);
    const botW = Math.hypot(d2.x - d3.x, d2.y - d3.y);
    const leftH = Math.hypot(d3.x - d0.x, d3.y - d0.y);
    const rightH = Math.hypot(d2.x - d1.x, d2.y - d1.y);
    const w = (topW + botW) * 0.5;
    const h = (leftH + rightH) * 0.5;
    return w / Math.max(h, 1e-6);
}

/** Shrink quad toward its center; uInset trims left/right, vInset trims top/bottom (0–0.5). */
export function insetQuadEdges(d0, d1, d2, d3, uInset, vInset) {
    let bl = lerpPt(d0, d1, uInset);
    let br = lerpPt(d1, d0, uInset);
    let tl = lerpPt(d3, d2, uInset);
    let tr = lerpPt(d2, d3, uInset);

    bl = lerpPt(bl, tl, vInset);
    br = lerpPt(br, tr, vInset);
    tl = lerpPt(tl, bl, vInset);
    tr = lerpPt(tr, br, vInset);

    return { d0: bl, d1: br, d2: tr, d3: tl };
}

/**
 * Letterbox/pillarbox: map the full texture onto an inset quad so art is not squished or cropped.
 * sx0,sy0 = top-left; sx1,sy1 = bottom-right in image pixel space.
 */
export function containTextureInQuad(sx0, sy0, sx1, sy1, d0, d1, d2, d3) {
    const screenAspect = labeledQuadScreenAspect(d0, d1, d2, d3);
    const texAspect = (sx1 - sx0) / Math.max(sy1 - sy0, 1e-6);

    let uInset = 0;
    let vInset = 0;

    if (texAspect > screenAspect) {
        uInset = (1 - screenAspect / texAspect) * 0.5;
    } else {
        vInset = (1 - texAspect / screenAspect) * 0.5;
    }

    const inset = insetQuadEdges(d0, d1, d2, d3, uInset, vInset);
    return { sx0, sy0, sx1, sy1, ...inset };
}
