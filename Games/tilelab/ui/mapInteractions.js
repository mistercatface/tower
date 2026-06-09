import { findPickupAt } from "../../../Libraries/Sandbox/findPickupAt.js";
import { selectLabNode } from "../world/mapWorld.js";
import { canvasClientToWorld } from "./labCanvas.js";
import { populateNodeList, renderNodeInspector } from "./mapInspector.js";
/** @param {import("../index.js").TileLabGameState} state @param {HTMLCanvasElement} canvas */
function resolveTopologyClickViewport(state, canvas) {
    return state.mapViewport;
}
/** @param {import("../index.js").TileLabGameState} state @param {() => void} onRedraw */
export function initMapTopologyInteractions(state, onRedraw) {
    const canvas = document.getElementById("gameCanvas");
    canvas?.addEventListener("pointerdown", (e) => {
        if (!state.labShowTopologyOverlay || e.button !== 0) return;
        if (e.defaultPrevented) return;
        const viewport = resolveTopologyClickViewport(state, canvas);
        const world = canvasClientToWorld(canvas, viewport, e.clientX, e.clientY);
        if (!world) return;
        const { x: worldX, y: worldY } = world;
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
            selectLabNode(state, nearestNode.id);
            populateNodeList(state, onRedraw);
            renderNodeInspector(state, onRedraw);
            onRedraw();
        }
    });
}
