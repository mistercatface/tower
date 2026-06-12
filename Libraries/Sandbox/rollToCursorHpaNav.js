import { agentPose } from "../Agent/index.js";
import { createNavState } from "../Pathfinding/navSession.js";
import { computePathSteering, trimPathAhead } from "../Pathfinding/pathFollow.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/** @typedef {import("../Pathfinding/navSession.js").NavSessionState} NavSessionState */
const REPLAN_INTERVAL_MS = 250;
const REPLAN_TARGET_MOVE_PX = 64;
/** @returns {{ navState: NavSessionState, reset: () => void, update: (prop: object, targetX: number, targetY: number, host: SandboxHostPort, dtMs: number) => void, getSteering: (prop: object, targetX: number, targetY: number, settings: object) => import("../Agent/types.js").SteeringResult | null }} */
export function createRollToCursorHpaNav() {
    const navState = createNavState();
    let replanClockMs = 0;
    const reset = () => {
        navState.path = null;
        navState.abstractPath = null;
        navState.pathPlanner = null;
        navState.pathProgressIdx = 0;
        navState.lastTargetX = null;
        navState.lastTargetY = null;
        navState.lastUpdate = 0;
        replanClockMs = 0;
    };
    const replan = (prop, targetX, targetY, host) => {
        if (!host.computePath) {
            navState.path = null;
            navState.abstractPath = null;
            navState.pathPlanner = null;
            return;
        }
        const result = host.computePath(prop.x, prop.y, targetX, targetY);
        const rawPath = result?.waypoints ?? null;
        navState.path = rawPath ? trimPathAhead(prop.x, prop.y, rawPath) : null;
        navState.abstractPath = navState.path ? (result?.abstractNodes ?? null) : null;
        navState.pathPlanner = navState.path ? (result?.pathPlanner ?? null) : null;
        navState.pathProgressIdx = 0;
        navState.lastTargetX = targetX;
        navState.lastTargetY = targetY;
        navState.lastUpdate = replanClockMs;
    };
    const update = (prop, targetX, targetY, host, dtMs) => {
        replanClockMs += dtMs;
        const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
        const needsReplan = !navState.path || targetMovedPx >= REPLAN_TARGET_MOVE_PX;
        if (needsReplan) replan(prop, targetX, targetY, host);
    };
    const getSteering = (prop, targetX, targetY, settings) => {
        if (!navState.path || navState.path.length < 2) return null;
        return computePathSteering(agentPose(prop), navState.path, targetX, targetY, settings, navState);
    };
    return { navState, reset, update, getSteering };
}
