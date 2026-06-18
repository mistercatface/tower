// World props: geometry is built in world space (prop.facing at spawn).
// Symmetric cylinders use a viewer-facing silhouette (viewAngle for rim tangents only).
import { angleDelta } from "../../Math/Angle.js";
import { radiusAtT, scaleAtHeight } from "../../Math/Interpolate.js";
import { rectCorners } from "../../Math/Poly2D.js";
import { elevationCameraFromViewer } from "./ElevationCamera.js";
export { radiusAtT, scaleAtHeight };
/**
 * Radial extrusion factor for a world point at elevation height.
 *
 * @param {number} height
 * @param {import("./ElevationCamera.js").ElevationCamera} camera
 */
export function resolveElevationAlpha(height, camera) {
    const { cameraHeight, strength } = camera;
    if (height <= 0 || cameraHeight <= height) return 0;
    return (height / (cameraHeight - height)) * strength;
}
/**
 * @param {{ x: number, y: number }} out
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} height
 * @param {import("./ElevationCamera.js").ElevationCamera} camera
 * @returns {typeof out}
 */
export function projectWorldPointInto(out, worldX, worldY, height, camera) {
    const alpha = resolveElevationAlpha(height, camera);
    if (alpha <= 0) {
        out.x = worldX;
        out.y = worldY;
    } else {
        out.x = worldX + (worldX - camera.viewerX) * alpha;
        out.y = worldY + (worldY - camera.viewerY) * alpha;
    }
    return out;
}
/**
 * Project a world point to its screen position at elevation height.
 *
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} height
 * @param {import("./ElevationCamera.js").ElevationCamera} camera
 * @returns {{ x: number, y: number }}
 */
export function projectWorldPointAtHeight(worldX, worldY, height, camera) {
    return projectWorldPointInto({ x: 0, y: 0 }, worldX, worldY, height, camera);
}
/** Elevation projection then viewport pan/zoom — canonical world (x, y, z) → screen pixels. */
export function projectWorldPointToScreenInto(out, viewport, camera, worldX, worldY, height) {
    projectWorldPointInto(out, worldX, worldY, height, camera);
    const screen = viewport.worldToScreen(out.x, out.y);
    out.x = screen.x;
    out.y = screen.y;
    return out;
}
/**
 * Project the four corners of a world-axis-aligned rectangle at elevation height.
 *
 * @param {number} originX
 * @param {number} originY
 * @param {number} sizePx
 * @param {number} height
 * @param {import("./ElevationCamera.js").ElevationCamera} camera
 * @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]}
 */
/** @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} Allocates — prefer `projectWorldAabbCornersInto`. */
export function projectWorldRectCorners(originX, originY, sizePx, height, camera) {
    const out = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ];
    projectWorldAabbCornersInto(out, originX, originY, originX + sizePx, originY + sizePx, height, camera);
    return out;
}
/** @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} out4 @param {import("./ElevationCamera.js").ElevationCamera} camera */
export function projectWorldAabbCornersInto(out4, minX, minY, maxX, maxY, height, camera) {
    projectWorldPointInto(out4[0], minX, minY, height, camera);
    projectWorldPointInto(out4[1], maxX, minY, height, camera);
    projectWorldPointInto(out4[2], maxX, maxY, height, camera);
    projectWorldPointInto(out4[3], minX, maxY, height, camera);
    return out4;
}
export function projectVertical(objX, objY, viewerX, viewerY, height) {
    const camera = elevationCameraFromViewer(viewerX, viewerY);
    const dx = objX - viewerX;
    const dy = objY - viewerY;
    const dist = Math.hypot(dx, dy);
    const alpha = resolveElevationAlpha(height, camera);
    const top = projectWorldPointAtHeight(objX, objY, height, camera);
    const viewAngle = Math.atan2(dy, dx);
    return { cx: objX, cy: objY, dx, dy, dist, alpha, topX: top.x, topY: top.y, viewAngle, height };
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
export function extrudeBox(projection, halfSize, angle = 0) {
    const { cx, cy, topX, topY, alpha } = projection;
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    const topHx = scaleAtHeight(hx, alpha, 1);
    const topHy = scaleAtHeight(hy, alpha, 1);
    const baseCorners = rectCorners(cx, cy, { x: hx, y: hy }, angle);
    const topCorners = rectCorners(topX, topY, { x: topHx, y: topHy }, angle);
    return {
        halfSize: { x: hx, y: hy },
        topHalfSize: { x: topHx, y: topHy },
        baseCorners,
        topCorners,
        faces: baseCorners.map((_, i) => {
            const next = (i + 1) % 4;
            return { baseA: baseCorners[i], baseB: baseCorners[next], topA: topCorners[i], topB: topCorners[next] };
        }),
    };
}
export function extrudeConvexFootprint(projection, localVerts, angle = 0) {
    const { cx, cy, topX, topY, alpha } = projection;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const count = localVerts.length;
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
    const faces = new Array(count);
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        faces[i] = { baseA: baseCorners[i], baseB: baseCorners[next], topA: topCorners[i], topB: topCorners[next] };
    }
    return { baseCorners, topCorners, faces };
}
export function isOutwardFaceTowardViewer(midX, midY, outwardX, outwardY, viewerX, viewerY) {
    const viewX = midX - viewerX;
    const viewY = midY - viewerY;
    return outwardX * viewX + outwardY * viewY < 0;
}
export function isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewerX, viewerY) {
    return isOutwardFaceTowardViewer(edgeMidX, edgeMidY, edgeMidX - originX, edgeMidY - originY, viewerX, viewerY);
}
export function getSideHighlightT(viewAngle, lightAngle = (-3 * Math.PI) / 4) {
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
    const nx = Math.cos(viewAngle + Math.PI / 2);
    const ny = Math.sin(viewAngle + Math.PI / 2);
    const dot = lx * nx + ly * ny;
    return Math.max(0.1, Math.min(0.9, 0.5 + dot * 0.5));
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
