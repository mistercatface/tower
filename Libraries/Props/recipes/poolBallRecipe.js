import { drawLoFiSphere } from "../../Render/Props3D/lofiSphere.js";
import { drawSphereTexturePatch } from "../../Render/SurfaceTexturing/drawSphereTexturePatch.js";
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
            panelCount: visuals.panelCount ?? 12,
            latBands: visuals.latBands ?? 8,
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

        drawSphereTexturePatch(ctx, prop, px, py, label, {
            baseRadius: radius,
            phiCenter: Math.PI * 0.5,
            thetaCenter: 0,
            capAngle: 0.36,
            gridSegments: 20,
            subSegments: 2,
            radiusInflate: 1,
            uvBleed: 1,
            screenBleed: 0,
            imageSmoothing: true,
        });
    };
}
