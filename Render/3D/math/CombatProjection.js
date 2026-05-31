// World props: geometry is built in world space (prop.facing at spawn).
// Symmetric cylinders use a viewer-facing silhouette (viewAngle for rim tangents only).
// Faceted extrusion remains available via bodyMode: "faceted".
import { angleDelta } from "../../../Math/Angle.js";
import { radiusAtT, scaleAtHeight } from "../../../Math/Interpolate.js";
import { rectCorners } from "../../../Math/Poly2D.js";

export { radiusAtT, scaleAtHeight };

export let CAMERA_HEIGHT = 160;
export function setCameraHeight(val) {
    CAMERA_HEIGHT = val;
}

export function projectVertical(objX, objY, viewerX, viewerY, height) {
    const dx = objX - viewerX;
    const dy = objY - viewerY;
    const dist = Math.hypot(dx, dy);
    const alpha = height / (CAMERA_HEIGHT - height);
    const topX = dist === 0 ? objX : objX + dx * alpha;
    const topY = dist === 0 ? objY : objY + dy * alpha;
    const viewAngle = Math.atan2(dy, dx);
    return { cx: objX, cy: objY, dx, dy, dist, alpha, topX, topY, viewAngle, height };
}

export function getHeightSlice(projection, baseSize, t) {
    const { cx, cy, topX, topY, alpha } = projection;
    return { centerX: cx + (topX - cx) * t, centerY: cy + (topY - cy) * t, size: scaleAtHeight(baseSize, alpha, t) };
}

export function pointOnFrustum(projection, baseRadius, topRadius, t, angle) {
    const { cx, cy, topX, topY } = projection;
    const radius = radiusAtT(baseRadius, topRadius, t);
    const centerX = cx + (topX - cx) * t;
    const centerY = cy + (topY - cy) * t;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

/** Arc on a circle rim that bulges toward the viewer (symmetric cylinder silhouette). */
export function traceVisibleArc(ctx, centerX, centerY, radius, fromAngle, toAngle, viewAngle) {
    const towardViewer = viewAngle + Math.PI;
    const delta = angleDelta(fromAngle, toAngle);
    const midShort = fromAngle + delta / 2;
    const midLong = midShort + (delta > 0 ? -Math.PI : Math.PI);
    const useShort = Math.abs(angleDelta(midShort, towardViewer)) < Math.abs(angleDelta(midLong, towardViewer));
    const counterClockwise = delta > 0 ? !useShort : useShort;
    ctx.arc(centerX, centerY, radius, fromAngle, toAngle, counterClockwise);
}

export function getRadialSilhouette(projection, baseRadius, topRadius = null) {
    const { cx, cy, topX, topY, alpha, viewAngle } = projection;
    const resolvedTop = topRadius === null ? baseRadius * (1 + alpha) : topRadius;
    const perpA = viewAngle + Math.PI / 2;
    const perpB = viewAngle - Math.PI / 2;
    const rimPoint = (centerX, centerY, radius, angle) => ({ x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });

    if (resolvedTop === 0) {
        const apex = { x: topX, y: topY };
        return { viewAngle, perpA, perpB, baseRadius, topRadius: 0, baseLeft: rimPoint(cx, cy, baseRadius, perpA), baseRight: rimPoint(cx, cy, baseRadius, perpB), topLeft: apex, topRight: apex };
    }

    return {
        viewAngle,
        perpA,
        perpB,
        baseRadius,
        topRadius: resolvedTop,
        baseLeft: rimPoint(cx, cy, baseRadius, perpA),
        baseRight: rimPoint(cx, cy, baseRadius, perpB),
        topLeft: rimPoint(topX, topY, resolvedTop, perpA),
        topRight: rimPoint(topX, topY, resolvedTop, perpB),
    };
}

export function extrudeRadial(projection, baseRadius, topRadius, facing, segments = 12) {
    const { cx, cy, topX, topY, alpha } = projection;
    const resolvedTop = topRadius === 0 ? 0 : (topRadius ?? baseRadius * (1 + alpha));
    const faces = [];
    for (let i = 0; i < segments; i++) {
        const a0 = facing + (i / segments) * Math.PI * 2;
        const a1 = facing + ((i + 1) / segments) * Math.PI * 2;
        const apex = { x: topX, y: topY };
        faces.push({
            baseA: { x: cx + Math.cos(a0) * baseRadius, y: cy + Math.sin(a0) * baseRadius },
            baseB: { x: cx + Math.cos(a1) * baseRadius, y: cy + Math.sin(a1) * baseRadius },
            topA: resolvedTop === 0 ? apex : { x: topX + Math.cos(a0) * resolvedTop, y: topY + Math.sin(a0) * resolvedTop },
            topB: resolvedTop === 0 ? apex : { x: topX + Math.cos(a1) * resolvedTop, y: topY + Math.sin(a1) * resolvedTop },
            midAngle: (a0 + a1) / 2,
        });
    }

    return { faces, cx, cy, topX, topY, topRadius: resolvedTop };
}

export function getBoxCorners(centerX, centerY, halfSize, angle = 0) {
    return rectCorners(centerX, centerY, halfSize, angle);
}

export function extrudeBox(projection, halfSize, angle = 0) {
    const { cx, cy, topX, topY, alpha } = projection;
    const topHalfSize = scaleAtHeight(halfSize, alpha, 1);
    const baseCorners = getBoxCorners(cx, cy, halfSize, angle);
    const topCorners = getBoxCorners(topX, topY, topHalfSize, angle);
    return {
        halfSize,
        topHalfSize,
        baseCorners,
        topCorners,
        faces: baseCorners.map((_, i) => {
            const next = (i + 1) % 4;
            return { baseA: baseCorners[i], baseB: baseCorners[next], topA: topCorners[i], topB: topCorners[next] };
        }),
    };
}

export function isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewerX, viewerY) {
    const outX = edgeMidX - originX;
    const outY = edgeMidY - originY;
    const viewX = edgeMidX - viewerX;
    const viewY = edgeMidY - viewerY;
    return outX * viewX + outY * viewY < 0;
}

export function getSideHighlightT(viewAngle, lightAngle = (-3 * Math.PI) / 4) {
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
    const nx = Math.cos(viewAngle + Math.PI / 2);
    const ny = Math.sin(viewAngle + Math.PI / 2);
    const dot = lx * nx + ly * ny;
    return Math.max(0.1, Math.min(0.9, 0.5 + dot * 0.5));
}

export function createSideGradient(ctx, left, right, viewAngle, colors) {
    const t = getSideHighlightT(viewAngle);
    const grad = ctx.createLinearGradient(left.x, left.y, right.x, right.y);
    grad.addColorStop(0.0, colors.shadow);
    grad.addColorStop(Math.max(0.0, t - 0.25), colors.mid);
    grad.addColorStop(t, colors.highlight);
    grad.addColorStop(Math.min(1.0, t + 0.25), colors.mid);
    grad.addColorStop(1.0, colors.shadow);
    return grad;
}
