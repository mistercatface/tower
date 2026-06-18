import { drawSphere } from "../../Render/Props3D/sphere.js";
import { resolveBodyRadius } from "../../Motion/bodyDefaults.js";
/** @param {object} visuals */
export function createSpherePrimitive(visuals) {
    return (ctx, prop, px, py) => {
        drawSphere(ctx, prop, px, py, {
            baseRadius: resolveBodyRadius(prop, visuals.defaultRadius ?? 7),
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: visuals.panels,
            stroke: visuals.stroke,
        });
    };
}
