import { isFaceTowardViewer, pointOnFrustum, traceVisibleArc } from "../../Spatial/iso/IsometricProjection.js";
import { drawExtrudedRadial } from "./SolidDraw.js";

const DEFAULT_PANEL_COLORS = ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"];

function isPanelVisible(px, py, cx, cy, edgeMidX, edgeMidY) {
    return isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py);
}

function drawPanelWedge(ctx, projection, baseRadius, topRadius, t0, t1, a0, a1, fill, stroke, lineWidth, px, py) {
    const { cx, cy } = projection;
    const edgeMidX = (
        pointOnFrustum(projection, baseRadius, topRadius, t0, a0).x
        + pointOnFrustum(projection, baseRadius, topRadius, t0, a1).x
    ) / 2;
    const edgeMidY = (
        pointOnFrustum(projection, baseRadius, topRadius, t0, a0).y
        + pointOnFrustum(projection, baseRadius, topRadius, t0, a1).y
    ) / 2;
    if (!isPanelVisible(px, py, cx, cy, edgeMidX, edgeMidY)) return;

    const p0a = pointOnFrustum(projection, baseRadius, topRadius, t0, a0);
    const p0b = pointOnFrustum(projection, baseRadius, topRadius, t0, a1);
    const p1a = pointOnFrustum(projection, baseRadius, topRadius, t1, a0);
    const p1b = pointOnFrustum(projection, baseRadius, topRadius, t1, a1);

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(p0a.x, p0a.y);
    ctx.lineTo(p0b.x, p0b.y);
    ctx.lineTo(p1b.x, p1b.y);
    ctx.lineTo(p1a.x, p1a.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawLoFiTopCap(ctx, projection, topRadius, facing, panelCount, panelColors, stroke, lineWidth, px, py) {
    const { topX, topY, viewAngle, alpha } = projection;
    const capRadius = topRadius * (1 + alpha * 0.12);
    const step = (Math.PI * 2) / panelCount;

    for (let i = 0; i < panelCount; i++) {
        const a0 = facing + i * step;
        const a1 = facing + (i + 1) * step;
        const edgeMidX = topX + Math.cos((a0 + a1) * 0.5) * capRadius * 0.5;
        const edgeMidY = topY + Math.sin((a0 + a1) * 0.5) * capRadius * 0.5;
        if (!isPanelVisible(px, py, topX, topY, edgeMidX, edgeMidY)) continue;

        ctx.fillStyle = panelColors[i % panelColors.length];
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.arc(topX, topY, capRadius, a0, a1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth * 0.8;
    ctx.beginPath();
    traceVisibleArc(ctx, topX, topY, capRadius, viewAngle + Math.PI / 2, viewAngle - Math.PI / 2, viewAngle);
    ctx.stroke();
}

/**
 * Low-poly beach-ball style sphere for iso props. Panels rotate with prop.facing
 * and bake into the quantized prop sprite cache (16 facing steps).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {{
 *   baseRadius?: number,
 *   height?: number,
 *   panelCount?: number,
 *   panelColors?: string[],
 *   bodyColors?: { shadow: string, mid: string, highlight: string },
 *   stroke?: string,
 *   lineWidth?: number,
 * }} [options]
 */
export function drawLoFiSphere(ctx, prop, px, py, options = {}) {
    const baseRadius = options.baseRadius ?? prop.radius ?? 8;
    const height = options.height ?? baseRadius * 1.35;
    const panelCount = Math.max(3, options.panelCount ?? 6);
    const panelColors = options.panelColors ?? DEFAULT_PANEL_COLORS;
    const stroke = options.stroke ?? "#2a2a2a";
    const lineWidth = options.lineWidth ?? 1.1;
    const facing = prop.facing ?? 0;
    const bodyColors = options.bodyColors ?? {
        shadow: "#D0D0D0",
        mid: "#F2F2F2",
        highlight: "#FFFFFF",
    };

    const topRadius = baseRadius * 0.92;
    const { projection } = drawExtrudedRadial(ctx, prop, px, py, {
        baseRadius,
        topRadius,
        height,
        facing,
        colors: bodyColors,
    });

    const step = (Math.PI * 2) / panelCount;
    for (let i = 0; i < panelCount; i++) {
        drawPanelWedge(
            ctx,
            projection,
            baseRadius,
            topRadius,
            0.08,
            0.92,
            facing + i * step,
            facing + (i + 1) * step,
            panelColors[i % panelColors.length],
            stroke,
            lineWidth,
            px,
            py,
        );
    }

    drawLoFiTopCap(ctx, projection, topRadius, facing, panelCount, panelColors, stroke, lineWidth * 0.9, px, py);
}
