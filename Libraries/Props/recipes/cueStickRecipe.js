import { drawLoFiLongAxisCylinder } from "../../Render/Props3D/lofiTippedCylinder.js";

const DEFAULT_COLORS = {
    side: "#C9A66B",
    sideAlt: "#9A7B4F",
    top: "#F2EFE8",
    bottom: "#1C1510",
};

/** @param {object} [visuals] */
export function createCueStickDraw(visuals = {}) {
    const colors = { ...DEFAULT_COLORS, ...visuals.colors };
    const stroke = visuals.stroke ?? "#3E3228";
    const lineWidth = visuals.lineWidth ?? 0.65;
    const hx = visuals.hx ?? 72;
    const hy = visuals.hy ?? 1.15;
    const height = visuals.height ?? 2.3;
    return (ctx, prop, px, py) => {
        const cs = prop.cueStick ?? {};
        drawLoFiLongAxisCylinder(ctx, prop, px, py, {
            hx: cs.hx ?? hx,
            hy: cs.hy ?? hy,
            height: cs.height ?? height,
            segments: visuals.segments ?? 28,
            colors,
            stroke,
            lineWidth,
        });
    };
}
