/**
 * Per-entity navigation session — mutated by path-follow compute and game replan policy.
 */
/**
 * @typedef {object} NavSessionState
 * @property {number | null} lastX
 * @property {number | null} lastY
 * @property {number} stuckFrames
 * @property {number} pathProgressIdx
 * @property {string} topologyKey — gridNavCacheKey at last successful replan
 * @property {number | null} lastTargetX
 * @property {number | null} lastTargetY
 * @property {number} lastOffPathReplan
 * @property {number} [hpaReplanRequestId] — 0 = idle; non-zero while worker replan in flight
 * @property {number} [pathSlot] — worker path SAB slot while following a path, -1 when idle
 * @property {number} [pathLen] — cell count in pathSlot SAB
 */
/** @param {NavSessionState} navState */
export function navHasPath(navState) {
    return navState.pathLen > 0 && navState.pathSlot >= 0;
}
/** @returns {NavSessionState} */
export function createNavState() {
    return {
        lastX: null,
        lastY: null,
        stuckFrames: 0,
        pathProgressIdx: 0,
        topologyKey: "",
        lastTargetX: null,
        lastTargetY: null,
        lastOffPathReplan: 0,
        hpaReplanRequestId: 0,
        pathSlot: -1,
        pathLen: 0,
        routeId: 0,
        pendingReplanReason: null,
        lastAcceptedRouteReason: null,
        lastAcceptedPathLen: 0,
        lastAcceptedProgressIdx: 0,
        lastAcceptedTargetX: null,
        lastAcceptedTargetY: null,
    };
}
import { agentPose } from "../Agent/index.js";
import { hasLineOfSight } from "../Spatial/query/spatialQueries.js";
import { resolveBodyRadius } from "../Motion/physicsDefaults.js";
const PATH_WAYPOINT_ARRIVAL_PX = 16;
function sabWaypointArrived(bodyX, bodyY, bodyIdx, worker, slot, i, arrivalPx, grid, navTopology) {
    const idx = worker.pathIdx(slot, i);
    const wx = grid.gridCenterXByIdx(idx);
    const wy = grid.gridCenterYByIdx(idx);
    if (Math.hypot(wx - bodyX, wy - bodyY) <= arrivalPx) return true;
    if (i > 0) {
        const prevIdx = worker.pathIdx(slot, i - 1);
        const prevWx = grid.gridCenterXByIdx(prevIdx);
        const prevWy = grid.gridCenterYByIdx(prevIdx);
        const dx_seg = wx - prevWx;
        const dy_seg = wy - prevWy;
        const dx_agent = bodyX - wx;
        const dy_agent = bodyY - wy;
        const segLen = Math.hypot(dx_seg, dy_seg);
        if (segLen > 0.001) {
            const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
            if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) return true;
        }
    }
    if (bodyIdx === idx) return true;
    return grid.canStep(bodyIdx, idx, navTopology);
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function findSabPathProgressIdx(x, y, worker, slot, pathLen, grid, navTopology) {
    if (pathLen <= 0) return 0;
    const cols = grid.cols;
    const hereIdx = grid.worldCol(x) + grid.worldRow(y) * cols;
    let idx = 0;
    for (let i = 0; i < pathLen; i++) if (worker.pathIdx(slot, i) === hereIdx) idx = i + 1;
    if (idx >= pathLen) idx = pathLen - 1;
    const waypointArrival = PATH_WAYPOINT_ARRIVAL_PX;
    while (idx < pathLen - 1) {
        const cellIdx = worker.pathIdx(slot, idx);
        const wx = grid.gridCenterXByIdx(cellIdx);
        const wy = grid.gridCenterYByIdx(cellIdx);
        let arrived = Math.hypot(wx - x, wy - y) <= waypointArrival;
        if (!arrived && idx > 0) {
            const prevIdx = worker.pathIdx(slot, idx - 1);
            const prevWx = grid.gridCenterXByIdx(prevIdx);
            const prevWy = grid.gridCenterYByIdx(prevIdx);
            const dx_seg = wx - prevWx;
            const dy_seg = wy - prevWy;
            const dx_agent = x - wx;
            const dy_agent = y - wy;
            const segLen = Math.hypot(dx_seg, dy_seg);
            if (segLen > 0.001) {
                const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
                if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) arrived = true;
            }
        }
        if (!arrived) break;
        if (hereIdx === cellIdx) {
            idx++;
            continue;
        }
        if (!grid.canStep(hereIdx, cellIdx, navTopology)) break;
        idx++;
    }
    return idx;
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} progressIdx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function buildSabPathOverlayFromProgress(x, y, worker, slot, pathLen, progressIdx, grid) {
    if (pathLen <= 0) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, pathLen - 1));
    const pathNodes = [];
    for (let i = idx; i < pathLen; i++) {
        const cellIdx = worker.pathIdx(slot, i);
        pathNodes.push({ x: grid.gridCenterXByIdx(cellIdx), y: grid.gridCenterYByIdx(cellIdx) });
    }
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const aCol = grid.worldCol(x);
        const aRow = grid.worldRow(y);
        const bCol = grid.worldCol(first.x);
        const bRow = grid.worldRow(first.y);
        if (Math.abs(aCol - bCol) <= 1 && Math.abs(aRow - bRow) <= 1) pathNodes.unshift({ x, y });
    }
    return { pathNodes };
}
/**
 * Debug overlay — maps abstract idx SAB + graph meta to world nodes. Only call from getPathOverlay.
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {{ pathPlanner: "local" | "hpa", abstractPath: Array<{ x: number, y: number, id?: string }> } | null}
 */
export function buildSabAbstractPathOverlay(worker, slot, pathLen) {
    if (pathLen <= 0) return null;
    const abstractLen = worker.abstractPathLen(slot);
    if (abstractLen <= 0) return { pathPlanner: "local", abstractPath: [worker.pathIdx(slot, 0), worker.pathIdx(slot, pathLen - 1)] };
    const nodeCount = worker.graphNodeCount;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const abstractPath = [];
    for (let i = 0; i < abstractLen; i++) {
        const idx = worker.abstractPathIdx(slot, i);
        if (idx === startTemp) abstractPath.push(worker.pathIdx(slot, 0));
        else if (idx === targetTemp) abstractPath.push(worker.pathIdx(slot, pathLen - 1));
        else abstractPath.push(worker.graphNodeIdx(idx));
    }
    return { pathPlanner: "hpa", abstractPath };
}
/**
 * @param {import("../Agent/types.js").AgentPose} pose
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} targetX
 * @param {number} targetY
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ navCardinalOpen: Uint8Array, vertexPassability: Uint8Array, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, wallRevision: number }} navTopology
 * @param {object} [settings]
 * @param {import("./navSession.js").NavSessionState | null} [navState]
 */
const tempWallProxies = [];
const tempCornerProxies = [];
class PathSteeringEvaluator {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 0;
        this.worker = null;
        this.slot = -1;
        this.pathLen = 0;
        this.grid = null;
        this.settings = null;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    init(pose, worker, slot, pathLen, grid, settings) {
        this.x = pose.x;
        this.y = pose.y;
        this.vx = pose.vx ?? 0;
        this.vy = pose.vy ?? 0;
        this.radius = resolveBodyRadius(pose);
        this.worker = worker;
        this.slot = slot;
        this.pathLen = pathLen;
        this.grid = grid;
        this.settings = settings;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    getPathX(step) {
        return this.grid.gridCenterXByIdx(this.worker.pathIdx(this.slot, step));
    }
    getPathY(step) {
        return this.grid.gridCenterYByIdx(this.worker.pathIdx(this.slot, step));
    }
    resolveClearanceRadius() {
        const bodyRadius = this.radius;
        tempWallProxies.length = 0;
        this.grid.appendStaticWallProxiesNearWorld(this.x, this.y, bodyRadius + this.grid.cellSize, tempWallProxies);
        let wallThickness = 4; // Default thickness fallback
        for (let i = 0; i < tempWallProxies.length; i++) {
            const wall = tempWallProxies[i];
            const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
            if (thickness > 0 && thickness < this.grid.cellSize) wallThickness = Math.max(wallThickness, thickness);
        }
        this.hasNearWalls = tempWallProxies.length > 0;
        tempWallProxies.length = 0; // Clear references to prevent memory leaks
        const freeHalfWidth = (this.grid.cellSize - wallThickness) * 0.5;
        const centeredClearance = freeHalfWidth - bodyRadius;
        this.centeredClearance = centeredClearance;
        const safetyPadding = Math.max(0, centeredClearance * 0.85);
        this.clearanceRadius = bodyRadius + safetyPadding;
    }
    findLookaheadStep(step) {
        const maxLookahead = this.hasNearWalls ? 1 : 4;
        let lookaheadStep = step + 1;
        let validLookaheadStep = step;
        while (lookaheadStep < step + maxLookahead && lookaheadStep < this.pathLen) {
            const lx = this.getPathX(lookaheadStep);
            const ly = this.getPathY(lookaheadStep);
            if (hasLineOfSight(this.x, this.y, lx, ly, this.grid, this.clearanceRadius)) validLookaheadStep = lookaheadStep;
            else break; // Stop looking ahead if line of sight is broken by walls/corners
            lookaheadStep++;
        }
        return validLookaheadStep;
    }
    calculateCornerSlowdown(progressStep, maxSpeed, accel, currentDesiredSpeed) {
        let desiredSpeed = currentDesiredSpeed;
        const minCornerSpeed = Math.min(30.0, maxSpeed * 0.35);
        const startCheck = Math.max(1, progressStep - 1);
        const endCheck = Math.min(this.pathLen - 2, progressStep + 3);
        for (let i = startCheck; i <= endCheck; i++) {
            const idxPrev = this.worker.pathIdx(this.slot, i - 1);
            const idxCurr = this.worker.pathIdx(this.slot, i);
            const idxNext = this.worker.pathIdx(this.slot, i + 1);
            const xPrev = this.grid.gridCenterXByIdx(idxPrev);
            const yPrev = this.grid.gridCenterYByIdx(idxPrev);
            const xCurr = this.grid.gridCenterXByIdx(idxCurr);
            const yCurr = this.grid.gridCenterYByIdx(idxCurr);
            const xNext = this.grid.gridCenterXByIdx(idxNext);
            const yNext = this.grid.gridCenterYByIdx(idxNext);
            const dx0 = xCurr - xPrev;
            const dy0 = yCurr - yPrev;
            const dx1 = xNext - xCurr;
            const dy1 = yNext - yCurr;
            const d0 = Math.hypot(dx0, dy0);
            const d1 = Math.hypot(dx1, dy1);
            if (d0 > 0.001 && d1 > 0.001) {
                const cosTheta = (dx0 * dx1 + dy0 * dy1) / (d0 * d1);
                if (cosTheta < 0.95) {
                    tempCornerProxies.length = 0;
                    this.grid.appendStaticWallProxiesNearWorld(xCurr, yCurr, this.radius + this.grid.cellSize, tempCornerProxies);
                    let cornerWallThickness = 4;
                    for (let w = 0; w < tempCornerProxies.length; w++) {
                        const wall = tempCornerProxies[w];
                        const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                        if (thickness > 0 && thickness < this.grid.cellSize) cornerWallThickness = Math.max(cornerWallThickness, thickness);
                    }
                    const hasNearWallsAtCorner = tempCornerProxies.length > 0;
                    tempCornerProxies.length = 0;
                    const cornerFreeHalfWidth = (this.grid.cellSize - cornerWallThickness) * 0.5;
                    const cornerClearance = cornerFreeHalfWidth - this.radius;
                    const maxDev = hasNearWallsAtCorner ? Math.max(0.5, cornerClearance * 0.75) : 4.0;
                    const invCos = 1.0 - Math.max(-1.0, Math.min(1.0, cosTheta));
                    const cornerSpeed = Math.max(minCornerSpeed, Math.min(maxSpeed, Math.sqrt((accel * maxDev) / invCos)));
                    const distToCorner = Math.hypot(xCurr - this.x, yCurr - this.y);
                    const brakingDistance = (maxSpeed * maxSpeed - cornerSpeed * cornerSpeed) / (2 * accel);
                    if (distToCorner < brakingDistance) {
                        const limit = Math.sqrt(cornerSpeed * cornerSpeed + 2 * accel * distToCorner);
                        desiredSpeed = Math.min(desiredSpeed, limit);
                    }
                }
            }
        }
        return desiredSpeed;
    }
    calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, currentDesiredSpeed) {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed <= 20.0 || dist < 0.01) return currentDesiredSpeed;
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        const tx = dx / dist;
        const ty = dy / dist;
        const cosAlign = dirX * tx + dirY * ty;
        if (cosAlign < 0.95) {
            tempCornerProxies.length = 0;
            this.grid.appendStaticWallProxiesNearWorld(steerX, steerY, this.radius + this.grid.cellSize, tempCornerProxies);
            let targetWallThickness = 4;
            for (let w = 0; w < tempCornerProxies.length; w++) {
                const wall = tempCornerProxies[w];
                const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                if (thickness > 0 && thickness < this.grid.cellSize) targetWallThickness = Math.max(targetWallThickness, thickness);
            }
            const hasNearWallsAtTarget = tempCornerProxies.length > 0;
            tempCornerProxies.length = 0;
            const targetFreeHalfWidth = (this.grid.cellSize - targetWallThickness) * 0.5;
            const targetClearance = targetFreeHalfWidth - this.radius;
            const maxDevAlign = hasNearWallsAtTarget ? Math.max(0.5, targetClearance * 0.75) : 4.0;
            const invCosAlign = 1.0 - Math.max(-1.0, Math.min(1.0, cosAlign));
            const alignSpeed = Math.max(30.0, Math.min(maxSpeed, Math.sqrt((accel * maxDevAlign) / invCosAlign)));
            return Math.min(currentDesiredSpeed, alignSpeed);
        }
        return currentDesiredSpeed;
    }
}
const tempEvaluator = new PathSteeringEvaluator();
export function computeSabPathSteering(pose, worker, slot, pathLen, targetX, targetY, grid, navTopology, settings, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const bodyIdx = grid.worldCol(x) + grid.worldRow(y) * grid.cols;
    // Initialize evaluator and resolve wall clearance first so we can use its properties
    tempEvaluator.init(pose, worker, slot, pathLen, grid, settings);
    tempEvaluator.resolveClearanceRadius();
    let waypointArrival = settings.pathWaypointArrival;
    if (tempEvaluator.hasNearWalls) waypointArrival = Math.min(waypointArrival, Math.max(3.0, tempEvaluator.radius + 1.0));
    const arrivalDistance = settings.arrivalDistance;
    const offPathDistance = settings.pathOffPathDistance;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= pathLen) step = pathLen - 1;
    let steerIdx = worker.pathIdx(slot, step);
    let steerX = grid.gridCenterXByIdx(steerIdx);
    let steerY = grid.gridCenterYByIdx(steerIdx);
    let dx = steerX - x;
    let dy = steerY - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, bodyIdx, worker, slot, step, waypointArrival, grid, navTopology)) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerIdx = worker.pathIdx(slot, step);
        steerX = grid.gridCenterXByIdx(steerIdx);
        steerY = grid.gridCenterYByIdx(steerIdx);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const progressStep = step;
    const validLookaheadStep = tempEvaluator.findLookaheadStep(step);
    if (validLookaheadStep > step) {
        step = validLookaheadStep;
        if (navState) navState.pathProgressIdx = step;
        steerX = tempEvaluator.getPathX(step);
        steerY = tempEvaluator.getPathY(step);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    if (!(dist >= 0.01)) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    const maxSpeed = settings.maxSpeed ?? 180;
    const accel = settings.accel ?? 600;
    let desiredSpeed = maxSpeed;
    desiredSpeed = tempEvaluator.calculateCornerSlowdown(progressStep, maxSpeed, accel, desiredSpeed);
    desiredSpeed = tempEvaluator.calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, desiredSpeed);
    const decelRadius = Math.max(32.0, (maxSpeed * maxSpeed) / (2.0 * accel));
    if (step >= pathLen - 1 || distToTarget < decelRadius) {
        const arrivalFactor = Math.max(0.15, Math.min(1.0, distToTarget / decelRadius));
        desiredSpeed = Math.min(desiredSpeed, maxSpeed * arrivalFactor);
    }
    return { desiredX: dx / dist, desiredY: dy / dist, desiredSpeed, offPath: dist > offPathDistance };
}
import {
    buildReplanParams,
    obstacleEpochReplanDue,
    obstacleReplanAllowed,
    trackNavStuck,
    idlePathReplanReason,
    idlePathReplanAllowed,
    offPathReplanDue,
    sandboxReplanReason,
    sandboxReplanAllowed,
    replanPriorityFor,
    REPLAN_PRIORITY_TARGET,
} from "./hpaReplan.js";
import { resolveNavRuntime } from "../Navigation/NavRuntime.js";
export class HpaNavSession {
    constructor() {
        this.navState = createNavState();
        this.replanClockMs = 0;
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
    }
    reset(state) {
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
        const nav = resolveNavRuntime(state);
        nav.worker.releaseOwnedPathSlot(this.navState);
        Object.assign(this.navState, createNavState());
        this.replanClockMs = 0;
    }
    markTargetChanged() {
        this.pendingTargetReplan = true;
    }
    isRoutePending() {
        return this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
    }
    replan(prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) {
        const nav = resolveNavRuntime(state);
        return nav.session.requestReplan(this.navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, nav, prop.navStepPenalty), priority);
    }
    requestReplan(prop, targetX, targetY, state, priority, reason) {
        const accepted = this.replan(prop, targetX, targetY, state, priority);
        if (accepted) {
            this.pendingTargetReplan = false;
            this.navState.pendingReplanReason = reason;
            this.navState.stuckFrames = 0;
            return { steering: null, replanReason: reason };
        }
        return { steering: null, replanReason: "cooldown" };
    }
    syncRouteCommitState() {
        if (!navHasPath(this.navState)) {
            this.committedPathSlot = -1;
            this.committedPathLen = 0;
            this.routeCommitFrames = 0;
            return;
        }
        if (this.navState.pathSlot !== this.committedPathSlot || this.navState.pathLen !== this.committedPathLen) {
            this.committedPathSlot = this.navState.pathSlot;
            this.committedPathLen = this.navState.pathLen;
            this.routeCommitFrames = 0;
            return;
        }
        this.routeCommitFrames++;
    }
    softReplanAllowed(stuckFrames, stuckReplanFrames) {
        return stuckFrames > Math.max(1, Math.floor(stuckReplanFrames * 0.5));
    }
    update(prop, targetX, targetY, state, dtMs, pathSettings) {
        this.replanClockMs += dtMs;
        const nav = resolveNavRuntime(state);
        const settings = nav.settings;
        const inFlight = nav.session.isReplanInFlight(this.navState);
        const routePending = this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
        if (inFlight || routePending) {
            this.navState.stuckFrames = 0;
            this.navState.lastX = prop.x;
            this.navState.lastY = prop.y;
        } else trackNavStuck(this.navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, "props");
        const stuckFrames = this.navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        this.syncRouteCommitState();
        if (!inFlight && obstacleEpochReplanDue(this.navState, nav.topologyKey()))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible), "epoch");
        let sandboxReason = sandboxReplanReason(this.navState, this.pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason === "targetMoved" && !this.softReplanAllowed(stuckFrames, stuckReplanFrames)) sandboxReason = null;
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames))
            return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible), sandboxReason);
        const idleReason = idlePathReplanReason(this.navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(this.navState, idleReason, isVisible, stuckReplanFrames))
            return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible), idleReason);
        if (!navHasPath(this.navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const steering = computeSabPathSteering(
            agentPose(prop),
            nav.worker,
            this.navState.pathSlot,
            this.navState.pathLen,
            targetX,
            targetY,
            state.obstacleGrid,
            nav.topology,
            pathSettings,
            this.navState,
        );
        if (steering && !inFlight && offPathReplanDue(steering, this.navState, this.replanClockMs))
            if (this.softReplanAllowed(stuckFrames, stuckReplanFrames) && obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                this.navState.lastOffPathReplan = this.replanClockMs;
                return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible), "offPath");
            }
        return { steering, replanReason: null };
    }
    getCommitStatus() {
        return { routeCommitFrames: this.routeCommitFrames };
    }
}
