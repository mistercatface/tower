import { fillStrokeClosedPolygonTranslated } from "../Canvas/CanvasPath.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createGravityPadDraw() {
    return (ctx, prop) => {
        const hx = prop.halfExtents?.x ?? prop.strategy.halfExtents?.x ?? 40;
        const hy = prop.halfExtents?.y ?? prop.strategy.halfExtents?.y ?? 80;
        const off = prop.powered !== false ? 1 : 0.35;
        const lineScale = getCanvasLineScale(ctx);
        ctx.lineWidth = 2 * lineScale;
        ctx.fillStyle = `rgba(255, 100, 100, ${0.22 * off})`;
        ctx.strokeStyle = `rgba(255, 80, 80, ${0.9 * off})`;
        fillStrokeClosedPolygonTranslated(ctx, prop.x, prop.y, [
            { x: -hx, y: -hy },
            { x: hx, y: -hy },
            { x: hx, y: hy },
            { x: -hx, y: hy },
        ]);
    };
}
