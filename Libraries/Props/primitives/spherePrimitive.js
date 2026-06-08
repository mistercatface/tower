import { drawLoFiSphere } from "../../Render/Props3D/lofiSphere.js";
/** @param {object} visuals */
export function createSpherePrimitive(visuals) {
    return (ctx, prop, px, py) => {
        drawLoFiSphere(ctx, prop, px, py, {
            baseRadius: prop.radius || visuals.defaultRadius || 7,
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: visuals.panels,
            stroke: visuals.stroke,
        });
    };
}
