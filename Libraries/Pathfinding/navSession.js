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
export function computeSabPathSteering(pose, worker, slot, pathLen, targetX, targetY, grid, navTopology, settings, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const bodyIdx = grid.worldCol(x) + grid.worldRow(y) * grid.cols;
    const waypointArrival = settings.pathWaypointArrival;
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
    // Dynamic safety clearance padding calculation based on bodyRadius, wall thickness, and cellSize
    const bodyRadius = resolveBodyRadius(pose);
    const wallProxies = [];
    grid.appendStaticWallProxiesNearWorld(x, y, bodyRadius + grid.cellSize, wallProxies);
    let wallThickness = 4; // Default thickness fallback
    for (let i = 0; i < wallProxies.length; i++) {
        const wall = wallProxies[i];
        const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
        if (thickness > 0 && thickness < grid.cellSize) wallThickness = Math.max(wallThickness, thickness);
    }
    const freeHalfWidth = (grid.cellSize - wallThickness) * 0.5;
    const centeredClearance = freeHalfWidth - bodyRadius;
    const safetyPadding = Math.max(0, centeredClearance * 0.5);
    const clearanceRadius = bodyRadius + safetyPadding;
    // Dynamic Line of Sight Steering (Lookahead Smoothing)
    const maxLookahead = 4;
    let lookaheadStep = step + 1;
    let validLookaheadStep = step;
    while (lookaheadStep < step + maxLookahead && lookaheadStep < pathLen) {
        const lx = grid.gridCenterXByIdx(worker.pathIdx(slot, lookaheadStep));
        const ly = grid.gridCenterYByIdx(worker.pathIdx(slot, lookaheadStep));
        if (hasLineOfSight(x, y, lx, ly, grid, clearanceRadius)) validLookaheadStep = lookaheadStep;
        else break; // Stop looking ahead if line of sight is broken by walls/corners
        lookaheadStep++;
    }
    if (validLookaheadStep > step) {
        // Officially skip the intermediate waypoints since we have a clear shot
        step = validLookaheadStep;
        if (navState) navState.pathProgressIdx = step;
        steerIdx = worker.pathIdx(slot, step);
        steerX = grid.gridCenterXByIdx(steerIdx);
        steerY = grid.gridCenterYByIdx(steerIdx);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    if (!(dist >= 0.01)) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    // Calculate cornering and arrival slowdown
    const maxSpeed = settings.maxSpeed ?? 180;
    const accel = settings.accel ?? 600;
    let desiredSpeed = maxSpeed;
    // Cornering Slowdown check
    if (step < pathLen - 1) {
        // 1. Turn at the immediate next waypoint 'step' (corner: steerX, steerY)
        const nextIdx1 = worker.pathIdx(slot, step + 1);
        const nextX1 = grid.gridCenterXByIdx(nextIdx1);
        const nextY1 = grid.gridCenterYByIdx(nextIdx1);
        const dx0 = steerX - x;
        const dy0 = steerY - y;
        const dx1 = nextX1 - steerX;
        const dy1 = nextY1 - steerY;
        const d0 = Math.hypot(dx0, dy0);
        const d1 = Math.hypot(dx1, dy1);
        if (d0 > 0.001 && d1 > 0.001) {
            const cosTheta = (dx0 * dx1 + dy0 * dy1) / (d0 * d1);
            if (cosTheta < 0.9) {
                const cornerFactor = 0.35 + 0.65 * Math.max(0, cosTheta);
                const cornerSpeed = maxSpeed * cornerFactor;
                const distToCorner = d0;
                const brakingDistance = (maxSpeed * maxSpeed - cornerSpeed * cornerSpeed) / (2 * accel);
                if (distToCorner < brakingDistance) {
                    const limit = Math.sqrt(cornerSpeed * cornerSpeed + 2 * accel * distToCorner);
                    desiredSpeed = Math.min(desiredSpeed, limit);
                }
            }
        }
        // 2. Look ahead up to 2 waypoints further for upcoming turns (starting at step + 1)
        for (let checkStep = step; checkStep < Math.min(step + 2, pathLen - 2); checkStep++) {
            const idx0 = worker.pathIdx(slot, checkStep);
            const idx1 = worker.pathIdx(slot, checkStep + 1);
            const idx2 = worker.pathIdx(slot, checkStep + 2);
            const x0 = grid.gridCenterXByIdx(idx0);
            const y0 = grid.gridCenterYByIdx(idx0);
            const x1 = grid.gridCenterXByIdx(idx1);
            const y1 = grid.gridCenterYByIdx(idx1);
            const x2 = grid.gridCenterXByIdx(idx2);
            const y2 = grid.gridCenterYByIdx(idx2);
            const dx1_ch = x1 - x0;
            const dy1_ch = y1 - y0;
            const dx2_ch = x2 - x1;
            const dy2_ch = y2 - y1;
            const d1_ch = Math.hypot(dx1_ch, dy1_ch);
            const d2_ch = Math.hypot(dx2_ch, dy2_ch);
            if (d1_ch > 0.001 && d2_ch > 0.001) {
                const cosTheta = (dx1_ch * dx2_ch + dy1_ch * dy2_ch) / (d1_ch * d2_ch);
                if (cosTheta < 0.9) {
                    const cornerFactor = 0.35 + 0.65 * Math.max(0, cosTheta);
                    const cornerSpeed = maxSpeed * cornerFactor;
                    const distToCorner = Math.hypot(x1 - x, y1 - y);
                    const brakingDistance = (maxSpeed * maxSpeed - cornerSpeed * cornerSpeed) / (2 * accel);
                    if (distToCorner < brakingDistance) {
                        const limit = Math.sqrt(cornerSpeed * cornerSpeed + 2 * accel * distToCorner);
                        desiredSpeed = Math.min(desiredSpeed, limit);
                    }
                }
            }
        }
    }
    // Arrival Slowdown check
    const decelRadius = 32.0; // 2 grid cells
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
