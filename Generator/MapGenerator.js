import { Segment } from "../Entities/Wall.js";
import { GeneratorStrategies } from "./GeneratorStrategies.js";
import { StartBuildingStrategy } from "./StartNodeBuilding.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { FLOW_FIELD_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { FlowFieldGrid } from "../Libraries/Pathfinding/FlowFieldGrid.js";
import { mapSettings, gridSettings, mapGenerationSettings } from "../Config/Config.js";
import { resolveSurfaceProfileId } from "../Config/procedural/profiles.js";
import { syncSurfaceProfile } from "../Render/game/surfaceProfileResolver.js";
import { buildMapRenderCaches } from "../Render/Map/MapRenderCache.js";

const STRATEGIES = Object.keys(GeneratorStrategies);

let tempObstacleGrid = null;
let tempFlowFieldGrid = null;

function getTempGrids() {
    if (!tempObstacleGrid) {
        tempObstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        tempFlowFieldGrid = new FlowFieldGrid(
            gridSettings.cellSize,
            gridSettings.width,
            gridSettings.height,
            tempObstacleGrid,
            FLOW_FIELD_WORKER_URL,
        );
    }
    return { tempObstacleGrid, tempFlowFieldGrid };
}

function serializeWalls(walls, px, py, maxRadius = 480) {
    const out = [];
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const half = w.size / 2;
        const dist = Math.hypot(w.x - px, w.y - py);
        if (dist + half <= maxRadius) {
            out.push({
                x: w.x,
                y: w.y,
                angle: w.angle,
                size: w.size,
                padding: w.padding,
                maxHealth: w.maxHealth || 30,
                wallHeight: w.wallHeight,
            });
        }
    }
    return out;
}

function buildIncomingNodesMap(mapNodes) {
    const incomingByNodeId = new Map();
    for (const node of mapNodes) {
        for (const targetId of node.connections) {
            let incoming = incomingByNodeId.get(targetId);
            if (!incoming) {
                incoming = [];
                incomingByNodeId.set(targetId, incoming);
            }
            incoming.push(node);
        }
    }
    return incomingByNodeId;
}

export class MapGenerator {
    static generateMap(state) {
        state.mapBaseSpawnX = state.canvasBounds.width > 0 ? state.canvasBounds.width / 2 : 225;
        state.mapBaseSpawnY = state.canvasBounds.height > 0 ? state.canvasBounds.height / 2 : 225;

        state.mapNodes = [];
        const numLayers = mapSettings.numLayers;
        const layerSpacing = mapSettings.layerSpacing;
        const xSpacing = mapSettings.xSpacing;
        const nodeJitter = mapSettings.nodeJitter ?? 20;
        const { extraConnectionChance } = mapGenerationSettings;

        let nodeIdCounter = 0;
        let layers = [];

        // Center Node 0 at the origin
        const startNode = {
            id: nodeIdCounter++,
            x: 0,
            y: 0,
            connections: [],
            layer: 0,
        };
        state.mapNodes.push(startNode);
        layers.push([startNode]);

        // Direction vectors for 8 cardinal/ordinal directions
        // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
        const dirVectors = [
            { dx: 0, dy: -1 },  // N
            { dx: 1, dy: -1 },  // NE
            { dx: 1, dy: 0 },   // E
            { dx: 1, dy: 1 },   // SE
            { dx: 0, dy: 1 },   // S
            { dx: -1, dy: 1 },  // SW
            { dx: -1, dy: 0 },  // W
            { dx: -1, dy: -1 }, // NW
        ];

        // Generate concentric rings of nodes
        for (let l = 1; l < numLayers; l++) {
            let layerNodes = [];
            for (let dir = 0; dir < 8; dir++) {
                const vector = dirVectors[dir];
                let jitterX = (Math.random() - 0.5) * nodeJitter * 2;
                let jitterY = (Math.random() - 0.5) * nodeJitter * 2;

                let node = {
                    id: nodeIdCounter++,
                    x: vector.dx * l * xSpacing + jitterX,
                    y: vector.dy * l * layerSpacing + jitterY,
                    connections: [],
                    layer: l,
                };
                layerNodes.push(node);
                state.mapNodes.push(node);
            }
            layers.push(layerNodes);
        }

        // Establish connections
        // Layer 0 (startNode) connects to all 8 nodes in Layer 1
        if (numLayers > 1) {
            for (const nextNode of layers[1]) {
                startNode.connections.push(nextNode.id);
            }
        }

        // Concentric layers connection outward
        for (let l = 1; l < numLayers - 1; l++) {
            const currentLayerNodes = layers[l];
            const nextLayerNodes = layers[l + 1];

            for (let dir = 0; dir < 8; dir++) {
                const node = currentLayerNodes[dir];

                // 1. Always connect to the straight outward neighbor
                const straightTarget = nextLayerNodes[dir];
                node.connections.push(straightTarget.id);

                // 2. Extra connections diagonally left and right
                if (Math.random() < extraConnectionChance) {
                    const leftDir = (dir - 1 + 8) % 8;
                    const leftTarget = nextLayerNodes[leftDir];
                    node.connections.push(leftTarget.id);
                }

                if (Math.random() < extraConnectionChance) {
                    const rightDir = (dir + 1) % 8;
                    const rightTarget = nextLayerNodes[rightDir];
                    node.connections.push(rightTarget.id);
                }
            }
        }

        state.rebuildMapNodeIndex();

        // 1. Calculate CA bounds from node coordinates
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const node of state.mapNodes) {
            const coords = state.getNodeCombatCoords(node);
            minX = Math.min(minX, coords.x);
            maxX = Math.max(maxX, coords.x);
            minY = Math.min(minY, coords.y);
            maxY = Math.max(maxY, coords.y);
        }
        const margin = 800;
        const cellSize = gridSettings.cellSize;
        const caMinX = Math.floor((minX - margin) / cellSize) * cellSize;
        const caMinY = Math.floor((minY - margin) / cellSize) * cellSize;
        const caMaxX = Math.ceil((maxX + margin) / cellSize) * cellSize;
        const caMaxY = Math.ceil((maxY + margin) / cellSize) * cellSize;
        const cols = (caMaxX - caMinX) / cellSize;
        const rows = (caMaxY - caMinY) / cellSize;

        // Seed CA grid randomly
        let grid = new Uint8Array(cols * rows);
        for (let i = 0; i < grid.length; i++) {
            if (Math.random() < 0.45) {
                grid[i] = 1;
            }
        }

        // Run 3 iterations of Cellular Automata cave rules
        let nextGrid = new Uint8Array(cols * rows);
        for (let iter = 0; iter < 3; iter++) {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let wallsCount = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                if (grid[nr * cols + nc] === 1) wallsCount++;
                            } else {
                                wallsCount++; // Borders are solid
                            }
                        }
                    }
                    nextGrid[r * cols + c] = wallsCount >= 5 ? 1 : 0;
                }
            }
            let temp = grid;
            grid = nextGrid;
            nextGrid = temp;
        }

        const caWalls = [];
        state.walls = [];
        state.wallSpatialIndex.clear();

        const nodeCoords = state.mapNodes.map(node => state.getNodeCombatCoords(node));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    const wx = caMinX + c * cellSize + cellSize / 2;
                    const wy = caMinY + r * cellSize + cellSize / 2;

                    let inRoomZone = false;
                    for (let i = 0; i < nodeCoords.length; i++) {
                        const distSq = (wx - nodeCoords[i].x) ** 2 + (wy - nodeCoords[i].y) ** 2;
                        if (distSq < 548 * 548) {
                            inRoomZone = true;
                            break;
                        }
                    }

                    if (!inRoomZone) {
                        const segment = new Segment(wx, wy, 0, cellSize, 0);
                        caWalls.push(segment);
                        state.walls.push(segment);
                        state.wallSpatialIndex.insert(segment);
                    }
                }
            }
        }

        MapGenerator.pregenerateAllCombatData(state);

        // Clear and rebuild final walls combining Room walls and CA walls
        state.walls = [];
        state.wallSpatialIndex.clear();
        for (const node of state.mapNodes) {
            if (node.wallsData) {
                for (const w of node.wallsData) {
                    const segment = new Segment(w.x, w.y, w.angle, w.size, w.padding ?? 0, w.maxHealth, w.maxHealth, false, w.wallHeight);
                    state.walls.push(segment);
                    state.wallSpatialIndex.insert(segment);
                }
            }
        }

        for (const seg of caWalls) {
            state.walls.push(seg);
            state.wallSpatialIndex.insert(seg);
        }



        state.obstacleGrid.rebuild(state.walls);
        const startCoords = state.getNodeCombatCoords(state.getMapNode(0));
        state.hierarchicalNavigator.initialize(startCoords.x, startCoords.y);
        buildMapRenderCaches(state);
        state.worldSurfaceSeed = (Math.random() * 0x7fffffff) | 0;
        state.worldSurfaces.clear();
        syncSurfaceProfile(state);
    }

    static pregenerateAllCombatData(state) {
        const { tempObstacleGrid, tempFlowFieldGrid } = getTempGrids();
        const incomingByNodeId = buildIncomingNodesMap(state.mapNodes);

        const startNode = state.getMapNode(0);
        if (startNode) {
            const coords = state.getNodeCombatCoords(startNode);

            tempFlowFieldGrid.centerX = coords.x;
            tempFlowFieldGrid.centerY = coords.y;
            const mockState = {
                walls: [],
                obstacleGrid: tempObstacleGrid,
                flowFieldGrid: tempFlowFieldGrid,
            };

            StartBuildingStrategy.generate(mockState, coords.x, coords.y);

            startNode.wallsData = serializeWalls(mockState.walls, coords.x, coords.y, 480);
            startNode.strategy = "StartBuilding";
            startNode.surfaceProfileId = resolveSurfaceProfileId({ layer: 0, strategy: "StartBuildingStrategy" });
        }

        const numLayers = mapSettings.numLayers;
        for (let l = 1; l < numLayers; l++) {
            const layerNodes = state.mapNodes.filter(n => n.layer === l);
            for (const nodeB of layerNodes) {
                const incomingNodes = incomingByNodeId.get(nodeB.id) || [];

                let attempts = 0;
                let success = false;
                let chosenWalls = [];
                let chosenStrategy = null;

                while (!success && attempts < 50) {
                    attempts++;
                    const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
                    const coordsB = state.getNodeCombatCoords(nodeB);

                    tempFlowFieldGrid.centerX = coordsB.x;
                    tempFlowFieldGrid.centerY = coordsB.y;
                    const mockState = {
                        walls: [],
                        obstacleGrid: tempObstacleGrid,
                        flowFieldGrid: tempFlowFieldGrid,
                    };

                    GeneratorStrategies[strategy].generate(mockState, coordsB.x, coordsB.y);

                    let allPathable = true;
                    for (const nodeA of incomingNodes) {
                        if (!MapGenerator.checkPathability(state, nodeA, nodeB, nodeA.wallsData || [], mockState.walls, tempObstacleGrid, tempFlowFieldGrid)) {
                            allPathable = false;
                            break;
                        }
                    }

                    if (allPathable) {
                        chosenWalls = serializeWalls(mockState.walls, coordsB.x, coordsB.y, 480);
                        chosenStrategy = strategy;
                        success = true;
                    }
                }

                if (!success) {
                    chosenWalls = [];
                    chosenStrategy = "None";
                }

                nodeB.wallsData = chosenWalls;
                nodeB.strategy = chosenStrategy;
                nodeB.surfaceProfileId =
                    chosenStrategy === "None"
                        ? resolveSurfaceProfileId({ layer: 0 })
                        : resolveSurfaceProfileId({ layer: l, strategy: chosenStrategy });
            }
        }
    }

    static checkPathability(state, nodeA, nodeB, wallsA, wallsB, tempObstacleGrid, tempFlowFieldGrid) {
        const coordsA = state.getNodeCombatCoords(nodeA);
        const coordsB = state.getNodeCombatCoords(nodeB);
        const mx = (coordsA.x + coordsB.x) / 2;
        const my = (coordsA.y + coordsB.y) / 2;

        tempFlowFieldGrid.centerX = mx;
        tempFlowFieldGrid.centerY = my;

        tempObstacleGrid.rebuildFixed(mx, my, gridSettings.width, gridSettings.height);

        // Mark existing local walls (Cellular Automata cave walls)
        const localWalls = state.wallSpatialIndex.collectInBounds(
            mx - gridSettings.width / 2,
            my - gridSettings.height / 2,
            mx + gridSettings.width / 2,
            my + gridSettings.height / 2
        );
        for (let i = 0; i < localWalls.length; i++) {
            tempObstacleGrid.markWall(localWalls[i]);
        }

        for (let i = 0; i < wallsA.length; i++) {
            tempObstacleGrid.markWall(wallsA[i]);
        }
        for (let i = 0; i < wallsB.length; i++) {
            tempObstacleGrid.markWall(wallsB[i]);
        }

        tempFlowFieldGrid.syncLocalObstacles();
        return tempFlowFieldGrid.checkReachability(coordsA.x, coordsA.y, coordsB.x, coordsB.y);
    }


}
