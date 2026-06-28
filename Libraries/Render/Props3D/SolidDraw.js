import {
    extrudeBox,
    extrudeConvexFootprint,
    pointOnFrustum,
    radiusAtT,
    getHeightSlice,
    getRadialSilhouette,
    traceVisibleArc,
    isFaceTowardViewer,
    isOutwardFaceTowardViewer,
    createSideGradient,
    projectVertical,
    scaleAtHeight,
} from "../../Spatial/elevation/RadialElevationProjection.js";
import { traceClosedPolygon, traceQuad, traceSegment } from "../../Canvas/CanvasPath.js";
import { drawImageQuad, drawImageTriangle } from "../../Canvas/AffineTexture.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";
export const DEFAULT_PROP_HEIGHT = 14;
export const RADIAL_SEGMENTS = 14;
export function drawCullFace(ctx, face, shadeAngle, { fill, stroke, lineWidth }) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    traceQuad(ctx, face.topA, face.topB, face.baseB, face.baseA);
    ctx.fill();
    ctx.stroke();
}
function isFaceVisible(viewport, originX, originY, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewport.x, viewport.y);
}
function drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors) {
    const sil = getRadialSilhouette(projection, baseRadius, resolvedTop);
    const { cx, cy, topX, topY, viewAngle } = projection;
    const { perpA, perpB, baseLeft, baseRight, topRight } = sil;
    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y);
    traceVisibleArc(ctx, cx, cy, sil.baseRadius, perpA, perpB, viewAngle);
    if (resolvedTop === 0) ctx.lineTo(topX, topY);
    else {
        ctx.lineTo(topRight.x, topRight.y);
        traceVisibleArc(ctx, topX, topY, sil.topRadius, perpB, perpA, viewAngle);
    }
    ctx.closePath();
    ctx.fillStyle = createSideGradient(ctx, baseLeft, baseRight, viewAngle + Math.PI, colors);
    ctx.fill();
}
export function drawExtrudedRadial(ctx, prop, viewport, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius, height, facing = prop.facing, colors } = options;
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors);
    return { projection, orientAngle: facing };
}
export function drawRadialBand(ctx, prop, viewport, options) {
    const baseRadius = options.baseRadius ?? options.radius;
    const { topRadius = null, height = DEFAULT_PROP_HEIGHT, t0, t1, fill, stroke, lineWidth = 0.8, facing = prop.facing, segments = RADIAL_SEGMENTS } = options;
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + projection.alpha));
    const { cx, cy } = projection;
    for (let i = 0; i < segments; i++) {
        const a0 = facing + (i / segments) * Math.PI * 2;
        const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
        const edgeMidX = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).x + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).x) / 2;
        const edgeMidY = (pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).y + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).y) / 2;
        if (!isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) continue;
        const p0a = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0);
        const p0b = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1);
        const p1a = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a0);
        const p1b = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a1);
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceQuad(ctx, p0a, p0b, p1b, p1a);
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
export function drawBox(
    ctx,
    prop,
    viewport,
    { halfSize, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const { cx, cy, topX, topY } = projection;
    const box = extrudeBox(projection, halfSize, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const backFaces = [];
    const frontFaces = [];
    for (const face of box.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
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
    traceClosedPolygon(ctx, box.baseCorners);
    ctx.fill();
    if (stroke) ctx.stroke();
    for (const face of backFaces) drawBoxSideFace(ctx, face, cx, cy, backColors, { stroke, lineWidth, plankTs, drawPlanks: false });
    for (const face of frontFaces) drawBoxSideFace(ctx, face, cx, cy, faceColors, { stroke, lineWidth, plankTs, drawPlanks: true });
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
    traceClosedPolygon(ctx, box.topCorners);
    ctx.fill();
    if (stroke) ctx.stroke();
    if (topCross) {
        ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
        ctx.lineWidth = topCross.lineWidth ?? 0.8;
        ctx.beginPath();
        traceSegment(ctx, box.topCorners[0].x, (box.topCorners[0].y + box.topCorners[2].y) / 2, box.topCorners[1].x, (box.topCorners[1].y + box.topCorners[3].y) / 2);
        traceSegment(ctx, (box.topCorners[0].x + box.topCorners[1].x) / 2, box.topCorners[0].y, (box.topCorners[2].x + box.topCorners[3].x) / 2, box.topCorners[2].y);
        ctx.stroke();
    }
}
export function drawExtrudedConvexPolygon(
    ctx,
    prop,
    viewport,
    { localVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const { cx, cy, topX, topY } = projection;
    const body = extrudeConvexFootprint(projection, localVerts, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const backFaces = [];
    const frontFaces = [];
    for (const face of body.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
        else backFaces.push(face);
    }
    const textures = prop.wallChunkProfileId && prop._wallChunkTextures?.ready ? prop._wallChunkTextures : null;
    if (textures) {
        const textureScale = textures.scale;
        const sideSrcHeight = (prop.wallChunkHeightPx ?? height) * textureScale;
        for (const faces of [backFaces, frontFaces])
            for (const face of faces) {
                ctx.save();
                ctx.beginPath();
                traceQuad(ctx, face.topA, face.topB, face.baseB, face.baseA);
                ctx.clip();
                drawImageQuad(ctx, textures.sideCanvas, 0, 0, textures.sideCanvas.width, sideSrcHeight, face.baseA, face.baseB, face.topB, face.topA);
                ctx.restore();
            }
        ctx.save();
        ctx.beginPath();
        traceClosedPolygon(ctx, body.topCorners);
        ctx.clip();
        const chunkSizePx = textures.chunkSizePx;
        const offset = chunkSizePx / 2;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const count = localVerts.length;
        const srcCorners = [];
        for (let i = 0; i < count; i++) {
            const lx = localVerts[i].x;
            const ly = localVerts[i].y;
            const topLx = scaleAtHeight(lx, projection.alpha, 1);
            const topLy = scaleAtHeight(ly, projection.alpha, 1);
            const rx = topLx * cos - topLy * sin;
            const ry = topLx * sin + topLy * cos;
            srcCorners.push({ x: (rx + offset) * textureScale, y: (ry + offset) * textureScale });
        }
        if (body.topCorners.length >= 3)
            for (let i = 1; i < body.topCorners.length - 1; i++)
                drawImageTriangle(ctx, textures.capCanvas, srcCorners[0], srcCorners[i], srcCorners[i + 1], body.topCorners[0], body.topCorners[i], body.topCorners[i + 1]);
        ctx.restore();
    } else {
        const baseGrad = ctx.createLinearGradient(body.baseCorners[0].x, body.baseCorners[0].y, body.baseCorners[1].x, body.baseCorners[1].y);
        baseGrad.addColorStop(0.0, baseColors.light);
        baseGrad.addColorStop(0.5, baseColors.mid);
        baseGrad.addColorStop(1.0, baseColors.dark);
        ctx.fillStyle = baseGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, body.baseCorners);
        ctx.fill();
        if (stroke) ctx.stroke();
        for (const face of backFaces) drawBoxSideFace(ctx, face, cx, cy, backColors, { stroke, lineWidth, plankTs, drawPlanks: false });
        for (const face of frontFaces) drawBoxSideFace(ctx, face, cx, cy, faceColors, { stroke, lineWidth, plankTs, drawPlanks: true });
        const topGrad = ctx.createLinearGradient(topX, topY - 8, topX, topY + 8);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, body.topCorners);
        ctx.fill();
        if (stroke) ctx.stroke();
        if (topCross && body.topCorners.length === 4) {
            ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
            ctx.lineWidth = topCross.lineWidth ?? 0.8;
            ctx.beginPath();
            traceSegment(ctx, body.topCorners[0].x, (body.topCorners[0].y + body.topCorners[2].y) / 2, body.topCorners[1].x, (body.topCorners[1].y + body.topCorners[3].y) / 2);
            traceSegment(ctx, (body.topCorners[0].x + body.topCorners[1].x) / 2, body.topCorners[0].y, (body.topCorners[2].x + body.topCorners[3].x) / 2, body.topCorners[2].y);
            ctx.stroke();
        }
    }
}
export function drawFlatWallChunkCap(ctx, prop, localVerts, facing = prop.facing) {
    const textures = prop._wallChunkTextures;
    if (!textures?.ready) return;
    const capCanvas = textures.capCanvas;
    const textureScale = textures.scale;
    const offset = textures.chunkSizePx / 2;
    const angle = facing ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const px = prop.x;
    const py = prop.y;
    const count = localVerts.length / 2;
    if (count < 3) return;
    const worldCorners = [];
    const srcCorners = [];
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        worldCorners.push({ x: px + lx * cos - ly * sin, y: py + lx * sin + ly * cos });
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        srcCorners.push({ x: (rx + offset) * textureScale, y: (ry + offset) * textureScale });
    }
    ctx.save();
    ctx.beginPath();
    traceClosedPolygon(ctx, worldCorners);
    ctx.clip();
    for (let i = 1; i < count - 1; i++) drawImageTriangle(ctx, capCanvas, srcCorners[0], srcCorners[i], srcCorners[i + 1], worldCorners[0], worldCorners[i], worldCorners[i + 1]);
    ctx.restore();
}
export function drawFlatWallChunkProp(ctx, prop) {
    if (!prop.wallChunkProfileId || !prop._wallChunkTextures?.ready) return false;
    const parts = getEntityCollisionParts(prop);
    if (parts.length !== 1) return false;
    const verts = parts[0].vertices;
    if (!verts || verts.length < 3) return false;
    drawFlatWallChunkCap(ctx, prop, verts);
    return true;
}
export function drawExtrudedCompoundPolygon(
    ctx,
    prop,
    viewport,
    { partsVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    if (prop.type === "cross_pinwheel") {
        const length = prop.crossLength ?? 32;
        const thickness = prop.crossThickness ?? 8;
        const halfL = length / 2;
        const halfT = thickness / 2;
        const localVerts = [
            { x: -halfT, y: -halfL },
            { x: halfT, y: -halfL },
            { x: halfT, y: -halfT },
            { x: halfL, y: -halfT },
            { x: halfL, y: halfT },
            { x: halfT, y: halfT },
            { x: halfT, y: halfL },
            { x: -halfT, y: halfL },
            { x: -halfT, y: halfT },
            { x: -halfL, y: halfT },
            { x: -halfL, y: -halfT },
            { x: -halfT, y: -halfT },
        ];
        const projection = projectVertical(prop.x, prop.y, height, viewport);
        const { cx, cy, topX, topY, alpha } = projection;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const count = 12;
        const baseCorners = new Array(count);
        const topCorners = new Array(count);
        for (let i = 0; i < count; i++) {
            const lx = localVerts[i].x;
            const ly = localVerts[i].y;
            const topLx = scaleAtHeight(lx, alpha, 1);
            const topLy = scaleAtHeight(ly, alpha, 1);
            baseCorners[i] = { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
            topCorners[i] = { x: topX + topLx * cos - topLy * sin, y: topY + topLx * sin + topLy * cos };
        }
        const faces = [];
        for (let i = 0; i < count; i++) {
            const next = (i + 1) % count;
            const pA = localVerts[i];
            const pB = localVerts[next];
            const lx = pB.y - pA.y;
            const ly = -(pB.x - pA.x);
            const worldNx = lx * cos - ly * sin;
            const worldNy = lx * sin + ly * cos;
            const face = {
                baseA: baseCorners[i],
                baseB: baseCorners[next],
                topA: topCorners[i],
                topB: topCorners[next],
                midX: (baseCorners[i].x + baseCorners[next].x + topCorners[i].x + topCorners[next].x) / 4,
                midY: (baseCorners[i].y + baseCorners[next].y + topCorners[i].y + topCorners[next].y) / 4,
            };
            face.visible = isOutwardFaceTowardViewer(face.midX, face.midY, worldNx, worldNy, viewport.x, viewport.y);
            faces.push(face);
        }
        const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
        const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
        // 1. Draw base
        const baseGrad = ctx.createLinearGradient(baseCorners[0].x, baseCorners[0].y, baseCorners[6].x, baseCorners[6].y);
        baseGrad.addColorStop(0.0, baseColors.light);
        baseGrad.addColorStop(0.5, baseColors.mid);
        baseGrad.addColorStop(1.0, baseColors.dark);
        ctx.fillStyle = baseGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, baseCorners);
        ctx.fill();
        ctx.stroke();
        // 2. Draw sides sorted back-to-front
        const sortedFaces = faces.slice().sort((a, b) => a.midY - b.midY);
        for (const face of sortedFaces) {
            const colors = face.visible ? faceColors : backColors;
            const drawPlanks = face.visible;
            drawBoxSideFace(ctx, face, cx, cy, colors, { stroke, lineWidth, plankTs, drawPlanks });
        }
        // 3. Draw top
        const topGrad = ctx.createLinearGradient(topX, topY - 8, topX, topY + 8);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, topCorners);
        ctx.fill();
        ctx.stroke();
        return;
    }
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const { cx, cy, topX, topY } = projection;
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const bodies = partsVerts.map((localVerts) => extrudeConvexFootprint(projection, localVerts, facing));
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const baseGrad = ctx.createLinearGradient(body.baseCorners[0].x, body.baseCorners[0].y, body.baseCorners[1].x, body.baseCorners[1].y);
        baseGrad.addColorStop(0.0, baseColors.light);
        baseGrad.addColorStop(0.5, baseColors.mid);
        baseGrad.addColorStop(1.0, baseColors.dark);
        ctx.fillStyle = baseGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, body.baseCorners);
        ctx.fill();
        ctx.stroke();
    }
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const backFaces = [];
        const frontFaces = [];
        for (const face of body.faces) {
            const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
            const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
            if (isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
            else backFaces.push(face);
        }
        for (const face of backFaces) drawBoxSideFace(ctx, face, cx, cy, backColors, { stroke, lineWidth, plankTs, drawPlanks: false });
        for (const face of frontFaces) drawBoxSideFace(ctx, face, cx, cy, faceColors, { stroke, lineWidth, plankTs, drawPlanks: true });
    }
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const topGrad = ctx.createLinearGradient(topX, topY - 8, topX, topY + 8);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedPolygon(ctx, body.topCorners);
        ctx.fill();
        ctx.stroke();
        if (topCross && body.topCorners.length === 4) {
            ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
            ctx.lineWidth = topCross.lineWidth ?? 0.8;
            ctx.beginPath();
            traceSegment(ctx, body.topCorners[0].x, (body.topCorners[0].y + body.topCorners[2].y) / 2, body.topCorners[1].x, (body.topCorners[1].y + body.topCorners[3].y) / 2);
            traceSegment(ctx, (body.topCorners[0].x + body.topCorners[1].x) / 2, body.topCorners[0].y, (body.topCorners[2].x + body.topCorners[3].x) / 2, body.topCorners[2].y);
            ctx.stroke();
        }
    }
}
