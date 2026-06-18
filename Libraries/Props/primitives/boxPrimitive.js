import { drawBox } from "../../Render/Props3D/SolidDraw.js";
/** @param {object} visuals */
export function createBoxPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const hx = prop.halfExtents?.x ?? prop.radius ?? 8;
        const hy = prop.halfExtents?.y ?? hx;
        const height = world?.height ?? 10;
        drawBox(ctx, prop, px, py, {
            halfSize: { x: hx, y: hy },
            height,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
            topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            lineWidth: lineWidth ?? 1.0,
            plankTs,
            topCross,
        });
    };
}
