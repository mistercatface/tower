import { isFaceTowardViewer, pointOnFrustum } from "../../Projection3D.js";
import { drawExtrudedRadial, drawRadialBand, RADIAL_SEGMENTS } from "../../SolidDraw.js";
import { drawImageQuad } from "../../core/AffineTexture.js";
import { getTexture } from "../../core/TextureCache.js";
import { JACKO_CAN, JACKO_LABEL_SRC } from "../../../../Config/props/JackoCan.js";

function normalizeAngle(a) {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}

function angleInLabelArc(angle, frontAngle, arcHalf) {
    return Math.abs(normalizeAngle(angle - frontAngle)) <= arcHalf;
}

function labelU(angle, frontAngle, arcHalf) {
    return (normalizeAngle(angle - frontAngle) + arcHalf) / (arcHalf * 2);
}

function drawCylindricalLabelCombat(ctx, pc, img, { baseRadius, height, t0, t1, facing, arcHalf }) {
    if (!img) return;

    const projection = pc.project(height);
    const resolvedTop = baseRadius * (1 + projection.alpha);
    const { cx, cy } = projection;
    const frontAngle = Math.atan2(pc.py - pc.y, pc.px - pc.x);
    const iw = img.width;
    const ih = img.height;

    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
        const a0 = facing + (i / RADIAL_SEGMENTS) * Math.PI * 2;
        const a1 = facing + ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
        const midA = (a0 + a1) / 2;
        if (!angleInLabelArc(midA, frontAngle, arcHalf)) continue;

        const edgeMidX = (
            pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).x
            + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).x
        ) / 2;
        const edgeMidY = (
            pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).y
            + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).y
        ) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, pc.px, pc.py)) continue;

        const p0a = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0);
        const p0b = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1);
        const p1a = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a0);
        const p1b = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a1);

        const u0 = labelU(a0, frontAngle, arcHalf) * iw;
        const u1 = labelU(a1, frontAngle, arcHalf) * iw;

        drawImageQuad(ctx, img, u0, 0, u1, ih, p1a, p1b, p0b, p0a);
    }
}

function drawCanTopCombat(ctx, pc, radius, height, onFire) {
    const { colors } = JACKO_CAN;
    const projection = pc.project(height);
    const { topX, topY, alpha } = projection;
    const lipRadius = radius * 1.07;
    const capRadius = radius * 0.88;

    ctx.fillStyle = onFire ? "#6A3020" : colors.lip;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(topX, topY, lipRadius * (1 + alpha * 0.15), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const grad = ctx.createRadialGradient(topX, topY, 0, topX, topY, capRadius * (1 + alpha * 0.1));
    grad.addColorStop(0, onFire ? "#8A4030" : colors.top);
    grad.addColorStop(0.65, onFire ? "#5A2818" : "#A8ADB4");
    grad.addColorStop(1, onFire ? "#3A1810" : colors.lip);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(topX, topY, capRadius * (1 + alpha * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = onFire ? "#C0A090" : colors.tab;
    ctx.beginPath();
    ctx.ellipse(topX + radius * 0.12, topY - radius * 0.08, radius * 0.22, radius * 0.1, -0.35, 0, Math.PI * 2);
    ctx.fill();
}

export function drawJackoFuelBarrelCombat(ctx, pc, { onFire = false } = {}) {
    const { combat, colors } = JACKO_CAN;
    const radius = pc.prop.radius || 8;
    const bodyColors = onFire ? colors.bodyFire : colors.body;
    const { facing } = pc;

    drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        height: combat.height,
        colors: bodyColors,
        stroke: colors.stroke,
    });

    drawRadialBand(ctx, pc, {
        baseRadius: radius,
        height: combat.height,
        t0: combat.bandT0,
        t1: combat.bandT1,
        fill: onFire ? "rgba(60, 20, 12, 0.35)" : "rgba(120, 125, 132, 0.25)",
        stroke: colors.stroke,
    });

    drawCylindricalLabelCombat(ctx, pc, getTexture(JACKO_LABEL_SRC), {
        baseRadius: radius,
        height: combat.height,
        t0: combat.bandT0,
        t1: combat.bandT1,
        facing,
        arcHalf: combat.arcHalf,
    });

    drawCanTopCombat(ctx, pc, radius, combat.height, onFire);
}
