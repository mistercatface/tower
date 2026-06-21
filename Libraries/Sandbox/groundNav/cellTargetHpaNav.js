import { getPhysicsSettings } from "../../../Core/GamePhysicsSettings.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
import { REPLAN_PRIORITY_TARGET } from "../../Pathfinding/hpaReplanPolicy.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { createHpaGroundNavSession } from "./hpaGroundNavSession.js";
import { buildHpaGroundNavPathSettings, driveGroundNav, groundNavArrivedAtTarget } from "./driveGroundNav.js";
import { decelerateRoll, getKineticRollConfig, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { isEntityOnFloorBelt, isFloorBeltCell } from "../../Spatial/grid/FloorCell.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { hasLineOfSight } from "../../Spatial/query/lineOfSight.js";
export function cellTargetHasArrivedAtDestCell(grid, col, row, destCol, destRow) {
    if (isFloorBeltCell(grid, destCol, destRow)) return col === destCol && row === destRow;
    return cellChebyshevDistance(col, row, destCol, destRow) <= 1;
}
export function shouldReleaseCellTargetHpaNav(prop, grid, destCol, destRow, destWorld, stopRadius) {
    const cell = grid.worldToGrid(prop.x, prop.y);
    if (cellTargetHasArrivedAtDestCell(grid, cell.col, cell.row, destCol, destRow)) return true;
    return groundNavArrivedAtTarget(prop, destWorld, destCol, destRow, grid, stopRadius);
}
function exactCellTargetHasArrived(prop, grid, destCol, destRow, destWorld, stopRadius) {
    return groundNavArrivedAtTarget(prop, destWorld, destCol, destRow, grid, stopRadius);
}
export function createCellTargetLocomotion(headNav) {
    const hasArrivedAtDest = (agent, grid) => {
        const dest = headNav.getDestination();
        if (!dest) return false;
        if (dest.lockOnTarget) return false;
        if (dest.exactArrival) return exactCellTargetHasArrived(agent, grid, dest.col, dest.row, dest.world, dest.arrivalRadius ?? Math.max(agent.radius, 2) * 2);
        const cell = grid.worldToGrid(agent.x, agent.y);
        return cellTargetHasArrivedAtDestCell(grid, cell.col, cell.row, dest.col, dest.row);
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
            const cell = state.obstacleGrid.worldToGrid(target.x, target.y);
            headNav.setDestination(state.obstacleGrid, cell.col, cell.row, {
                world: { x: target.x, y: target.y },
                exactArrival: true,
                arrivalRadius: options.arrivalRadius,
                lockOnTarget: options.lockOnTarget === true,
                terminalHoming: options.terminalHoming,
            });
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
    let arrivalRadius = null;
    let lockOnTarget = false;
    let terminalHoming = null;
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
        arrivalRadius = null;
        lockOnTarget = false;
        terminalHoming = null;
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
        const changed = destCol !== col || destRow !== row || !destWorld || destWorld.x !== world.x || destWorld.y !== world.y || exactArrival !== nextExactArrival;
        destCol = col;
        destRow = row;
        destWorld = world;
        exactArrival = nextExactArrival;
        arrivalRadius = options.arrivalRadius ?? null;
        lockOnTarget = options.lockOnTarget === true;
        terminalHoming = options.terminalHoming ?? null;
        terminalHomingHoldTicks = 0;
        if (changed) {
            strandedFrames = 0;
            hpaNav.markTargetChanged();
        }
        return changed;
    };
    const needsRetry = () => {
        if (destCol == null) return true;
        if (hpaNav.isRoutePending()) return false;
        return false;
    };
    const replan = (prop) => {
        if (!destWorld) return;
        hpaNav.replan(prop, destWorld.x, destWorld.y, state, REPLAN_PRIORITY_TARGET);
    };
    const steerDirectToTarget = (prop, config) => {
        const dx = destWorld.x - prop.x;
        const dy = destWorld.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) steerRollToward(prop, dx / dist, dy / dist, config, state);
    };
    const terminalHomingEnabled = () => terminalHoming?.enabled === true;
    const terminalHomingHandoffRadius = (grid, config) => {
        if (terminalHoming.handoffRadius != null) return terminalHoming.handoffRadius;
        return Math.max(arrivalRadius ?? 0, config.stopRadius, grid.cellSize * 1.5);
    };
    const shouldTerminalHome = (prop, grid, config) => {
        lastTargetDistance = Math.hypot(destWorld.x - prop.x, destWorld.y - prop.y);
        const handoffRadius = terminalHomingHandoffRadius(grid, config);
        const withinHandoff = lastTargetDistance <= handoffRadius;
        const requireWorldLos = terminalHoming.requireWorldLos !== false;
        lastTargetLos = requireWorldLos ? hasLineOfSight(prop.x, prop.y, destWorld.x, destWorld.y, grid, prop.radius ?? 0, terminalHoming.targetRadius ?? 0) : true;
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
        const config = getKineticRollConfig(prop, { stopRadius: getPhysicsSettings().groundNavHpa.stopRadius });
        const grid = state.obstacleGrid;
        const arrived = exactArrival
            ? exactCellTargetHasArrived(prop, grid, destCol, destRow, destWorld, arrivalRadius ?? config.stopRadius)
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
        steerRollToward(prop, vx, vy, config, state);
    };
    const getStatus = () => {
        const nav = hpaNav.navState;
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
                    { x: destWorld.x, y: destWorld.y },
                ],
                targetX: destWorld.x,
                targetY: destWorld.y,
            };
        const nav = hpaNav.navState;
        const progressIdx = nav.pathProgressIdx;
        const trace =
            nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid) : { pathNodes: [] };
        const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen, state.obstacleGrid) : null;
        return { mode: "hpa", pathNodes: trace.pathNodes, targetX: destWorld.x, targetY: destWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
    };
    return {
        getDestination() {
            if (destCol == null || destRow == null) return null;
            const dest = { col: destCol, row: destRow, world: destWorld };
            if (exactArrival) dest.exactArrival = true;
            if (arrivalRadius != null) dest.arrivalRadius = arrivalRadius;
            if (lockOnTarget) dest.lockOnTarget = true;
            return dest;
        },
        setDestination,
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
