import {
    extrudeBox,
    extrudeConvexFootprint,
    pointOnFrustum,
    radiusAtT,
    getHeightSlice,
    getRadialSilhouette,
    traceVisibleArc,
    isFaceTowardViewer,
    createSideGradient,
    projectVertical,
} from "../../Spatial/iso/IsometricProjection.js";
import { traceClosedPolygon, traceQuad, traceSegment } from "../../Canvas/CanvasPath.js";
import { POXEL_TARGET_EDGE } from "../../Props/poxelFracture.js";
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
    if (resolvedTop === 0) ctx.lineTo(topX, topY);
    else {
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
    px,
    py,
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
    traceClosedPolygon(ctx, box.baseCorners);
    ctx.fill();
    ctx.stroke();
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
    ctx.stroke();
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
    px,
    py,
    { localVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, plankTs, topCross, lineWidth = 1.0, facing = prop.facing },
) {
    const projection = projectVertical(prop.x, prop.y, px, py, height);
    const { cx, cy, topX, topY } = projection;
    const body = extrudeConvexFootprint(projection, localVerts, facing);
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const backFaces = [];
    const frontFaces = [];
    for (const face of body.faces) {
        const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
        const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
        if (isFaceVisible(px, py, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
        else backFaces.push(face);
    }
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
function canonicalPoxelEdgeKey(ax, ay, bx, by) {
    const ha = Math.round(ax * 1000) + "," + Math.round(ay * 1000);
    const hb = Math.round(bx * 1000) + "," + Math.round(by * 1000);
    return ha < hb ? ha + ";" + hb : hb + ";" + ha;
}
function exposedPoxelEdgeKeys(poxels) {
    const counts = new Map();
    for (let p = 0; p < poxels.length; p++) {
        const v = poxels[p].vertices;
        for (let i = 0; i < 3; i++) {
            const key = canonicalPoxelEdgeKey(v[i * 2], v[i * 2 + 1], v[((i + 1) % 3) * 2], v[((i + 1) % 3) * 2 + 1]);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    const exposed = new Set();
    for (const [key, count] of counts) if (count === 1) exposed.add(key);
    return exposed;
}
function poxelLocalVerts(poxel) {
    const v = poxel.vertices;
    return [
        { x: v[0], y: v[1] },
        { x: v[2], y: v[3] },
        { x: v[4], y: v[5] },
    ];
}
function poxelWorldCentroidDistSq(prop, poxel, px, py, facing) {
    const v = poxel.vertices;
    const lx = (v[0] + v[2] + v[4]) / 3;
    const ly = (v[1] + v[3] + v[5]) / 3;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const wx = prop.x + lx * cos - ly * sin;
    const wy = prop.y + lx * sin + ly * cos;
    const dx = wx - px;
    const dy = wy - py;
    return dx * dx + dy * dy;
}
function poxelSlabHeight(height) {
    return Math.min(height, POXEL_TARGET_EDGE * 1.15);
}
export function drawExtrudedPoxelMesh(
    ctx,
    prop,
    px,
    py,
    { localVerts, height = DEFAULT_PROP_HEIGHT, faceColors, backFaceColors = null, bottomColors = null, topColors, stroke, seamStroke = "rgba(0,0,0,0.22)", lineWidth = 1.0, facing = prop.facing },
) {
    const poxels = prop.poxels;
    const slabHeight = poxelSlabHeight(height);
    const outlineWidth = lineWidth * 0.55;
    const sideWidth = lineWidth * 0.55;
    const seamWidth = Math.max(0.25, lineWidth * 0.3);
    const projection = projectVertical(prop.x, prop.y, px, py, slabHeight);
    const { cx, cy } = projection;
    const backColors = backFaceColors ?? { shadow: faceColors.shadow, mid: faceColors.shadow, highlight: faceColors.mid };
    const baseColors = bottomColors ?? { light: faceColors.shadow, mid: faceColors.shadow, dark: faceColors.shadow };
    const shell = extrudeConvexFootprint(projection, localVerts, facing);
    const baseGrad = ctx.createLinearGradient(shell.baseCorners[0].x, shell.baseCorners[0].y, shell.baseCorners[1].x, shell.baseCorners[1].y);
    baseGrad.addColorStop(0.0, baseColors.light);
    baseGrad.addColorStop(0.5, baseColors.mid);
    baseGrad.addColorStop(1.0, baseColors.dark);
    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = outlineWidth;
    ctx.beginPath();
    traceClosedPolygon(ctx, shell.baseCorners);
    ctx.fill();
    ctx.stroke();
    const exposedEdges = exposedPoxelEdgeKeys(poxels);
    const backFaces = [];
    const frontFaces = [];
    const topTris = [];
    for (let p = 0; p < poxels.length; p++) {
        const triVerts = poxelLocalVerts(poxels[p]);
        const tri = extrudeConvexFootprint(projection, triVerts, facing);
        const raw = poxels[p].vertices;
        for (let i = 0; i < 3; i++) {
            const key = canonicalPoxelEdgeKey(raw[i * 2], raw[i * 2 + 1], raw[((i + 1) % 3) * 2], raw[((i + 1) % 3) * 2 + 1]);
            if (!exposedEdges.has(key)) continue;
            const face = tri.faces[i];
            const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
            const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
            if (isFaceVisible(px, py, cx, cy, edgeMidX, edgeMidY)) frontFaces.push(face);
            else backFaces.push(face);
        }
        topTris.push({
            corners: tri.topCorners,
            raw,
            distSq: poxelWorldCentroidDistSq(prop, poxels[p], px, py, facing),
        });
    }
    for (const face of backFaces) drawBoxSideFace(ctx, face, cx, cy, backColors, { stroke, lineWidth: sideWidth, drawPlanks: false });
    for (const face of frontFaces) drawBoxSideFace(ctx, face, cx, cy, faceColors, { stroke, lineWidth: sideWidth, drawPlanks: false });
    topTris.sort((a, b) => b.distSq - a.distSq);
    for (const top of topTris) {
        const c = top.corners;
        const cxTop = (c[0].x + c[1].x + c[2].x) / 3;
        const cyTop = (c[0].y + c[1].y + c[2].y) / 3;
        const topGrad = ctx.createLinearGradient(cxTop - 4, cyTop - 4, cxTop + 4, cyTop + 4);
        topGrad.addColorStop(0.0, topColors.light);
        topGrad.addColorStop(0.5, topColors.mid);
        topGrad.addColorStop(1.0, topColors.dark);
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        traceClosedPolygon(ctx, c);
        ctx.fill();
    }
    const drawnTopEdges = new Set();
    ctx.lineJoin = "round";
    for (let p = 0; p < topTris.length; p++) {
        const top = topTris[p];
        const c = top.corners;
        const raw = top.raw;
        for (let i = 0; i < 3; i++) {
            const key = canonicalPoxelEdgeKey(raw[i * 2], raw[i * 2 + 1], raw[((i + 1) % 3) * 2], raw[((i + 1) % 3) * 2 + 1]);
            if (drawnTopEdges.has(key)) continue;
            drawnTopEdges.add(key);
            const exposed = exposedEdges.has(key);
            ctx.strokeStyle = exposed ? stroke : seamStroke;
            ctx.lineWidth = exposed ? outlineWidth : seamWidth;
            ctx.beginPath();
            traceSegment(ctx, c[i].x, c[i].y, c[(i + 1) % 3].x, c[(i + 1) % 3].y);
            ctx.stroke();
        }
    }
}
