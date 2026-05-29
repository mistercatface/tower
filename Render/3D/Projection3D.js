export const CAMERA_HEIGHT = 160;

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

export function scaleAtHeight(baseSize, alpha, t) {
    return baseSize * (1 + alpha * t);
}

export function getHeightSlice(projection, baseSize, t) {
    const { cx, cy, topX, topY, alpha } = projection;
    return {
        centerX: cx + (topX - cx) * t,
        centerY: cy + (topY - cy) * t,
        size: scaleAtHeight(baseSize, alpha, t),
    };
}

export function getRadialSilhouette(projection, baseRadius) {
    const { cx, cy, topX, topY, alpha, viewAngle } = projection;
    const topRadius = baseRadius * (1 + alpha);
    const perpA = viewAngle + Math.PI / 2;
    const perpB = viewAngle - Math.PI / 2;
    return {
        viewAngle,
        topRadius,
        baseLeft: { x: cx + Math.cos(perpA) * baseRadius, y: cy + Math.sin(perpA) * baseRadius },
        baseRight: { x: cx + Math.cos(perpB) * baseRadius, y: cy + Math.sin(perpB) * baseRadius },
        topLeft: { x: topX + Math.cos(perpA) * topRadius, y: topY + Math.sin(perpA) * topRadius },
        topRight: { x: topX + Math.cos(perpB) * topRadius, y: topY + Math.sin(perpB) * topRadius },
    };
}

export function getBoxCorners(centerX, centerY, halfSize) {
    return [
        { x: centerX - halfSize, y: centerY - halfSize },
        { x: centerX + halfSize, y: centerY - halfSize },
        { x: centerX + halfSize, y: centerY + halfSize },
        { x: centerX - halfSize, y: centerY + halfSize },
    ];
}

export function extrudeBox(projection, halfSize) {
    const { cx, cy, topX, topY, alpha } = projection;
    const topHalfSize = scaleAtHeight(halfSize, alpha, 1);
    const baseCorners = getBoxCorners(cx, cy, halfSize);
    const topCorners = getBoxCorners(topX, topY, topHalfSize);
    return {
        halfSize,
        topHalfSize,
        baseCorners,
        topCorners,
        faces: baseCorners.map((_, i) => {
            const next = (i + 1) % 4;
            return {
                baseA: baseCorners[i],
                baseB: baseCorners[next],
                topA: topCorners[i],
                topB: topCorners[next],
            };
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

export function getSideHighlightT(viewAngle, lightAngle = -3 * Math.PI / 4) {
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
