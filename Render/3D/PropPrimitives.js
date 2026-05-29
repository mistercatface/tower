import {
    projectVertical,
    extrudeRadial,
    pointOnFrustum,
    radiusAtT,
    getHeightSlice,
    extrudeBox,
    isFaceTowardViewer,
    createSideGradient,
} from "./Projection3D.js";

export const DEFAULT_PROP_HEIGHT = 14;
const RADIAL_SEGMENTS = 14;

function drawRadialSideFaces(ctx, projection, px, py, { baseRadius, topRadius, facing, colors, stroke, lineWidth, segments = RADIAL_SEGMENTS }) {
    const { faces, cx, cy, topRadius: resolvedTop } = extrudeRadial(projection, baseRadius, topRadius, facing, segments);

    for (const face of faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;

        ctx.fillStyle = createSideGradient(ctx, face.baseA, face.baseB, face.midAngle, colors);
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

    return { cx, cy, topRadius: resolvedTop, topX: projection.topX, topY: projection.topY };
}

export function drawCylinder(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, topRadius, colors, stroke, lineWidth = 1.0, facing }) {
    const projection = projectVertical(x, y, px, py, height);
    const resolvedTop = topRadius ?? radius * (1 + projection.alpha);
    drawRadialSideFaces(ctx, projection, px, py, {
        baseRadius: radius,
        topRadius: resolvedTop,
        facing,
        colors,
        stroke,
        lineWidth,
    });

    return { projection, orientAngle: facing };
}

export function drawBand(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, t0, t1, fill, stroke, lineWidth = 0.8, facing, topRadius = null }) {
    const projection = projectVertical(x, y, px, py, height);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? radius * (1 + projection.alpha));
    const { cx, cy } = projection;

    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
        const a0 = facing + (i / RADIAL_SEGMENTS) * Math.PI * 2;
        const a1 = facing + ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
        const edgeMidX = (pointOnFrustum(projection, radius, resolvedTop, t0, a0).x + pointOnFrustum(projection, radius, resolvedTop, t0, a1).x) / 2;
        const edgeMidY = (pointOnFrustum(projection, radius, resolvedTop, t0, a0).y + pointOnFrustum(projection, radius, resolvedTop, t0, a1).y) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;

        const p0a = pointOnFrustum(projection, radius, resolvedTop, t0, a0);
        const p0b = pointOnFrustum(projection, radius, resolvedTop, t0, a1);
        const p1a = pointOnFrustum(projection, radius, resolvedTop, t1, a0);
        const p1b = pointOnFrustum(projection, radius, resolvedTop, t1, a1);

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

    const slice1 = getHeightSlice(projection, radiusAtT(radius, resolvedTop, t0), t0);
    const slice2 = getHeightSlice(projection, radiusAtT(radius, resolvedTop, t1), t1);
    return { projection, orientAngle: facing, slice1, slice2 };
}

export function drawCylinderRibs(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, ts, stroke, lineWidth = 1.2, facing, topRadius = null }) {
    const projection = projectVertical(x, y, px, py, height);
    const resolvedTop = topRadius ?? radius * (1 + projection.alpha);
    const { cx, cy } = projection;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    for (const t of ts) {
        for (let i = 0; i < RADIAL_SEGMENTS; i++) {
            const a0 = facing + (i / RADIAL_SEGMENTS) * Math.PI * 2;
            const a1 = facing + ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
            const p0 = pointOnFrustum(projection, radius, resolvedTop, t, a0);
            const p1 = pointOnFrustum(projection, radius, resolvedTop, t, a1);
            const edgeMidX = (p0.x + p1.x) / 2;
            const edgeMidY = (p0.y + p1.y) / 2;
            if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
    }
}

export function drawCap(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, topRadius, capColors, stroke, lineWidth = 1.0, facing = 0 }) {
    const projection = projectVertical(x, y, px, py, height);
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

export function drawSphere(ctx, x, y, px, py, { radius, height, colors, stroke, lineWidth = 0.9, facing }) {
    const blobHeight = height ?? radius * 2.2;
    const projection = projectVertical(x, y, px, py, blobHeight);
    const topRadius = radius * (1 + projection.alpha);
    drawRadialSideFaces(ctx, projection, px, py, {
        baseRadius: radius,
        topRadius,
        facing,
        colors,
        stroke,
        lineWidth,
    });

    const topGrad = ctx.createRadialGradient(
        projection.topX, projection.topY, 0,
        projection.topX, projection.topY, topRadius
    );
    topGrad.addColorStop(0.0, colors.highlight);
    topGrad.addColorStop(0.55, colors.mid);
    topGrad.addColorStop(1.0, colors.shadow);
    ctx.fillStyle = topGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(projection.topX, projection.topY, topRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

export function drawCone(ctx, x, y, px, py, { baseRadius, height, colors, stroke, lineWidth = 1.0, facing }) {
    drawRadialSideFaces(ctx, projectVertical(x, y, px, py, height), px, py, {
        baseRadius,
        topRadius: 0,
        facing,
        colors,
        stroke,
        lineWidth,
    });
}

export function drawStack(ctx, x, y, px, py, { height, segments, facing }) {
    const projection = projectVertical(x, y, px, py, height);
    for (const seg of segments) {
        const slice = getHeightSlice(projection, seg.radius, seg.t);
        drawSphere(ctx, slice.centerX, slice.centerY, px, py, {
            radius: seg.radius,
            height: seg.blobHeight ?? seg.radius * 2.2,
            colors: seg.colors,
            stroke: seg.stroke ?? "#000",
            facing,
        });
    }
}

export function drawBox(ctx, x, y, px, py, { halfSize, height = DEFAULT_PROP_HEIGHT, faceColors, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = 0 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { cx, cy, topX, topY } = projection;
    const box = extrudeBox(projection, halfSize);

    for (const face of box.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;

        ctx.fillStyle = createSideGradient(ctx, face.baseA, face.baseB, facing, faceColors);
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

export function drawBarkLines(ctx, x, y, px, py, { radius, height, ts, stroke, lineWidth = 0.7, taper = 0.12, facing }) {
    const projection = projectVertical(x, y, px, py, height);
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
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;
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
