import { drawExtrudedRadial, drawRadialBand } from "../../SolidDraw.js";
import { JACKO_CAN } from "../../../../Config/props/JackoCan.js";

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

    drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        height: combat.height,
        colors: bodyColors,
        stroke: colors.stroke,
    });

    if (onFire) {
        drawRadialBand(ctx, pc, {
            baseRadius: radius,
            height: combat.height,
            t0: combat.bandT0,
            t1: combat.bandT1,
            fill: "rgba(60, 20, 12, 0.35)",
            stroke: colors.stroke,
        });
    }

    drawCanTopCombat(ctx, pc, radius, combat.height, onFire);
}
