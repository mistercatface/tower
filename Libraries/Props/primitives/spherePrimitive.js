import { resolveVisualOverridePanels } from "../../Color/visualOverride.js";
import { resolveBodyRadius } from "../../Motion/bodyDefaults.js";
import { drawSphere } from "../../Render/Props3D/sphere.js";
export function createSpherePrimitive(visuals) {
    return (ctx, prop, viewport) => {
        drawSphere(ctx, prop, viewport, {
            baseRadius: resolveBodyRadius(prop, visuals.defaultRadius ?? 7),
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: resolveVisualOverridePanels(prop, visuals.panels),
            stroke: visuals.stroke,
        });
    };
}
