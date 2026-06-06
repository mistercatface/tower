// World props: geometry is built in world space (prop.facing at spawn).
// Symmetric cylinders use a viewer-facing silhouette (viewAngle for rim tangents only).
import { angleDelta } from "../../Math/Angle.js";
import { radiusAtT, scaleAtHeight } from "../../Math/Interpolate.js";
import { rectCorners } from "../../Math/Poly2D.js";
import { LIBRARY_DEFAULT_CAMERA_HEIGHT, LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH } from "./perspectiveDefaults.js";
export { radiusAtT, scaleAtHeight };
export let CAMERA_HEIGHT = LIBRARY_DEFAULT_CAMERA_HEIGHT;
export let PERSPECTIVE_STRENGTH = LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH;
export function setCameraHeight(val) {
    CAMERA_HEIGHT = val;
}
export function setPerspectiveStrength(val) {
    PERSPECTIVE_STRENGTH = Math.max(0, val);
}
/**
 * Radial extrusion factor for a world point at elevation height.
 *
 * @param {number} height
 * @param {number} cameraHeight
 * @param {number} [strength]
 */
export function resolveElevationAlpha(height, cameraHeight, strength = 1) {
    if (height <= 0 || cameraHeight <= height) return 0;
    return (height / (cameraHeight - height)) * strength;
}
/**
 * Project a world point to its screen position at elevation height.
 * Shared by horizontal surfaces, wall roof caps, and iso props.
 *
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} height
 * @param {number} cameraHeight
 * @param {number} [strength]
 * @returns {{ x: number, y: number }}
 */
export function projectWorldPointAtHeight(worldX, worldY, viewerX, viewerY, height, cameraHeight, strength = 1) {
    const alpha = resolveElevationAlpha(height, cameraHeight, strength);
    if (alpha <= 0) return { x: worldX, y: worldY };
    return { x: worldX + (worldX - viewerX) * alpha, y: worldY + (worldY - viewerY) * alpha };
}
/**
 * Project the four corners of a world-axis-aligned rectangle at elevation height.
 *
 * @param {number} originX
 * @param {number} originY
 * @param {number} sizePx
 * @param {number} height
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {number} [strength]
 * @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]}
 */
export function projectWorldRectCorners(originX, originY, sizePx, height, viewerX, viewerY, cameraHeight, strength = 1) {
    return [
        projectWorldPointAtHeight(originX, originY, viewerX, viewerY, height, cameraHeight, strength),
        projectWorldPointAtHeight(originX + sizePx, originY, viewerX, viewerY, height, cameraHeight, strength),
        projectWorldPointAtHeight(originX + sizePx, originY + sizePx, viewerX, viewerY, height, cameraHeight, strength),
        projectWorldPointAtHeight(originX, originY + sizePx, viewerX, viewerY, height, cameraHeight, strength),
    ];
}
export function projectVertical(objX, objY, viewerX, viewerY, height) {
    const dx = objX - viewerX;
    const dy = objY - viewerY;
    const dist = Math.hypot(dx, dy);
    const alpha = resolveElevationAlpha(height, CAMERA_HEIGHT, PERSPECTIVE_STRENGTH);
    const top = projectWorldPointAtHeight(objX, objY, viewerX, viewerY, height, CAMERA_HEIGHT, PERSPECTIVE_STRENGTH);
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
