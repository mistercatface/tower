import { drawSphere } from "../../Render/Props3D/sphere.js";
/** @param {object} visuals */
export function createSpherePrimitive(visuals) {
    return (ctx, prop, px, py) => {
        drawSphere(ctx, prop, px, py, {
            baseRadius: prop.radius || visuals.defaultRadius || 7,
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: visuals.panels,
            stroke: visuals.stroke,
        });
    };
}
