import {
    extrudeBox,
    pointOnFrustum,
    radiusAtT,
    getHeightSlice,
    getRadialSilhouette,
    traceVisibleArc,
    isFaceTowardViewer,
    createSideGradient,
    projectVertical,
} from "../../Spatial/iso/IsometricProjection.js";

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

function isFaceVisible(px, py, originX, originY, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, px, py);
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

export function drawExtrudedRadial(ctx, prop, px, py, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius, height, facing = prop.facing, colors } = options;
    const projection = projectVertical(prop.x, prop.y, px, py, height);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));

    drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors);

    return { projection, orientAngle: facing };
}

export function drawRadialBand(ctx, prop, px, py, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius = null, height = DEFAULT_PROP_HEIGHT, t0, t1, fill, stroke, lineWidth = 0.8, facing = prop.facing, segments = RADIAL_SEGMENTS } = options;
    const projection = projectVertical(prop.x, prop.y, px, py, height);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    const { cx, cy } = projection;

    for (let i = 0; i < segments; i++) {
        const a0 = facing + (i / segments) * Math.PI * 2;
        const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
        const edgeMidX = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).x + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).x) / 2;
        const edgeMidY = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).y + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).y) / 2;
        if (!isFaceVisible(px, py, cx, cy, edgeMidX, edgeMidY)) continue;

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

function faceViewAngle(face, originX, originY) {
    const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
    const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
    return Math.atan2(edgeMidY - originY, edgeMidX - originX);
}

function drawBoxSideFace(ctx, face, originX, originY, colors, { stroke, lineWidth, plankTs, drawPlanks }) {
    const shadeAngle = faceViewAngle(face, originX, originY);
    drawCullFace(ctx, face, shadeAngle, { fill: createSideGradient(ctx, face.baseA, face.baseB, shadeAngle, colors), stroke, lineWidth });

    if (drawPlanks && plankTs) {
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

export function drawExtrudedBox(
    ctx,
    prop, px, py,
    { halfSize, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const projection = projectVertical(prop.x, prop.y, px, py, height);
    const { cx, cy, topX, topY } = projection;
    const box = extrudeBox(projection, halfSize, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };

    const backFaces = [];
    const frontFaces = [];
    for (const face of box.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (isFaceVisible(px, py, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
        else backFaces.push(face);
    }

    const baseGrad = ctx.createLinearGradient(box.baseCorners[0].x, box.baseCorners[0].y, box.baseCorners[2].x, box.baseCorners[2].y);
    baseGrad.addColorStop(0.0, baseColors.light);
    baseGrad.addColorStop(0.5, baseColors.mid);
    baseGrad.addColorStop(1.0, baseColors.dark);
    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(box.baseCorners[0].x, box.baseCorners[0].y);
    for (let i = 1; i < box.baseCorners.length; i++) {
        ctx.lineTo(box.baseCorners[i].x, box.baseCorners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (const face of backFaces) {
        drawBoxSideFace(ctx, face, cx, cy, backColors, { stroke, lineWidth, plankTs, drawPlanks: false });
    }
    for (const face of frontFaces) {
        drawBoxSideFace(ctx, face, cx, cy, faceColors, { stroke, lineWidth, plankTs, drawPlanks: true });
    }

    const topHx = typeof box.topHalfSize === "number" ? box.topHalfSize : (box.topHalfSize.x ?? box.topHalfSize.hx);
    const topHy = typeof box.topHalfSize === "number" ? box.topHalfSize : (box.topHalfSize.y ?? box.topHalfSize.hy);
    const topGrad = ctx.createLinearGradient(topX - topHx, topY - topHy, topX + topHx, topY + topHy);
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
