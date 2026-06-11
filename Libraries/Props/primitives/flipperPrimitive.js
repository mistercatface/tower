import { drawFlipperPaddle } from "../../Render/Props3D/flipperPaddle.js";
/** @param {object} visuals */
export function createFlipperPrimitive(visuals) {
    const { world, colors, activeColors } = visuals;
    return (ctx, prop, px, py) => {
        const active = prop._flipperTarget === "active" || prop._flipperButtonPressed;
        drawFlipperPaddle(ctx, prop, px, py, {
            length: world?.length ?? 32,
            width: world?.width ?? 8,
            height: world?.height ?? 10,
            pivotRadius: world?.pivotRadius ?? 5,
            restAngle: world?.restAngle ?? 0.45,
            colors: active && activeColors ? activeColors : colors,
            lineWidth: visuals.lineWidth ?? 0.9,
        });
    };
}
