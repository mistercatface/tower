import { placePathTestAgent } from "../world/mapPathTest.js";
import { selectLabNode } from "../world/mapWorld.js";
import { canvasClientToWorld } from "./labCanvas.js";
import { populateNodeList, renderNodeInspector } from "./mapInspector.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {HTMLCanvasElement} canvas */
function resolveTopologyClickViewport(state, canvas) {
    state.mapViewport.setCanvasSize(canvas.width, canvas.height);
    return state.mapViewport;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} onRedraw */
export function initMapTopologyInteractions(state, onRedraw) {
    const canvas = document.getElementById("gameCanvas");
    canvas?.addEventListener("pointerdown", (e) => {
        if (!state.labShowTopologyOverlay || e.shiftKey) return;
        const viewport = resolveTopologyClickViewport(state, canvas);
        const world = canvasClientToWorld(canvas, viewport, e.clientX, e.clientY);
        if (!world) return;
        const { x: worldX, y: worldY } = world;
        const showPathTest = document.getElementById("showPathTestInput")?.checked ?? false;
        const actionEl = document.querySelector('input[name="clickAction"]:checked');
        const clickAction = showPathTest && actionEl ? actionEl.value : "selectNode";
        if (clickAction === "selectNode") {
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
        } else if (clickAction === "repositionPlayer") {
            if (placePathTestAgent(state, worldX, worldY, "player")) onRedraw();
        } else if (clickAction === "setTarget") if (placePathTestAgent(state, worldX, worldY, "target")) onRedraw();
    });
}
