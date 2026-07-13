import { normalizeXYInto, findClosestPolygonBoundaryGrabPointInto, findCircleRimGrabPointInto } from "../Math/math.js";
import { ENGINE_F32, M_OUT_NX, M_OUT_NY, M_OUT_LEN, G_WX, G_WY, G_LX, G_LY, G_OX, G_OY, ENGINE_BOUNDS_BASE, B_TMP, entityX, entityY, entityVx, entityVy, entityW, entityR, entityFlags, entityFacing, entityGameId, entityAlive, kineticDynamicSlab } from "../../Core/engineMemory.js";
import { computeCircleAimLineSegmentInto, estimateRollingTravelDistance } from "../Spatial/spatial.js";
import { FloorBelt } from "../Spatial/belts.js";
import { clearGroundRollDrive, decelerateRoll, steerRollToward, wakeKineticBody, kineticInertiaFromBody, CircleShape, stampPrimitivePhysics, physicsSettings } from "../Physics/physics.js";
import { ENTITY_FLAG_KINETIC, ENTITY_FLAG_ROLLS, ENTITY_FLAG_DEAD, ENTITY_FLAG_CIRCLE_SHAPE, SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON, PRIMITIVE_PHYSICS_ROW_CIRCLE, SANDBOX_BEHAVIOR_GRAB_DRAG, SANDBOX_BEHAVIOR_DRAG_LAUNCH } from "../../Core/engineEnums.js";
import { stampOverlayAimSegment, stampOverlayCircleFillStroke, stampOverlayCircleStroke, stampOverlaySegment, OVERLAY_STYLE_DRAG_GRAB_LINE, OVERLAY_STYLE_DRAG_GRAB_DOT_A, OVERLAY_STYLE_DRAG_GRAB_DOT_B, OVERLAY_STYLE_DRAG_BAND, OVERLAY_STYLE_DRAG_PULL_LINE, OVERLAY_STYLE_DRAG_PULL_DOT, OVERLAY_STYLE_DRAG_START_RING, OVERLAY_STYLE_DRAG_START_DOT, OVERLAY_STYLE_DRAG_RUBBER, OVERLAY_STYLE_DRAG_ANCHOR } from "../Render/render.js";
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
function resolveDragLaunchConfigFromSize(radius) {
    const R = Math.max(2, radius);
    const maxPower = Math.min(700, Math.max(200, 70 * R + 220));
    dragConfigScratch.minDrag = 10;
    dragConfigScratch.maxPull = Math.min(200, Math.max(90, 90 + 5 * R));
    dragConfigScratch.pullScale = 1.25;
    dragConfigScratch.minPower = Math.max(12, maxPower * 0.08);
    dragConfigScratch.maxPower = maxPower;
    return dragConfigScratch;
}
function resolveDragLaunchPullRatio(drag, config) {
    if (drag < config.minDrag) return 0;
    const maxFingerDrag = config.maxPull / config.pullScale;
    const span = Math.max(0.001, maxFingerDrag - config.minDrag);
    return Math.min(1, (drag - config.minDrag) / span);
}
function computeLaunchPower(drag, config) {
    const pullRatio = resolveDragLaunchPullRatio(drag, config);
    if (pullRatio <= 0) return 0;
    return config.minPower + pullRatio * (config.maxPower - config.minPower);
}
function dragLaunchMaxRayDist(obstacleGrid) {
    return Math.hypot(obstacleGrid.maxX - obstacleGrid.minX, obstacleGrid.maxY - obstacleGrid.minY) * 1.25;
}
function applyDragLaunchVelocity(eid, nx, ny, power) {
    entityVx[eid] = nx * power;
    entityVy[eid] = ny * power;
    if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) entityW[eid] = (power / entityR[eid]) * 0.12;
    wakeKineticBody(eid);
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
    return true;
}
function entitySupportsDragInteraction(eid) {
    return (entityFlags[eid] & ENTITY_FLAG_KINETIC) !== 0 && (entityFlags[eid] & ENTITY_FLAG_DEAD) === 0;
}
export function resolveDragInteractionBehavior(eid, state, behaviorById) {
    if (!entitySupportsDragInteraction(eid)) return null;
    if (!entityAlive[eid]) return null;
    const mode = state.sandbox.dragInteractionMode ?? DEFAULT_DRAG_INTERACTION_MODE;
    const behaviorId = mode === SANDBOX_BEHAVIOR_GRAB_DRAG ? SANDBOX_BEHAVIOR_GRAB_DRAG : SANDBOX_BEHAVIOR_DRAG_LAUNCH;
    const behavior = behaviorById.get(behaviorId);
    if (!behavior) throw new Error(`resolveDragInteractionBehavior: missing behavior ${behaviorId}`);
    return behavior;
}
function entityCanStartDrag(state, eid) {
    if (!entitySupportsDragInteraction(eid)) return false;
    return !FloorBelt.isEntityOnBelt(state.obstacleGrid, entityX[eid], entityY[eid]);
}
function clearGroundNavForEntity(state, groundNavBehaviorIds, eid) {
    const byId = state.sandbox.behaviorById;
    for (const id of groundNavBehaviorIds) byId.get(id).clearMoveTarget(eid);
    const gameId = entityGameId[eid];
    if (gameId >= 0) state.sandbox.entityMeta.clearActiveBehaviorId(gameId);
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
    const appendAimOverlay = (slab, eid) => {
        const radius = entityR[eid];
        const config = resolveDragLaunchConfigFromSize(radius);
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
        const travelDist = estimateRollingTravelDistance(aimPower, eid);
        if (!computeCircleAimLineSegmentInto(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, aimAnchorX, aimAnchorY, radius, aimShotNx, aimShotNy, travelDist, dragLaunchMaxRayDist(grid), grid)) return;
        const aimO = ENGINE_BOUNDS_BASE + B_TMP;
        stampOverlayAimSegment(slab, ENGINE_F32[aimO], ENGINE_F32[aimO + 1], ENGINE_F32[aimO + 2], ENGINE_F32[aimO + 3], hue);
    };
    return {
        id: SANDBOX_BEHAVIOR_DRAG_LAUNCH,
        onPointerDown(eid, world) {
            if (!entityCanStartDrag(state, eid)) return false;
            wakeKineticBody(eid);
            aimActive = 1;
            aimAnchorX = entityX[eid];
            aimAnchorY = entityY[eid];
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
            resolveAimPhysics(resolveDragLaunchConfigFromSize(entityR[eid]));
            return true;
        },
        onPointerMove(eid, world) {
            if (!aimActive) return;
            if (!entityCanStartDrag(state, eid)) {
                clearAim();
                return;
            }
            aimPullX = world.x;
            aimPullY = world.y;
            resolveAimPhysics(resolveDragLaunchConfigFromSize(entityR[eid]));
        },
        onPointerUp(eid) {
            if (!aimActive) return;
            const config = resolveDragLaunchConfigFromSize(entityR[eid]);
            const ok = resolveAimPhysics(config) && aimDrag >= config.minDrag && Number.isFinite(aimShotNx) && Number.isFinite(aimShotNy);
            const power = ok ? computeLaunchPower(aimDrag, config) : 0;
            const nx = aimShotNx;
            const ny = aimShotNy;
            clearAim();
            if (!ok || power <= 0) return;
            applyDragLaunchVelocity(eid, nx, ny, power);
        },
        appendOverlayCommands(slab, eid) {
            if (!aimActive) return;
            appendAimOverlay(slab, eid);
        },
        reset() {
            clearAim();
        },
    };
}
function resolveGrabDragAnchor(eid, world) {
    if ((entityFlags[eid] & ENTITY_FLAG_KINETIC) === 0) throw new Error(`resolveGrabDragAnchor: eid ${eid} is not kinetic`);
    const px = entityX[eid];
    const py = entityY[eid];
    const facing = entityFacing[eid];
    if ((entityFlags[eid] & ENTITY_FLAG_CIRCLE_SHAPE) !== 0) {
        findCircleRimGrabPointInto(ENGINE_F32, G_WX, px, py, facing, entityR[eid], world.x, world.y);
        ENGINE_F32[G_OX] = ENGINE_F32[G_WX] - world.x;
        ENGINE_F32[G_OY] = ENGINE_F32[G_WY] - world.y;
        return;
    }
    const slab = kineticDynamicSlab;
    const geom0 = slab.partGeomOffset[eid];
    if (geom0 < 0) throw new Error(`resolveGrabDragAnchor: eid ${eid} has no stamped slab geometry`);
    const partCount = slab.partCount[eid] | 0;
    if (partCount <= 0) throw new Error(`resolveGrabDragAnchor: eid ${eid} has empty part table`);
    let bestDistSq = Infinity;
    let bestWx = px;
    let bestWy = py;
    let bestLx = 0;
    let bestLy = 0;
    for (let p = 0; p < partCount; p++) {
        const row = geom0 + p;
        if (slab.partShapeKind[row] === SHAPE_TYPE_CIRCLE) {
            findCircleRimGrabPointInto(ENGINE_F32, G_WX, px, py, facing, slab.partRadius[row], world.x, world.y);
            const dx = world.x - ENGINE_F32[G_WX];
            const dy = world.y - ENGINE_F32[G_WY];
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestWx = ENGINE_F32[G_WX];
                bestWy = ENGINE_F32[G_WY];
                bestLx = ENGINE_F32[G_LX];
                bestLy = ENGINE_F32[G_LY];
            }
            continue;
        }
        if (slab.partShapeKind[row] !== SHAPE_TYPE_POLYGON) continue;
        const vo = slab.partVertOffset[row];
        const n = slab.partVertFloatCount[row];
        const verts = slab.shapeVertPool.subarray(vo, vo + n);
        findClosestPolygonBoundaryGrabPointInto(ENGINE_F32, G_WX, verts, px, py, facing, world.x, world.y);
        const dx = world.x - ENGINE_F32[G_WX];
        const dy = world.y - ENGINE_F32[G_WY];
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestWx = ENGINE_F32[G_WX];
            bestWy = ENGINE_F32[G_WY];
            bestLx = ENGINE_F32[G_LX];
            bestLy = ENGINE_F32[G_LY];
        }
    }
    if (bestDistSq === Infinity) throw new Error(`resolveGrabDragAnchor: eid ${eid} stamped parts had no grab boundary`);
    ENGINE_F32[G_WX] = bestWx;
    ENGINE_F32[G_WY] = bestWy;
    ENGINE_F32[G_LX] = bestLx;
    ENGINE_F32[G_LY] = bestLy;
    ENGINE_F32[G_OX] = bestWx - world.x;
    ENGINE_F32[G_OY] = bestWy - world.y;
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
    const grabAnchorWorld = (eid) => {
        const px = entityX[eid];
        const py = entityY[eid];
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) {
            findCircleRimGrabPointInto(ENGINE_F32, G_WX, px, py, entityFacing[eid], entityR[eid], targetX, targetY);
            return;
        }
        const angle = entityFacing[eid];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ENGINE_F32[G_WX] = px + anchorLocalX * cos - anchorLocalY * sin;
        ENGINE_F32[G_WY] = py + anchorLocalX * sin + anchorLocalY * cos;
    };
    const tickPull = (eid, dtMs) => {
        const px = entityX[eid];
        const py = entityY[eid];
        const grabConfig = resolveDragLaunchConfigFromSize(entityR[eid]);
        const rollConfig = physicsSettings.groundNavRoll;
        const tx = targetX + offsetX;
        const ty = targetY + offsetY;
        let dx;
        let dy;
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) {
            dx = tx - px;
            dy = ty - py;
        } else {
            grabAnchorWorld(eid);
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
        grabAnchorWorld(eid);
        const rx = ENGINE_F32[G_WX] - px;
        const ry = ENGINE_F32[G_WY] - py;
        const leverArmSq = rx * rx + ry * ry;
        if (leverArmSq > 0.25) {
            const fx = (dx / dist) * power;
            const fy = (dy / dist) * power;
            const torque = rx * fy - ry * fx;
            const dtScale = dtMs / 16;
            entityW[eid] += torque * (1 / REFERENCE_GRAB_INERTIA) * GRAB_DRAG_TORQUE_GAIN * dtScale;
            entityW[eid] *= Math.exp(-GRAB_DRAG_ANGULAR_DAMP * (dtMs / 1000));
            wakeKineticBody(eid);
        }
    };
    return {
        id: SANDBOX_BEHAVIOR_GRAB_DRAG,
        onPointerDown(eid, world) {
            if (!entityCanStartDrag(state, eid)) return false;
            clearGroundNavForEntity(state, groundNavBehaviorIds, eid);
            resolveGrabDragAnchor(eid, world);
            grabEid = eid;
            targetX = world.x;
            targetY = world.y;
            offsetX = ENGINE_F32[G_OX];
            offsetY = ENGINE_F32[G_OY];
            anchorLocalX = ENGINE_F32[G_LX];
            anchorLocalY = ENGINE_F32[G_LY];
            wakeKineticBody(eid);
            return true;
        },
        onPointerMove(eid, world) {
            if (grabEid !== eid) return;
            targetX = world.x;
            targetY = world.y;
        },
        onPointerUp(eid) {
            if (grabEid !== eid) return;
            clearGroundRollDrive(eid);
            clearGrab();
        },
        tickWorld(dtMs = 16) {
            if (grabEid < 0) return;
            if (!entityAlive[grabEid]) {
                clearGrab();
                return;
            }
            if (FloorBelt.isEntityOnBelt(state.obstacleGrid, entityX[grabEid], entityY[grabEid])) {
                clearGroundRollDrive(grabEid);
                clearGrab();
                return;
            }
            tickPull(grabEid, dtMs);
        },
        appendOverlayCommands(slab, eid) {
            if (grabEid !== eid) return;
            const grabConfig = resolveDragLaunchConfigFromSize(entityR[grabEid]);
            grabAnchorWorld(eid);
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
