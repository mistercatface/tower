import { tilelabMapTopology } from "../mapTopology.js";
import { getWorldGen } from "../../../Core/GamePorts.js";
import { SliderControl } from "./controls/SliderControl.js";
import { calculatePathTest } from "../world/mapPathTest.js";
import { focusLabNode, generateTilelabMap, listLabMapNodes, selectLabNode } from "../world/mapWorld.js";
import { setLabCamera } from "./labViewport.js";
import { readControls } from "./toolbar.js";
export function readMapControls() {
    return {
        showNodes: document.getElementById("showNodesInput")?.checked ?? true,
        showRoomZones: document.getElementById("showRoomZonesInput")?.checked ?? true,
        showWalls: document.getElementById("showWallsInput")?.checked ?? true,
        showGridBounds: document.getElementById("showGridBoundsInput")?.checked ?? true,
        showPathDebug: document.getElementById("showPathDebugInput")?.checked ?? true,
        showPathTest: document.getElementById("showPathTestInput")?.checked ?? true,
    };
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function populateNodeList(state, onRedraw) {
    const listPanel = document.getElementById("nodeListPanel");
    if (!listPanel) return;
    listPanel.innerHTML = "";
    for (const node of listLabMapNodes(state)) {
        const item = document.createElement("div");
        item.className = `node-row${node.id === state.roguelikeMapSession.selectedNodeId ? " selected" : ""}`;
        const themeColor = node.wallTheme ? `rgb(${node.wallTheme.r}, ${node.wallTheme.g}, ${node.wallTheme.b})` : "#fff";
        item.innerHTML = `
            <span class="node-id">#${node.id}</span>
            <span class="node-layer">L${node.layer}</span>
            <span class="node-strategy">${node.strategy ?? "Unknown"}</span>
            <span class="color-badge" style="background-color: ${themeColor}"></span>`;
        item.addEventListener("click", () => {
            selectLabNode(state, node.id);
            populateNodeList(state, onRedraw);
            renderNodeInspector(state, onRedraw);
            onRedraw?.();
        });
        listPanel.appendChild(item);
    }
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function renderNodeInspector(state, onRedraw) {
    const infoPanel = document.getElementById("nodeInfoPanel");
    if (!infoPanel) return;
    if (state.roguelikeMapSession.selectedNodeId == null) {
        infoPanel.textContent = "Select a node from the map or list.";
        return;
    }
    const node = state.getMapNode(state.roguelikeMapSession.selectedNodeId);
    if (!node) return;
    infoPanel.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "node-info-grid";
    const addRow = (label, value) => {
        const l = document.createElement("div");
        l.className = "info-label";
        l.textContent = label;
        const v = document.createElement("div");
        v.className = "info-value";
        v.innerHTML = value;
        grid.appendChild(l);
        grid.appendChild(v);
    };
    const themeColor = node.wallTheme ? `rgb(${node.wallTheme.r}, ${node.wallTheme.g}, ${node.wallTheme.b})` : "#fff";
    addRow("ID", String(node.id));
    addRow("Layer", String(node.layer));
    addRow("Strategy", node.strategy ?? "None");
    addRow("Theme", `<span class="color-badge" style="background-color: ${themeColor}"></span>`);
    addRow("Connections", node.connections.join(", ") || "None");
    infoPanel.appendChild(grid);
    const focusBtn = document.createElement("button");
    focusBtn.className = "focus-btn";
    focusBtn.textContent = "Focus Node";
    focusBtn.addEventListener("click", () => {
        focusLabNode(state, node.id);
        setLabCamera(state, state.mapViewport.x, state.mapViewport.y, 0.5);
    });
    infoPanel.appendChild(focusBtn);
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function buildTopologySettingsPanel(state) {
    const panel = document.getElementById("mapSettingsPanel");
    if (!panel) return;
    panel.innerHTML = "";
    const worldGen = getWorldGen();
    const regen = () => generateTilelabMap(state, readControls(state));
    const addSlider = (label, min, max, step, obj, key) => {
        panel.appendChild(
            new SliderControl(label, min, max, step, obj[key], (val) => {
                obj[key] = val;
                regen();
            }).element,
        );
    };
    const subh1 = document.createElement("div");
    subh1.className = "editor-subhead";
    subh1.textContent = "Topology";
    panel.appendChild(subh1);
    addSlider("Layers", 1, 20, 1, tilelabMapTopology, "numLayers");
    addSlider("Layer Spacing", 50, 500, 10, tilelabMapTopology, "layerSpacing");
    addSlider("Node Spacing (X)", 50, 500, 10, tilelabMapTopology, "xSpacing");
    addSlider("Node Jitter", 0, 100, 1, tilelabMapTopology, "nodeJitter");
    const subh2 = document.createElement("div");
    subh2.className = "editor-subhead";
    subh2.textContent = "Generation Settings";
    panel.appendChild(subh2);
    addSlider("Extra Conn Chance", 0, 1, 0.05, tilelabMapTopology, "extraConnectionChance");
    const subh3 = document.createElement("div");
    subh3.className = "editor-subhead";
    subh3.textContent = "Scale";
    panel.appendChild(subh3);
    addSlider("Node World Scale", 1, 20, 0.5, worldGen, "nodeWorldCoordScale");
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function syncMapInspectorAfterRegen(state, onRedraw) {
    const { selectedNodeId } = state.roguelikeMapSession;
    if (selectedNodeId != null && !state.getMapNode(selectedNodeId)) selectLabNode(state, null);
    populateNodeList(state, onRedraw);
    renderNodeInspector(state, onRedraw);
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} onRedraw */
export function bindMapInspectorControls(state, onRedraw) {
    buildTopologySettingsPanel(state);
    for (const id of ["showNodesInput", "showRoomZonesInput", "showWallsInput", "showGridBoundsInput", "showPathDebugInput", "showPathTestInput"])
        document.getElementById(id)?.addEventListener("change", () => {
            if (id === "showPathTestInput") {
                const checked = document.getElementById("showPathTestInput")?.checked ?? false;
                const el = document.getElementById("pathTestControls");
                if (el) el.style.display = checked ? "block" : "none";
                calculatePathTest(state);
            }
            onRedraw();
        });
    const pathTestControls = document.getElementById("pathTestControls");
    if (pathTestControls) pathTestControls.style.display = (document.getElementById("showPathTestInput")?.checked ?? false) ? "block" : "none";
}
