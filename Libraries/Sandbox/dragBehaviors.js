import propCatalog from "../../Assets/props/index.js";
import { normalizeXYInto, findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto } from "../Math/math.js";
import { ENGINE_F32, M_OUT_NX, M_OUT_NY, M_OUT_LEN, G_WX, G_WY, G_LX, G_LY, G_OX, G_OY, ENGINE_BOUNDS_BASE, B_TMP } from "../../Core/engineMemory.js";
import { computeCircleAimLineSegmentInto, estimateRollingTravelDistance } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { getKineticRollConfig, clearGroundRollDrive, decelerateRoll, steerRollToward, wakeKineticBody, readEntityFacing, kineticInertiaFromBody, CircleShape, stampPrimitivePhysics } from "../Physics/physics.js";
import { overlayAimSegment, overlayCircleFillStroke, overlayCircleStroke, overlaySegment } from "../Render/render.js";
import { PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON } from "../../Core/engineEnums.js";
import { PRIMITIVE_PHYSICS_ROW_CIRCLE } from "../../Core/engineMemory.js";
/** @typedef {{ minDrag: number, maxPull: number, pullScale: number, minPower: number, maxPower: number, powerCurve?: number }} DragLaunchConfig */
/** @typedef {{ active: boolean, anchorX: number, anchorY: number, startX: number, startY: number, pullX: number, pullY: number, shotNx: number | null, shotNy: number | null }} DragLaunchAim */
export const GRAB_DRAG_BEHAVIOR_ID = "grabDrag";
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
const GRAB_DRAG_TORQUE_GAIN = 0.004;
const GRAB_DRAG_ANGULAR_DAMP = 4;
const REFERENCE_GRAB_INERTIA = (() => {
    const body = { shape: new CircleShape(4), radius: 4, strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_CIRCLE) };
    return kineticInertiaFromBody(body);
})();
function hueFromPullRatio(ratio) {
    return 180 - ratio * 180;
}
export function resolveDragLaunchConfigFromSize(radius) {
    const R = Math.max(2, radius);
    const maxPower = Math.min(700, Math.max(200, 70 * R + 220));
    return { minDrag: 10, maxPull: Math.min(200, Math.max(90, 90 + 5 * R)), pullScale: 1.25, minPower: Math.max(12, maxPower * 0.08), maxPower };
}
export function createDragLaunchAim(anchorX, anchorY, startX = anchorX, startY = anchorY) {
    return { active: true, anchorX, anchorY, startX, startY, pullX: startX, pullY: startY, shotNx: null, shotNy: null };
}
function resolveDragAimPhysics(aim, config) {
    const startX = aim.startX ?? aim.anchorX;
    const startY = aim.startY ?? aim.anchorY;
    const dx = aim.pullX - startX;
    const dy = aim.pullY - startY;
    normalizeXYInto(dx, dy);
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
    if (!preview || preview.power <= 0 || !aimLineContext) return false;
    const travelDist = estimateRollingTravelDistance(preview.power, aimLineContext.prop?.strategy ?? {});
    return computeCircleAimLineSegmentInto(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, { originX: preview.anchorX, originY: preview.anchorY, radius: aimLineContext.radius, nx: preview.nx, ny: preview.ny, maxTravelDist: travelDist, maxRayDist: aimLineContext.maxRayDist });
}
export function applyDragLaunchVelocity(body, nx, ny, power) {
    body.vx = nx * power;
    body.vy = ny * power;
    if (body.strategy?.rolls) {
        const r = body.radius;
        body.angularVelocity = (power / r) * 0.12;
    }
    wakeKineticBody(body);
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
            updateDragLaunchAim(aim, world.x, world.y, resolveDragLaunchConfigFromSize(prop.radius));
            return true;
        },
        onPointerMove(prop, world, _e) {
            if (!aim?.active) return;
            if (spec.canStart && !spec.canStart(prop, world)) {
                aim = null;
                return;
            }
            updateDragLaunchAim(aim, world.x, world.y, resolveDragLaunchConfigFromSize(prop.radius));
        },
        onPointerUp(prop, _e) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, resolveDragLaunchConfigFromSize(prop.radius));
            aim = null;
            if (!shot) return;
            applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        },
        appendOverlayCommands(commands, prop) {
            if (!aim?.active) return;
            appendDragLaunchOverlayCommands(commands, aim, resolveDragLaunchConfigFromSize(prop.radius), buildCtx(prop), resolveLine);
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
export function assetSupportsDragInteraction(asset) {
    if (!asset) return false;
    if (asset.sandbox?.gridFloorBelt) return false;
    if (asset.physics?.isKinetic === false) return false;
    return true;
}
export function propSupportsDragInteraction(prop) {
    return prop?.strategy?.isKinetic === true && !prop.isDead;
}
export function resolveDragInteractionBehaviorId(asset, dragInteractionMode = DEFAULT_DRAG_INTERACTION_MODE) {
    if (!assetSupportsDragInteraction(asset)) return null;
    return dragInteractionMode === GRAB_DRAG_BEHAVIOR_ID ? GRAB_DRAG_BEHAVIOR_ID : DRAG_LAUNCH_BEHAVIOR_ID;
}
export function resolveDragInteractionBehavior(prop, state, behaviorById) {
    if (!propSupportsDragInteraction(prop)) return null;
    const mode = state.sandbox.dragInteractionMode ?? DEFAULT_DRAG_INTERACTION_MODE;
    const behaviorId = resolveDragInteractionBehaviorId(propCatalog[prop.type], mode);
    return behaviorId ? (behaviorById.get(behaviorId) ?? null) : null;
}
export function createDragLaunchBehaviors(state) {
    return [
        createDragLaunchInteraction({
            id: DRAG_LAUNCH_BEHAVIOR_ID,
            buildAimLineContext: dragLaunchAimLineContextForState(state),
            resolveAimLine: getDragLaunchAimLine,
            canStart: (prop) => {
                if (!propSupportsDragInteraction(prop)) return false;
                const grid = state?.obstacleGrid;
                return !(grid && FloorBelt.isEntityOnBelt(grid, prop.x, prop.y));
            },
        }),
    ];
}
function resolveGrabDragAnchor(prop, world) {
    const asset = propCatalog[prop.type];
    const verts = prop.drawOutline?.length >= 6 ? prop.drawOutline : prop.shape?.vertices;
    if (asset?.primitive === PROP_PRIMITIVE_POLYGON && asset.physics?.isKinetic !== false && verts?.length >= 6) {
        const facing = readEntityFacing(prop);
        findClosestPolygonBoundaryGrabPointInto(ENGINE_F32, G_WX, verts, prop.x, prop.y, facing, world.x, world.y);
        ENGINE_F32[G_OX] = ENGINE_F32[G_WX] - world.x;
        ENGINE_F32[G_OY] = ENGINE_F32[G_WY] - world.y;
        return;
    }
    if (asset?.primitive === PROP_PRIMITIVE_SPHERE && asset.physics?.isKinetic !== false) {
        const facing = readEntityFacing(prop);
        const radius = prop.radius;
        findCircleRimGrabPointInto(ENGINE_F32, G_WX, prop.x, prop.y, facing, radius, world.x, world.y);
        ENGINE_F32[G_OX] = ENGINE_F32[G_WX] - world.x;
        ENGINE_F32[G_OY] = ENGINE_F32[G_WY] - world.y;
        return;
    }
    ENGINE_F32[G_LX] = 0;
    ENGINE_F32[G_LY] = 0;
    ENGINE_F32[G_OX] = prop.x - world.x;
    ENGINE_F32[G_OY] = prop.y - world.y;
}
function grabDragAnchorWorld(prop, run) {
    if (prop.strategy?.rolls) {
        const radius = prop.radius;
        findCircleRimGrabPointInto(ENGINE_F32, G_WX, prop.x, prop.y, readEntityFacing(prop), radius, run.targetWorld.x, run.targetWorld.y);
        return;
    }
    const angle = readEntityFacing(prop);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const lx = run.anchorLocalX;
    const ly = run.anchorLocalY;
    ENGINE_F32[G_WX] = prop.x + lx * cos - ly * sin;
    ENGINE_F32[G_WY] = prop.y + lx * sin + ly * cos;
}
export function createGrabDragBehavior(state, groundNavBehaviorIds = []) {
    const propRuns = new Map();
    const activeRunIds = [];
    const tickPull = (prop, run, dtMs) => {
        const grabConfig = resolveDragLaunchConfigFromSize(prop.radius);
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
            dx = tx - ENGINE_F32[G_WX];
            dy = ty - ENGINE_F32[G_WY];
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
        steerRollToward(prop, dx / dist, dy / dist, rollConfig, null, rollConfig.accel * (0.5 + ratio), rollConfig.maxSpeed * (0.3 + ratio * 0.7));
        if (prop.strategy?.rolls) return;
        grabDragAnchorWorld(prop, run);
        const rx = ENGINE_F32[G_WX] - prop.x;
        const ry = ENGINE_F32[G_WY] - prop.y;
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
            propRuns.set(prop.id, { targetWorld: { x: world.x, y: world.y }, offsetX: ENGINE_F32[G_OX], offsetY: ENGINE_F32[G_OY], anchorLocalX: ENGINE_F32[G_LX], anchorLocalY: ENGINE_F32[G_LY], dragging: true });
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
            const grabConfig = resolveDragLaunchConfigFromSize(prop.radius);
            grabDragAnchorWorld(prop, run);
            const ax = ENGINE_F32[G_WX];
            const ay = ENGINE_F32[G_WY];
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
    if (!resolveAimLine(preview, aimLineContext)) return;
    const aimO = ENGINE_BOUNDS_BASE + B_TMP;
    commands.push(overlayAimSegment(ENGINE_F32[aimO], ENGINE_F32[aimO + 1], ENGINE_F32[aimO + 2], ENGINE_F32[aimO + 3], { color: `hsl(${hue}, 100%, 50%)`, lineWidth: 3, glowHue: hue }));
}
