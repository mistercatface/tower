import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { resolveSandboxPathVisual } from "./sandboxPathVisual.js";
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} pickup
 * @param {import("./createSandboxController.js").SandboxBehavior | null | undefined} behavior
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 */
export function drawSandboxPathOverlay(ctx, pickup, behavior, host) {
    const visual = resolveSandboxPathVisual(pickup);
    if (visual === "off" || !behavior?.getPathOverlay) return;
    const overlay = behavior.getPathOverlay(pickup, host);
    if (!overlay) return;
    const zoom = host.getWorldState?.()?.viewport?.zoom ?? 1;
    drawActivePathOverlay(ctx, overlay, zoom, visual);
}
