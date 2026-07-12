import propCatalog from "../../Assets/props/index.js";
import { normalizeXYInto, findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto } from "../Math/math.js";
import { ENGINE_F32, M_OUT_NX, M_OUT_NY, M_OUT_LEN, G_WX, G_WY, G_LX, G_LY, G_OX, G_OY, ENGINE_BOUNDS_BASE, B_TMP, entityX, entityY, entityFlags } from "../../Core/engineMemory.js";
import { computeCircleAimLineSegmentInto, estimateRollingTravelDistance } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { clearGroundRollDrive, decelerateRoll, steerRollToward, wakeKineticBody, readEntityFacing, kineticInertiaFromBody, CircleShape, stampPrimitivePhysics, physicsSettings } from "../Physics/physics.js";
import { ENTITY_FLAG_KINETIC, ENTITY_FLAG_ROLLS } from "../../Core/engineEnums.js";
import { stampOverlayAimSegment, stampOverlayCircleFillStroke, stampOverlayCircleStroke, stampOverlaySegment, OVERLAY_STYLE_DRAG_GRAB_LINE, OVERLAY_STYLE_DRAG_GRAB_DOT_A, OVERLAY_STYLE_DRAG_GRAB_DOT_B, OVERLAY_STYLE_DRAG_BAND, OVERLAY_STYLE_DRAG_PULL_LINE, OVERLAY_STYLE_DRAG_PULL_DOT, OVERLAY_STYLE_DRAG_START_RING, OVERLAY_STYLE_DRAG_START_DOT, OVERLAY_STYLE_DRAG_RUBBER, OVERLAY_STYLE_DRAG_ANCHOR } from "../Render/render.js";
import { PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON, PRIMITIVE_PHYSICS_ROW_CIRCLE, SANDBOX_BEHAVIOR_GRAB_DRAG, SANDBOX_BEHAVIOR_DRAG_LAUNCH } from "../../Core/engineEnums.js";
const GRAB_DRAG_TORQUE_GAIN = 0.004;
const GRAB_DRAG_ANGULAR_DAMP = 4;
const REFERENCE_GRAB_INERTIA = (() => {
    const body = { shape: new CircleShape(4), radius: 4, strategy: stampPrimitivePhysics({ isKinetic: true }, PRIMITIVE_PHYSICS_ROW_CIRCLE) };
    return kineticInertiaFromBody(body);
})();
const dragConfigScratch = { minDrag: 10, maxPull: 90, pullScale: 1.25, minPower: 12, maxPower: 200 };
function hueFromPullRatio(ratio) {
    return 180 - ratio * 180;
}
export function resolveDragLaunchConfigFromSize(radius) {
    const R = Math.max(2, radius);
    const maxPower = Math.min(700, Math.max(200, 70 * R + 220));
    dragConfigScratch.minDrag = 10;
    dragConfigScratch.maxPull = Math.min(200, Math.max(90, 90 + 5 * R));
    dragConfigScratch.pullScale = 1.25;
    dragConfigScratch.minPower = Math.max(12, maxPower * 0.08);
    dragConfigScratch.maxPower = maxPower;
    return dragConfigScratch;
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
    return config.minPower + pullRatio * (config.maxPower - config.minPower);
}
function dragLaunchMaxRayDist(obstacleGrid) {
    return Math.hypot(obstacleGrid.maxX - obstacleGrid.minX, obstacleGrid.maxY - obstacleGrid.minY) * 1.25;
}
export function applyDragLaunchVelocity(body, nx, ny, power) {
    body.vx = nx * power;
    body.vy = ny * power;
    if ((entityFlags[body._physId] & ENTITY_FLAG_ROLLS) !== 0) body.angularVelocity = (power / body.radius) * 0.12;
    wakeKineticBody(body._physId);
}
export const DEFAULT_DRAG_INTERACTION_MODE = SANDBOX_BEHAVIOR_DRAG_LAUNCH;
export function normalizeDragInteractionMode(mode) {
    return mode === SANDBOX_BEHAVIOR_GRAB_DRAG ? SANDBOX_BEHAVIOR_GRAB_DRAG : SANDBOX_BEHAVIOR_DRAG_LAUNCH;
}
export function toggleDragInteractionMode(mode) {
    return normalizeDragInteractionMode(mode) === SANDBOX_BEHAVIOR_GRAB_DRAG ? SANDBOX_BEHAVIOR_DRAG_LAUNCH : SANDBOX_BEHAVIOR_GRAB_DRAG;
}
export function dragInteractionModeLabel(mode) {
    return normalizeDragInteractionMode(mode) === SANDBOX_BEHAVIOR_GRAB_DRAG ? "Drag: Grab" : "Drag: Launch";
}
export function assetSupportsDragInteraction(asset) {
    if (!asset) return false;
    if (asset.sandbox?.gridFloorBelt) return false;
    if (asset.physics?.isKinetic === false) return false;
    return true;
}
export function propSupportsDragInteraction(prop) {
    return (entityFlags[prop._physId] & ENTITY_FLAG_KINETIC) !== 0 && !prop.isDead;
}
export function resolveDragInteractionBehaviorId(asset, dragInteractionMode = DEFAULT_DRAG_INTERACTION_MODE) {
    if (!assetSupportsDragInteraction(asset)) return null;
    return dragInteractionMode === SANDBOX_BEHAVIOR_GRAB_DRAG ? SANDBOX_BEHAVIOR_GRAB_DRAG : SANDBOX_BEHAVIOR_DRAG_LAUNCH;
}
export function resolveDragInteractionBehavior(prop, state, behaviorById) {
    if (!propSupportsDragInteraction(prop)) return null;
    const mode = state.sandbox.dragInteractionMode ?? DEFAULT_DRAG_INTERACTION_MODE;
    const behaviorId = resolveDragInteractionBehaviorId(propCatalog[prop.type], mode);
    return behaviorId ? (behaviorById.get(behaviorId) ?? null) : null;
}
function propCanStartDrag(state, prop) {
    if (!propSupportsDragInteraction(prop)) return false;
    const eid = prop._physId;
    return !FloorBelt.isEntityOnBelt(state.obstacleGrid, entityX[eid], entityY[eid]);
}
function clearGroundNavForProp(state, groundNavBehaviorIds, prop) {
    const byId = state.sandbox.behaviorById;
    const eid = prop._physId;
    for (const id of groundNavBehaviorIds) byId.get(id).clearMoveTarget(eid);
    state.sandbox.entityMeta.clearActiveBehaviorId(prop.id);
}
export function createDragLaunchBehavior(state) {
    let aimActive = 0;
    let aimAnchorX = 0;
    let aimAnchorY = 0;
    let aimStartX = 0;
    let aimStartY = 0;
    let aimPullX = 0;
    let aimPullY = 0;
    let aimShotNx = NaN;
    let aimShotNy = NaN;
    let aimDrag = 0;
    let aimPullBack = 0;
    let aimPreviewPullX = 0;
    let aimPreviewPullY = 0;
    let aimPower = 0;
    const clearAim = () => {
        aimActive = 0;
        aimShotNx = NaN;
        aimShotNy = NaN;
        aimDrag = 0;
        aimPullBack = 0;
        aimPower = 0;
    };
    const resolveAimPhysics = (config) => {
        const dx = aimPullX - aimStartX;
        const dy = aimPullY - aimStartY;
        normalizeXYInto(dx, dy);
        const nx = ENGINE_F32[M_OUT_NX];
        const ny = ENGINE_F32[M_OUT_NY];
        const drag = ENGINE_F32[M_OUT_LEN];
        if (drag < 0.5) {
            if (!Number.isFinite(aimShotNx) || !Number.isFinite(aimShotNy)) return false;
            aimDrag = 0;
            aimPullBack = 0;
            return true;
        }
        aimShotNx = -nx;
        aimShotNy = -ny;
        aimDrag = drag;
        aimPullBack = Math.min(config.maxPull, drag * config.pullScale);
        return true;
    };
    const writeAimPreview = (config) => {
        if (!aimActive) return false;
        if (!resolveAimPhysics(config) || !Number.isFinite(aimShotNx) || !Number.isFinite(aimShotNy)) return false;
        aimPreviewPullX = aimAnchorX + (aimPullX - aimStartX);
        aimPreviewPullY = aimAnchorY + (aimPullY - aimStartY);
        aimPower = computeLaunchPower(aimDrag, config);
        return true;
    };
    const appendAimOverlay = (slab, prop) => {
        const config = resolveDragLaunchConfigFromSize(prop.radius);
        if (!writeAimPreview(config)) return;
        const ratio = config.maxPower > config.minPower ? Math.max(0, Math.min(1, (aimPower - config.minPower) / (config.maxPower - config.minPower))) : 0;
        const hue = hueFromPullRatio(ratio);
        const maxFingerDrag = config.maxPull / config.pullScale;
        stampOverlayCircleStroke(slab, aimStartX, aimStartY, maxFingerDrag, OVERLAY_STYLE_DRAG_BAND, hue);
        stampOverlaySegment(slab, aimStartX, aimStartY, aimPullX, aimPullY, OVERLAY_STYLE_DRAG_PULL_LINE, hue);
        stampOverlayCircleFillStroke(slab, aimPullX, aimPullY, 4, OVERLAY_STYLE_DRAG_PULL_DOT, hue);
        if (Math.hypot(aimStartX - aimAnchorX, aimStartY - aimAnchorY) > 0.1) {
            stampOverlayCircleStroke(slab, aimStartX, aimStartY, 5, OVERLAY_STYLE_DRAG_START_RING, hue);
            stampOverlayCircleFillStroke(slab, aimStartX, aimStartY, 1.5, OVERLAY_STYLE_DRAG_START_DOT, hue);
        }
        stampOverlaySegment(slab, aimPreviewPullX, aimPreviewPullY, aimAnchorX, aimAnchorY, OVERLAY_STYLE_DRAG_RUBBER, hue);
        stampOverlayCircleStroke(slab, aimAnchorX, aimAnchorY, 7, OVERLAY_STYLE_DRAG_ANCHOR, hue);
        if (aimPower <= 0) return;
        const grid = state.obstacleGrid;
        const travelDist = estimateRollingTravelDistance(aimPower, prop.strategy);
        if (!computeCircleAimLineSegmentInto(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, aimAnchorX, aimAnchorY, prop.radius, aimShotNx, aimShotNy, travelDist, dragLaunchMaxRayDist(grid), grid)) return;
        const aimO = ENGINE_BOUNDS_BASE + B_TMP;
        stampOverlayAimSegment(slab, ENGINE_F32[aimO], ENGINE_F32[aimO + 1], ENGINE_F32[aimO + 2], ENGINE_F32[aimO + 3], hue);
    };
    return {
        id: SANDBOX_BEHAVIOR_DRAG_LAUNCH,
        onPointerDown(prop, world) {
            if (!propCanStartDrag(state, prop)) return false;
            wakeKineticBody(prop._physId);
            aimActive = 1;
            aimAnchorX = entityX[prop._physId];
            aimAnchorY = entityY[prop._physId];
            aimStartX = world.x;
            aimStartY = world.y;
            aimPullX = world.x;
            aimPullY = world.y;
            aimShotNx = NaN;
            aimShotNy = NaN;
            aimDrag = 0;
            aimPullBack = 0;
            aimPreviewPullX = world.x;
            aimPreviewPullY = world.y;
            aimPower = 0;
            resolveAimPhysics(resolveDragLaunchConfigFromSize(prop.radius));
            return true;
        },
        onPointerMove(prop, world) {
            if (!aimActive) return;
            if (!propCanStartDrag(state, prop)) {
                clearAim();
                return;
            }
            aimPullX = world.x;
            aimPullY = world.y;
            resolveAimPhysics(resolveDragLaunchConfigFromSize(prop.radius));
        },
        onPointerUp(prop) {
            if (!aimActive) return;
            const config = resolveDragLaunchConfigFromSize(prop.radius);
            const ok = resolveAimPhysics(config) && aimDrag >= config.minDrag && Number.isFinite(aimShotNx) && Number.isFinite(aimShotNy);
            const power = ok ? computeLaunchPower(aimDrag, config) : 0;
            const nx = aimShotNx;
            const ny = aimShotNy;
            clearAim();
            if (!ok || power <= 0) return;
            applyDragLaunchVelocity(prop, nx, ny, power);
        },
        appendOverlayCommands(slab, prop) {
            if (!aimActive) return;
            appendAimOverlay(slab, prop);
        },
        reset() {
            clearAim();
        },
    };
}
function resolveGrabDragAnchor(prop, world) {
    const eid = prop._physId;
    const px = entityX[eid];
    const py = entityY[eid];
    const asset = propCatalog[prop.type];
    const verts = prop.drawOutline?.length >= 6 ? prop.drawOutline : prop.shape?.vertices;
    if (asset?.primitive === PROP_PRIMITIVE_POLYGON && asset.physics?.isKinetic !== false && verts?.length >= 6) {
        const facing = readEntityFacing(prop);
        findClosestPolygonBoundaryGrabPointInto(ENGINE_F32, G_WX, verts, px, py, facing, world.x, world.y);
        ENGINE_F32[G_OX] = ENGINE_F32[G_WX] - world.x;
        ENGINE_F32[G_OY] = ENGINE_F32[G_WY] - world.y;
        return;
    }
    if (asset?.primitive === PROP_PRIMITIVE_SPHERE && asset.physics?.isKinetic !== false) {
        const facing = readEntityFacing(prop);
        findCircleRimGrabPointInto(ENGINE_F32, G_WX, px, py, facing, prop.radius, world.x, world.y);
        ENGINE_F32[G_OX] = ENGINE_F32[G_WX] - world.x;
        ENGINE_F32[G_OY] = ENGINE_F32[G_WY] - world.y;
        return;
    }
    ENGINE_F32[G_LX] = 0;
    ENGINE_F32[G_LY] = 0;
    ENGINE_F32[G_OX] = px - world.x;
    ENGINE_F32[G_OY] = py - world.y;
}
export function createGrabDragBehavior(state, groundNavBehaviorIds) {
    let grabEid = -1;
    let targetX = 0;
    let targetY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let anchorLocalX = 0;
    let anchorLocalY = 0;
    const clearGrab = () => {
        grabEid = -1;
    };
    const grabAnchorWorld = (prop) => {
        const eid = prop._physId;
        const px = entityX[eid];
        const py = entityY[eid];
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) {
            findCircleRimGrabPointInto(ENGINE_F32, G_WX, px, py, readEntityFacing(prop), prop.radius, targetX, targetY);
            return;
        }
        const angle = readEntityFacing(prop);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ENGINE_F32[G_WX] = px + anchorLocalX * cos - anchorLocalY * sin;
        ENGINE_F32[G_WY] = py + anchorLocalX * sin + anchorLocalY * cos;
    };
    const tickPull = (prop, dtMs) => {
        const eid = prop._physId;
        const px = entityX[eid];
        const py = entityY[eid];
        const grabConfig = resolveDragLaunchConfigFromSize(prop.radius);
        const rollConfig = physicsSettings.groundNavRoll;
        const tx = targetX + offsetX;
        const ty = targetY + offsetY;
        let dx;
        let dy;
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) {
            dx = tx - px;
            dy = ty - py;
        } else {
            grabAnchorWorld(prop);
            dx = tx - ENGINE_F32[G_WX];
            dy = ty - ENGINE_F32[G_WY];
        }
        const dist = Math.hypot(dx, dy);
        if (dist < rollConfig.stopRadius) {
            decelerateRoll(eid, rollConfig);
            return;
        }
        const power = computeLaunchPower(dist, grabConfig);
        if (power <= 0) {
            decelerateRoll(eid, rollConfig);
            return;
        }
        const ratio = power / grabConfig.maxPower;
        steerRollToward(eid, dx / dist, dy / dist, rollConfig, null, rollConfig.accel * (0.5 + ratio), rollConfig.maxSpeed * (0.3 + ratio * 0.7));
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) return;
        grabAnchorWorld(prop);
        const rx = ENGINE_F32[G_WX] - px;
        const ry = ENGINE_F32[G_WY] - py;
        const leverArmSq = rx * rx + ry * ry;
        if (leverArmSq > 0.25) {
            const fx = (dx / dist) * power;
            const fy = (dy / dist) * power;
            const torque = rx * fy - ry * fx;
            const dtScale = dtMs / 16;
            prop.angularVelocity = (prop.angularVelocity ?? 0) + torque * (1 / REFERENCE_GRAB_INERTIA) * GRAB_DRAG_TORQUE_GAIN * dtScale;
            prop.angularVelocity *= Math.exp(-GRAB_DRAG_ANGULAR_DAMP * (dtMs / 1000));
            wakeKineticBody(prop._physId);
        }
    };
    return {
        id: SANDBOX_BEHAVIOR_GRAB_DRAG,
        onPointerDown(prop, world) {
            if (!propCanStartDrag(state, prop)) return false;
            clearGroundNavForProp(state, groundNavBehaviorIds, prop);
            resolveGrabDragAnchor(prop, world);
            grabEid = prop._physId;
            targetX = world.x;
            targetY = world.y;
            offsetX = ENGINE_F32[G_OX];
            offsetY = ENGINE_F32[G_OY];
            anchorLocalX = ENGINE_F32[G_LX];
            anchorLocalY = ENGINE_F32[G_LY];
            wakeKineticBody(prop._physId);
            return true;
        },
        onPointerMove(prop, world) {
            if (grabEid !== prop._physId) return;
            targetX = world.x;
            targetY = world.y;
        },
        onPointerUp(prop) {
            if (grabEid !== prop._physId) return;
            clearGroundRollDrive(prop._physId);
            clearGrab();
        },
        tickWorld(dtMs = 16) {
            if (grabEid < 0) return;
            const prop = state.entityRegistry.getRef(grabEid);
            if (!prop) {
                clearGrab();
                return;
            }
            if (FloorBelt.isEntityOnBelt(state.obstacleGrid, entityX[grabEid], entityY[grabEid])) {
                clearGroundRollDrive(prop._physId);
                clearGrab();
                return;
            }
            tickPull(prop, dtMs);
        },
        appendOverlayCommands(slab, prop) {
            if (grabEid !== prop._physId) return;
            const grabConfig = resolveDragLaunchConfigFromSize(prop.radius);
            grabAnchorWorld(prop);
            const ax = ENGINE_F32[G_WX];
            const ay = ENGINE_F32[G_WY];
            const tx = targetX + offsetX;
            const ty = targetY + offsetY;
            const dist = Math.hypot(tx - ax, ty - ay);
            const ratio = resolveDragLaunchPullRatio(dist, grabConfig);
            const hue = hueFromPullRatio(ratio);
            stampOverlaySegment(slab, ax, ay, tx, ty, OVERLAY_STYLE_DRAG_GRAB_LINE, hue);
            stampOverlayCircleFillStroke(slab, ax, ay, 3, OVERLAY_STYLE_DRAG_GRAB_DOT_A, hue);
            stampOverlayCircleFillStroke(slab, tx, ty, 4, OVERLAY_STYLE_DRAG_GRAB_DOT_B, hue);
        },
        reset() {
            clearGrab();
        },
    };
}
