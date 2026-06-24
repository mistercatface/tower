import { physicsSettings } from "../../Motion/physicsDefaults.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
import { REPLAN_PRIORITY_TARGET } from "../../Pathfinding/hpaReplanPolicy.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { createHpaGroundNavSession } from "./hpaGroundNavSession.js";
import { buildHpaGroundNavPathSettings, driveGroundNav, groundNavArrivedAtTarget } from "./driveGroundNav.js";
import { decelerateRoll, getKineticRollConfig, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { isEntityOnFloorBelt, isFloorBeltCell } from "../../Spatial/grid/FloorCell.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { hasLineOfSight } from "../../Spatial/query/lineOfSight.js";
import { getSnakeGameConfig } from "../../Game/snake/snakeGameConfig.js";
export function cellTargetHasArrivedAtDestCell(grid, col, row, destCol, destRow) {
    if (isFloorBeltCell(grid, destCol, destRow)) return col === destCol && row === destRow;
    return cellChebyshevDistance(col, row, destCol, destRow) <= 1;
}
export function shouldReleaseCellTargetHpaNav(prop, grid, destCol, destRow, destWorld, stopRadius) {
    const col = grid.worldCol(prop.x);
    const row = grid.worldRow(prop.y);
    if (cellTargetHasArrivedAtDestCell(grid, col, row, destCol, destRow)) return true;
    return groundNavArrivedAtTarget(prop, destWorld, destCol, destRow, grid, stopRadius);
}
function exactCellTargetHasArrived(prop, grid, destCol, destRow, destWorld, stopRadius) {
    return groundNavArrivedAtTarget(prop, destWorld, destCol, destRow, grid, stopRadius);
}
function applySnakeBodyPressureSteering(prop, dirX, dirY, config, state) {
    const snakeGame = state.sandbox?.snakeGame;
    const instance = snakeGame ? snakeGame.instancesByHeadId.get(prop.id) : null;
    if (!instance || !instance.segmentWallPressures || instance.segmentWallPressures.size === 0) return { dirX, dirY, config };
    const configGame = getSnakeGameConfig ? getSnakeGameConfig() : null;
    const nudgeWeight = configGame?.bodyPressureNudgeWeight ?? 0.5;
    const speedDamp = configGame?.bodyPressureSpeedDamp ?? 2.0;
    let nudgeX = 0;
    let nudgeY = 0;
    let maxPressure = 0;
    for (const record of instance.segmentWallPressures.values()) {
        nudgeX += record.normalX * record.pressure;
        nudgeY += record.normalY * record.pressure;
        if (record.pressure > maxPressure) maxPressure = record.pressure;
    }
    let finalVx = dirX;
    let finalVy = dirY;
    const len = Math.hypot(nudgeX, nudgeY);
    if (maxPressure > 0 && len > 0) {
        const factor = Math.min(2.0, maxPressure) * nudgeWeight;
        finalVx += (nudgeX / len) * factor;
        finalVy += (nudgeY / len) * factor;
        const finalLen = Math.hypot(finalVx, finalVy);
        if (finalLen > 0) {
            finalVx /= finalLen;
            finalVy /= finalLen;
        }
    }
    if (maxPressure > 0) {
        const S = Math.max(0.1, 1.0 / (1.0 + maxPressure * speedDamp));
        config = { ...config, maxSpeed: config.maxSpeed * S, accel: config.accel * S };
    }
    return { dirX: finalVx, dirY: finalVy, config };
}
export function createCellTargetLocomotion(headNav) {
    const hasArrivedAtDest = (agent, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        if (dest.lockOnTarget) return false;
        if (dest.exactArrival) return exactCellTargetHasArrived(agent, grid, dest.col, dest.row, dest.world, dest.arrivalRadius ?? Math.max(agent.radius, 2) * 2);
        const col = grid.worldCol(agent.x);
        const row = grid.worldRow(agent.y);
        return cellTargetHasArrivedAtDestCell(grid, col, row, dest.col, dest.row);
    };
    const hasReachedDest = (agent, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        if (hasArrivedAtDest(agent, grid)) return true;
        if (!dest.world) return false;
        const stopRadius = Math.max(agent.radius, 2) * 2;
        return Math.hypot(agent.x - dest.world.x, agent.y - dest.world.y) <= stopRadius;
    };
    return {
        setExplore(agent, state, cell) {
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
        },
        setSeek(agent, state, target, options = {}) {
            headNav.setDestination(state.obstacleGrid, state.obstacleGrid.worldCol(target.x), state.obstacleGrid.worldRow(target.y), {
                world: { x: target.x, y: target.y },
                exactArrival: true,
                arrivalRadius: options.arrivalRadius,
                lockOnTarget: options.lockOnTarget === true,
                terminalHoming: options.terminalHoming,
                targetId: options.targetId,
            });
        },
        updateSeekTarget(agent, state, target, options = {}) {
            headNav.updateTerminalTarget(state.obstacleGrid, target, options.targetId);
        },
        setFlee(agent, state, cell) {
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row);
        },
        clearDestination(_agent, _state) {
            headNav.clearDestination();
        },
        getDestination() {
            return headNav.getDestination();
        },
        needsRetry(_agent, _state) {
            return headNav.needsRetry();
        },
        getStatus(_agent, _state) {
            return headNav.getStatus();
        },
        tick(agent, dtMs, _state) {
            headNav.tick(agent, dtMs);
        },
        clear(agent, _state) {
            headNav.clear(agent);
        },
        hasArrivedAtDest,
        hasReachedDest,
        retryOnRouteFailure(mode, { fleeMode, exploreMode }) {
            return mode === exploreMode || mode === fleeMode;
        },
        hasMoveTarget(_agent, _state) {
            const dest = headNav.getDestination();
            if (!dest) return false;
            const status = headNav.getStatus();
            return status.hasRoute || status.replanPending;
        },
    };
}
export function createCellTargetHpaNav(state) {
    let destCol = null;
    let destRow = null;
    let destWorld = null;
    let terminalWorld = null;
    let arrivalRadius = null;
    let lockOnTarget = false;
    let terminalHoming = null;
    let destTargetId = null;
    let terminalHomingHoldTicks = 0;
    let navPhase = "idle";
    let lastReplanReason = null;
    let lastTargetDistance = null;
    let lastTargetLos = null;
    let wasOnBelt = false;
    let strandedFrames = 0;
    const beltHandoffCooldown = { frames: 0 };
    const hpaNav = createHpaGroundNavSession();
    const resetSession = () => {
        wasOnBelt = false;
        strandedFrames = 0;
        beltHandoffCooldown.frames = 0;
        hpaNav.reset(state);
    };
    const clearDestination = () => {
        destCol = null;
        destRow = null;
        destWorld = null;
        terminalWorld = null;
        arrivalRadius = null;
        lockOnTarget = false;
        terminalHoming = null;
        destTargetId = null;
        terminalHomingHoldTicks = 0;
        navPhase = "idle";
        lastReplanReason = null;
        lastTargetDistance = null;
        lastTargetLos = null;
        exactArrival = false;
        resetSession();
    };
    let exactArrival = false;
    const setDestination = (grid, col, row, options = {}) => {
        const world = options.world ?? grid.gridToWorld(col, row);
        const nextExactArrival = Boolean(options.exactArrival);
        const nextLockOnTarget = options.lockOnTarget === true;
        const nextTargetId = options.targetId ?? null;
        const routeWorld = nextLockOnTarget ? grid.gridToWorld(col, row) : world;
        const changed =
            destCol !== col ||
            destRow !== row ||
            !destWorld ||
            destWorld.x !== routeWorld.x ||
            destWorld.y !== routeWorld.y ||
            exactArrival !== nextExactArrival ||
            lockOnTarget !== nextLockOnTarget ||
            destTargetId !== nextTargetId;
        destCol = col;
        destRow = row;
        destWorld = routeWorld;
        terminalWorld = nextLockOnTarget ? world : null;
        exactArrival = nextExactArrival;
        arrivalRadius = options.arrivalRadius ?? null;
        lockOnTarget = nextLockOnTarget;
        terminalHoming = options.terminalHoming ?? null;
        destTargetId = nextTargetId;
        terminalHomingHoldTicks = 0;
        if (changed) {
            strandedFrames = 0;
            hpaNav.markTargetChanged();
        }
        return changed;
    };
    const updateTerminalTarget = (grid, target, targetId = null) => {
        if (!lockOnTarget || destCol == null || destRow == null) return false;
        if (destTargetId != null && targetId !== destTargetId) return false;
        const col = grid.worldCol(target.x);
        const row = grid.worldRow(target.y);
        if (col !== destCol || row !== destRow) return false;
        terminalWorld = { x: target.x, y: target.y };
        return true;
    };
    const needsRetry = () => {
        if (destCol == null) return true;
        if (hpaNav.isRoutePending()) return false;
        if (navHasPath(hpaNav.navState)) return false;
        return strandedFrames >= Math.max(1, Math.floor(state.nav.settings.stuckReplanFrames * 0.5));
    };
    const replan = (prop) => {
        if (!destWorld) return;
        hpaNav.replan(prop, destWorld.x, destWorld.y, state, REPLAN_PRIORITY_TARGET);
    };
    const steerDirectToTarget = (prop, config) => {
        const targetWorld = terminalWorld ?? destWorld;
        const dx = targetWorld.x - prop.x;
        const dy = targetWorld.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            const adjusted = applySnakeBodyPressureSteering(prop, dx / dist, dy / dist, config, state);
            steerRollToward(prop, adjusted.dirX, adjusted.dirY, adjusted.config, state);
        }
    };
    const terminalHomingEnabled = () => terminalHoming?.enabled === true;
    const terminalHomingHandoffRadius = (grid, config) => {
        if (terminalHoming.handoffRadius != null) return terminalHoming.handoffRadius;
        return Math.max(arrivalRadius ?? 0, config.stopRadius, grid.cellSize * 1.5);
    };
    const shouldTerminalHome = (prop, grid, config) => {
        const targetWorld = terminalWorld ?? destWorld;
        lastTargetDistance = Math.hypot(targetWorld.x - prop.x, targetWorld.y - prop.y);
        const handoffRadius = terminalHomingHandoffRadius(grid, config);
        const withinHandoff = lastTargetDistance <= handoffRadius;
        const requireWorldLos = terminalHoming.requireWorldLos !== false;
        lastTargetLos = requireWorldLos ? hasLineOfSight(prop.x, prop.y, targetWorld.x, targetWorld.y, grid, prop.radius ?? 0, terminalHoming.targetRadius ?? 0) : true;
        if (withinHandoff && lastTargetLos) {
            terminalHomingHoldTicks = terminalHoming.minHoldTicks ?? 0;
            return true;
        }
        if (terminalHomingHoldTicks > 0 && lastTargetLos) {
            terminalHomingHoldTicks--;
            return true;
        }
        terminalHomingHoldTicks = 0;
        return false;
    };
    /** @param {number} dtMs */
    const tick = (prop, dtMs) => {
        if (destCol == null || !destWorld) return;
        navPhase = "hpa";
        lastReplanReason = null;
        lastTargetDistance = null;
        lastTargetLos = null;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        const grid = state.obstacleGrid;
        const arrivalWorld = terminalWorld ?? destWorld;
        const arrived = exactArrival
            ? exactCellTargetHasArrived(prop, grid, destCol, destRow, arrivalWorld, arrivalRadius ?? config.stopRadius)
            : shouldReleaseCellTargetHpaNav(prop, grid, destCol, destRow, destWorld, config.stopRadius);
        if (arrived && !lockOnTarget) {
            clearGroundRollDrive(prop);
            clearDestination();
            return;
        }
        const onBelt = isEntityOnFloorBelt(grid, prop.x, prop.y);
        if (onBelt) {
            navPhase = "hpa";
            strandedFrames = 0;
            const { replanReason, beltWasOnBelt } = driveGroundNav({
                prop,
                targetWorld: destWorld,
                targetCellCol: destCol,
                targetCellRow: destRow,
                nav: hpaNav,
                beltWasOnBelt: wasOnBelt,
                beltHandoffCooldown,
                state,
                dtMs: dtMs,
                pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
            });
            lastReplanReason = replanReason;
            wasOnBelt = beltWasOnBelt;
            clearGroundRollDrive(prop);
            return;
        }
        if (lockOnTarget && exactArrival && terminalHomingEnabled() && shouldTerminalHome(prop, grid, config)) {
            navPhase = "terminal_homing";
            strandedFrames = 0;
            steerDirectToTarget(prop, config);
            return;
        }
        const status = getStatus();
        if (status.hasRoute) strandedFrames = 0;
        else strandedFrames++;
        const giveUpFrames = state.nav.settings.stuckReplanFrames;
        if (strandedFrames >= giveUpFrames) {
            decelerateRoll(prop, config, state);
            clearDestination();
            return;
        }
        const allowNavUpdate = status.hasRoute || status.replanPending || strandedFrames <= 1;
        if (!allowNavUpdate) {
            navPhase = "stranded";
            decelerateRoll(prop, config, state);
            return;
        }
        const { vx, vy, steering, replanReason, beltWasOnBelt } = driveGroundNav({
            prop,
            targetWorld: destWorld,
            targetCellCol: destCol,
            targetCellRow: destRow,
            nav: hpaNav,
            beltWasOnBelt: wasOnBelt,
            beltHandoffCooldown,
            state,
            dtMs: dtMs,
            pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
        });
        lastReplanReason = replanReason;
        wasOnBelt = beltWasOnBelt;
        if (!steering && lockOnTarget) {
            navPhase = "direct_locked";
            steerDirectToTarget(prop, config);
            return;
        }
        if (!steering) return;
        if (vx === 0 && vy === 0) {
            if (lockOnTarget) {
                navPhase = "direct_locked";
                steerDirectToTarget(prop, config);
                return;
            }
            decelerateRoll(prop, config, state);
            return;
        }
        const adjusted = applySnakeBodyPressureSteering(prop, vx, vy, config, state);
        steerRollToward(prop, adjusted.dirX, adjusted.dirY, adjusted.config, state);
    };
    const getStatus = () => {
        const nav = hpaNav.navState;
        const commit = hpaNav.getCommitStatus();
        return {
            hasDest: destCol != null,
            destCol,
            destRow,
            hasRoute: navHasPath(nav),
            replanPending: hpaNav.isRoutePending(),
            stuckFrames: nav.stuckFrames,
            pathLen: nav.pathLen,
            navPhase,
            lastReplanReason,
            targetDistance: lastTargetDistance,
            targetLos: lastTargetLos,
            routeGoal: destWorld,
            terminalGoal: terminalWorld,
            routeCommitFrames: commit.routeCommitFrames,
            routeId: nav.routeId,
            lastAcceptedRouteReason: nav.lastAcceptedRouteReason,
            lastAcceptedPathLen: nav.lastAcceptedPathLen,
            lastAcceptedProgressIdx: nav.lastAcceptedProgressIdx,
            lastAcceptedTargetX: nav.lastAcceptedTargetX,
            lastAcceptedTargetY: nav.lastAcceptedTargetY,
        };
    };
    const getPathOverlay = (prop) => {
        if (destCol == null || !destWorld) return null;
        const grid = state.obstacleGrid;
        if (isEntityOnFloorBelt(grid, prop.x, prop.y))
            return {
                mode: "direct",
                pathNodes: [
                    { x: prop.x, y: prop.y },
                    { x: (terminalWorld ?? destWorld).x, y: (terminalWorld ?? destWorld).y },
                ],
                targetX: (terminalWorld ?? destWorld).x,
                targetY: (terminalWorld ?? destWorld).y,
            };
        const nav = hpaNav.navState;
        const progressIdx = nav.pathProgressIdx;
        const trace =
            nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid) : { pathNodes: [] };
        const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen, state.obstacleGrid) : null;
        const targetWorld = terminalWorld ?? destWorld;
        return { mode: "hpa", pathNodes: trace.pathNodes, targetX: targetWorld.x, targetY: targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
    };
    return {
        getDestination() {
            if (destCol == null || destRow == null) return null;
            const dest = { col: destCol, row: destRow, world: terminalWorld ?? destWorld };
            if (terminalWorld) dest.routeWorld = destWorld;
            if (exactArrival) dest.exactArrival = true;
            if (arrivalRadius != null) dest.arrivalRadius = arrivalRadius;
            if (lockOnTarget) dest.lockOnTarget = true;
            if (destTargetId != null) dest.targetId = destTargetId;
            return dest;
        },
        setDestination,
        updateTerminalTarget,
        clearDestination,
        clear(prop) {
            if (prop) clearGroundRollDrive(prop);
            clearDestination();
        },
        needsRetry,
        replan,
        tick,
        getStatus,
        getPathOverlay,
    };
}
