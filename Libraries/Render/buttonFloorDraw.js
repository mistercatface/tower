import { fillCircle, strokeCircle } from "../Canvas/CanvasPath.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
/** @returns {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
export function createButtonFloorDraw() {
    return (ctx, prop) => {
        const radius = prop.radius;
        const pressed = prop._buttonDrawPressed === true;
        const lineScale = getCanvasLineScale(ctx);
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
        const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
        grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
        grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
        ctx.fillStyle = grad;
        fillCircle(ctx, 0, 0, radius);
        ctx.strokeStyle = "#3E2723";
        ctx.lineWidth = 2.5 * lineScale;
        strokeCircle(ctx, 0, 0, radius);
        ctx.fillStyle = "rgba(255,255,255,0.38)";
        fillCircle(ctx, -radius * 0.28, -radius * 0.28, radius * 0.32);
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1.5 * lineScale;
        strokeCircle(ctx, 0, 0, radius * 0.55);
        ctx.restore();
    };
}
