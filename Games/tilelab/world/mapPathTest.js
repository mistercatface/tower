import { computePathTestSession, placePathTestAgentSession } from "../../../Libraries/WorldGen/session/index.js";
import { LAB_PATH_AGENT_RADIUS } from "../config.js";
export function updatePathStatus(msg, isError = false) {
    const el = document.getElementById("pathStatus");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "#f44336" : "#00bcd4";
    }
}
/** @param {import("../../../Libraries/WorldGen/session/pathTestSession.js").PathTestStatus} status */
export function applyPathTestStatus(status) {
    updatePathStatus(status.message, status.isError);
}
function isPathTestEnabled() {
    return document.getElementById("showPathTestInput")?.checked ?? false;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function calculatePathTest(state) {
    applyPathTestStatus(computePathTestSession(state, { enabled: isPathTestEnabled() }));
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function placePathTestAgent(state, worldX, worldY, role) {
    const result = placePathTestAgentSession(state, worldX, worldY, role, LAB_PATH_AGENT_RADIUS);
    if (!result.ok) {
        applyPathTestStatus(result.status);
        return false;
    }
    calculatePathTest(state);
    return true;
}
