import { getRunScenePort } from "../../Core/GamePorts.js";
import { ensurePoolState } from "./balls.js";
import { getPocketArcAngles } from "./config/tableLayout.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../../Libraries/Spatial/iso/IsometricProjection.js";
import { resolveRenderViewer } from "../../Render/adapters/WorldRenderAdapter.js";
/** Pocket holes on the felt and depth below it — drawn before wall faces. */
export function drawPoolPockets(state, viewport, canvasCtx) {
    const layout = getRunScenePort().getLayout(state);
    if (!layout?.pockets) return;
    const pool = ensurePoolState(state);
    if (pool.won) return;
    const { x: px, y: py } = resolveRenderViewer(state, viewport);
    const lineW = viewport?.zoom ? 2 / viewport.zoom : 2;
    for (let i = 0; i < layout.pockets.length; i++) {
        const pocket = layout.pockets[i];
        const { start, end } = getPocketArcAngles(pocket.kind);
        // Draw the pocket opening and depth below ground (H from 0 down to -24)
        for (let H = 0; H >= -24; H -= 3) {
            const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - H);
            const projR = pocket.radius * scale;
            // Project the pocket center for this layer using 3D perspective shift
            const dx = pocket.x - px;
            const dy = pocket.y - py;
            const dist = Math.hypot(dx, dy);
            const alpha = (H / (CAMERA_HEIGHT - H)) * PERSPECTIVE_STRENGTH;
            const projX = dist === 0 ? pocket.x : pocket.x + dx * alpha;
            const projY = dist === 0 ? pocket.y : pocket.y + dy * alpha;
            canvasCtx.beginPath();
            // Under the felt, the pocket is a full circular well
            canvasCtx.arc(projX, projY, projR, 0, Math.PI * 2);
            canvasCtx.closePath();
            // Darken as we go deeper (felt level is H=0, lightness 14%. Bottom H=-24 is 0% black.)
            const ratio = Math.min(1.0, -H / 24);
            const lightness = Math.max(0, 14 - ratio * 14);
            canvasCtx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
            canvasCtx.fill();
        }
        // Draw the outline at ground level (felt surface) for visual grounding
        canvasCtx.beginPath();
        canvasCtx.arc(pocket.x, pocket.y, pocket.radius, start, end);
        canvasCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        canvasCtx.lineWidth = lineW;
        canvasCtx.stroke();
    }
}
