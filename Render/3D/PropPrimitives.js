import { createPropDrawContext, propAt } from "./PropDrawContext.js";
import {
    DEFAULT_PROP_HEIGHT,
    drawExtrudedRadial,
    drawRadialBand,
    drawRadialRibs,
    drawRadialCap,
    drawExtrudedBox,
    drawBarkLines as drawBarkLinesSolid,
} from "./SolidDraw.js";

export { DEFAULT_PROP_HEIGHT } from "./SolidDraw.js";

function legacyContext(x, y, px, py, facing) {
    return propAt(createPropDrawContext({ x: 0, y: 0, facing: facing ?? 0 }, px, py), x, y);
}

function withRadialRadius(options) {
    const baseRadius = options.baseRadius ?? options.radius;
    return { ...options, baseRadius };
}

export function drawCylinder(ctx, x, y, px, py, { radius, height = DEFAULT_PROP_HEIGHT, topRadius, colors, stroke, lineWidth = 1.0, facing }) {
    const pc = legacyContext(x, y, px, py, facing);
    const projection = pc.project(height);
    return drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        topRadius: topRadius ?? radius * (1 + projection.alpha),
        height,
        facing,
        colors,
        stroke,
        lineWidth,
    });
}

export function drawBand(ctx, x, y, px, py, options) {
    return drawRadialBand(ctx, legacyContext(x, y, px, py, options.facing), withRadialRadius(options));
}

export function drawCylinderRibs(ctx, x, y, px, py, options) {
    drawRadialRibs(ctx, legacyContext(x, y, px, py, options.facing), withRadialRadius(options));
}

export function drawCap(ctx, x, y, px, py, options) {
    return drawRadialCap(ctx, legacyContext(x, y, px, py, options.facing), options);
}

export function drawBox(ctx, x, y, px, py, options) {
    drawExtrudedBox(ctx, legacyContext(x, y, px, py, options.facing ?? 0), options);
}

export function drawBarkLines(ctx, x, y, px, py, options) {
    drawBarkLinesSolid(ctx, legacyContext(x, y, px, py, options.facing), options);
}
