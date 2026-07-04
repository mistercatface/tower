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
    if (Math.hypot(wx - bodyX, wy - bodyY) > arrivalPx) return false;
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
        if (Math.hypot(wx - x, wy - y) > waypointArrival) break;
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
    // Dynamic Line of Sight Steering (Lookahead Smoothing)
    const maxLookahead = 4;
    const bodyRadius = resolveBodyRadius(pose);
    let lookaheadStep = step + 1;
    let validLookaheadStep = step;
    while (lookaheadStep < step + maxLookahead && lookaheadStep < pathLen) {
        const lx = grid.gridCenterXByIdx(worker.pathIdx(slot, lookaheadStep));
        const ly = grid.gridCenterYByIdx(worker.pathIdx(slot, lookaheadStep));
        if (hasLineOfSight(x, y, lx, ly, grid, bodyRadius)) validLookaheadStep = lookaheadStep;
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
    if (step < pathLen - 1)
        // Look ahead up to 3 waypoints for upcoming turns
        for (let checkStep = step; checkStep < Math.min(step + 3, pathLen - 1); checkStep++) {
            const idx0 = worker.pathIdx(slot, checkStep);
            const idx1 = worker.pathIdx(slot, checkStep + 1);
            const idx2 = checkStep + 2 < pathLen ? worker.pathIdx(slot, checkStep + 2) : -1;
            if (idx2 !== -1) {
                const x0 = grid.gridCenterXByIdx(idx0);
                const y0 = grid.gridCenterYByIdx(idx0);
                const x1 = grid.gridCenterXByIdx(idx1);
                const y1 = grid.gridCenterYByIdx(idx1);
                const x2 = grid.gridCenterXByIdx(idx2);
                const y2 = grid.gridCenterYByIdx(idx2);
                const dx1 = x1 - x0;
                const dy1 = y1 - y0;
                const dx2 = x2 - x1;
                const dy2 = y2 - y1;
                const d1 = Math.hypot(dx1, dy1);
                const d2 = Math.hypot(dx2, dy2);
                if (d1 > 0.001 && d2 > 0.001) {
                    const cosTheta = (dx1 * dx2 + dy1 * dy2) / (d1 * d2);
                    // cosTheta < 0.9 means a turn of more than ~25 degrees
                    if (cosTheta < 0.9) {
                        const cornerFactor = 0.35 + 0.65 * Math.max(0, cosTheta);
                        const cornerSpeed = maxSpeed * cornerFactor;
                        // Distance from entity to the corner waypoint x1, y1
                        const distToCorner = Math.hypot(x1 - x, y1 - y);
                        // Braking distance to slow down to cornerSpeed
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
export function createNavSession() {
    const navState = createNavState();
    let replanClockMs = 0;
    let pendingTargetReplan = false;
    let committedPathSlot = -1;
    let committedPathLen = 0;
    let routeCommitFrames = 0;
    const reset = (state) => {
        pendingTargetReplan = false;
        committedPathSlot = -1;
        committedPathLen = 0;
        routeCommitFrames = 0;
        const nav = resolveNavRuntime(state);
        nav.worker.releaseOwnedPathSlot(navState);
        Object.assign(navState, createNavState());
        replanClockMs = 0;
    };
    const markTargetChanged = () => {
        pendingTargetReplan = true;
    };
    const isRoutePending = () => pendingTargetReplan || navState.hpaReplanRequestId !== 0;
    const replan = (prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) => {
        const nav = resolveNavRuntime(state);
        return nav.session.requestReplan(navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, nav, prop.navStepPenalty), priority);
    };
    const requestReplan = (prop, targetX, targetY, state, priority, reason) => {
        const accepted = replan(prop, targetX, targetY, state, priority);
        if (accepted) {
            pendingTargetReplan = false;
            navState.pendingReplanReason = reason;
            navState.stuckFrames = 0;
            return { steering: null, replanReason: reason };
        }
        return { steering: null, replanReason: "cooldown" };
    };
    const syncRouteCommitState = () => {
        if (!navHasPath(navState)) {
            committedPathSlot = -1;
            committedPathLen = 0;
            routeCommitFrames = 0;
            return;
        }
        if (navState.pathSlot !== committedPathSlot || navState.pathLen !== committedPathLen) {
            committedPathSlot = navState.pathSlot;
            committedPathLen = navState.pathLen;
            routeCommitFrames = 0;
            return;
        }
        routeCommitFrames++;
    };
    const softReplanAllowed = (stuckFrames, stuckReplanFrames) => {
        return stuckFrames > Math.max(1, Math.floor(stuckReplanFrames * 0.5));
    };
    const update = (prop, targetX, targetY, state, dtMs, pathSettings) => {
        replanClockMs += dtMs;
        const nav = resolveNavRuntime(state);
        const settings = nav.settings;
        const inFlight = nav.session.isReplanInFlight(navState);
        const routePending = pendingTargetReplan || navState.hpaReplanRequestId !== 0;
        if (inFlight || routePending) {
            navState.stuckFrames = 0;
            navState.lastX = prop.x;
            navState.lastY = prop.y;
        } else trackNavStuck(navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, "props");
        const stuckFrames = navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        syncRouteCommitState();
        if (!inFlight && obstacleEpochReplanDue(navState, nav.topologyKey()))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) return requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible), "epoch");
        let sandboxReason = sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason === "targetMoved" && !softReplanAllowed(stuckFrames, stuckReplanFrames)) sandboxReason = null;
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible), sandboxReason);
        const idleReason = idlePathReplanReason(navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(navState, idleReason, isVisible, stuckReplanFrames))
            return requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible), idleReason);
        if (!navHasPath(navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const steering = computeSabPathSteering(agentPose(prop), nav.worker, navState.pathSlot, navState.pathLen, targetX, targetY, state.obstacleGrid, nav.topology, pathSettings, navState);
        if (steering && !inFlight && offPathReplanDue(steering, navState, replanClockMs))
            if (softReplanAllowed(stuckFrames, stuckReplanFrames) && obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                navState.lastOffPathReplan = replanClockMs;
                return requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible), "offPath");
            }
        return { steering, replanReason: null };
    };
    const getCommitStatus = () => ({ routeCommitFrames });
    return { navState, reset, markTargetChanged, replan, update, isRoutePending, getCommitStatus };
}
