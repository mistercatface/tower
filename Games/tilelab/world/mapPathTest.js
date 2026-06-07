import { resolveRepositionTarget } from "../../../Libraries/Pathfinding/PathClearance.js";
import { LAB_PATH_AGENT_RADIUS } from "../config.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function resetPathTestPositions(state) {
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
}
export function updatePathStatus(msg, isError = false) {
    const el = document.getElementById("pathStatus");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "#f44336" : "#00bcd4";
    }
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function calculatePathTest(state) {
    const showPathTest = document.getElementById("showPathTestInput")?.checked ?? false;
    if (!showPathTest) {
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
        updatePathStatus("Path test is disabled.");
        return;
    }
    const { playerPos, targetPos } = state.mapLab;
    if (!playerPos || !targetPos) {
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
        updatePathStatus("Need both player and target positions.");
        return;
    }
    try {
        const result = state.hierarchicalNavigator.computePath(playerPos.x, playerPos.y, targetPos.x, targetPos.y);
        state.mapLab.currentPath = result?.waypoints ?? null;
        state.mapLab.currentAbstractPath = result?.abstractNodes ?? null;
        if (state.mapLab.currentPath) {
            const hops = state.mapLab.currentAbstractPath ? state.mapLab.currentAbstractPath.length : 0;
            updatePathStatus(`Path found: ${state.mapLab.currentPath.length} waypoints, ${hops} abstract nodes.`);
        } else updatePathStatus("No path found (blocked or too far).", true);
    } catch (err) {
        console.error(err);
        state.mapLab.currentPath = null;
        state.mapLab.currentAbstractPath = null;
        updatePathStatus("Error calculating path.", true);
    }
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function placePathTestAgent(state, worldX, worldY, role) {
    const target = resolveRepositionTarget(state.obstacleGrid, worldX, worldY, LAB_PATH_AGENT_RADIUS);
    if (!target) {
        updatePathStatus(`Cannot set ${role}: cell is blocked or has insufficient wall clearance.`, true);
        return false;
    }
    if (role === "player") state.mapLab.playerPos = { x: target.x, y: target.y };
    else state.mapLab.targetPos = { x: target.x, y: target.y };
    calculatePathTest(state);
    return true;
}
