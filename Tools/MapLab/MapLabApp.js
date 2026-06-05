import { mapSettings, mapGenerationSettings } from "../../Config/Config.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { initResizer, setupLabViewportNavigation } from "../Lab/lab-shared.js";
import { createLabMapWorld } from "../TileLab/map/LabMapWorld.js";
import { renderMapLabView } from "./MapLabView.js";
import { SliderControl } from "../Lab/ui/controls/SliderControl.js";
import { resolveRepositionTarget } from "../../Libraries/Math/pathfinding/PathClearance.js";

let currentWorld = null;
const currentViewport = new Viewport(0, 0, 0.1);
let selectedNodeId = null;

let playerPos = null;
let targetPos = null;
let currentPath = null;
let currentAbstractPath = null;

let mapSeed = Math.floor(Math.random() * 100000);
let worldSurfaceSeed = Math.floor(Math.random() * 100000);

function updatePathStatus(msg, isError = false) {
    const el = document.getElementById("pathStatus");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "#f44336" : "#00bcd4";
    }
}

function calculatePath() {
    if (!currentWorld) return;
    const showPathTest = document.getElementById("showPathTestInput").checked;
    if (!showPathTest) {
        currentPath = null;
        currentAbstractPath = null;
        updatePathStatus("Path test is disabled.");
        return;
    }
    if (!playerPos || !targetPos) {
        currentPath = null;
        currentAbstractPath = null;
        updatePathStatus("Need both player and target positions.");
        return;
    }
    try {
        const result = currentWorld.hierarchicalNavigator.computePath(
            playerPos.x,
            playerPos.y,
            targetPos.x,
            targetPos.y,
        );
        currentPath = result?.waypoints ?? null;
        currentAbstractPath = result?.abstractNodes ?? null;
        if (currentPath) {
            const hops = currentAbstractPath ? currentAbstractPath.length : 0;
            updatePathStatus(`Path found: ${currentPath.length} waypoints, ${hops} abstract nodes.`);
        } else {
            updatePathStatus("No path found (blocked or too far).", true);
        }
    } catch (err) {
        console.error(err);
        currentPath = null;
        currentAbstractPath = null;
        updatePathStatus("Error calculating path.", true);
    }
}

function readControls() {
    return {
        mapSeed,
        worldSurfaceSeed,
        showNodes: document.getElementById("showNodesInput").checked,
        showRoomZones: document.getElementById("showRoomZonesInput").checked,
        showWalls: document.getElementById("showWallsInput").checked,
        showGridBounds: document.getElementById("showGridBoundsInput").checked,
        showPathDebug: document.getElementById("showPathDebugInput").checked,
        showPathTest: document.getElementById("showPathTestInput").checked,
    };
}

function generateMap() {
    const ctrl = readControls();
    currentWorld = createLabMapWorld({
        mapSeed: ctrl.mapSeed,
        worldSurfaceSeed: ctrl.worldSurfaceSeed
    });
    
    // Focus camera roughly on the center of the generated bounds
    const bounds = currentWorld.obstacleGrid;
    if (bounds && bounds.minX !== undefined) {
        currentViewport.snapTo((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    }

    // Default player position to Node 0 combat center, target to Node 1 combat center
    const startNode = currentWorld.getMapNode(0);
    if (startNode) {
        playerPos = currentWorld.getNodeCombatCoords(startNode);
        const nextId = startNode.connections[0];
        const nextNode = currentWorld.getMapNode(nextId);
        if (nextNode) {
            targetPos = currentWorld.getNodeCombatCoords(nextNode);
        } else {
            targetPos = { x: playerPos.x + 300, y: playerPos.y };
        }
    } else {
        playerPos = { x: 0, y: 0 };
        targetPos = { x: 300, y: 0 };
    }
    calculatePath();

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
    
    renderMapLabView(
        canvas.getContext("2d"),
        canvas.width,
        canvas.height,
        currentWorld,
        currentViewport,
        readControls(),
        selectedNodeId,
        playerPos,
        targetPos,
        currentPath,
        currentAbstractPath
    );
    
    const statusLine = document.getElementById("mapStatusLine");
    if (statusLine) {
        statusLine.textContent = `Cam: ${Math.round(currentViewport.x)}, ${Math.round(currentViewport.y)} · Zoom: ${currentViewport.zoom.toFixed(2)}x · Nodes: ${currentWorld.mapNodes.length} · Walls: ${currentWorld.walls.length}`;
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
        currentViewport.snapTo(coords.x, coords.y);
        currentViewport.zoom = 0.5;
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
            generateMap();
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
    hint.textContent = "Changes are applied automatically.";
    panel.appendChild(hint);
}

function bootstrap() {
    initResizer("resizer", redrawCanvas);
    buildSettingsPanel();
    
    const checkboxes = [
        "showNodesInput",
        "showRoomZonesInput",
        "showWallsInput",
        "showGridBoundsInput",
        "showPathDebugInput",
        "showPathTestInput"
    ];
    for (const id of checkboxes) {
        document.getElementById(id).addEventListener("change", () => {
            if (id === "showPathTestInput") {
                const checked = document.getElementById("showPathTestInput").checked;
                document.getElementById("pathTestControls").style.display = checked ? "block" : "none";
                calculatePath();
            }
            redrawCanvas();
        });
    }
    
    setupLabViewportNavigation("mapPreview", {
        getCamera: () => currentViewport,
        setCamera: (x, y, zoom) => {
            currentViewport.snapTo(x, y);
            currentViewport.zoom = zoom;
        },
        onUpdate: () => redrawCanvas(),
    });

    const canvas = document.getElementById("mapPreview");
    canvas.addEventListener("pointerdown", (e) => {
        if (!currentWorld) return;
        const rect = canvas.getBoundingClientRect();
        currentViewport.setCanvasSize(canvas.width, canvas.height);
        const { x: worldX, y: worldY } = currentViewport.screenToWorld(
            e.clientX - rect.left,
            e.clientY - rect.top,
        );
        
        const showPathTest = document.getElementById("showPathTestInput").checked;
        const actionEl = document.querySelector('input[name="clickAction"]:checked');
        const clickAction = (showPathTest && actionEl) ? actionEl.value : "selectNode";

        if (clickAction === "selectNode") {
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
        } else if (clickAction === "repositionPlayer") {
            const target = resolveRepositionTarget(currentWorld.obstacleGrid, worldX, worldY, currentWorld.player.radius);
            if (target) {
                playerPos = { x: target.x, y: target.y };
                calculatePath();
                redrawCanvas();
            } else {
                updatePathStatus("Cannot reposition player: cell is blocked or has insufficient wall clearance.", true);
            }
        } else if (clickAction === "setTarget") {
            const target = resolveRepositionTarget(currentWorld.obstacleGrid, worldX, worldY, currentWorld.player.radius);
            if (target) {
                targetPos = { x: target.x, y: target.y };
                calculatePath();
                redrawCanvas();
            } else {
                updatePathStatus("Cannot set target: cell is blocked or has insufficient wall clearance.", true);
            }
        }
    });

    window.addEventListener("resize", redrawCanvas);
    generateMap();

    // Initial sync of the controls display
    const showPathTest = document.getElementById("showPathTestInput").checked;
    document.getElementById("pathTestControls").style.display = showPathTest ? "block" : "none";
}

bootstrap();
