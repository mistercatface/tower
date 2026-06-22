import { resolveVisualOverrideColorTree, resolveVisualOverridePanels } from "../Color/visualOverride.js";
import { quantizeAngle } from "../Math/Angle.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { resolvePropQuantizeSteps } from "../Props/propStrategy.js";
import { drawExtrudedConvexPolygon } from "./Props3D/SolidDraw.js";
import { drawSphere } from "./Props3D/sphere.js";
import { quantizeAngleIndex } from "../Canvas/viewQuantize.js";

const FLEE_BALL_WEDGE_FOOTPRINT = [
    { x: -1.75, y: -0.97 },
    { x: 1.75, y: -0.97 },
    { x: 0, y: 1.94 },
];
const FLEE_BALL_WEDGE_MOUNT_GAP_RATIO = 0.3;

function wedgeFootprintMaxDist(footprint) {
    let maxDist = 0;
    for (let i = 0; i < footprint.length; i++) maxDist = Math.max(maxDist, Math.hypot(footprint[i].x, footprint[i].y));
    return maxDist;
}

export function buildFleeBallWedgeLocalVerts(bodyRadius, footprint = FLEE_BALL_WEDGE_FOOTPRINT) {
    const maxDist = wedgeFootprintMaxDist(footprint);
    const scale = bodyRadius / maxDist;
    const mountX = bodyRadius + bodyRadius * FLEE_BALL_WEDGE_MOUNT_GAP_RATIO;
    const verts = [];
    for (let i = 0; i < footprint.length; i++) {
        verts.push({ x: mountX + footprint[i].x * scale, y: footprint[i].y * scale });
    }
    return verts;
}

export function getFleeBallSpriteCacheKey(prop) {
    const bodyRadius = resolveBodyRadius(prop);
    const steps = resolvePropQuantizeSteps(prop).facing;
    const heading = quantizeAngleIndex(prop.turretFacing ?? 0, steps);
    return `r${Math.round(bodyRadius * 4)}_h${heading}`;
}

export function createFleeBallDraw(sphereVisuals, wedgeVisuals) {
    const wedgeMaxDist = wedgeFootprintMaxDist(FLEE_BALL_WEDGE_FOOTPRINT);
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
        const wedgeScale = bodyRadius / wedgeMaxDist;
        const wedgeHeight = (prop.height ?? wedgeVisuals.world?.height ?? 12) * wedgeScale;
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
            lineWidth: Math.max(0.35, baseLineWidth * wedgeScale),
        });
    };
}
