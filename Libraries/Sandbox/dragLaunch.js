import { normalizeXY } from "../Math/Vec2.js";
import { resolveCueStrikeMaxRayDist } from "../CueStick/cueStrikeAimPreview.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { overlayAimSegment, overlayCircleFillStroke, overlayCircleStroke, overlaySegment } from "../Render/overlays/overlayCommands.js";
import { computeCircleAimLineSegment, estimateRollingTravelDistance } from "../Spatial/query/circleAimLinePreview.js";
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
 * @param {object} prop
 * @param {object | null | undefined} state
 */
export function buildDragLaunchAimLineContext(prop, state) {
    if (!state || !prop) return null;
    const grid = state.obstacleGrid;
    const maxRayDist = resolveCueStrikeMaxRayDist({ obstacleGrid: grid });
    return { prop, radius: prop.radius, maxRayDist };
}
/**
 * @param {ReturnType<typeof getDragLaunchPreview>} preview
 * @param {ReturnType<typeof buildDragLaunchAimLineContext>} aimLineContext
 */
export function getDragLaunchAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.prop?.strategy ?? {});
    return computeCircleAimLineSegment({
        originX: preview.anchorX,
        originY: preview.anchorY,
        radius: aimLineContext.radius,
        nx: preview.nx,
        ny: preview.ny,
        maxTravelDist: travelDist,
        maxRayDist: aimLineContext.maxRayDist,
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
    wakeKineticBody(body);
}
/**
 * Shared pointer-drag aim + launch for sandbox behaviors.
 *
 * @param {{
 *   id: string,
 *   getConfig?: (prop: object) => DragLaunchConfig,
 *   canStart?: (prop: object, world: { x: number, y: number }) => boolean,
 *   onLaunch?: (prop: object, shot: { anchorX: number, anchorY: number, nx: number, ny: number, power: number }) => void,
 *   onAim?: (prop: object, aim: DragLaunchAim) => void,
 *   buildAimLineContext?: (prop: object) => ReturnType<typeof buildDragLaunchAimLineContext>,
 *   resolveAimLine?: typeof getDragLaunchAimLine,
 * }} spec
 * @returns {import("./sandboxCapabilities.js").SandboxBehavior}
 */
export function createDragLaunchInteraction(spec) {
    /** @type {DragLaunchAim | null} */
    let aim = null;
    const buildCtx = spec.buildAimLineContext ?? (() => null);
    const resolveLine = spec.resolveAimLine ?? getDragLaunchAimLine;
    return {
        id: spec.id,
        onPointerDown(prop, world, _e) {
            if (spec.canStart && !spec.canStart(prop, world)) return false;
            wakeKineticBody(prop);
            aim = createDragLaunchAim(prop.x, prop.y, world.x, world.y);
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            spec.onAim?.(prop, aim);
            return true;
        },
        onPointerMove(prop, world, _e) {
            if (!aim?.active) return;
            updateDragLaunchAim(aim, world.x, world.y, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            spec.onAim?.(prop, aim);
        },
        onPointerUp(prop, _e) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop));
            aim = null;
            if (!shot) return;
            if (spec.onLaunch) spec.onLaunch(prop, shot);
            else applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        },
        appendOverlayCommands(commands, prop) {
            if (!aim?.active) return;
            appendDragLaunchOverlayCommands(commands, aim, spec.getConfig?.(prop) ?? dragLaunchConfigForProp(prop), buildCtx(prop), resolveLine);
        },
        reset() {
            aim = null;
        },
    };
}
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
export const DRAG_LAUNCH_WAIT_BEHAVIOR_ID = "dragLaunchWait";
/** @param {object} prop */
function dragLaunchConfigForProp(prop) {
    return getDragLaunchConfig(getPropAsset(prop?.type));
}
/** @param {object} state @returns {(prop: object) => ReturnType<typeof buildDragLaunchAimLineContext>} */
export function dragLaunchAimLineContextForState(state) {
    return (prop) => buildDragLaunchAimLineContext(prop, state);
}
/** @param {object} state @returns {import("./sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchBehavior(state) {
    return createDragLaunchInteraction({ id: DRAG_LAUNCH_BEHAVIOR_ID, getConfig: dragLaunchConfigForProp, buildAimLineContext: dragLaunchAimLineContextForState(state) });
}
/** @param {object} state @returns {import("./sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchWaitBehavior(state) {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_WAIT_BEHAVIOR_ID,
        getConfig: dragLaunchConfigForProp,
        buildAimLineContext: dragLaunchAimLineContextForState(state),
        canStart(prop) {
            if (!isEntityAtRest(prop)) return false;
            return evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, prop, getPropAsset(prop?.type), state).allowed;
        },
    });
}
export function appendDragLaunchOverlayCommands(commands, aim, config, aimLineContext = null, resolveAimLine = getDragLaunchAimLine) {
    const preview = getDragLaunchPreview(aim, config);
    if (!preview) return;
    const ratio = config.maxPower > config.minPower ? Math.max(0, Math.min(1, (preview.power - config.minPower) / (config.maxPower - config.minPower))) : 0;
    const hue = 180 - ratio * 180;
    const startX = aim?.startX ?? preview.anchorX;
    const startY = aim?.startY ?? preview.anchorY;
    const maxFingerDrag = config.maxPull / config.pullScale;
    commands.push(overlayCircleStroke(startX, startY, maxFingerDrag, { stroke: `hsla(${hue}, 90%, 55%, 0.15)`, lineWidth: 1, dash: [4, 4] }));
    if (aim && aim.pullX != null && aim.pullY != null) {
        commands.push(overlaySegment(startX, startY, aim.pullX, aim.pullY, { stroke: `hsla(${hue}, 90%, 55%, 0.12)`, lineWidth: 1, dash: [3, 3] }));
        commands.push(overlayCircleFillStroke(aim.pullX, aim.pullY, 4, { fill: `hsla(${hue}, 90%, 55%, 0.35)`, stroke: `hsla(${hue}, 90%, 55%, 0.85)`, lineWidth: 1.5 }));
    }
    if (Math.hypot(startX - preview.anchorX, startY - preview.anchorY) > 0.1) {
        commands.push(overlayCircleStroke(startX, startY, 5, { stroke: `hsla(${hue}, 90%, 55%, 0.4)`, lineWidth: 1.5 }));
        commands.push(overlayCircleFillStroke(startX, startY, 1.5, { fill: `hsla(${hue}, 90%, 55%, 0.65)`, stroke: `hsla(${hue}, 90%, 55%, 0.65)`, lineWidth: 1 }));
    }
    commands.push(overlaySegment(preview.pullX, preview.pullY, preview.anchorX, preview.anchorY, { stroke: `hsla(${hue}, 90%, 55%, 0.4)`, lineWidth: 2, dash: [6, 4] }));
    commands.push(overlayCircleStroke(preview.anchorX, preview.anchorY, 7, { stroke: `hsla(${hue}, 100%, 60%, 0.85)`, lineWidth: 2 }));
    if (preview.power <= 0) return;
    const aimLine = resolveAimLine(preview, aimLineContext);
    if (!aimLine) return;
    commands.push(overlayAimSegment(aimLine.x1, aimLine.y1, aimLine.x2, aimLine.y2, { color: `hsl(${hue}, 100%, 50%)`, lineWidth: 3, glowHue: hue }));
}
