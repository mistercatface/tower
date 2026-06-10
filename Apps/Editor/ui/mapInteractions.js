import { findPickupAt } from "../../../Libraries/Sandbox/findPickupAt.js";
import { canvasClientToWorld } from "./labCanvas.js";
import { populateNodeList, renderNodeInspector } from "./mapInspector.js";
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onRedraw */
export function initMapTopologyInteractions(state, onRedraw) {
    document.getElementById("gameCanvas").addEventListener("pointerdown", (e) => {
        if (!state.labShowTopologyOverlay || e.button !== 0) return;
        if (e.defaultPrevented) return;
        const { x: worldX, y: worldY } = canvasClientToWorld(state.labCanvas, state.viewport, e.clientX, e.clientY);
        if (findPickupAt(state.pickups, worldX, worldY)) return;
        let nearestNode = null;
        let nearestDist = Infinity;
        for (const node of state.mapNodes) {
            const coords = state.getNodeWorldCoords(node);
            const dist = Math.hypot(coords.x - worldX, coords.y - worldY);
            if (dist < 200 && dist < nearestDist) {
                nearestDist = dist;
                nearestNode = node;
            }
        }
        if (nearestNode) {
            state.roguelikeMapSession.selectedNodeId = nearestNode.id;
            populateNodeList(state, onRedraw);
            renderNodeInspector(state, onRedraw);
            onRedraw();
        }
    });
}
