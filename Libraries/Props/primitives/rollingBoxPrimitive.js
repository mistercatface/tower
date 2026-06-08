import { drawLoFiRollingBox } from "../../Render/Props3D/lofiRollingBox.js";
/** @param {object} visuals */
export function createRollingBoxPrimitive(visuals) {
    return (ctx, prop, px, py) => {
        const hx = prop.halfExtents?.x ?? visuals.halfExtents.x;
        const hy = prop.halfExtents?.y ?? visuals.halfExtents.y;
        drawLoFiRollingBox(ctx, prop, px, py, { halfExtents: { x: hx, y: hy }, height: visuals.height, colors: visuals.colors, stroke: visuals.stroke, lineWidth: visuals.lineWidth });
    };
}
