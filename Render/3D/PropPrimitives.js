import {
    projectVertical,
    getRadialSilhouette,
    getHeightSlice,
    extrudeBox,
    isFaceTowardViewer,
    createSideGradient,
} from "./Projection3D.js";

export const DEFAULT_PROP_HEIGHT = 14;

export function drawCylinder(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, topRadius, colors, stroke, lineWidth = 1.0 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { cx, cy, viewAngle } = projection;
    const { baseLeft, baseRight, topLeft, topRight } = getRadialSilhouette(projection, radius, topRadius);

    ctx.fillStyle = createSideGradient(ctx, baseLeft, baseRight, viewAngle, colors);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.arc(cx, cy, radius, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return { projection, viewAngle };
}

export function drawBand(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, t0, t1, fill, stroke, lineWidth = 0.8 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { viewAngle } = projection;
    const slice1 = getHeightSlice(projection, radius, t0);
    const slice2 = getHeightSlice(projection, radius, t1);

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(slice1.centerX, slice1.centerY, slice1.size, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
    ctx.lineTo(
        slice2.centerX + Math.cos(viewAngle + Math.PI / 2) * slice2.size,
        slice2.centerY + Math.sin(viewAngle + Math.PI / 2) * slice2.size
    );
    ctx.arc(slice2.centerX, slice2.centerY, slice2.size, viewAngle + Math.PI / 2, viewAngle - Math.PI / 2, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return { projection, viewAngle, slice1, slice2 };
}

export function drawCylinderRibs(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, ts, stroke, lineWidth = 1.2 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { viewAngle } = projection;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    for (const t of ts) {
        const slice = getHeightSlice(projection, radius, t);
        ctx.beginPath();
        ctx.arc(slice.centerX, slice.centerY, slice.size, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
        ctx.stroke();
    }
}

export function drawCap(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, topRadius, capColors, stroke, lineWidth = 1.0 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { topX, topY } = projection;
    const { topRadius: capRadius } = getRadialSilhouette(projection, radius, topRadius);

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

export function drawSphere(ctx, x, y, px, py, { radius, height, colors, stroke, lineWidth = 0.9 }) {
    const blobHeight = height ?? radius * 2.2;
    const projection = projectVertical(x, y, px, py, blobHeight);
    const { viewAngle } = projection;
    const canopy = getRadialSilhouette(projection, radius);

    ctx.fillStyle = createSideGradient(ctx, canopy.baseLeft, canopy.baseRight, viewAngle, colors);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(canopy.topLeft.x, canopy.topLeft.y);
    ctx.lineTo(canopy.topRight.x, canopy.topRight.y);
    ctx.lineTo(canopy.baseRight.x, canopy.baseRight.y);
    ctx.arc(x, y, radius, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const topGrad = ctx.createRadialGradient(
        projection.topX, projection.topY, 0,
        projection.topX, projection.topY, canopy.topRadius
    );
    topGrad.addColorStop(0.0, colors.highlight);
    topGrad.addColorStop(0.55, colors.mid);
    topGrad.addColorStop(1.0, colors.shadow);
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.arc(projection.topX, projection.topY, canopy.topRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

export function drawCone(ctx, x, y, px, py, { baseRadius, height, colors, stroke, lineWidth = 1.0 }) {
    drawCylinder(ctx, x, y, px, py, {
        radius: baseRadius,
        height,
        topRadius: 0,
        colors,
        stroke,
        lineWidth,
    });
}

export function drawStack(ctx, x, y, px, py, { height, segments }) {
    const projection = projectVertical(x, y, px, py, height);
    for (const seg of segments) {
        const slice = getHeightSlice(projection, seg.radius, seg.t);
        drawSphere(ctx, slice.centerX, slice.centerY, px, py, {
            radius: seg.radius,
            height: seg.blobHeight ?? seg.radius * 2.2,
            colors: seg.colors,
            stroke: seg.stroke ?? "#000",
        });
    }
}

export function drawBox(ctx, x, y, px, py, { halfSize, height = DEFAULT_PROP_HEIGHT, faceColors, topColors, stroke, plankTs, topCross, lineWidth = 1.0 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { cx, cy, topX, topY, viewAngle } = projection;
    const box = extrudeBox(projection, halfSize);

    for (const face of box.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;

        ctx.fillStyle = createSideGradient(ctx, face.baseA, face.baseB, viewAngle, faceColors);
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

export function drawBarkLines(ctx, x, y, px, py, { radius, height, ts, stroke, lineWidth = 0.7, taper = 0.12 }) {
    const projection = projectVertical(x, y, px, py, height);
    const { viewAngle } = projection;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    for (const t of ts) {
        const slice = getHeightSlice(projection, radius * (1 - t * taper), t);
        ctx.beginPath();
        ctx.moveTo(
            slice.centerX - Math.cos(viewAngle) * slice.size * 0.15,
            slice.centerY - Math.sin(viewAngle) * slice.size * 0.15
        );
        ctx.lineTo(
            slice.centerX + Math.cos(viewAngle + Math.PI / 2) * slice.size * 0.35,
            slice.centerY + Math.sin(viewAngle + Math.PI / 2) * slice.size * 0.35
        );
        ctx.stroke();
    }
}
