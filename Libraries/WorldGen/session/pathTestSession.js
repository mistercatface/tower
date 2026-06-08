import { resolveRepositionTarget } from "../../Pathfinding/PathClearance.js";
import { getRoguelikeMapSession } from "./roguelikeMapSession.js";
const DEFAULT_PATH_AGENT_RADIUS = 8;
/**
 * @typedef {Object} PathTestStatus
 * @property {string} message
 * @property {boolean} isError
 */
/** @param {object} state */
export function resetPathTestSession(state) {
    const session = getRoguelikeMapSession(state);
    const startNode = state.getMapNode(0);
    if (startNode) {
        session.playerPos = state.getNodeWorldCoords(startNode);
        const nextId = startNode.connections[0];
        const nextNode = state.getMapNode(nextId);
        session.targetPos = nextNode ? state.getNodeWorldCoords(nextNode) : { x: session.playerPos.x + 300, y: session.playerPos.y };
    } else {
        session.playerPos = { x: 0, y: 0 };
        session.targetPos = { x: 300, y: 0 };
    }
    session.currentPath = null;
    session.currentAbstractPath = null;
}
/**
 * @param {object} state
 * @param {{ enabled?: boolean }} [options]
 * @returns {PathTestStatus}
 */
export function computePathTestSession(state, { enabled = true } = {}) {
    const session = getRoguelikeMapSession(state);
    if (!enabled) {
        session.currentPath = null;
        session.currentAbstractPath = null;
        return { message: "Path test is disabled.", isError: false };
    }
    const { playerPos, targetPos } = session;
    if (!playerPos || !targetPos) {
        session.currentPath = null;
        session.currentAbstractPath = null;
        return { message: "Need both player and target positions.", isError: false };
    }
    try {
        const result = state.hierarchicalNavigator.computePath(playerPos.x, playerPos.y, targetPos.x, targetPos.y);
        session.currentPath = result?.waypoints ?? null;
        session.currentAbstractPath = result?.abstractNodes ?? null;
        if (session.currentPath) {
            const hops = session.currentAbstractPath ? session.currentAbstractPath.length : 0;
            return { message: `Path found: ${session.currentPath.length} waypoints, ${hops} abstract nodes.`, isError: false };
        }
        return { message: "No path found (blocked or too far).", isError: true };
    } catch (err) {
        console.error(err);
        session.currentPath = null;
        session.currentAbstractPath = null;
        return { message: "Error calculating path.", isError: true };
    }
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {"player" | "target"} role
 * @param {number} [agentRadius]
 * @returns {{ ok: true } | { ok: false, status: PathTestStatus }}
 */
export function placePathTestAgentSession(state, worldX, worldY, role, agentRadius = DEFAULT_PATH_AGENT_RADIUS) {
    const target = resolveRepositionTarget(state.obstacleGrid, worldX, worldY, agentRadius);
    if (!target) return { ok: false, status: { message: `Cannot set ${role}: cell is blocked or has insufficient wall clearance.`, isError: true } };
    const session = getRoguelikeMapSession(state);
    if (role === "player") session.playerPos = { x: target.x, y: target.y };
    else session.targetPos = { x: target.x, y: target.y };
    return { ok: true };
}
