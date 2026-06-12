import { fillCircle, traceCircle, withClip } from "../Canvas/CanvasPath.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../Spatial/iso/IsometricProjection.js";
/** @param {number} defaultDepth */
export function createVoidPitDraw(defaultDepth) {
    /** @type {import("./Props3D/PropRenderer.js").PropDrawRecipe} */
    return (ctx, prop, viewerX, viewerY) => {
        const mouthRadius = prop.radius;
        const pocketDepth = prop.sinkDepth ?? defaultDepth;
        withClip(
            ctx,
            (ctx) => {
                traceCircle(ctx, prop.x, prop.y, mouthRadius);
            },
            (ctx) => {
                const step = pocketDepth / 8;
                for (let H = 0; H >= -pocketDepth; H -= step) {
                    const dx = prop.x - viewerX;
                    const dy = prop.y - viewerY;
                    const dist = Math.hypot(dx, dy);
                    const alpha = (H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
                    const projX = dist === 0 ? prop.x : prop.x + dx * alpha;
                    const projY = dist === 0 ? prop.y : prop.y + dy * alpha;
                    const layerRadius = mouthRadius * (CAMERA_HEIGHT / (CAMERA_HEIGHT - H));
                    const ratio = Math.min(1, -H / pocketDepth);
                    const lightness = Math.max(0, 100 - ratio * 100);
                    ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
                    fillCircle(ctx, projX, projY, layerRadius);
                }
            },
        );
    };
}
