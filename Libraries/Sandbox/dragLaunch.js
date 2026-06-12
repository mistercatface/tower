import { normalizeXY } from "../Math/Vec2.js";
import { resolveCueStrikeMaxRayDist } from "../CueStick/cueStrikeAimPreview.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { drawAimSegment } from "../Render/contactPreviewDraw.js";
import { fillCircle, strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { computeCircleAimLineSegment, estimateRollingTravelDistance } from "../Spatial/query/circleAimLinePreview.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { evaluateInputGates, isEntityAtRest } from "./inputGates.js";
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number, powerCurve?: number }} DragLaunchConfig */
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
/** @param {number} drag @param {DragLaunchConfig} config @returns {number} 0–1 pull amount after minDrag */
export function resolveDragLaunchPullRatio(drag, config) {
    if (drag < config.minDrag) return 0;
    const maxFingerDrag = config.maxPull / config.pullScale;
    const span = Math.max(0.001, maxFingerDrag - config.minDrag);
    return Math.min(1, (drag - config.minDrag) / span);
}
/** @param {number} drag @param {DragLaunchConfig} config */
function computeLaunchPower(drag, config) {
    const pullRatio = resolveDragLaunchPullRatio(drag, config);
    if (pullRatio <= 0) return 0;
    const exponent = config.powerCurve ?? 1;
    const curved = exponent === 1 ? pullRatio : Math.pow(pullRatio, exponent);
    const minPower = config.minPower;
    const maxPower = config.maxPower;
    return minPower + curved * (maxPower - minPower);
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
/**
 * @param {object} pickup
 * @param {import("./SandboxHostPort.js").SandboxHostPort | null | undefined} host
 */
export function buildDragLaunchAimLineContext(pickup, host) {
    const state = host?.getWorldState?.();
    if (!state || !pickup) return null;
    const radius = pickup.radius;
    const circleTargets = [];
    for (const p of state.pickups) {
        if (p === pickup || p.isDead) continue;
        circleTargets.push({ x: p.x, y: p.y, radius: p.radius });
    }
    const grid = state.obstacleGrid;
    const maxRayDist = resolveCueStrikeMaxRayDist({ obstacleGrid: grid });
    return { pickup, radius, circleTargets, wallCtx: wallContextFromState(state), maxRayDist };
}
/**
 * @param {ReturnType<typeof getDragLaunchPreview>} preview
 * @param {ReturnType<typeof buildDragLaunchAimLineContext>} aimLineContext
 */
export function getDragLaunchAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.pickup?.strategy ?? {});
    return computeCircleAimLineSegment({
        originX: preview.anchorX,
        originY: preview.anchorY,
        radius: aimLineContext.radius,
        nx: preview.nx,
        ny: preview.ny,
        maxTravelDist: travelDist,
        maxRayDist: aimLineContext.maxRayDist,
        wallCtx: aimLineContext.wallCtx,
        circleTargets: aimLineContext.circleTargets,
    });
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
/**
 * Shared pointer-drag aim + launch for sandbox behaviors.
 *
 * @param {{
 *   id: string,
 *   getConfig: (pickup: object) => DragLaunchConfig,
 *   canStart?: (pickup: object, world: { x: number, y: number }, host: import("./SandboxHostPort.js").SandboxHostPort) => boolean,
 *   onLaunch?: (pickup: object, shot: { anchorX: number, anchorY: number, nx: number, ny: number, power: number }, host: import("./SandboxHostPort.js").SandboxHostPort) => void,
 *   onAim?: (pickup: object, aim: DragLaunchAim) => void,
 *   buildAimLineContext?: (pickup: object, host: import("./SandboxHostPort.js").SandboxHostPort) => ReturnType<typeof buildDragLaunchAimLineContext>,
 *   resolveAimLine?: typeof getDragLaunchAimLine,
 * }} spec
 * @returns {import("./createSandboxController.js").SandboxBehavior}
 */
export function createDragLaunchInteraction(spec) {
    /** @type {DragLaunchAim | null} */
    let aim = null;
    const buildCtx = spec.buildAimLineContext ?? buildDragLaunchAimLineContext;
    const resolveLine = spec.resolveAimLine ?? getDragLaunchAimLine;
    return {
        id: spec.id,
        onPointerDown(pickup, world, _e, host) {
            if (spec.canStart && !spec.canStart(pickup, world, host)) return false;
            wakePushableBody(pickup);
            aim = createDragLaunchAim(pickup.x, pickup.y, world.x, world.y);
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig(pickup));
            spec.onAim?.(pickup, aim);
            return true;
        },
        onPointerMove(pickup, world) {
            if (!aim?.active) return;
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig(pickup));
            spec.onAim?.(pickup, aim);
        },
        onPointerUp(pickup, _e, host) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, spec.getConfig(pickup));
            aim = null;
            if (!shot) return;
            if (spec.onLaunch) spec.onLaunch(pickup, shot, host);
            else applyDragLaunchVelocity(pickup, shot.nx, shot.ny, shot.power);
        },
        drawOverlay(ctx, pickup, host) {
            if (!aim?.active) return;
            drawDragLaunchPreview(ctx, aim, spec.getConfig(pickup), buildCtx(pickup, host), resolveLine);
        },
        reset() {
            aim = null;
        },
    };
}
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
export const DRAG_LAUNCH_WAIT_BEHAVIOR_ID = "dragLaunchWait";
/** @param {object} pickup */
function dragLaunchConfigForPickup(pickup) {
    return getDragLaunchConfig(getPropAsset(pickup?.type));
}
/** @returns {import("./createSandboxController.js").SandboxBehavior} */
export function createDragLaunchBehavior() {
    return createDragLaunchInteraction({ id: DRAG_LAUNCH_BEHAVIOR_ID, getConfig: dragLaunchConfigForPickup });
}
/** @returns {import("./createSandboxController.js").SandboxBehavior} */
export function createDragLaunchWaitBehavior() {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_WAIT_BEHAVIOR_ID,
        getConfig: dragLaunchConfigForPickup,
        canStart(pickup, _world, host) {
            if (!isEntityAtRest(pickup)) return false;
            return evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, pickup, getPropAsset(pickup?.type), host).allowed;
        },
    });
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {DragLaunchAim | null | undefined} aim
 * @param {DragLaunchConfig} config
 * @param {ReturnType<typeof buildDragLaunchAimLineContext>} [aimLineContext]
 * @param {(preview: ReturnType<typeof getDragLaunchPreview>, aimLineContext: ReturnType<typeof buildDragLaunchAimLineContext>) => { x1: number, y1: number, x2: number, y2: number } | null} [resolveAimLine]
 */
export function drawDragLaunchPreview(ctx, aim, config, aimLineContext = null, resolveAimLine = getDragLaunchAimLine) {
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
    ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.15)`;
    ctx.lineWidth = 1 * lineScale;
    ctx.setLineDash([4 * lineScale, 4 * lineScale]);
    strokeCircle(ctx, startX, startY, maxFingerDrag);
    ctx.setLineDash([]);
    if (aim && aim.pullX != null && aim.pullY != null) {
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.12)`;
        ctx.lineWidth = 1 * lineScale;
        ctx.setLineDash([3 * lineScale, 3 * lineScale]);
        strokeSegment(ctx, startX, startY, aim.pullX, aim.pullY);
        ctx.setLineDash([]);
        ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.35)`;
        fillCircle(ctx, aim.pullX, aim.pullY, 4 * lineScale);
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.85)`;
        ctx.lineWidth = 1.5 * lineScale;
        strokeCircle(ctx, aim.pullX, aim.pullY, 4 * lineScale);
    }
    if (Math.hypot(startX - preview.anchorX, startY - preview.anchorY) > 0.1) {
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.4)`;
        ctx.lineWidth = 1.5 * lineScale;
        strokeCircle(ctx, startX, startY, 5 * lineScale);
        ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.65)`;
        fillCircle(ctx, startX, startY, 1.5 * lineScale);
    }
    ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.4)`;
    ctx.lineWidth = 2 * lineScale;
    ctx.setLineDash([6 * lineScale, 4 * lineScale]);
    strokeSegment(ctx, preview.pullX, preview.pullY, preview.anchorX, preview.anchorY);
    ctx.setLineDash([]);
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.85)`;
    ctx.lineWidth = 2 * lineScale;
    strokeCircle(ctx, preview.anchorX, preview.anchorY, 7);
    ctx.restore();
    if (preview.power <= 0) return;
    const aimLine = resolveAimLine(preview, aimLineContext);
    if (!aimLine) return;
    drawAimSegment(ctx, aimLine, { color: `hsl(${hue}, 100%, 50%)`, lineWidth: 3 * lineScale, glowHue: hue });
}
