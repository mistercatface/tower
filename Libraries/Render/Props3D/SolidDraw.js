import {
    extrudeLocalVertsInto,
    pointOnFrustumInto,
    radiusAtT,
    getHeightSlice,
    traceVisibleArc,
    isFaceTowardViewer,
    isOutwardFaceTowardViewer,
    createSideGradientAt,
    projectVertical,
    scaleAtHeight,
} from "../../Spatial/elevation/RadialElevationProjection.js";
import { traceClosedFlatPolygon, traceFlatQuad, traceQuad, traceSegment } from "../../Canvas/CanvasPath.js";
import { drawImageQuadFromFlatRingsWithBaseTransform, drawImageTriangleFlatWithBaseTransform } from "../../Canvas/AffineTexture.js";
import { getEntityCollisionParts } from "../../Physics/collisionMath.js";
export const DEFAULT_PROP_HEIGHT = 14;
export const RADIAL_SEGMENTS = 14;
const sPinwheelLocalVerts = new Float32Array(24);
const sBandQuad = new Float32Array(8);
const sBoxFootprint = new Float32Array(8);
let sBaseRing = new Float32Array(0);
let sTopRing = new Float32Array(0);
let sCapSrcRing = new Float32Array(0);
let sFaceVisible = new Uint8Array(0);
let sFaceMidY = new Float32Array(0);
let sFaceOrder = new Int32Array(0);
function ensurePrismScratch(vertexCount) {
    const ringLen = vertexCount * 2;
    if (sBaseRing.length < ringLen) {
        sBaseRing = new Float32Array(ringLen);
        sTopRing = new Float32Array(ringLen);
        sCapSrcRing = new Float32Array(ringLen);
        sFaceVisible = new Uint8Array(vertexCount);
        sFaceMidY = new Float32Array(vertexCount);
        sFaceOrder = new Int32Array(vertexCount);
    }
}
function fillBoxFootprintInto(out, hx, hy) {
    out[0] = -hx;
    out[1] = -hy;
    out[2] = hx;
    out[3] = -hy;
    out[4] = hx;
    out[5] = hy;
    out[6] = -hx;
    out[7] = hy;
}
function fillPinwheelOutlineInto(out, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    out[0] = -halfT;
    out[1] = -halfL;
    out[2] = halfT;
    out[3] = -halfL;
    out[4] = halfT;
    out[5] = -halfT;
    out[6] = halfL;
    out[7] = -halfT;
    out[8] = halfL;
    out[9] = halfT;
    out[10] = halfT;
    out[11] = halfT;
    out[12] = halfT;
    out[13] = halfL;
    out[14] = -halfT;
    out[15] = halfL;
    out[16] = -halfT;
    out[17] = halfT;
    out[18] = -halfL;
    out[19] = halfT;
    out[20] = -halfL;
    out[21] = -halfT;
    out[22] = -halfT;
    out[23] = -halfT;
}
function isFaceVisible(viewport, originX, originY, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewport.x, viewport.y);
}
function drawRadialSilhouetteBody(ctx, projection, baseRadius, resolvedTop, colors) {
    const { cx, cy, topX, topY, viewAngle } = projection;
    const perpA = viewAngle + Math.PI / 2;
    const perpB = viewAngle - Math.PI / 2;
    const baseLeftX = cx + Math.cos(perpA) * baseRadius;
    const baseLeftY = cy + Math.sin(perpA) * baseRadius;
    const baseRightX = cx + Math.cos(perpB) * baseRadius;
    const baseRightY = cy + Math.sin(perpB) * baseRadius;
    ctx.beginPath();
    ctx.moveTo(baseLeftX, baseLeftY);
    traceVisibleArc(ctx, cx, cy, baseRadius, perpA, perpB, viewAngle);
    if (resolvedTop === 0) ctx.lineTo(topX, topY);
    else {
        const topRightX = topX + Math.cos(perpB) * resolvedTop;
        const topRightY = topY + Math.sin(perpB) * resolvedTop;
        ctx.lineTo(topRightX, topRightY);
        traceVisibleArc(ctx, topX, topY, resolvedTop, perpB, perpA, viewAngle);
    }
    ctx.closePath();
    ctx.fillStyle = createSideGradientAt(ctx, baseLeftX, baseLeftY, baseRightX, baseRightY, viewAngle + Math.PI, colors);
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
        pointOnFrustumInto(sBandQuad, 0, projection, baseRadius, resolvedTop, t0, a0);
        pointOnFrustumInto(sBandQuad, 2, projection, baseRadius, resolvedTop, t0, a1);
        const edgeMidX = (sBandQuad[0] + sBandQuad[2]) * 0.5;
        const edgeMidY = (sBandQuad[1] + sBandQuad[3]) * 0.5;
        if (!isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY)) continue;
        pointOnFrustumInto(sBandQuad, 4, projection, baseRadius, resolvedTop, t1, a1);
        pointOnFrustumInto(sBandQuad, 6, projection, baseRadius, resolvedTop, t1, a0);
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceFlatQuad(ctx, sBandQuad[0], sBandQuad[1], sBandQuad[2], sBandQuad[3], sBandQuad[4], sBandQuad[5], sBandQuad[6], sBandQuad[7]);
        ctx.fill();
        ctx.stroke();
    }
    const slice1 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t0), t0);
    const slice2 = getHeightSlice(projection, radiusAtT(baseRadius, resolvedTop, t1), t1);
    return { projection, orientAngle: facing, slice1, slice2 };
}
function drawSideFaceFlat(ctx, edgeIndex, count, originX, originY, colors, { stroke, lineWidth, plankTs, drawPlanks }) {
    const ai = edgeIndex * 2;
    const bi = ((edgeIndex + 1) % count) * 2;
    const edgeMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
    const edgeMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
    const shadeAngle = Math.atan2(edgeMidY - originY, edgeMidX - originX);
    ctx.fillStyle = createSideGradientAt(ctx, sBaseRing[ai], sBaseRing[ai + 1], sBaseRing[bi], sBaseRing[bi + 1], shadeAngle, colors);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
    ctx.fill();
    ctx.stroke();
    if (drawPlanks && plankTs) {
        ctx.strokeStyle = plankTs.stroke ?? "rgba(0,0,0,0.55)";
        ctx.lineWidth = plankTs.lineWidth ?? 0.8;
        for (const t of plankTs.values) {
            const xA = sTopRing[ai] + (sBaseRing[ai] - sTopRing[ai]) * t;
            const yA = sTopRing[ai + 1] + (sBaseRing[ai + 1] - sTopRing[ai + 1]) * t;
            const xB = sTopRing[bi] + (sBaseRing[bi] - sTopRing[bi]) * t;
            const yB = sTopRing[bi + 1] + (sBaseRing[bi + 1] - sTopRing[bi + 1]) * t;
            ctx.beginPath();
            ctx.moveTo(xA, yA);
            ctx.lineTo(xB, yB);
            ctx.stroke();
        }
    }
}
function classifyPrismFaces(count, viewport, cx, cy, faceOrder, localVerts, facing) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    for (let i = 0; i < count; i++) {
        const ai = i * 2;
        const bi = ((i + 1) % count) * 2;
        const edgeMidX = (sBaseRing[ai] + sBaseRing[bi]) * 0.5;
        const edgeMidY = (sBaseRing[ai + 1] + sBaseRing[bi + 1]) * 0.5;
        sFaceMidY[i] = (sBaseRing[ai + 1] + sBaseRing[bi + 1] + sTopRing[ai + 1] + sTopRing[bi + 1]) * 0.25;
        if (faceOrder === "midY") {
            const pAx = localVerts[ai];
            const pAy = localVerts[ai + 1];
            const pBx = localVerts[bi];
            const pBy = localVerts[bi + 1];
            const lx = pBy - pAy;
            const ly = -(pBx - pAx);
            const worldNx = lx * cos - ly * sin;
            const worldNy = lx * sin + ly * cos;
            const midX = (sBaseRing[ai] + sBaseRing[bi] + sTopRing[ai] + sTopRing[bi]) * 0.25;
            const midY = sFaceMidY[i];
            sFaceVisible[i] = isOutwardFaceTowardViewer(midX, midY, worldNx, worldNy, viewport.x, viewport.y) ? 1 : 0;
        } else sFaceVisible[i] = isFaceVisible(viewport, cx, cy, edgeMidX, edgeMidY) ? 1 : 0;
        sFaceOrder[i] = i;
    }
    if (faceOrder === "midY") sFaceOrder.subarray(0, count).sort((a, b) => sFaceMidY[a] - sFaceMidY[b]);
}
function drawTexturedPrism(ctx, prop, localVerts, count, height, facing, projection, textures) {
    const textureScale = textures.scale;
    const sideSrcHeight = (prop.wallChunkHeightPx ?? height) * textureScale;
    for (let pass = 0; pass < 2; pass++) {
        const wantFront = pass === 1;
        for (let i = 0; i < count; i++) {
            if ((sFaceVisible[i] === 1) !== wantFront) continue;
            const ai = i * 2;
            const bi = ((i + 1) % count) * 2;
            ctx.save();
            ctx.beginPath();
            traceFlatQuad(ctx, sTopRing[ai], sTopRing[ai + 1], sTopRing[bi], sTopRing[bi + 1], sBaseRing[bi], sBaseRing[bi + 1], sBaseRing[ai], sBaseRing[ai + 1]);
            ctx.clip();
            const baseTransform = ctx.getTransform();
            drawImageQuadFromFlatRingsWithBaseTransform(
                ctx,
                textures.sideCanvas,
                0,
                0,
                textures.sideCanvas.width,
                sideSrcHeight,
                sBaseRing,
                sTopRing,
                i,
                count,
                baseTransform.a,
                baseTransform.b,
                baseTransform.c,
                baseTransform.d,
                baseTransform.e,
                baseTransform.f,
            );
            ctx.restore();
        }
    }
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.clip();
    const chunkSizePx = textures.chunkSizePx;
    const offset = chunkSizePx / 2;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        const topLx = scaleAtHeight(lx, projection.alpha, 1);
        const topLy = scaleAtHeight(ly, projection.alpha, 1);
        const rx = topLx * cos - topLy * sin;
        const ry = topLx * sin + topLy * cos;
        sCapSrcRing[i * 2] = (rx + offset) * textureScale;
        sCapSrcRing[i * 2 + 1] = (ry + offset) * textureScale;
    }
    const baseTransform = ctx.getTransform();
    for (let i = 1; i < count - 1; i++)
        drawImageTriangleFlatWithBaseTransform(
            ctx,
            textures.capCanvas,
            sCapSrcRing,
            sTopRing,
            0,
            i,
            i + 1,
            baseTransform.a,
            baseTransform.b,
            baseTransform.c,
            baseTransform.d,
            baseTransform.e,
            baseTransform.f,
        );
    ctx.restore();
}
function drawExtrudedPrism(ctx, prop, viewport, localVerts, opts) {
    const {
        height = DEFAULT_PROP_HEIGHT,
        facing = prop.facing,
        faceColors,
        backFaceColors = null,
        bottomColors = null,
        topColors,
        stroke,
        lineWidth = 1.0,
        plankTs,
        topCross,
        textures = null,
        faceOrder = "convexCull",
        prismPass = "all",
        topHalfSize = null,
        baseGradCornerB = 1,
    } = opts;
    const count = localVerts.length / 2;
    if (count < 3) return;
    ensurePrismScratch(count);
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const { cx, cy, topX, topY } = projection;
    extrudeLocalVertsInto(sBaseRing, sTopRing, localVerts, projection, facing);
    classifyPrismFaces(count, viewport, cx, cy, faceOrder, localVerts, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const drawBase = prismPass === "all" || prismPass === "base";
    const drawSides = prismPass === "all" || prismPass === "sides";
    const drawTop = prismPass === "all" || prismPass === "top";
    if (textures) {
        if (drawSides || drawTop) drawTexturedPrism(ctx, prop, localVerts, count, height, facing, projection, textures);
        return;
    }
    if (drawBase) {
        const gradB = Math.min(baseGradCornerB, count - 1);
        const baseGrad = ctx.createLinearGradient(sBaseRing[0], sBaseRing[1], sBaseRing[gradB * 2], sBaseRing[gradB * 2 + 1]);
        baseGrad.addColorStop(0.0, baseColors.light);
        baseGrad.addColorStop(0.5, baseColors.mid);
        baseGrad.addColorStop(1.0, baseColors.dark);
        ctx.fillStyle = baseGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sBaseRing, count);
        ctx.fill();
        if (stroke) ctx.stroke();
    }
    if (drawSides)
        if (faceOrder === "midY")
            for (let o = 0; o < count; o++) {
                const i = sFaceOrder[o];
                const colors = sFaceVisible[i] ? faceColors : backColors;
                drawSideFaceFlat(ctx, i, count, cx, cy, colors, { stroke, lineWidth, plankTs, drawPlanks: sFaceVisible[i] === 1 });
            }
        else
            for (let pass = 0; pass < 2; pass++) {
                const wantFront = pass === 1;
                for (let i = 0; i < count; i++) {
                    if ((sFaceVisible[i] === 1) !== wantFront) continue;
                    const colors = wantFront ? faceColors : backColors;
                    drawSideFaceFlat(ctx, i, count, cx, cy, colors, { stroke, lineWidth, plankTs, drawPlanks: wantFront });
                }
            }
    if (drawTop) {
        let topGrad;
        if (topHalfSize) {
            const topHx = topHalfSize.x ?? topHalfSize.hx;
            const topHy = topHalfSize.y ?? topHalfSize.hy;
            topGrad = ctx.createLinearGradient(topX - topHx, topY - topHy, topX + topHx, topY + topHy);
        } else topGrad = ctx.createLinearGradient(topX, topY - 8, topX, topY + 8);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        traceClosedFlatPolygon(ctx, sTopRing, count);
        ctx.fill();
        if (stroke) ctx.stroke();
        if (topCross && count === 4) {
            ctx.strokeStyle = topCross.stroke ?? "rgba(0,0,0,0.6)";
            ctx.lineWidth = topCross.lineWidth ?? 0.8;
            ctx.beginPath();
            traceSegment(ctx, sTopRing[0], (sTopRing[1] + sTopRing[5]) / 2, sTopRing[2], (sTopRing[3] + sTopRing[7]) / 2);
            traceSegment(ctx, (sTopRing[0] + sTopRing[2]) / 2, sTopRing[1], (sTopRing[4] + sTopRing[6]) / 2, sTopRing[5]);
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
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    fillBoxFootprintInto(sBoxFootprint, hx, hy);
    const projection = projectVertical(prop.x, prop.y, height, viewport);
    const topHx = scaleAtHeight(hx, projection.alpha, 1);
    const topHy = scaleAtHeight(hy, projection.alpha, 1);
    drawExtrudedPrism(ctx, prop, viewport, sBoxFootprint, {
        height,
        facing,
        faceColors,
        backFaceColors,
        bottomColors,
        topColors,
        stroke,
        lineWidth,
        plankTs,
        topCross,
        faceOrder: "convexCull",
        baseGradCornerB: 2,
        topHalfSize: { x: topHx, y: topHy },
    });
}
export function drawExtrudedConvexPolygon(
    ctx,
    prop,
    viewport,
    { localVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const textures = prop.wallChunkProfileId && prop._wallChunkTextures?.ready ? prop._wallChunkTextures : null;
    drawExtrudedPrism(ctx, prop, viewport, localVerts, {
        height,
        facing,
        faceColors,
        backFaceColors,
        bottomColors,
        topColors,
        stroke,
        lineWidth,
        plankTs,
        topCross,
        textures,
        faceOrder: "convexCull",
    });
}
export function drawFlatWallChunkCap(ctx, prop, localVerts, facing = prop.facing) {
    const textures = prop._wallChunkTextures;
    if (!textures?.ready) return;
    const count = localVerts.length / 2;
    if (count < 3) return;
    ensurePrismScratch(count);
    const cos = Math.cos(facing ?? 0);
    const sin = Math.sin(facing ?? 0);
    const px = prop.x;
    const py = prop.y;
    const textureScale = textures.scale;
    const offset = textures.chunkSizePx / 2;
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        sTopRing[i * 2] = px + lx * cos - ly * sin;
        sTopRing[i * 2 + 1] = py + lx * sin + ly * cos;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        sCapSrcRing[i * 2] = (rx + offset) * textureScale;
        sCapSrcRing[i * 2 + 1] = (ry + offset) * textureScale;
    }
    ctx.save();
    ctx.beginPath();
    traceClosedFlatPolygon(ctx, sTopRing, count);
    ctx.clip();
    const baseTransform = ctx.getTransform();
    for (let i = 1; i < count - 1; i++)
        drawImageTriangleFlatWithBaseTransform(
            ctx,
            textures.capCanvas,
            sCapSrcRing,
            sTopRing,
            0,
            i,
            i + 1,
            baseTransform.a,
            baseTransform.b,
            baseTransform.c,
            baseTransform.d,
            baseTransform.e,
            baseTransform.f,
        );
    ctx.restore();
}
export function drawFlatWallChunkProp(ctx, prop) {
    if (!prop.wallChunkProfileId || !prop._wallChunkTextures?.ready) return false;
    const parts = getEntityCollisionParts(prop);
    if (parts.length !== 1) return false;
    const verts = parts[0].vertices;
    if (!verts || verts.length < 6) return false;
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
        fillPinwheelOutlineInto(sPinwheelLocalVerts, length, thickness);
        drawExtrudedPrism(ctx, prop, viewport, sPinwheelLocalVerts, {
            height,
            facing,
            faceColors,
            backFaceColors,
            bottomColors,
            topColors,
            stroke,
            lineWidth,
            plankTs,
            topCross,
            faceOrder: "midY",
            baseGradCornerB: 6,
        });
        return;
    }
    const prismOpts = { height, facing, faceColors, backFaceColors, bottomColors, topColors, stroke, lineWidth, plankTs, topCross, faceOrder: "convexCull" };
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "base" });
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "sides" });
    for (let i = 0; i < partsVerts.length; i++) drawExtrudedPrism(ctx, prop, viewport, partsVerts[i], { ...prismOpts, prismPass: "top" });
}
