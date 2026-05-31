/**
 * Cylindrical label overlay for inspect view.
 * Small grid cells + edge bleed hide affine gaps; backing fill hides black show-through.
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

function inflateTri(d0, d1, d2, px) {
    const cx = (d0.x + d1.x + d2.x) / 3;
    const cy = (d0.y + d1.y + d2.y) / 3;
    const puff = (p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
    };
    return [puff(d0), puff(d1), puff(d2)];
}

function drawImageTriangle(ctx, img, s0, s1, s2, d0, d1, d2, underlay, bleedPx) {
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

function drawImageQuad(ctx, img, sx0, sy0, sx1, sy1, d0, d1, d2, d3, underlay, bleedPx) {
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }, d0, d1, d2, underlay, bleedPx);
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }, d0, d2, d3, underlay, bleedPx);
}

function drawBackingHull(ctx, points, color) {
    if (points.length < 3) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * Wrap a label image around a cylindrical band using the inspect camera.
 */
export function drawInspectCylindricalLabel(ctx, cx, cy, scale, yaw, pitch, {
    img,
    halfHeight = 1.05,
    bodyRadius = 0.5,
    y0 = 0.22,
    y1 = 0.78,
    angleCenter = -Math.PI / 2,
    angleSpan = Math.PI * 1.15,
    radialSegments = 10,
    verticalSegments = 18,
    radiusInflate = 1.006,
    underlay = "#B4BAC2",
    referenceDepth = 420,
    screenScale = scale * 88,
    uvBleed = 1.5,
    screenBleed = 1.25,
} = {}) {
    if (!img) return;

    const camera = { cx, cy, referenceDepth, screenScale };
    const yBot = -halfHeight + halfHeight * 2 * y0;
    const yTop = -halfHeight + halfHeight * 2 * y1;
    const halfSpan = angleSpan * 0.5;
    const radius = bodyRadius * radiusInflate;
    const iw = img.width;
    const ih = img.height;

    const cells = [];
    const hullTop = [];
    const hullBot = [];

    for (let ri = 0; ri < radialSegments; ri++) {
        const u0 = ri / radialSegments;
        const u1 = (ri + 1) / radialSegments;
        const a0 = angleCenter - halfSpan + u0 * angleSpan;
        const a1 = angleCenter - halfSpan + u1 * angleSpan;

        for (let vi = 0; vi < verticalSegments; vi++) {
            const v0 = vi / verticalSegments;
            const v1 = (vi + 1) / verticalSegments;
            const yt = yTop + (yBot - yTop) * v0;
            const yb = yTop + (yBot - yTop) * v1;

            const model = [
                cylinderPoint(yt, a0, radius),
                cylinderPoint(yt, a1, radius),
                cylinderPoint(yb, a1, radius),
                cylinderPoint(yb, a0, radius),
            ];

            const view = model.map((p) => transformPoint(p, yaw, pitch));
            const normal = triangleNormal(view[0], view[1], view[2]);
            if (!faceVisible(normal)) continue;

            const screen = view.map((p) => projectPoint(p, camera));
            if (screen.some((p) => !p)) continue;

            const sx0 = u0 * iw - (ri > 0 ? uvBleed : 0);
            const sx1 = u1 * iw + (ri < radialSegments - 1 ? uvBleed : 0);
            const sy0 = v0 * ih - (vi > 0 ? uvBleed : 0);
            const sy1 = v1 * ih + (vi < verticalSegments - 1 ? uvBleed : 0);

            cells.push({
                depth: averageDepth(view[0], view[1], view[2]),
                sx0, sy0, sx1, sy1,
                d0: screen[0],
                d1: screen[1],
                d2: screen[2],
                d3: screen[3],
            });

            if (vi === 0) {
                if (ri === 0) hullTop.push(screen[0]);
                hullTop.push(screen[1]);
            }
            if (vi === verticalSegments - 1) {
                if (ri === 0) hullBot.push(screen[3]);
                hullBot.push(screen[2]);
            }
        }
    }

    if (cells.length === 0) return;

    drawBackingHull(ctx, [...hullTop, ...hullBot.slice().reverse()], underlay);

    cells.sort((a, b) => b.depth - a.depth);

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    for (const cell of cells) {
        drawImageQuad(
            ctx, img,
            cell.sx0, cell.sy0, cell.sx1, cell.sy1,
            cell.d0, cell.d1, cell.d2, cell.d3,
            underlay,
            screenBleed,
        );
    }
    ctx.imageSmoothingEnabled = prevSmooth;
}
