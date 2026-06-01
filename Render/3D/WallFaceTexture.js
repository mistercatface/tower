import { floorTileSettings, gridSettings } from "../../Config/Config.js";

export const WALL_ANGLE_SPREAD = 0.002;

export function getWallProjectionDistance() {
    return floorTileSettings.wallProjectionDistance ?? 3000;
}

function getEdgeSpread(p1, p2, px, py) {
    const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
    return cross > 0
        ? { spread1: -WALL_ANGLE_SPREAD, spread2: WALL_ANGLE_SPREAD }
        : { spread1: WALL_ANGLE_SPREAD, spread2: -WALL_ANGLE_SPREAD };
}

function spreadAtPoint(p, p1, p2, spread1, spread2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return (spread1 + spread2) * 0.5;
    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq));
    return spread1 + (spread2 - spread1) * t;
}

function projectFar(p, p1, p2, px, py, spread1, spread2, distance) {
    const adjust = spreadAtPoint(p, p1, p2, spread1, spread2);
    const angle = Math.atan2(p.y - py, p.x - px) + adjust;
    return {
        x: p.x + Math.cos(angle) * distance,
        y: p.y + Math.sin(angle) * distance,
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Original offscreen wall projection — rays extend toward the viewer. */
export function computeProjectedFace(p1, p2, px, py, distance = getWallProjectionDistance()) {
    const { spread1, spread2 } = getEdgeSpread(p1, p2, px, py);
    const far1 = projectFar(p1, p1, p2, px, py, spread1, spread2, distance);
    const far2 = projectFar(p2, p1, p2, px, py, spread1, spread2, distance);
    return {
        proj1X: far1.x,
        proj1Y: far1.y,
        proj2X: far2.x,
        proj2Y: far2.y,
    };
}

export function traceProjectedFace(ctx, p1, p2, face) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(face.proj1X, face.proj1Y);
    ctx.lineTo(face.proj2X, face.proj2Y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
}

function getVisibleWallRows(fullRows, viewport) {
    const maxRows = floorTileSettings.wallMaxVisibleRows ?? 32;
    if (!viewport) return Math.min(fullRows, maxRows);

    const cellSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    const halfH = viewport.cy / Math.max(viewport.zoom, 0.001);
    const screenEstimate = Math.ceil(halfH / cellSize) + 2;
    return Math.min(fullRows, maxRows, Math.max(1, screenEstimate));
}

function fillPatternTriangle(ctx, pattern, matrix, x0, y0, x1, y1, x2, y2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    pattern.setTransform(matrix);
    ctx.fillStyle = pattern;

    const minX = Math.min(x0, x1, x2) - 1;
    const maxX = Math.max(x0, x1, x2) + 1;
    const minY = Math.min(y0, y1, y2) - 1;
    const maxY = Math.max(y0, y1, y2) + 1;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
}

/**
 * World-anchored pattern split into one-tile row bands. A single affine map over the
 * full 3000px face bends horizontal grid lines; thin rows keep them straight.
 */
function drawFaceTexture(ctx, p1, p2, face, textureCanvas, projectionDistance, viewport) {
    const tileWorldSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    const texW = textureCanvas.width;
    const texH = textureCanvas.height;
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (edgeLen < 0.001) return;

    const edgeDirX = (p2.x - p1.x) / edgeLen;
    const edgeDirY = (p2.y - p1.y) / edgeLen;
    const uAlongEdge = p1.x * edgeDirX + p1.y * edgeDirY;
    const u1 = (((uAlongEdge / tileWorldSize) % 1) + 1) % 1 * texW;
    const u2 = u1 + (edgeLen / tileWorldSize) * texW;
    const du = u2 - u1;
    if (Math.abs(du) < 1e-6) return;

    const fullRows = Math.max(1, Math.ceil(projectionDistance / tileWorldSize));
    const visibleRows = getVisibleWallRows(fullRows, viewport);
    const pattern = ctx.createPattern(textureCanvas, "repeat");

    const leftTop = { x: face.proj1X, y: face.proj1Y };
    const rightTop = { x: face.proj2X, y: face.proj2Y };

    ctx.save();
    traceProjectedFace(ctx, p1, p2, face);
    ctx.clip();

    for (let row = 0; row < visibleRows; row++) {
        const t0 = row / fullRows;
        const t1 = (row + 1) / fullRows;
        const bl = lerpPoint(p1, leftTop, t0);
        const br = lerpPoint(p2, rightTop, t0);
        const tl = lerpPoint(p1, leftTop, t1);
        const tr = lerpPoint(p2, rightTop, t1);

        const v1 = row * texH;
        const v2 = (row + 1) * texH;
        const dv = texH;

        const a1 = (br.x - bl.x) / du;
        const b1 = (br.y - bl.y) / du;
        const c1 = (tl.x - bl.x) / dv;
        const d1 = (tl.y - bl.y) / dv;
        const e1 = bl.x - a1 * u1 - c1 * v1;
        const f1 = bl.y - b1 * u1 - d1 * v1;
        fillPatternTriangle(ctx, pattern, new DOMMatrix([a1, b1, c1, d1, e1, f1]), bl.x, bl.y, br.x, br.y, tl.x, tl.y);

        const a2 = (tr.x - tl.x) / du;
        const b2 = (tr.y - tl.y) / du;
        const c2 = (tr.x - br.x) / dv;
        const d2 = (tr.y - br.y) / dv;
        const e2 = br.x - a2 * u2 - c2 * v1;
        const f2 = br.y - b2 * u2 - d2 * v1;
        fillPatternTriangle(ctx, pattern, new DOMMatrix([a2, b2, c2, d2, e2, f2]), br.x, br.y, tr.x, tr.y, tl.x, tl.y);
    }

    ctx.restore();
}

export function drawProjectedWallFace(
    ctx,
    p1,
    p2,
    px,
    py,
    fillStyle,
    floorTiles,
    state,
    {
        viewport = null,
        damageAlpha = 0,
        textureEnabled = true,
        shouldStroke = false,
        shadeOverlay = 0,
    } = {},
) {
    const projectionDistance = getWallProjectionDistance();
    const face = computeProjectedFace(p1, p2, px, py, projectionDistance);

    traceProjectedFace(ctx, p1, p2, face);
    ctx.fillStyle = fillStyle;
    ctx.fill();

    if (floorTiles && textureEnabled) {
        const textureCanvas = floorTiles.getTileTextureCanvas(state);
        if (textureCanvas) {
            drawFaceTexture(ctx, p1, p2, face, textureCanvas, projectionDistance, viewport);
        }
    }

    if (shadeOverlay > 0) {
        ctx.save();
        traceProjectedFace(ctx, p1, p2, face);
        ctx.clip();
        ctx.fillStyle = `rgba(0, 0, 0, ${shadeOverlay})`;
        ctx.fill();
        ctx.restore();
    }

    if (damageAlpha > 0) {
        ctx.save();
        traceProjectedFace(ctx, p1, p2, face);
        ctx.clip();
        ctx.fillStyle = `rgba(244, 67, 54, ${damageAlpha})`;
        ctx.fill();
        ctx.restore();
    }

    if (shouldStroke) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }
}
