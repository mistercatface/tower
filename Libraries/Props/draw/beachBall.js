import { BEACH_BALL } from "../definitions/beachBall.js";
import { drawLoFiSphere } from "../../Render/Props3D/lofiSphere.js";

export function drawBeachBall(ctx, prop, px, py) {
    const { colors, world } = BEACH_BALL;
    drawLoFiSphere(ctx, prop, px, py, {
        baseRadius: prop.radius || 7,
        panelCount: world.panelCount,
        latBands: world.latBands,
        panelColors: colors.panels,
        stroke: colors.stroke,
    });
}
