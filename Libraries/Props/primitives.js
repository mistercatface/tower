import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon } from "../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts, resolveBodyRadius } from "../Physics/physics.js";
import { resolveVisualOverrideColorTree, resolveVisualOverridePanels } from "../Color/visualOverride.js";
import { ensureFlatVerts } from "../Math/math.js";
import propCatalog from "../../Assets/props/index.js";
import { NEUTRAL_BOX_COLORS } from "../../Assets/props/shared/neutralCoats.js";
import { drawSphere } from "../Render/Props3D/sphere.js";
import { createFlipperPrimitive } from "../Render/Props3D/flipperPaddle.js";
import { createPipeElbowPrimitive } from "../Render/Props3D/pipeElbow.js";
export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return;
        const tinted = resolveVisualOverrideColorTree(prop, colors);
        const height = prop.height ?? world?.height ?? 12;
        const asset = propCatalog[prop.type];
        let scale = 1.0;
        const rawFootprint = prop.strategy?.localFootprint ?? asset?.physics?.localFootprint;
        if (rawFootprint) {
            const footprint = ensureFlatVerts(rawFootprint);
            let maxDist = 0;
            const count = footprint.length / 2;
            for (let i = 0; i < count; i++) maxDist = Math.max(maxDist, Math.hypot(footprint[i * 2], footprint[i * 2 + 1]));
            if (maxDist > 0 && prop.radius) scale = prop.radius / maxDist;
        }
        const baseLineWidth = lineWidth ?? 1.0;
        const resolvedLineWidth = Math.max(0.35, baseLineWidth * scale);
        const drawOpts = {
            height,
            facing: prop.facing,
            faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
            backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
            bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
            topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
            stroke: tinted.stroke,
            seamStroke: tinted.seamStroke,
            lineWidth: resolvedLineWidth,
            plankTs,
            topCross,
        };
        const parts = getEntityCollisionParts(prop);
        if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
        else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
    };
}
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
/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_PRIMITIVE_BUILDERS = { sphere: createSpherePrimitive, polygon: createPolygonPrimitive, flipper: createFlipperPrimitive, pipeElbow: createPipeElbowPrimitive };
