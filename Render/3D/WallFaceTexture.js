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

/**
 * World-anchored repeating pattern on two face triangles (reference fork technique).
 * U follows world position along the wall edge; V runs base → far projection.
 */
function drawFaceTexture(ctx, p1, p2, face, textureCanvas, projectionDistance) {
    const tileWorldSize = floorTileSettings.tileWorldSize ?? gridSettings.cellSize;
    const texW = textureCanvas.width;
    const texH = textureCanvas.height;
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (edgeLen < 0.001) return;

    const edgeDirX = (p2.x - p1.x) / edgeLen;
    const edgeDirY = (p2.y - p1.y) / edgeLen;
    const uAlongEdge = p1.x * edgeDirX + p1.y * edgeDirY;
    const uPatternOffset = (((uAlongEdge / tileWorldSize) % 1) + 1) % 1 * texW;
    const verticalTiles = projectionDistance / tileWorldSize;
    const vMax = verticalTiles * texH;

    const ax = p1.x;
    const ay = p1.y;
    const bx = p2.x;
    const by = p2.y;
    const projAx = face.proj1X;
    const projAy = face.proj1Y;
    const projBx = face.proj2X;
    const projBy = face.proj2Y;

    const u1 = uPatternOffset;
    const u2 = uPatternOffset + (edgeLen / tileWorldSize) * texW;
    const du = u2 - u1;

    const pattern = ctx.createPattern(textureCanvas, "repeat");

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(projAx, projAy);
    ctx.closePath();
    ctx.clip();

    const a1 = (bx - ax) / du;
    const b1 = (by - ay) / du;
    const c1 = (projAx - ax) / vMax;
    const d1 = (projAy - ay) / vMax;
    const e1 = ax - a1 * u1;
    const f1 = ay - b1 * u1;

    pattern.setTransform(new DOMMatrix([a1, b1, c1, d1, e1, f1]));
    ctx.fillStyle = pattern;

    let minX = Math.min(ax, bx, projAx);
    let maxX = Math.max(ax, bx, projAx);
    let minY = Math.min(ay, by, projAy);
    let maxY = Math.max(ay, by, projAy);
    ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(projBx, projBy);
    ctx.lineTo(projAx, projAy);
    ctx.closePath();
    ctx.clip();

    const a2 = (projBx - projAx) / du;
    const b2 = (projBy - projAy) / du;
    const c2 = (projBx - bx) / vMax;
    const d2 = (projBy - by) / vMax;
    const e2 = bx - a2 * u2;
    const f2 = by - b2 * u2;

    pattern.setTransform(new DOMMatrix([a2, b2, c2, d2, e2, f2]));
    ctx.fillStyle = pattern;

    minX = Math.min(bx, projBx, projAx);
    maxX = Math.max(bx, projBx, projAx);
    minY = Math.min(by, projBy, projAy);
    maxY = Math.max(by, projBy, projAy);
    ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
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
            drawFaceTexture(ctx, p1, p2, face, textureCanvas, projectionDistance);
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
