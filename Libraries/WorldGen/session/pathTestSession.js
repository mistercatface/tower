import { resolveRepositionTarget } from "../../Pathfinding/PathClearance.js";
const DEFAULT_PATH_AGENT_RADIUS = 8;
/**
 * @typedef {Object} PathTestStatus
 * @property {string} message
 * @property {boolean} isError
 */
/**
 * @param {object} state
 */
export function resetPathTestSession(state) {
    const startNode = state.getMapNode(0);
    if (startNode) {
        state.mapLab.playerPos = state.getNodeWorldCoords(startNode);
        const nextId = startNode.connections[0];
        const nextNode = state.getMapNode(nextId);
        state.mapLab.targetPos = nextNode ? state.getNodeWorldCoords(nextNode) : { x: state.mapLab.playerPos.x + 300, y: state.mapLab.playerPos.y };
    } else {
        state.mapLab.playerPos = { x: 0, y: 0 };
        state.mapLab.targetPos = { x: 300, y: 0 };
    }
    state.mapLab.currentPath = null;
    state.mapLab.currentAbstractPath = null;
}
/**
 * @param {object} state
 * @param {{ enabled?: boolean }} [options]
 * @returns {PathTestStatus}
 */
export function computePathTestSession(state, { enabled = true } = {}) {
    if (!enabled) {
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
        return { message: "Path test is disabled.", isError: false };
    }
    const { playerPos, targetPos } = state.mapLab;
    if (!playerPos || !targetPos) {
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
        return { message: "Need both player and target positions.", isError: false };
    }
    try {
        const result = state.hierarchicalNavigator.computePath(playerPos.x, playerPos.y, targetPos.x, targetPos.y);
        state.mapLab.currentPath = result?.waypoints ?? null;
        state.mapLab.currentAbstractPath = result?.abstractNodes ?? null;
        if (state.mapLab.currentPath) {
            const hops = state.mapLab.currentAbstractPath ? state.mapLab.currentAbstractPath.length : 0;
            return { message: `Path found: ${state.mapLab.currentPath.length} waypoints, ${hops} abstract nodes.`, isError: false };
        }
        return { message: "No path found (blocked or too far).", isError: true };
    } catch (err) {
        console.error(err);
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
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
    if (role === "player") state.mapLab.playerPos = { x: target.x, y: target.y };
    else state.mapLab.targetPos = { x: target.x, y: target.y };
    return { ok: true };
}
