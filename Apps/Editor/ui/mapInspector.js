import { engine } from "../engine.js";
import { tilelabMapTopology } from "../state.js";
import { SliderControl } from "./controls/SliderControl.js";
import { focusLabNode, generateTilelabMap, listLabMapNodes } from "../world/mapWorld.js";
import { setLabCamera } from "./labViewport.js";
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function populateNodeList(state, onRedraw) {
    const listPanel = document.getElementById("nodeListPanel");
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
            state.roguelikeMapSession.selectedNodeId = node.id;
            populateNodeList(state, onRedraw);
            renderNodeInspector(state, onRedraw);
            onRedraw?.();
        });
        listPanel.appendChild(item);
    }
}
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function renderNodeInspector(state, onRedraw) {
    const infoPanel = document.getElementById("nodeInfoPanel");
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
        setLabCamera(state, state.viewport.x, state.viewport.y, 0.5);
    });
    infoPanel.appendChild(focusBtn);
}
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onApplied] */
export function buildTopologySettingsPanel(state, onApplied) {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const worldGen = engine.worldGen;
    const addSlider = (label, hint, min, max, step, obj, key, formatValue = (v) => String(v)) => {
        const slider = new SliderControl(label, min, max, step, obj[key], (val) => {
            obj[key] = val;
        }, formatValue);
        slider.element.title = hint;
        panel.appendChild(slider.element);
    };
    const subh1 = document.createElement("div");
    subh1.className = "editor-subhead";
    subh1.textContent = "Node graph";
    panel.appendChild(subh1);
    addSlider("Depth", "Rings of nodes around start (1 = home only; each extra ring adds up to 8 nodes)", 1, 20, 1, tilelabMapTopology, "numLayers");
    addSlider("Ring gap", "Topology distance between rings along north/south", 50, 500, 10, tilelabMapTopology, "layerSpacing");
    addSlider("Branch gap", "Topology distance between compass branches on the same ring", 50, 500, 10, tilelabMapTopology, "xSpacing");
    addSlider("Scatter", "Random position wobble per node (0 = perfect grid)", 0, 100, 1, tilelabMapTopology, "nodeJitter");
    addSlider("Shortcuts", "Chance of extra diagonal links between adjacent rings", 0, 1, 0.05, tilelabMapTopology, "extraConnectionChance", (v) => `${Math.round(v * 100)}%`);
    const subh3 = document.createElement("div");
    subh3.className = "editor-subhead";
    subh3.textContent = "World layout";
    panel.appendChild(subh3);
    addSlider("World scale", "Multiplier from topology coordinates to world pixels", 1, 20, 0.5, worldGen, "nodeWorldCoordScale");
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "focus-btn";
    applyBtn.textContent = "Apply";
    applyBtn.title = "Regenerate the map with these settings (same seeds)";
    applyBtn.addEventListener("click", () => {
        generateTilelabMap(state, { mapSeed: state.mapSeed, floorSeed: state.floorSeed });
        onApplied?.();
    });
    panel.appendChild(applyBtn);
}
/** @param {import("../state.js").TileLabGameState} state @param {(() => void) | null} [onRedraw] */
export function syncMapInspectorAfterRegen(state, onRedraw) {
    const { selectedNodeId } = state.roguelikeMapSession;
    if (selectedNodeId != null && !state.getMapNode(selectedNodeId)) state.roguelikeMapSession.selectedNodeId = null;
    populateNodeList(state, onRedraw);
    renderNodeInspector(state, onRedraw);
}
