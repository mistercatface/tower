import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import { CAMERA_HEIGHT } from "./math/CombatProjection.js";

const WALL_ANGLE_SPREAD = 0.002;

export function getWallVisualHeight() {
    const configured = floorTileSettings.wallVisualHeight;
    if (configured != null) return configured;
    return CAMERA_HEIGHT - 10;
}

/** Distance-scaled projection — walls extend offscreen when wallVisualHeight is near CAMERA_HEIGHT. */
export function computeProjectedFace(p1, p2, px, py, wallHeight = getWallVisualHeight()) {
    let angle1 = Math.atan2(p1.y - py, p1.x - px);
    let angle2 = Math.atan2(p2.y - py, p2.x - px);
    const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
    if (cross > 0) {
        angle1 -= WALL_ANGLE_SPREAD;
        angle2 += WALL_ANGLE_SPREAD;
    } else {
        angle1 += WALL_ANGLE_SPREAD;
        angle2 -= WALL_ANGLE_SPREAD;
    }

    const dist1 = Math.hypot(p1.x - px, p1.y - py);
    const dist2 = Math.hypot(p2.x - px, p2.y - py);
    const clampedHeight = Math.min(wallHeight, CAMERA_HEIGHT - 10);
    const alpha = clampedHeight / (CAMERA_HEIGHT - clampedHeight);

    return {
        proj1X: p1.x + Math.cos(angle1) * dist1 * alpha,
        proj1Y: p1.y + Math.sin(angle1) * dist1 * alpha,
        proj2X: p2.x + Math.cos(angle2) * dist2 * alpha,
        proj2Y: p2.y + Math.sin(angle2) * dist2 * alpha,
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

function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function paintPatternTriangle(ctx, pattern, matrix, x0, y0, x1, y1, x2, y2) {
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
 * One tile row per band on the face surface. Absolute world U (no per-face modulo) so maze
 * cell faces share continuous grout across segment boundaries.
 */
function drawFaceTexture(ctx, p1, p2, face, textureCanvas, wallHeight) {
    const tileWorldSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    const texW = textureCanvas.width;
    const texH = textureCanvas.height;
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (edgeLen < 0.001) return;

    const edgeDirX = (p2.x - p1.x) / edgeLen;
    const edgeDirY = (p2.y - p1.y) / edgeLen;
    const uAlongEdge = p1.x * edgeDirX + p1.y * edgeDirY;
    const u1 = (uAlongEdge / tileWorldSize) * texW;
    const u2 = u1 + (edgeLen / tileWorldSize) * texW;
    const du = u2 - u1;
    if (Math.abs(du) < 1e-6) return;

    const rowCount = Math.max(1, Math.ceil(wallHeight / tileWorldSize));
    const leftTop = { x: face.proj1X, y: face.proj1Y };
    const rightTop = { x: face.proj2X, y: face.proj2Y };
    const pattern = ctx.createPattern(textureCanvas, "repeat");

    ctx.save();
    traceProjectedFace(ctx, p1, p2, face);
    ctx.clip();

    for (let row = 0; row < rowCount; row++) {
        const t0 = row / rowCount;
        const t1 = (row + 1) / rowCount;
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
        paintPatternTriangle(ctx, pattern, new DOMMatrix([a1, b1, c1, d1, e1, f1]), bl.x, bl.y, br.x, br.y, tl.x, tl.y);

        const a2 = (tr.x - tl.x) / du;
        const b2 = (tr.y - tl.y) / du;
        const c2 = (tr.x - br.x) / dv;
        const d2 = (tr.y - br.y) / dv;
        const e2 = br.x - a2 * u2 - c2 * v1;
        const f2 = br.y - b2 * u2 - d2 * v1;
        paintPatternTriangle(ctx, pattern, new DOMMatrix([a2, b2, c2, d2, e2, f2]), br.x, br.y, tr.x, tr.y, tl.x, tl.y);
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
    textureCanvas,
    {
        damageAlpha = 0,
        textureEnabled = true,
        shouldStroke = false,
        shadeOverlay = 0,
    } = {},
) {
    const wallHeight = getWallVisualHeight();
    const face = computeProjectedFace(p1, p2, px, py, wallHeight);

    traceProjectedFace(ctx, p1, p2, face);
    ctx.fillStyle = fillStyle;
    ctx.fill();

    if (textureCanvas && textureEnabled) {
        drawFaceTexture(ctx, p1, p2, face, textureCanvas, wallHeight);
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
