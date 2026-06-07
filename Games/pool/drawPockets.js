import { getRunScenePort } from "../../Core/GamePorts.js";
import { ensurePoolState } from "./balls.js";
import { getPocketArcAngles } from "./config/tableLayout.js";
/** Pocket holes on the felt — after ground, before wall faces. */
export function drawPoolPockets(state, viewport, canvasCtx) {
    const layout = getRunScenePort().getLayout(state);
    if (!layout?.pockets) return;
    const pool = ensurePoolState(state);
    if (pool.won) return;
    const lineW = viewport?.zoom ? 2 / viewport.zoom : 2;
    for (let i = 0; i < layout.pockets.length; i++) {
        const pocket = layout.pockets[i];
        const { start, end } = getPocketArcAngles(pocket.kind);
        canvasCtx.beginPath();
        canvasCtx.moveTo(pocket.x, pocket.y);
        canvasCtx.arc(pocket.x, pocket.y, pocket.radius, start, end);
        canvasCtx.closePath();
        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
        canvasCtx.fill();
        canvasCtx.beginPath();
        canvasCtx.arc(pocket.x, pocket.y, pocket.radius, start, end);
        canvasCtx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        canvasCtx.lineWidth = lineW;
        canvasCtx.stroke();
    }
}
