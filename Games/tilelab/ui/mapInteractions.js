import { setupLabViewportNavigation } from "../../../Tools/Lab/lab-shared.js";
import { clampLabZoom, getLabZoomControl } from "./labZoomUi.js";
import { placePathTestAgent } from "../world/mapPathTest.js";
import { populateNodeList, renderNodeInspector } from "./mapInspector.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {HTMLCanvasElement} canvas */
function resolveTopologyClickViewport(state, canvas) {
    state.mapViewport.setCanvasSize(canvas.width, canvas.height);
    return state.mapViewport;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} onRedraw */
export function initMapTopologyNavigation(state, onRedraw) {
    setupLabViewportNavigation("mapPreview", {
        getCamera: () => state.mapViewport,
        setCamera: (x, y, zoom) => {
            state.mapViewport.snapTo(x, y);
            state.mapViewport.zoom = clampLabZoom(zoom);
            getLabZoomControl()?.setZoom(state.mapViewport.zoom);
        },
        onUpdate: onRedraw,
    });
    const bindTopologyClicks = (canvas) => {
        canvas?.addEventListener("pointerdown", (e) => {
            if (state.labViewMode !== "topology" && state.labViewMode !== "both") return;
            const rect = canvas.getBoundingClientRect();
            const viewport = resolveTopologyClickViewport(state, canvas);
            const { x: worldX, y: worldY } = viewport.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
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
                    state.mapLab.selectedNodeId = nearestNode.id;
                    populateNodeList(state, onRedraw);
                    renderNodeInspector(state, onRedraw);
                    onRedraw();
                }
            } else if (clickAction === "repositionPlayer") {
                if (placePathTestAgent(state, worldX, worldY, "player")) onRedraw();
            } else if (clickAction === "setTarget") if (placePathTestAgent(state, worldX, worldY, "target")) onRedraw();
        });
    };
    bindTopologyClicks(document.getElementById("mapPreview"));
    bindTopologyClicks(document.getElementById("gameCanvas"));
}
