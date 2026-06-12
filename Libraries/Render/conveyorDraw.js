import { fillStrokeClosedPolygonTranslated } from "../Canvas/CanvasPath.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createConveyorDraw() {
    return (ctx, prop) => {
        const hx = prop.halfExtents?.x ?? prop.strategy.halfExtents?.x ?? 8;
        const hy = prop.halfExtents?.y ?? prop.strategy.halfExtents?.y ?? 8;
        const lineScale = getCanvasLineScale(ctx);
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.fillStyle = "#8D6E63";
        ctx.strokeStyle = "#3E2723";
        ctx.lineWidth = 2 * lineScale;
        fillStrokeClosedPolygonTranslated(ctx, 0, 0, [
            { x: -hx, y: -hy },
            { x: hx, y: -hy },
            { x: hx, y: hy },
            { x: -hx, y: hy },
        ]);
        ctx.fillStyle = "rgba(62, 39, 35, 0.35)";
        fillStrokeClosedPolygonTranslated(ctx, 0, hy * 0.15, [
            { x: -hx * 0.85, y: -hy * 0.12 },
            { x: hx * 0.85, y: -hy * 0.12 },
            { x: hx * 0.85, y: hy * 0.12 },
            { x: -hx * 0.85, y: hy * 0.12 },
        ]);
        ctx.rotate(prop.facing ?? 0);
        const ah = Math.min(hx, hy) * 0.5;
        ctx.fillStyle = "#FFE082";
        ctx.strokeStyle = "#F57F17";
        ctx.lineWidth = 1.5 * lineScale;
        fillStrokeClosedPolygonTranslated(ctx, 0, 0, [
            { x: -ah * 0.35, y: -ah * 0.45 },
            { x: ah * 0.8, y: 0 },
            { x: -ah * 0.35, y: ah * 0.45 },
        ]);
        ctx.restore();
    };
}
