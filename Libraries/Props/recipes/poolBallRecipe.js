import { drawLoFiSphere } from "../../Render/Props3D/lofiSphere.js";
import { drawSphereTextureBand } from "../../Render/Props3D/drawSphereTextureBand.js";
import {
    getPoolBallLabelImage,
    resolvePoolBallFaceColor,
} from "../../Render/Props3D/poolBallArt.js";

/** @param {object} visuals */
export function createPoolBallDraw(visuals) {
    return (ctx, prop, px, py) => {
        const poolBall = prop.poolBall ?? visuals.defaultPoolBall;
        const radius = prop.radius || visuals.defaultRadius || 6;

        drawLoFiSphere(ctx, prop, px, py, {
            baseRadius: radius,
            panelCount: visuals.panelCount ?? 8,
            latBands: visuals.latBands ?? 6,
            stroke: visuals.stroke ?? null,
            getFaceColor: poolBall
                ? (face) => resolvePoolBallFaceColor(face, poolBall)
                : undefined,
            panelColors: poolBall
                ? [poolBall.color ?? "#888888"]
                : visuals.panels,
        });

        if (!poolBall) return;

        const label = getPoolBallLabelImage(poolBall);
        if (!label) return;

        drawSphereTextureBand(ctx, prop, px, py, label, {
            baseRadius: radius,
            latBands: 8,
            lonBands: 16,
            vMin: 0.36,
            vMax: 0.64,
            imageSmoothing: true,
        });
    };
}
