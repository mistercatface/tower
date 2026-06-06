import { drawExtrudedRadial, drawRadialBand } from "../../Render/Props3D/SolidDraw.js";
import { drawLoFiTippedCylinder } from "../../Render/Props3D/lofiTippedCylinder.js";
import { projectVertical } from "../../Spatial/iso/IsometricProjection.js";
import { isStandTipTilted } from "../../Spatial/transforms/longAxisBox3d.js";

const TIP_MESH_THRESHOLD = 0.06;

function drawBarrelTop(ctx, prop, px, py, radius, height, colors, onFire) {
    const projection = projectVertical(prop.x, prop.y, px, py, height);
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

function drawUprightBarrel(ctx, prop, px, py, radius, height, bodyColors, colors, onFire) {
    drawExtrudedRadial(ctx, prop, px, py, {
        baseRadius: radius,
        height,
        colors: bodyColors,
        stroke: colors.stroke,
    });

    if (onFire) {
        drawRadialBand(ctx, prop, px, py, {
            baseRadius: radius,
            height,
            t0: colors.bandT0 ?? 0.28,
            t1: colors.bandT1 ?? 0.72,
            fill: "rgba(60, 20, 12, 0.35)",
            stroke: colors.stroke,
        });
    }

    drawBarrelTop(ctx, prop, px, py, radius, height, colors, onFire);
}

/** @param {object} visuals */
export function createFuelBarrelDraw(visuals, { onFire = false } = {}) {
    const { world, colors } = visuals;
    return (ctx, prop, px, py) => {
        const radius = prop._baseRadius ?? prop.radius ?? 8;
        const height = world.height;
        const bodyColors = onFire ? colors.bodyFire : colors.body;
        const useMesh = prop.isFallen || isStandTipTilted(prop) || (prop.rollAngle ?? 0) >= TIP_MESH_THRESHOLD;

        if (!useMesh) {
            drawUprightBarrel(ctx, prop, px, py, radius, height, bodyColors, { ...colors, bandT0: world.bandT0, bandT1: world.bandT1 }, onFire);
            return;
        }

        drawLoFiTippedCylinder(ctx, prop, px, py, {
            radius,
            height,
            colors: {
                side: bodyColors.mid,
                sideAlt: bodyColors.shadow,
                top: colors.top,
                bottom: colors.lip,
            },
            stroke: colors.stroke,
            lineWidth: 0.85,
        });
    };
}
