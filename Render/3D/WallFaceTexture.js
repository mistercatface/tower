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

function getViewportWorldBounds(viewport, padding = floorTileSettings.viewPaddingPx ?? 128) {
    if (!viewport) return null;
    return viewport.getWorldBounds(viewport.cx * 2, viewport.cy * 2, padding);
}

function rowBoundsIntersects(bl, br, tl, tr, bounds) {
    if (!bounds) return true;
    const minX = Math.min(bl.x, br.x, tl.x, tr.x);
    const maxX = Math.max(bl.x, br.x, tl.x, tr.x);
    const minY = Math.min(bl.y, br.y, tl.y, tr.y);
    const maxY = Math.max(bl.y, br.y, tl.y, tr.y);
    return !(maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY);
}

function estimateFaceScreenSpan(p1, p2, face) {
    const topMidX = (face.proj1X + face.proj2X) * 0.5;
    const topMidY = (face.proj1Y + face.proj2Y) * 0.5;
    const baseMidX = (p1.x + p2.x) * 0.5;
    const baseMidY = (p1.y + p2.y) * 0.5;
    return Math.hypot(topMidX - baseMidX, topMidY - baseMidY);
}

/** Even story bands on the face; LOD tiers avoid sub-pixel scanlines without swimming every frame. */
function getWallStoryCount(p1, p2, face) {
    const maxStories = floorTileSettings.maxWallStories ?? 32;
    const minStories = floorTileSettings.minWallStories ?? 12;
    const minPxPerStory = floorTileSettings.minPxPerStory ?? 4;
    const tiers = floorTileSettings.wallStoryLodTiers ?? [12, 16, 24, 32];

    const faceSpan = estimateFaceScreenSpan(p1, p2, face);
    const target = Math.min(maxStories, Math.max(minStories, Math.floor(faceSpan / minPxPerStory)));

    let chosen = tiers[0] ?? minStories;
    for (const tier of tiers) {
        if (tier <= target) chosen = tier;
    }
    return Math.min(maxStories, Math.max(minStories, chosen));
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

function bandCorners(p1, p2, leftTop, rightTop, t0, t1) {
    return {
        bl: lerpPoint(p1, leftTop, t0),
        br: lerpPoint(p2, rightTop, t0),
        tl: lerpPoint(p1, leftTop, t1),
        tr: lerpPoint(p2, rightTop, t1),
    };
}

function drawTextureBand(ctx, pattern, u1, u2, du, bl, br, tl, tr, v1, v2) {
    const dv = v2 - v1;
    if (Math.abs(dv) < 1e-6) return;

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

/**
 * N evenly spaced stories on the projected face. Absolute world U keeps grout continuous
 * across maze cells; geometry height stays on wallVisualHeight.
 */
function drawFaceTexture(ctx, p1, p2, face, textureCanvas, viewport) {
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

    const storyCount = getWallStoryCount(p1, p2, face);
    const leftTop = { x: face.proj1X, y: face.proj1Y };
    const rightTop = { x: face.proj2X, y: face.proj2Y };
    const pattern = ctx.createPattern(textureCanvas, "repeat");
    const worldBounds = getViewportWorldBounds(viewport);

    ctx.save();
    traceProjectedFace(ctx, p1, p2, face);
    ctx.clip();

    for (let row = 0; row < storyCount; row++) {
        const t0 = row / storyCount;
        const t1 = (row + 1) / storyCount;
        const { bl, br, tl, tr } = bandCorners(p1, p2, leftTop, rightTop, t0, t1);

        if (!rowBoundsIntersects(bl, br, tl, tr, worldBounds)) continue;

        drawTextureBand(ctx, pattern, u1, u2, du, bl, br, tl, tr, row * texH, (row + 1) * texH);
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
        viewport = null,
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
        drawFaceTexture(ctx, p1, p2, face, textureCanvas, viewport);
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
