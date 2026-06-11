import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
/** @typedef {{ x: number, y: number, radius: number, trigger: string }} PropAttachedButtonState */
const DEFAULT_RADIUS_U = 0.045;
const HIT_PADDING = 4;
/**
 * @param {object} pickup
 * @param {ReturnType<typeof import("./assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {{ at?: import("./assemblies/assemblyManifest.js").AssemblyPlacementManifest, u?: number, v?: number, trigger: string, radiusU?: number }} config
 */
export function attachPropButton(pickup, layout, config) {
    const play = layout.play;
    const playW = play.maxX - play.minX;
    const placement = config.at ?? (typeof config.u === "number" && typeof config.v === "number" ? { u: config.u, v: config.v } : null);
    if (!placement) throw new Error("prop button requires at or u/v playfield placement");
    const at = resolvePlacement(play, placement);
    const radiusU = config.radiusU ?? DEFAULT_RADIUS_U;
    /** @type {PropAttachedButtonState} */
    pickup.sandboxButton = { x: at.x, y: at.y, radius: radiusU * playW, trigger: config.trigger };
}
/** @param {object} pickup */
export function hasPropButton(pickup) {
    return Boolean(pickup?.sandboxButton?.trigger);
}
/** @param {object} pickup */
export function getPropButtonPosition(pickup) {
    const btn = pickup.sandboxButton;
    return btn ? { x: btn.x, y: btn.y } : null;
}
/** @param {object} pickup @param {number} wx @param {number} wy */
export function hitPropButton(pickup, wx, wy) {
    const btn = pickup.sandboxButton;
    if (!btn) return false;
    return Math.hypot(wx - btn.x, wy - btn.y) <= btn.radius + HIT_PADDING;
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pickup */
export function drawPropButtonDebugLink(ctx, pickup) {
    const btn = pickup.sandboxButton;
    if (!btn) return;
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 220, 255, 0.65)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.setLineDash([4 * lineScale, 4 * lineScale]);
    ctx.beginPath();
    ctx.moveTo(pickup.x, pickup.y);
    ctx.lineTo(btn.x, btn.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0, 220, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, 2.5 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} pressed @param {number} radius */
export function drawPropAttachedButton(ctx, x, y, pressed, radius) {
    const r = radius;
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
    grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3E2723";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
