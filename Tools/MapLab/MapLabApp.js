import { mapSettings, mapGenerationSettings } from "../../Config/Config.js";
import { initResizer, setupLabViewportNavigation } from "../Lab/lab-shared.js";
import { createLabMapWorld } from "../TileLab/map/LabMapWorld.js";
import { renderMapLabView } from "./MapLabView.js";
import { SliderControl } from "../Lab/ui/controls/SliderControl.js";

let currentWorld = null;
let currentCamera = { x: 0, y: 0, zoom: 0.1 }; // zoomed out by default to see the whole map
let selectedNodeId = null;

function readControls() {
    return {
        mapSeed: parseInt(document.getElementById("mapSeedInput").value, 10) || 42,
        floorSeed: parseInt(document.getElementById("floorSeedInput").value, 10) || 42,
        showNodes: document.getElementById("showNodesInput").checked,
        showRoomZones: document.getElementById("showRoomZonesInput").checked,
        showWalls: document.getElementById("showWallsInput").checked,
        showGridBounds: document.getElementById("showGridBoundsInput").checked,
    };
}

function updateURL() {
    const ctrl = readControls();
    const params = new URLSearchParams(window.location.search);
    params.set("mapSeed", ctrl.mapSeed);
    params.set("floorSeed", ctrl.floorSeed);
    window.history.replaceState(null, "", "?" + params.toString());
}

function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("mapSeed")) document.getElementById("mapSeedInput").value = params.get("mapSeed");
    if (params.has("floorSeed")) document.getElementById("floorSeedInput").value = params.get("floorSeed");
}

function generateMap() {
    updateURL();
    const ctrl = readControls();
    currentWorld = createLabMapWorld({
        mapSeed: ctrl.mapSeed,
        floorTileSeed: ctrl.floorSeed
    });
    
    // Focus camera roughly on the center of the generated bounds
    const bounds = currentWorld.obstacleGrid;
    if (bounds && bounds.minX !== undefined) {
        currentCamera.x = (bounds.minX + bounds.maxX) / 2;
        currentCamera.y = (bounds.minY + bounds.maxY) / 2;
    }

    selectedNodeId = null;
    populateNodeList();
    renderSidebarDetails();
    redrawCanvas();
}

function redrawCanvas() {
    if (!currentWorld) return;
    const canvas = document.getElementById("mapPreview");
    const stage = document.getElementById("mapStage");
    
    const rect = stage.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    
    if (width < 32 || height < 32) return;
    
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    
    renderMapLabView(canvas.getContext("2d"), canvas.width, canvas.height, currentWorld, currentCamera, readControls(), selectedNodeId);
    
    const statusLine = document.getElementById("mapStatusLine");
    if (statusLine) {
        statusLine.textContent = `Cam: ${Math.round(currentCamera.x)}, ${Math.round(currentCamera.y)} · Zoom: ${currentCamera.zoom.toFixed(2)}x · Nodes: ${currentWorld.mapNodes.length} · Walls: ${currentWorld.walls.length}`;
    }
}

function populateNodeList() {
    const listPanel = document.getElementById("nodeListPanel");
    listPanel.innerHTML = "";
    
    if (!currentWorld) return;
    
    // Sort by layer, then by ID
    const sortedNodes = [...currentWorld.mapNodes].sort((a, b) => a.layer - b.layer || a.id - b.id);
    
    for (const node of sortedNodes) {
        const item = document.createElement("div");
        item.className = `node-row${node.id === selectedNodeId ? " selected" : ""}`;
        item.dataset.id = node.id;
        
        const themeColor = node.wallTheme ? `rgb(${node.wallTheme.r}, ${node.wallTheme.g}, ${node.wallTheme.b})` : "#fff";
        
        item.innerHTML = `
            <span class="node-id">#${node.id}</span>
            <span class="node-layer">L${node.layer}</span>
            <span class="node-strategy">${node.strategy ?? "Unknown"}</span>
            <span class="color-badge" style="background-color: ${themeColor}"></span>
        `;
        
        item.addEventListener("click", () => {
            selectedNodeId = node.id;
            populateNodeList(); // Re-render to update selected styling
            renderSidebarDetails();
            redrawCanvas();
        });
        
        listPanel.appendChild(item);
    }
}

function renderSidebarDetails() {
    const infoPanel = document.getElementById("nodeInfoPanel");
    
    if (selectedNodeId == null || !currentWorld) {
        infoPanel.textContent = "Select a node from the map or list.";
        return;
    }
    
    const node = currentWorld.getMapNode(selectedNodeId);
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
    
    addRow("ID", node.id);
    addRow("Layer", node.layer);
    addRow("Strategy", node.strategy ?? "None");
    addRow("Theme", `<span class="color-badge" style="background-color: ${themeColor}"></span>`);
    addRow("Waves", node.wavesTotal ?? 0);
    addRow("Connections", node.connections.join(", ") || "None");
    
    infoPanel.appendChild(grid);
    
    const focusBtn = document.createElement("button");
    focusBtn.className = "focus-btn";
    focusBtn.textContent = "Focus Node";
    focusBtn.addEventListener("click", () => {
        const coords = currentWorld.getNodeCombatCoords(node);
        currentCamera.x = coords.x;
        currentCamera.y = coords.y;
        currentCamera.zoom = 0.5; // Zoom in slightly
        redrawCanvas();
    });
    
    infoPanel.appendChild(focusBtn);
}

function buildSettingsPanel() {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    
    const addSlider = (label, min, max, step, obj, key) => {
        const slider = new SliderControl(label, min, max, step, obj[key], (val) => {
            obj[key] = val;
        });
        panel.appendChild(slider.element);
    };
    
    const subh1 = document.createElement("div");
    subh1.className = "editor-subhead";
    subh1.textContent = "Topology";
    panel.appendChild(subh1);
    
    addSlider("Layers", 1, 20, 1, mapSettings, "numLayers");
    addSlider("Layer Spacing", 50, 500, 10, mapSettings, "layerSpacing");
    addSlider("Node Spacing (X)", 50, 500, 10, mapSettings, "xSpacing");
    addSlider("Node Jitter", 0, 100, 1, mapSettings, "nodeJitter");
    
    const subh2 = document.createElement("div");
    subh2.className = "editor-subhead";
    subh2.textContent = "Generation Settings";
    panel.appendChild(subh2);
    
    addSlider("Extra Conn Chance", 0, 1, 0.05, mapGenerationSettings, "extraConnectionChance");
    
    const subh3 = document.createElement("div");
    subh3.className = "editor-subhead";
    subh3.textContent = "Scale";
    panel.appendChild(subh3);
    
    addSlider("Combat Scale", 1, 20, 0.5, mapSettings, "combatCoordScale");
    
    const hint = document.createElement("div");
    hint.className = "editor-hint";
    hint.style.marginTop = "8px";
    hint.textContent = "Click 'Regenerate Map' to apply changes.";
    panel.appendChild(hint);
}

function bootstrap() {
    initResizer("resizer", redrawCanvas);
    restoreFromURL();
    buildSettingsPanel();
    
    document.getElementById("regenerateBtn").addEventListener("click", () => {
        generateMap();
    });
    
    document.getElementById("randomMapSeedBtn").addEventListener("click", () => {
        document.getElementById("mapSeedInput").value = Math.floor(Math.random() * 100000);
        generateMap();
    });
    
    document.getElementById("randomFloorSeedBtn").addEventListener("click", () => {
        document.getElementById("floorSeedInput").value = Math.floor(Math.random() * 100000);
        generateMap();
    });
    
    const checkboxes = ["showNodesInput", "showRoomZonesInput", "showWallsInput", "showGridBoundsInput"];
    for (const id of checkboxes) {
        document.getElementById(id).addEventListener("change", redrawCanvas);
    }
    
    setupLabViewportNavigation("mapPreview", {
        getCamera: () => currentCamera,
        setCamera: (x, y, zoom) => {
            currentCamera.x = x;
            currentCamera.y = y;
            currentCamera.zoom = zoom;
        },
        onUpdate: () => redrawCanvas()
    });

    const canvas = document.getElementById("mapPreview");
    canvas.addEventListener("pointerdown", (e) => {
        if (!currentWorld) return;
        const rect = canvas.getBoundingClientRect();
        
        // Transform screen click to world coordinates
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        
        const worldX = (e.clientX - rect.left - cx) / currentCamera.zoom + currentCamera.x;
        const worldY = (e.clientY - rect.top - cy) / currentCamera.zoom + currentCamera.y;
        
        // Find nearest node
        let nearestNode = null;
        let nearestDist = Infinity;
        
        for (const node of currentWorld.mapNodes) {
            const coords = currentWorld.getNodeCombatCoords(node);
            const dist = Math.hypot(coords.x - worldX, coords.y - worldY);
            if (dist < 200 && dist < nearestDist) { // 200 radius click target
                nearestDist = dist;
                nearestNode = node;
            }
        }
        
        if (nearestNode) {
            selectedNodeId = nearestNode.id;
            populateNodeList();
            renderSidebarDetails();
            redrawCanvas();
        }
    });

    window.addEventListener("resize", redrawCanvas);
    generateMap();
}

bootstrap();
