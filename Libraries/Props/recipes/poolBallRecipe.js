import { drawSphere } from "../../Render/Props3D/sphere.js";
import { drawSphereTexturePatch } from "../../Render/SurfaceTexturing/drawSphereTexturePatch.js";
import { getPoolBallLabelImage, resolvePoolBallFaceColor } from "../../Render/Props3D/poolBallArt.js";
/** @param {object} visuals */
export function createPoolBallDraw(visuals) {
    return (ctx, prop, px, py) => {
        const poolBall = prop.poolBall ?? visuals.defaultPoolBall;
        const radius = prop.radius;
        const compact = radius < 6;
        drawSphere(ctx, prop, px, py, {
            baseRadius: radius,
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            stroke: visuals.stroke,
            getFaceColor: poolBall ? (face) => resolvePoolBallFaceColor(face, poolBall, visuals.faceShade) : undefined,
            panelColors: poolBall ? [poolBall.color ?? "#888888"] : visuals.panels,
        });
        if (!poolBall || !visuals.showLabels) return;
        const label = getPoolBallLabelImage(poolBall, radius, compact);
        if (!label) return;
        drawSphereTexturePatch(ctx, prop, px, py, label, {
            baseRadius: radius,
            phiCenter: Math.PI * 0.5,
            thetaCenter: 0,
            capAngle: visuals.labelCapAngle,
            gridSegments: visuals.labelGridSegments,
            subSegments: visuals.labelSubSegments,
            radiusInflate: 1,
            uvBleed: 1,
            screenBleed: 0,
            imageSmoothing: visuals.labelImageSmoothing,
        });
    };
}
