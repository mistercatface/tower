import propCatalog from "../../Assets/props/index.js";
import { normalizeXYInto, findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto, ENGINE_F32, M_OUT_NX, M_OUT_NY, M_OUT_LEN } from "../Math/math.js";
import { computeCircleAimLineSegment, estimateRollingTravelDistance } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { getKineticRollConfig, clearGroundRollDrive, decelerateRoll, steerRollToward, wakeKineticBody, entityFacing, kineticInertiaFromBody, kineticMassFromFootprint, resolveBodyRadius } from "../Physics/physics.js";
import { overlayAimSegment, overlayCircleFillStroke, overlayCircleStroke, overlaySegment } from "../Render/render.js";
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number, powerCurve?: number }} DragLaunchConfig */
/** @typedef {{ active: boolean, anchorX: number, anchorY: number, startX: number, startY: number, pullX: number, pullY: number, shotNx: number | null, shotNy: number | null }} DragLaunchAim */
export const GRAB_DRAG_BEHAVIOR_ID = "grabDrag";
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
const GRAB_DRAG_TORQUE_GAIN = 0.004;
const GRAB_DRAG_ANGULAR_DAMP = 4;
const REFERENCE_GRAB_INERTIA = (() => {
    const body = { shape: { type: "Circle", radius: 4 }, radius: 4, strategy: { isKinetic: true, density: 0.007958 } };
    body.mass = kineticMassFromFootprint(body);
    return kineticInertiaFromBody(body);
})();
const G_WX = 0;
const G_WY = 1;
const G_LX = 2;
const G_LY = 3;
const G_OX = 4;
const G_OY = 5;
const GRAB_ANCHOR_SCRATCH = new Float32Array(6);
function hueFromPullRatio(ratio) {
    return 180 - ratio * 180;
}
export function getDragLaunchConfig(asset) {
    return asset.sandbox.dragLaunch;
}
export function createDragLaunchAim(anchorX, anchorY, startX = anchorX, startY = anchorY) {
    return { active: true, anchorX, anchorY, startX, startY, pullX: startX, pullY: startY, shotNx: null, shotNy: null };
}
function resolveDragAimPhysics(aim, config) {
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    normalizeXYInto(ENGINE_F32, M_OUT_NX, dx, dy);
    const nx = ENGINE_F32[M_OUT_NX];
    const ny = ENGINE_F32[M_OUT_NY];
    const drag = ENGINE_F32[M_OUT_LEN];
    if (drag < 0.5) {
        if (aim.shotNx == null || aim.shotNy == null) return null;
        return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag: 0, pullBack: 0 };
    }
    aim.shotNx = -nx;
    aim.shotNy = -ny;
    const pullBack = Math.min(config.maxPull, drag * config.pullScale);
    return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag, pullBack };
}
export function resolveDragLaunchPullRatio(drag, config) {
    if (drag < config.minDrag) return 0;
    const maxFingerDrag = config.maxPull / config.pullScale;
    const span = Math.max(0.001, maxFingerDrag - config.minDrag);
    return Math.min(1, (drag - config.minDrag) / span);
}
export function computeLaunchPower(drag, config) {
    const pullRatio = resolveDragLaunchPullRatio(drag, config);
    if (pullRatio <= 0) return 0;
    const exponent = config.powerCurve ?? 1;
    const curved = exponent === 1 ? pullRatio : Math.pow(pullRatio, exponent);
    const minPower = config.minPower;
    const maxPower = config.maxPower;
    return minPower + curved * (maxPower - minPower);
}
export function updateDragLaunchAim(aim, pullX, pullY, config) {
    if (!aim?.active) return null;
    aim.pullX = pullX;
    aim.pullY = pullY;
    return resolveDragAimPhysics(aim, config);
}
export function getDragLaunchPreview(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || aim.shotNx == null || aim.shotNy == null) return null;
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    return { anchorX: aim.anchorX, anchorY: aim.anchorY, pullX: aim.anchorX + dx, pullY: aim.anchorY + dy, nx: physics.shotNx, ny: physics.shotNy, power: computeLaunchPower(physics.drag, config), drag: physics.drag };
}
export function releaseDragLaunch(aim, config) {
    if (!aim?.active) return null;
    const physics = resolveDragAimPhysics(aim, config);
    if (!physics || physics.drag < config.minDrag || aim.shotNx == null || aim.shotNy == null) return null;
    const power = computeLaunchPower(physics.drag, config);
    if (power <= 0) return null;
    return { anchorX: aim.anchorX, anchorY: aim.anchorY, nx: aim.shotNx, ny: aim.shotNy, power };
}
function dragLaunchMaxRayDist(obstacleGrid) {
    if (obstacleGrid?.minX != null) return Math.hypot(obstacleGrid.maxX - obstacleGrid.minX, obstacleGrid.maxY - obstacleGrid.minY) * 1.25;
    return 2400;
}
export function buildDragLaunchAimLineContext(prop, state) {
    if (!state || !prop) return null;
    const grid = state.obstacleGrid;
    const maxRayDist = dragLaunchMaxRayDist(grid);
    return { prop, radius: prop.radius, maxRayDist };
}
export function getDragLaunchAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.prop?.strategy ?? {});
    return computeCircleAimLineSegment({ originX: preview.anchorX, originY: preview.anchorY, radius: aimLineContext.radius, nx: preview.nx, ny: preview.ny, maxTravelDist: travelDist, maxRayDist: aimLineContext.maxRayDist });
}
export function applyDragLaunchVelocity(body, nx, ny, power) {
    body.vx = nx * power;
    body.vy = ny * power;
    if (body.strategy?.rolls) {
        const r = body.radius || 8;
        body.angularVelocity = (power / r) * 0.12;
    }
    wakeKineticBody(body);
}
function dragLaunchConfigForProp(prop) {
    return getDragLaunchConfig(propCatalog[prop?.type]);
}
export function dragLaunchAimLineContextForState(state) {
    return (prop) => buildDragLaunchAimLineContext(prop, state);
}
export function createDragLaunchInteraction(spec) {
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
            if (spec.canStart && !spec.canStart(prop, world)) {
                aim = null;
                return;
            }
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
export const DEFAULT_DRAG_INTERACTION_MODE = DRAG_LAUNCH_BEHAVIOR_ID;
export function normalizeDragInteractionMode(mode) {
    return mode === GRAB_DRAG_BEHAVIOR_ID ? GRAB_DRAG_BEHAVIOR_ID : DRAG_LAUNCH_BEHAVIOR_ID;
}
export function toggleDragInteractionMode(mode) {
    return normalizeDragInteractionMode(mode) === GRAB_DRAG_BEHAVIOR_ID ? DRAG_LAUNCH_BEHAVIOR_ID : GRAB_DRAG_BEHAVIOR_ID;
}
export function dragInteractionModeLabel(mode) {
    return normalizeDragInteractionMode(mode) === GRAB_DRAG_BEHAVIOR_ID ? "Drag: Grab" : "Drag: Launch";
}
export function sandboxAssetDragInteract(asset) {
    return asset?.sandbox?.dragInteract === true;
}
export function assetSupportsDragLaunch(asset) {
    if (!asset?.sandbox) return false;
    if (sandboxAssetDragInteract(asset)) return true;
    return asset.sandbox.dragLaunch != null;
}
export function resolveDragInteractionBehaviorId(asset, dragInteractionMode = DEFAULT_DRAG_INTERACTION_MODE) {
    if (!asset?.sandbox) return null;
    if (!assetSupportsDragLaunch(asset)) return null;
    return dragInteractionMode === GRAB_DRAG_BEHAVIOR_ID ? GRAB_DRAG_BEHAVIOR_ID : DRAG_LAUNCH_BEHAVIOR_ID;
}
export function resolveDragInteractionBehavior(prop, state, behaviorById) {
    const asset = propCatalog[prop.type];
    const mode = state.sandbox.dragInteractionMode ?? DEFAULT_DRAG_INTERACTION_MODE;
    const behaviorId = resolveDragInteractionBehaviorId(asset, mode);
    return behaviorId ? (behaviorById.get(behaviorId) ?? null) : null;
}
export function createDragLaunchBehaviors(state) {
    return [
        createDragLaunchInteraction({
            id: DRAG_LAUNCH_BEHAVIOR_ID,
            getConfig: dragLaunchConfigForProp,
            buildAimLineContext: dragLaunchAimLineContextForState(state),
            resolveAimLine: getDragLaunchAimLine,
            canStart: (prop) => {
                const grid = state?.obstacleGrid;
                return !(grid && FloorBelt.isEntityOnBelt(grid, prop.x, prop.y));
            },
        }),
    ];
}
function resolveGrabDragAnchor(prop, world) {
    const asset = propCatalog[prop.type];
    if (asset?.primitive === "polygon" && asset.physics?.isKinetic !== false && prop.shape?.vertices?.length >= 6) {
        const facing = entityFacing(prop);
        findClosestPolygonBoundaryGrabPointInto(GRAB_ANCHOR_SCRATCH, 0, prop.shape.vertices, prop.x, prop.y, facing, world.x, world.y);
        GRAB_ANCHOR_SCRATCH[G_OX] = GRAB_ANCHOR_SCRATCH[G_WX] - world.x;
        GRAB_ANCHOR_SCRATCH[G_OY] = GRAB_ANCHOR_SCRATCH[G_WY] - world.y;
        return;
    }
    if (asset?.primitive === "sphere" && asset.physics?.isKinetic !== false) {
        const facing = entityFacing(prop);
        const radius = resolveBodyRadius(prop);
        findCircleRimGrabPointInto(GRAB_ANCHOR_SCRATCH, 0, prop.x, prop.y, facing, radius, world.x, world.y);
        GRAB_ANCHOR_SCRATCH[G_OX] = GRAB_ANCHOR_SCRATCH[G_WX] - world.x;
        GRAB_ANCHOR_SCRATCH[G_OY] = GRAB_ANCHOR_SCRATCH[G_WY] - world.y;
        return;
    }
    GRAB_ANCHOR_SCRATCH[G_LX] = 0;
    GRAB_ANCHOR_SCRATCH[G_LY] = 0;
    GRAB_ANCHOR_SCRATCH[G_OX] = prop.x - world.x;
    GRAB_ANCHOR_SCRATCH[G_OY] = prop.y - world.y;
}
function grabDragAnchorWorld(prop, run) {
    if (prop.strategy?.rolls) {
        const radius = resolveBodyRadius(prop);
        findCircleRimGrabPointInto(GRAB_ANCHOR_SCRATCH, 0, prop.x, prop.y, entityFacing(prop), radius, run.targetWorld.x, run.targetWorld.y);
        return;
    }
    const angle = entityFacing(prop);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const lx = run.anchorLocalX;
    const ly = run.anchorLocalY;
    GRAB_ANCHOR_SCRATCH[G_WX] = prop.x + lx * cos - ly * sin;
    GRAB_ANCHOR_SCRATCH[G_WY] = prop.y + lx * sin + ly * cos;
}
export function createGrabDragBehavior(state, groundNavBehaviorIds = []) {
    const propRuns = new Map();
    const activeRunIds = [];
    const tickPull = (prop, run, dtMs) => {
        const grabConfig = getDragLaunchConfig(propCatalog[prop.type]);
        const rollConfig = getKineticRollConfig(prop);
        const tx = run.targetWorld.x + run.offsetX;
        const ty = run.targetWorld.y + run.offsetY;
        let dx;
        let dy;
        if (prop.strategy?.rolls) {
            dx = tx - prop.x;
            dy = ty - prop.y;
        } else {
            grabDragAnchorWorld(prop, run);
            dx = tx - GRAB_ANCHOR_SCRATCH[G_WX];
            dy = ty - GRAB_ANCHOR_SCRATCH[G_WY];
        }
        const dist = Math.hypot(dx, dy);
        if (dist < rollConfig.stopRadius) {
            decelerateRoll(prop, rollConfig);
            return;
        }
        const power = computeLaunchPower(dist, grabConfig);
        if (power <= 0) {
            decelerateRoll(prop, rollConfig);
            return;
        }
        const ratio = power / grabConfig.maxPower;
        steerRollToward(prop, dx / dist, dy / dist, { ...rollConfig, accel: rollConfig.accel * (0.5 + ratio), maxSpeed: rollConfig.maxSpeed * (0.3 + ratio * 0.7) });
        if (prop.strategy?.rolls) return;
        grabDragAnchorWorld(prop, run);
        const rx = GRAB_ANCHOR_SCRATCH[G_WX] - prop.x;
        const ry = GRAB_ANCHOR_SCRATCH[G_WY] - prop.y;
        const leverArmSq = rx * rx + ry * ry;
        if (leverArmSq > 0.25) {
            const fx = (dx / dist) * power;
            const fy = (dy / dist) * power;
            const torque = rx * fy - ry * fx;
            const dtScale = dtMs / 16;
            prop.angularVelocity = (prop.angularVelocity ?? 0) + torque * (1 / REFERENCE_GRAB_INERTIA) * GRAB_DRAG_TORQUE_GAIN * dtScale;
            prop.angularVelocity *= Math.exp(-GRAB_DRAG_ANGULAR_DAMP * (dtMs / 1000));
            wakeKineticBody(prop);
        }
    };
    return {
        id: GRAB_DRAG_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            if (!prop?.strategy?.isKinetic || prop.isDead) return false;
            const grid = state?.obstacleGrid;
            if (grid && FloorBelt.isEntityOnBelt(grid, prop.x, prop.y)) return false;
            for (const id of groundNavBehaviorIds) state.sandbox.behaviorById.get(id)?.clearMoveTarget?.(prop);
            state.sandbox.entityMeta.clearActiveBehaviorId(prop.id);
            resolveGrabDragAnchor(prop, world);
            propRuns.set(prop.id, { targetWorld: { x: world.x, y: world.y }, offsetX: GRAB_ANCHOR_SCRATCH[G_OX], offsetY: GRAB_ANCHOR_SCRATCH[G_OY], anchorLocalX: GRAB_ANCHOR_SCRATCH[G_LX], anchorLocalY: GRAB_ANCHOR_SCRATCH[G_LY], dragging: true });
            if (activeRunIds.indexOf(prop.id) === -1) activeRunIds.push(prop.id);
            wakeKineticBody(prop);
            return true;
        },
        onPointerMove(prop, world) {
            const run = propRuns.get(prop.id);
            if (!run?.dragging) return;
            run.targetWorld.x = world.x;
            run.targetWorld.y = world.y;
        },
        onPointerUp(prop) {
            const run = propRuns.get(prop.id);
            if (!run) return;
            run.dragging = false;
            clearGroundRollDrive(prop);
            propRuns.delete(prop.id);
            const idx = activeRunIds.indexOf(prop.id);
            if (idx >= 0) activeRunIds.splice(idx, 1);
        },
        tickWorld(dtMs = 16) {
            for (let i = activeRunIds.length - 1; i >= 0; i--) {
                const propId = activeRunIds[i];
                const prop = state.entityRegistry.getLive(propId);
                const run = propRuns.get(propId);
                if (!prop || !run?.dragging) {
                    activeRunIds.splice(i, 1);
                    continue;
                }
                const grid = state?.obstacleGrid;
                if (grid && FloorBelt.isEntityOnBelt(grid, prop.x, prop.y)) {
                    run.dragging = false;
                    clearGroundRollDrive(prop);
                    propRuns.delete(prop.id);
                    activeRunIds.splice(i, 1);
                    continue;
                }
                tickPull(prop, run, dtMs);
            }
        },
        appendOverlayCommands(commands, prop) {
            const run = propRuns.get(prop.id);
            if (!run?.dragging) return;
            const grabConfig = getDragLaunchConfig(propCatalog[prop.type]);
            grabDragAnchorWorld(prop, run);
            const ax = GRAB_ANCHOR_SCRATCH[G_WX];
            const ay = GRAB_ANCHOR_SCRATCH[G_WY];
            const tx = run.targetWorld.x + run.offsetX;
            const ty = run.targetWorld.y + run.offsetY;
            const dist = Math.hypot(tx - ax, ty - ay);
            const ratio = resolveDragLaunchPullRatio(dist, grabConfig);
            const hue = hueFromPullRatio(ratio);
            commands.push(overlaySegment(ax, ay, tx, ty, { stroke: `hsla(${hue}, 90%, 55%, 0.35)`, lineWidth: 1.5, dash: [3, 3] }));
            commands.push(overlayCircleFillStroke(ax, ay, 3, { fill: `hsla(${hue}, 90%, 55%, 0.45)`, stroke: `hsla(${hue}, 90%, 55%, 0.85)`, lineWidth: 1.5 }));
            commands.push(overlayCircleFillStroke(tx, ty, 4, { fill: `hsla(${hue}, 90%, 55%, 0.35)`, stroke: `hsla(${hue}, 90%, 55%, 0.85)`, lineWidth: 1.5 }));
        },
        reset() {
            propRuns.clear();
            activeRunIds.length = 0;
        },
    };
}
export function appendDragLaunchOverlayCommands(commands, aim, config, aimLineContext = null, resolveAimLine = getDragLaunchAimLine) {
    const preview = getDragLaunchPreview(aim, config);
    if (!preview) return;
    const ratio = config.maxPower > config.minPower ? Math.max(0, Math.min(1, (preview.power - config.minPower) / (config.maxPower - config.minPower))) : 0;
    const hue = hueFromPullRatio(ratio);
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
