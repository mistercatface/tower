import { resolveVisualOverridePanels, resolveVisualOverrideColorTree } from "../../Color/visualOverride.js";
import { resolveBodyRadius } from "../../Motion/physicsDefaults.js";
import { drawSphere } from "../../Render/Props3D/sphere.js";
import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon } from "../../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";
import { NEUTRAL_BOX_COLORS } from "../../../Assets/props/shared/neutralCoats.js";
export function createSpherePrimitive(visuals) {
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type === "Polygon") {
            const tinted = resolveVisualOverrideColorTree(prop, NEUTRAL_BOX_COLORS);
            const height = prop.height ?? 12;
            const drawOpts = {
                height,
                facing: prop.facing,
                faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
                backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
                bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
                topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
                stroke: tinted.stroke,
                seamStroke: tinted.seamStroke,
                lineWidth: 1.0,
            };
            const parts = getEntityCollisionParts(prop);
            if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
            else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
            return;
        }
        drawSphere(ctx, prop, viewport, {
            baseRadius: resolveBodyRadius(prop, visuals.defaultRadius ?? 7),
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: resolveVisualOverridePanels(prop, visuals.panels),
            stroke: visuals.stroke,
        });
    };
}
