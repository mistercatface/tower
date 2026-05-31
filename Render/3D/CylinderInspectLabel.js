/**
 * Cylindrical label overlay for inspect view — drawn after solid mesh.
 * Avoids hundreds of mesh texture tris that leave clip gaps between slices.
 */
import {
    transformPoint,
    projectPoint,
    faceVisible,
    triangleNormal,
    averageDepth,
} from "./Mesh3D.js";

function cylinderPoint(y, angle, radius) {
    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
}

function drawImageTriangle(ctx, img, s0, s1, s2, d0, d1, d2, underlay) {
    let ts0 = s0;
    let ts1 = s1;
    let ts2 = s2;
    let td0 = d0;
    let td1 = d1;
    let td2 = d2;

    let denom = ts0.x * (ts1.y - ts2.y) + ts1.x * (ts2.y - ts0.y) + ts2.x * (ts0.y - ts1.y);
    if (Math.abs(denom) < 0.001) return;

    if (denom < 0) {
        ts1 = s2;
        ts2 = s1;
        td1 = d2;
        td2 = d1;
        denom = -denom;
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

    const m11 = (td0.x * (ts1.y - ts2.y) + td1.x * (ts2.y - ts0.y) + td2.x * (ts0.y - ts1.y)) / denom;
    const m12 = (td0.y * (ts1.y - ts2.y) + td1.y * (ts2.y - ts0.y) + td2.y * (ts0.y - ts1.y)) / denom;
    const m21 = (td0.x * (ts2.x - ts1.x) + td1.x * (ts0.x - ts2.x) + td2.x * (ts1.x - ts0.x)) / denom;
    const m22 = (td0.y * (ts2.x - ts1.x) + td1.y * (ts0.x - ts2.x) + td2.y * (ts1.x - ts0.x)) / denom;
    const dx = td0.x - m11 * ts0.x - m21 * ts0.y;
    const dy = td0.y - m12 * ts0.x - m22 * ts0.y;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

function drawImageQuad(ctx, img, sx0, sy0, sx1, sy1, d0, d1, d2, d3, underlay) {
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }, d0, d1, d2, underlay);
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }, d0, d2, d3, underlay);
}

/**
 * Wrap a label image around a cylindrical band using the inspect camera.
 * Only front-facing strips are drawn, painter-sorted by depth.
 */
export function drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
    img,
    halfHeight = 1.05,
    bodyRadius = 0.5,
    y0 = 0.22,
    y1 = 0.78,
    angleCenter = -Math.PI / 2,
    angleSpan = Math.PI * 1.15,
    radialSegments = 20,
    radiusInflate = 1.004,
    underlay = "#B4BAC2",
    referenceDepth = 420,
    screenScale = scale * 88,
}) {
    if (!img) return;

    const camera = { cx, cy, referenceDepth, screenScale };
    const yBot = -halfHeight + halfHeight * 2 * y0;
    const yTop = -halfHeight + halfHeight * 2 * y1;
    const halfSpan = angleSpan * 0.5;
    const radius = bodyRadius * radiusInflate;
    const iw = img.width;
    const ih = img.height;

    const strips = [];

    for (let i = 0; i < radialSegments; i++) {
        const u0 = i / radialSegments;
        const u1 = (i + 1) / radialSegments;
        const a0 = angleCenter - halfSpan + u0 * angleSpan;
        const a1 = angleCenter - halfSpan + u1 * angleSpan;

        const model = [
            cylinderPoint(yTop, a0, radius),
            cylinderPoint(yTop, a1, radius),
            cylinderPoint(yBot, a1, radius),
            cylinderPoint(yBot, a0, radius),
        ];

        const view = model.map((p) => transformPoint(p, yaw, pitch));
        const normal = triangleNormal(view[0], view[1], view[2]);
        if (!faceVisible(normal)) continue;

        const screen = view.map((p) => projectPoint(p, camera));
        if (screen.some((p) => !p)) continue;

        strips.push({
            depth: averageDepth(view[0], view[1], view[2]),
            sx0: u0 * iw,
            sx1: u1 * iw,
            d0: screen[0],
            d1: screen[1],
            d2: screen[2],
            d3: screen[3],
        });
    }

    strips.sort((a, b) => b.depth - a.depth);

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (const strip of strips) {
        drawImageQuad(ctx, img, strip.sx0, 0, strip.sx1, ih, strip.d0, strip.d1, strip.d2, strip.d3, underlay);
    }
    ctx.imageSmoothingEnabled = prevSmooth;
}
