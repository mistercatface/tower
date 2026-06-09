import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../../Spatial/iso/IsometricProjection.js";

/** @param {object} visuals */
export function createVoidCircleDraw(visuals) {
    return (ctx, prop, px, py) => {
        const mouthRadius = prop.radius ?? visuals.mouthRadius ?? 16;
        const pocketDepth = visuals.pocketDepth ?? 24;
        const step = pocketDepth / 8;
        for (let H = 0; H >= -pocketDepth; H -= step) {
            const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - H);
            const layerRadius = mouthRadius * scale;
            const dx = prop.x - px;
            const dy = prop.y - py;
            const dist = Math.hypot(dx, dy);
            const alpha = (H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
            const projX = dist === 0 ? prop.x : prop.x + dx * alpha;
            const projY = dist === 0 ? prop.y : prop.y + dy * alpha;
            const ratio = Math.min(1, -H / pocketDepth);
            const lightness = Math.max(0, 14 - ratio * 14);
            ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
            ctx.beginPath();
            ctx.arc(projX, projY, layerRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, mouthRadius, 0, Math.PI * 2);
        ctx.strokeStyle = visuals.stroke ?? "rgba(0, 0, 0, 0.45)";
        ctx.lineWidth = visuals.lineWidth ?? 2;
        ctx.stroke();
    };
}
