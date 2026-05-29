import {
    extrudeRadial,
    extrudeBox,
    pointOnFrustum,
    radiusAtT,
    getHeightSlice,
    getRadialSilhouette,
    traceVisibleArc,
    isFaceTowardViewer,
    createSideGradient,
} from "./Projection3D.js";

export const DEFAULT_PROP_HEIGHT = 14;
export const RADIAL_SEGMENTS = 14;

export function drawCullFace(ctx, face, shadeAngle, { fill, stroke, lineWidth }) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(face.topA.x, face.topA.y);
    ctx.lineTo(face.topB.x, face.topB.y);
    ctx.lineTo(face.baseB.x, face.baseB.y);
    ctx.lineTo(face.baseA.x, face.baseA.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function isFaceVisible(pc, originX, originY, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, pc.px, pc.py);
}

function drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors) {
    const sil = getRadialSilhouette(projection, baseRadius, resolvedTop);
    const { cx, cy, topX, topY, viewAngle } = projection;
    const { perpA, perpB, baseLeft, baseRight, topRight } = sil;

    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y);
    traceVisibleArc(ctx, cx, cy, sil.baseRadius, perpA, perpB, viewAngle);
    if (resolvedTop === 0) {
        ctx.lineTo(topX, topY);
    } else {
        ctx.lineTo(topRight.x, topRight.y);
        traceVisibleArc(ctx, topX, topY, sil.topRadius, perpB, perpA, viewAngle);
    }
    ctx.closePath();

    ctx.fillStyle = createSideGradient(ctx, baseLeft, baseRight, viewAngle + Math.PI, colors);
    ctx.fill();
}

function drawFacetedRadialBody(ctx, pc, projection, baseRadius, topRadius, facing, segments, colors, stroke, lineWidth) {
    const { faces, cx, cy } = extrudeRadial(projection, baseRadius, topRadius, facing, segments);

    for (const face of faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (!isFaceVisible(pc, cx, cy, edgeMidX, edgeMidY)) continue;

        drawCullFace(ctx, face, face.midAngle, {
            fill: createSideGradient(ctx, face.baseA, face.baseB, face.midAngle, colors),
            stroke,
            lineWidth,
        });
    }
}

export function drawExtrudedRadial(ctx, pc, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const {
        topRadius,
        height,
        facing = pc.facing,
        colors,
        stroke,
        lineWidth = 1.0,
        segments = RADIAL_SEGMENTS,
        bodyMode = "silhouette",
    } = options;
    const projection = pc.project(height);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));

    if (bodyMode === "silhouette") {
        drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors);
    } else {
        drawFacetedRadialBody(ctx, pc, projection, baseRadius, topRadius, facing, segments, colors, stroke, lineWidth);
    }

    return { projection, orientAngle: facing };
}

export function drawRadialBand(ctx, pc, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const {
        topRadius = null,
        height = DEFAULT_PROP_HEIGHT,
        t0,
        t1,
        fill,
        stroke,
        lineWidth = 0.8,
        facing = pc.facing,
        segments = RADIAL_SEGMENTS,
    } = options;
    const projection = pc.project(height);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    const { cx, cy } = projection;

    for (let i = 0; i < segments; i++) {
        const a0 = facing + (i / segments) * Math.PI * 2;
        const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
        const edgeMidX = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).x + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).x) / 2;
        const edgeMidY = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).y + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).y) / 2;
        if (!isFaceVisible(pc, cx, cy, edgeMidX, edgeMidY)) continue;

        const p0a = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0);
        const p0b = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1);
        const p1a = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a0);
        const p1b = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a1);

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(p0a.x, p0a.y);
        ctx.lineTo(p0b.x, p0b.y);
        ctx.lineTo(p1b.x, p1b.y);
        ctx.lineTo(p1a.x, p1a.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    const slice1 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t0), t0);
    const slice2 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t1), t1);
    return { projection, orientAngle: facing, slice1, slice2 };
}

export function drawRadialRibs(ctx, pc, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const {
        topRadius = null,
        height = DEFAULT_PROP_HEIGHT,
        ts,
        stroke,
        lineWidth = 1.2,
        facing = pc.facing,
        segments = RADIAL_SEGMENTS,
    } = options;
    const projection = pc.project(height);
    const resolvedTop = topRadius ?? baseRadius * (1 + projection.alpha);
    const { cx, cy } = projection;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    for (const t of ts) {
        for (let i = 0; i < segments; i++) {
            const a0 = facing + (i / segments) * Math.PI * 2;
            const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
            const p0 = pointOnFrustum(projection, baseRadius, resolvedTop, t, a0);
            const p1 = pointOnFrustum(projection, baseRadius, resolvedTop, t, a1);
            const edgeMidX = (p0.x + p1.x) / 2;
            const edgeMidY = (p0.y + p1.y) / 2;
            if (!isFaceVisible(pc, cx, cy, edgeMidX, edgeMidY)) continue;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
    }
}

export function drawRadialCap(ctx, pc, {
    radius,
    height = DEFAULT_PROP_HEIGHT,
    topRadius,
    capColors,
    stroke,
    lineWidth = 1.0,
}) {
    const projection = pc.project(height);
    const { topX, topY, alpha } = projection;
    const capRadius = topRadius ?? radius * (1 + alpha);

    const topGrad = ctx.createRadialGradient(topX, topY, 0, topX, topY, capRadius);
    topGrad.addColorStop(0.0, capColors.inner);
    topGrad.addColorStop(0.7, capColors.mid);
    topGrad.addColorStop(1.0, capColors.outer);

    ctx.fillStyle = topGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(topX, topY, capRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    return { projection, topX, topY, capRadius };
}

/** Round foliage blob anchored on a parent projection height slice (tree canopy). */
export function drawFoliageBlob(ctx, projection, {
    t,
    radius,
    offsetX = 0,
    offsetY = 0,
    colors,
    stroke,
    lineWidth = 0.9,
}) {
    const slice = getHeightSlice(projection, radius, t);
    const scale = 1 + projection.alpha * t;
    const centerX = slice.centerX + offsetX * scale;
    const centerY = slice.centerY + offsetY * scale;
    const { viewAngle } = projection;
    const litX = centerX + Math.cos(viewAngle + Math.PI) * slice.size * 0.18;
    const litY = centerY + Math.sin(viewAngle + Math.PI) * slice.size * 0.18;

    const grad = ctx.createRadialGradient(litX, litY, slice.size * 0.08, centerX, centerY, slice.size);
    grad.addColorStop(0.0, colors.highlight);
    grad.addColorStop(0.55, colors.mid);
    grad.addColorStop(1.0, colors.shadow);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, slice.size, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

export function drawExtrudedBox(ctx, pc, {
    halfSize,
    height = DEFAULT_PROP_HEIGHT,
    faceColors,
    topColors,
    stroke,
    plankTs,
    topCross,
    lineWidth = 1.0,
    facing = pc.facing,
}) {
    const projection = pc.project(height);
    const { cx, cy, topX, topY } = projection;
    const box = extrudeBox(projection, halfSize);

    for (const face of box.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (!isFaceVisible(pc, cx, cy, edgeMidX, edgeMidY)) continue;

        drawCullFace(ctx, face, facing, {
            fill: createSideGradient(ctx, face.baseA, face.baseB, facing, faceColors),
            stroke,
            lineWidth,
        });

        if (plankTs) {
            ctx.strokeStyle = plankTs.stroke ?? "rgba(0,0,0,0.55)";
            ctx.lineWidth = plankTs.lineWidth ?? 0.8;
            for (const t of plankTs.values) {
                const xA = face.topA.x + (face.baseA.x - face.topA.x) * t;
                const yA = face.topA.y + (face.baseA.y - face.topA.y) * t;
                const xB = face.topB.x + (face.baseB.x - face.topB.x) * t;
                const yB = face.topB.y + (face.baseB.y - face.topB.y) * t;
                ctx.beginPath();
                ctx.moveTo(xA, yA);
                ctx.lineTo(xB, yB);
                ctx.stroke();
            }
        }
    }

    const topGrad = ctx.createLinearGradient(
        topX - box.topHalfSize, topY - box.topHalfSize,
        topX + box.topHalfSize, topY + box.topHalfSize
    );
    topGrad.addColorStop(0.0, topColors.light);
    topGrad.addColorStop(0.5, topColors.mid);
    topGrad.addColorStop(1.0, topColors.dark);

    ctx.fillStyle = topGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(box.topCorners[0].x, box.topCorners[0].y);
    for (let i = 1; i < box.topCorners.length; i++) {
        ctx.lineTo(box.topCorners[i].x, box.topCorners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (topCross) {
        ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
        ctx.lineWidth = topCross.lineWidth ?? 0.8;
        ctx.beginPath();
        ctx.moveTo(box.topCorners[0].x, (box.topCorners[0].y + box.topCorners[2].y) / 2);
        ctx.lineTo(box.topCorners[1].x, (box.topCorners[1].y + box.topCorners[3].y) / 2);
        ctx.moveTo((box.topCorners[0].x + box.topCorners[1].x) / 2, box.topCorners[0].y);
        ctx.lineTo((box.topCorners[2].x + box.topCorners[3].x) / 2, box.topCorners[2].y);
        ctx.stroke();
    }
}

export function drawBarkLines(ctx, pc, {
    radius,
    height,
    ts,
    stroke,
    lineWidth = 0.7,
    taper = 0.12,
    facing = pc.facing,
}) {
    const projection = pc.project(height);
    const resolvedTop = radius * (1 + projection.alpha);
    const { cx, cy } = projection;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    for (const t of ts) {
        const sliceRadius = radiusAtT(radius * (1 - t * taper), resolvedTop * (1 - t * taper), t);
        const slice = getHeightSlice(projection, sliceRadius, t);
        const p0 = pointOnFrustum(projection, radius * (1 - t * taper), resolvedTop * (1 - t * taper), t, facing);
        const p1 = pointOnFrustum(projection, radius * (1 - t * taper), resolvedTop * (1 - t * taper), t, facing + Math.PI / 2);
        const edgeMidX = (p0.x + p1.x) / 2;
        const edgeMidY = (p0.y + p1.y) / 2;
        if (!isFaceVisible(pc, cx, cy, edgeMidX, edgeMidY)) continue;
        ctx.beginPath();
        ctx.moveTo(
            slice.centerX - Math.cos(facing) * slice.size * 0.15,
            slice.centerY - Math.sin(facing) * slice.size * 0.15
        );
        ctx.lineTo(
            slice.centerX + Math.cos(facing + Math.PI / 2) * slice.size * 0.35,
            slice.centerY + Math.sin(facing + Math.PI / 2) * slice.size * 0.35
        );
        ctx.stroke();
    }
}
