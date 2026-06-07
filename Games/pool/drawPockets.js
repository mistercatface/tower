import { getRunScenePort } from "../../Core/GamePorts.js";
import { ensurePoolState } from "./balls.js";
import { getPocketArcAngles } from "./config/tableLayout.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH } from "../../Libraries/Spatial/iso/IsometricProjection.js";
import { resolveRenderViewer } from "../../Render/adapters/WorldRenderAdapter.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { getWallHeight } from "../../Libraries/WorldSurface/WorldSurfaceSettings.js";

/** Pocket holes on the felt — after ground, before wall faces. */
export function drawPoolPockets(state, viewport, canvasCtx) {
    const layout = getRunScenePort().getLayout(state);
    if (!layout?.pockets) return;
    const pool = ensurePoolState(state);
    if (pool.won) return;
    const { x: px, y: py } = resolveRenderViewer(state, viewport);
    const lineW = viewport?.zoom ? 2 / viewport.zoom : 2;
    const railHeight = getWallHeight(getGameWorldSurfaceSettings());

    for (let i = 0; i < layout.pockets.length; i++) {
        const pocket = layout.pockets[i];
        const { start, end } = getPocketArcAngles(pocket.kind);

        // Draw the 3D hole depth by layering circles from railHeight down to pocket bottom (-24).
        // Since each deeper layer is shifted and scaled, drawing them nested
        // creates an indented cylinder depth effect that runs up to the top of the rails.
        for (let H = railHeight; H >= -24; H -= 3) {
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
            canvasCtx.moveTo(projX, projY);
            canvasCtx.arc(projX, projY, projR, start, end);
            canvasCtx.closePath();

            // Darken as we go deeper (felt level is H=0, lightness 14%. Bottom H=-24 is 0% black. Above felt H>0 is 14%.)
            const ratio = H < 0 ? Math.min(1.0, -H / 24) : 0;
            const lightness = Math.max(0, 14 - ratio * 14);
            canvasCtx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
            canvasCtx.fill();
        }

        // Draw the top rim outline at the top of the rail height to define the opening edge in 3D
        {
            const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - railHeight);
            const projR = pocket.radius * scale;
            const dx = pocket.x - px;
            const dy = pocket.y - py;
            const dist = Math.hypot(dx, dy);
            const alpha = (railHeight / (CAMERA_HEIGHT - railHeight)) * PERSPECTIVE_STRENGTH;
            const projX = dist === 0 ? pocket.x : pocket.x + dx * alpha;
            const projY = dist === 0 ? pocket.y : pocket.y + dy * alpha;

            canvasCtx.beginPath();
            canvasCtx.arc(projX, projY, projR, start, end);
            canvasCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
            canvasCtx.lineWidth = lineW;
            canvasCtx.stroke();
        }

        // Draw the outline at ground level (felt surface) for visual grounding
        {
            canvasCtx.beginPath();
            canvasCtx.arc(pocket.x, pocket.y, pocket.radius, start, end);
            canvasCtx.strokeStyle = "rgba(0, 0, 0, 0.2)";
            canvasCtx.lineWidth = lineW;
            canvasCtx.stroke();
        }
    }
}
