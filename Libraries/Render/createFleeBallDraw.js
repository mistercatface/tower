import { resolveVisualOverrideColorTree, resolveVisualOverridePanels } from "../Color/visualOverride.js";
import { quantizeAngle } from "../Math/Angle.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolvePropQuantizeSteps } from "../Props/propStrategy.js";
import { drawExtrudedConvexPolygon } from "./Props3D/SolidDraw.js";
import { drawSphere } from "./Props3D/sphere.js";
import { quantizeAngleIndex } from "../Canvas/viewQuantize.js";
const FLEE_BALL_WEDGE_MOUNT_GAP_RATIO = 0.15;
const FLEE_BALL_WEDGE_LENGTH_RATIO = 0.7;
const FLEE_BALL_WEDGE_HALF_WIDTH_RATIO = 0.4;
/** Turret wedge sprite buckets (independent of hull roll); higher = smoother rim rotation. */
export const FLEE_BALL_TURRET_FACING_STEPS = 48;
export function buildFleeBallWedgeLocalVerts(bodyRadius) {
    const mountX = bodyRadius + bodyRadius * FLEE_BALL_WEDGE_MOUNT_GAP_RATIO;
    const length = bodyRadius * FLEE_BALL_WEDGE_LENGTH_RATIO;
    const halfW = bodyRadius * FLEE_BALL_WEDGE_HALF_WIDTH_RATIO;
    return [
        { x: mountX + length, y: 0 },
        { x: mountX, y: -halfW },
        { x: mountX, y: halfW },
    ];
}
export function getFleeBallSpriteCacheKey(prop) {
    const bodyRadius = resolveBodyRadius(prop);
    const steps = resolvePropQuantizeSteps(prop).facing;
    const heading = quantizeAngleIndex(prop.turretFacing ?? 0, steps);
    return `r${Math.round(bodyRadius * 4)}_h${heading}`;
}
export function createFleeBallDraw(sphereVisuals, wedgeVisuals) {
    return (ctx, prop, px, py) => {
        const bodyRadius = resolveBodyRadius(prop);
        const steps = resolvePropQuantizeSteps(prop).facing;
        const turretFacing = quantizeAngle(prop.turretFacing ?? 0, steps);
        drawSphere(ctx, prop, px, py, {
            baseRadius: bodyRadius,
            panelCount: sphereVisuals.panelCount,
            latBands: sphereVisuals.latBands,
            panelColors: resolveVisualOverridePanels(prop, sphereVisuals.panels),
            stroke: sphereVisuals.stroke,
        });
        const wedgeColors = resolveVisualOverrideColorTree(prop, wedgeVisuals.colors);
        const wedgeScale = FLEE_BALL_WEDGE_LENGTH_RATIO;
        const wedgeHeight = (prop.height ?? wedgeVisuals.world?.height ?? 12) * wedgeScale * (bodyRadius / 4);
        const baseLineWidth = wedgeVisuals.lineWidth ?? 1;
        const wedgeVerts = buildFleeBallWedgeLocalVerts(bodyRadius);
        drawExtrudedConvexPolygon(ctx, prop, px, py, {
            localVerts: wedgeVerts,
            height: wedgeHeight,
            facing: turretFacing,
            faceColors: { shadow: wedgeColors.sideShadow, mid: wedgeColors.side, highlight: wedgeColors.top },
            backFaceColors: { shadow: wedgeColors.sideShadow, mid: wedgeColors.sideShadow, highlight: wedgeColors.side },
            bottomColors: wedgeColors.bottom ? { light: wedgeColors.sideShadow, mid: wedgeColors.bottom, dark: wedgeColors.sideShadow } : null,
            topColors: wedgeColors.bottom
                ? { light: wedgeColors.topHighlight ?? wedgeColors.top, mid: wedgeColors.top, dark: wedgeColors.side }
                : { light: wedgeColors.top, mid: wedgeColors.top, dark: wedgeColors.side },
            stroke: wedgeColors.stroke,
            lineWidth: Math.max(0.35, baseLineWidth * wedgeScale * (bodyRadius / 4)),
        });
    };
}
