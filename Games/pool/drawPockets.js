import { getRunScenePort } from "../../Core/GamePorts.js";
import { ensurePoolState } from "./balls.js";
import { getPocketArcAngles } from "./config/tableLayout.js";
import { CAMERA_HEIGHT } from "../../Libraries/Spatial/iso/IsometricProjection.js";
import { resolveRenderViewer } from "../../Render/adapters/WorldRenderAdapter.js";
/** Pocket holes on the felt — after ground, before wall faces. */
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
        
        // Draw the 3D hole depth by layering circles from ground (d = 0) down into the table (d = 24).
        // Since each deeper layer is smaller, drawing them nested at the pocket center
        // creates an indented depth effect that is perfectly flush with the table cushions.
        for (let d = 0; d <= 24; d += 3) {
            const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT + d);
            const projR = pocket.radius * scale;

            canvasCtx.beginPath();
            canvasCtx.moveTo(pocket.x, pocket.y);
            canvasCtx.arc(pocket.x, pocket.y, projR, start, end);
            canvasCtx.closePath();

            // Darken as we go deeper into the pocket (lightness goes from 14% to 0% pitch black)
            const ratio = d / 24;
            const lightness = Math.max(0, 14 - ratio * 14);
            canvasCtx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
            canvasCtx.fill();
        }

        // Draw the top rim outline at ground level (felt surface) to define a clean opening edge
        canvasCtx.beginPath();
        canvasCtx.arc(pocket.x, pocket.y, pocket.radius, start, end);
        canvasCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        canvasCtx.lineWidth = lineW;
        canvasCtx.stroke();
    }
}
