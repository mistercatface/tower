import { normalizeXY } from "../Math/Vec2.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { drawAimSegment } from "../Render/contactPreviewDraw.js";
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number }} DragLaunchConfig */
/** @typedef {{ active: boolean, anchorX: number, anchorY: number, startX: number, startY: number, pullX: number, pullY: number, shotNx: number | null, shotNy: number | null }} DragLaunchAim */
export const DRAG_LAUNCH_DEFAULTS = { minDrag: 10, maxPull: 110, pullScale: 1.25, minPower: 55, maxPower: 340 };
/** @param {object | null | undefined} asset */
export function isSandboxProp(asset) {
    const sandbox = asset?.sandbox;
    return sandbox === true || (sandbox != null && typeof sandbox === "object");
}
/** @param {object | null | undefined} asset */
export function getDragLaunchConfig(asset) {
    const entry = asset?.sandbox?.dragLaunch;
    const overrides = entry === true ? {} : entry && typeof entry === "object" ? entry : {};
    return { ...DRAG_LAUNCH_DEFAULTS, ...overrides };
}
/** @param {number} anchorX @param {number} anchorY @param {number} [startX] @param {number} [startY] @returns {DragLaunchAim} */
export function createDragLaunchAim(anchorX, anchorY, startX = anchorX, startY = anchorY) {
    return { active: true, anchorX, anchorY, startX, startY, pullX: startX, pullY: startY, shotNx: null, shotNy: null };
}
/** @param {DragLaunchAim} aim @param {DragLaunchConfig} config */
function resolveDragAimPhysics(aim, config) {
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    const { nx, ny, len: drag } = normalizeXY(dx, dy);
    if (drag < 0.5) {
        if (aim.shotNx == null || aim.shotNy == null) return null;
        return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag: 0, pullBack: 0 };
    }
    aim.shotNx = -nx;
    aim.shotNy = -ny;
    const pullBack = Math.min(config.maxPull, drag * config.pullScale);
    return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag, pullBack };
}
/** @param {number} drag @param {DragLaunchConfig} config */
function computeLaunchPower(drag, config) {
    if (drag < config.minDrag) return 0;
    const maxFingerDrag = config.maxPull / config.pullScale;
    const pullRatio = Math.min(1, drag / Math.max(1, maxFingerDrag));
    return Math.min(config.maxPower, Math.max(config.minPower, pullRatio * config.maxPower));
}
/** @param {DragLaunchAim | null | undefined} aim @param {number} pullX @param {number} pullY @param {DragLaunchConfig} config */
export function updateDragLaunchAim(aim, pullX, pullY, config) {
    if (!aim?.active) return null;
    aim.pullX = pullX;
    aim.pullY = pullY;
    return resolveDragAimPhysics(aim, config);
}
/** @param {DragLaunchAim | null | undefined} aim @param {DragLaunchConfig} config */
export function getDragLaunchPreview(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || aim.shotNx == null || aim.shotNy == null) return null;
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    return {
        anchorX: aim.anchorX,
        anchorY: aim.anchorY,
        pullX: aim.anchorX + dx,
        pullY: aim.anchorY + dy,
        nx: physics.shotNx,
        ny: physics.shotNy,
        power: computeLaunchPower(physics.drag, config),
        drag: physics.drag,
    };
}
/**
 * @param {DragLaunchAim | null | undefined} aim
 * @param {DragLaunchConfig} config
 * @returns {{ anchorX: number, anchorY: number, nx: number, ny: number, power: number } | null}
 */
export function releaseDragLaunch(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || physics.drag < config.minDrag || aim.shotNx == null || aim.shotNy == null) return null;
    const power = computeLaunchPower(physics.drag, config);
    if (power <= 0) return null;
    return { anchorX: aim.anchorX, anchorY: aim.anchorY, nx: aim.shotNx, ny: aim.shotNy, power };
}
/** @param {object} body @param {number} nx @param {number} ny @param {number} power */
export function applyDragLaunchVelocity(body, nx, ny, power) {
    body.vx = nx * power;
    body.vy = ny * power;
    if (body.strategy?.rolls) {
        const r = body.radius || 8;
        body.angularVelocity = (power / r) * 0.12;
    }
    wakePushableBody(body);
}
/** @param {CanvasRenderingContext2D} ctx @param {DragLaunchAim | null | undefined} aim @param {DragLaunchConfig} config */
export function drawDragLaunchPreview(ctx, aim, config) {
    const preview = getDragLaunchPreview(aim, config);
    if (!preview) return;
    const ratio = config.maxPower > config.minPower ? Math.max(0, Math.min(1, (preview.power - config.minPower) / (config.maxPower - config.minPower))) : 0;
    const hue = 180 - ratio * 180;
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    // Draw initial click reference point indicator
    const startX = aim?.startX ?? preview.anchorX;
    const startY = aim?.startY ?? preview.anchorY;
    // Draw max drag radius circle around start point representing where power caps out
    const maxFingerDrag = config.maxPull / config.pullScale;
    ctx.beginPath();
    ctx.arc(startX, startY, maxFingerDrag, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.15)`;
    ctx.lineWidth = 1 * lineScale;
    ctx.setLineDash([4 * lineScale, 4 * lineScale]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Draw faint connection line and circle at the current actual pointer position
    if (aim && aim.pullX != null && aim.pullY != null) {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(aim.pullX, aim.pullY);
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.12)`;
        ctx.lineWidth = 1 * lineScale;
        ctx.setLineDash([3 * lineScale, 3 * lineScale]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(aim.pullX, aim.pullY, 4 * lineScale, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.35)`;
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.85)`;
        ctx.lineWidth = 1.5 * lineScale;
        ctx.fill();
        ctx.stroke();
    }
    if (Math.hypot(startX - preview.anchorX, startY - preview.anchorY) > 0.1) {
        ctx.beginPath();
        ctx.arc(startX, startY, 5 * lineScale, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.4)`;
        ctx.lineWidth = 1.5 * lineScale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(startX, startY, 1.5 * lineScale, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.65)`;
        ctx.fill();
    }
    ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.4)`;
    ctx.lineWidth = 2 * lineScale;
    ctx.setLineDash([6 * lineScale, 4 * lineScale]);
    ctx.beginPath();
    ctx.moveTo(preview.pullX, preview.pullY);
    ctx.lineTo(preview.anchorX, preview.anchorY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(preview.anchorX, preview.anchorY, 7, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.85)`;
    ctx.lineWidth = 2 * lineScale;
    ctx.stroke();
    ctx.restore();
    if (preview.power <= 0) return;
    const len = 20 + ratio * 80;
    drawAimSegment(
        ctx,
        { x1: preview.anchorX, y1: preview.anchorY, x2: preview.anchorX + preview.nx * len, y2: preview.anchorY + preview.ny * len },
        { color: `hsl(${hue}, 100%, 50%)`, lineWidth: 3 * lineScale, glowHue: hue },
    );
}
