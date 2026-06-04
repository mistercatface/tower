import { Segment } from "../Entities/Wall.js";
import { GeneratorStrategies } from "./GeneratorStrategies.js";
import { StartBuildingStrategy } from "./StartNodeBuilding.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { FlowFieldGrid } from "../Spatial/Navigation/FlowFieldGrid.js";
import { mapSettings, gridSettings, THEME_COLORS, mapGenerationSettings } from "../Config/Config.js";
import { resolveFloorTextureProfileId } from "../Config/floorProceduralConfig.js";
import { syncFloorTextureProfile } from "../Render/Floor/floorTextureProfile.js";

const STRATEGIES = Object.keys(GeneratorStrategies);

let tempObstacleGrid = null;
let tempFlowFieldGrid = null;

function getTempGrids() {
    if (!tempObstacleGrid) {
        tempObstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        tempFlowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, tempObstacleGrid);
    }
    return { tempObstacleGrid, tempFlowFieldGrid };
}

function serializeWalls(walls) {
    const out = new Array(walls.length);
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        out[i] = {
            x: w.x,
            y: w.y,
            angle: w.angle,
            size: w.size,
            padding: w.padding,
            maxHealth: w.maxHealth || 30,
        };
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
        const {
            startNodeWaves,
            wavesTotalMin,
            wavesTotalMax,
            extraConnectionChance,
        } = mapGenerationSettings;

        let nodeIdCounter = 0;
        let layers = [];

        // Center Node 0 at the origin
        const startNode = {
            id: nodeIdCounter++,
            x: 0,
            y: 0,
            connections: [],
            completed: false,
            wavesTotal: startNodeWaves,
            reward: null,
            type: "combat",
            layer: 0,
            dir: -1,
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
                    completed: false,
                    wavesTotal: Math.floor(Math.random() * (wavesTotalMax - wavesTotalMin + 1)) + wavesTotalMin,
                    reward: { type: "random_permanent_upgrade" },
                    type: "combat",
                    layer: l,
                    dir: dir,
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

        state.currentNodeId = 0;
        state.mapPlayerX = 0;
        state.mapPlayerY = 0;

        state.rebuildMapNodeIndex();

        MapGenerator.pregenerateAllCombatData(state);

        state.walls = [];
        state.wallSpatialHash.clear();
        for (const node of state.mapNodes) {
            if (node.wallsData) {
                for (const w of node.wallsData) {
                    const segment = new Segment(w.x, w.y, w.angle, w.size, w.padding ?? 0, w.maxHealth);
                    segment.theme = node.wallTheme || THEME_COLORS[0];
                    state.walls.push(segment);
                    state.wallSpatialHash.insert(segment);
                }
            }
        }

        const connectionPairs = new Set();
        for (const nodeA of state.mapNodes) {
            for (const targetId of nodeA.connections) {
                const nodeB = state.getMapNode(targetId);
                if (!nodeB) continue;
                
                const key = nodeA.id < nodeB.id ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
                if (connectionPairs.has(key)) continue;
                connectionPairs.add(key);
                
                const coordsA = state.getNodeCombatCoords(nodeA);
                const coordsB = state.getNodeCombatCoords(nodeB);
                
                MapGenerator.generateCorridor(state, coordsA.x, coordsA.y, coordsB.x, coordsB.y, nodeA.wallTheme || THEME_COLORS[0]);
            }
        }

        state.obstacleGrid.rebuild(state.walls);
        state.hierarchicalNavigator.initialize();
        state.floorTileSeed = (Math.random() * 0x7fffffff) | 0;
        state.floorTiles.clear();
        syncFloorTextureProfile(state);
    }

    static pregenerateAllCombatData(state) {
        const { tempObstacleGrid, tempFlowFieldGrid } = getTempGrids();
        const incomingByNodeId = buildIncomingNodesMap(state.mapNodes);

        const startNode = state.getMapNode(0);
        if (startNode) {
            const theme = THEME_COLORS[0];
            const coords = state.getNodeCombatCoords(startNode);

            tempFlowFieldGrid.centerX = coords.x;
            tempFlowFieldGrid.centerY = coords.y;
            const mockState = {
                walls: [],
                obstacleGrid: tempObstacleGrid,
                flowFieldGrid: tempFlowFieldGrid,
                waveManager: state.waveManager,
            };

            StartBuildingStrategy.generate(mockState, coords.x, coords.y);

            startNode.wallsData = serializeWalls(mockState.walls);
            startNode.wallTheme = theme;
            startNode.strategy = "StartBuilding";
            startNode.floorTextureProfileId = resolveFloorTextureProfileId({ layer: 0, strategy: "StartBuildingStrategy" });
        }

        const numLayers = mapSettings.numLayers;
        for (let l = 1; l < numLayers; l++) {
            const layerNodes = state.mapNodes.filter(n => n.layer === l);
            for (const nodeB of layerNodes) {
                const incomingNodes = incomingByNodeId.get(nodeB.id) || [];

                let attempts = 0;
                let success = false;
                let chosenWalls = [];
                let chosenTheme = null;
                let chosenStrategy = null;

                while (!success && attempts < 50) {
                    attempts++;
                    const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
                    const theme = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)];
                    const coordsB = state.getNodeCombatCoords(nodeB);

                    tempFlowFieldGrid.centerX = coordsB.x;
                    tempFlowFieldGrid.centerY = coordsB.y;
                    const mockState = {
                        walls: [],
                        obstacleGrid: tempObstacleGrid,
                        flowFieldGrid: tempFlowFieldGrid,
                        waveManager: state.waveManager
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
                        chosenWalls = serializeWalls(mockState.walls);
                        chosenTheme = theme;
                        chosenStrategy = strategy;
                        success = true;
                    }
                }

                if (!success) {
                    chosenWalls = [];
                    chosenTheme = THEME_COLORS[0];
                    chosenStrategy = "None";
                }

                nodeB.wallsData = chosenWalls;
                nodeB.wallTheme = chosenTheme;
                nodeB.strategy = chosenStrategy;
                nodeB.floorTextureProfileId =
                    chosenStrategy === "None"
                        ? resolveFloorTextureProfileId({ layer: 0 })
                        : resolveFloorTextureProfileId({ layer: l, strategy: chosenStrategy });
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
        for (let i = 0; i < wallsA.length; i++) {
            tempObstacleGrid.markWall(wallsA[i]);
        }
        for (let i = 0; i < wallsB.length; i++) {
            tempObstacleGrid.markWall(wallsB[i]);
        }

        tempFlowFieldGrid.syncLocalObstacles();
        return tempFlowFieldGrid.checkReachability(coordsA.x, coordsA.y, coordsB.x, coordsB.y);
    }

    static generateCorridor(state, x1, y1, x2, y2, theme) {
        const cellSize = gridSettings.cellSize;
        const halfWidth = 80;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        
        const stepSize = cellSize;
        const numSteps = Math.floor(dist / stepSize);
        
        for (let i = 0; i <= numSteps; i++) {
            const t = i / numSteps;
            const cx = x1 + (x2 - x1) * t;
            const cy = y1 + (y2 - y1) * t;
            
            const distToA = Math.hypot(cx - x1, cy - y1);
            const distToB = Math.hypot(cx - x2, cy - y2);
            if (distToA > 480 && distToB > 480) {
                const lx = cx + nx * halfWidth;
                const ly = cy + ny * halfWidth;
                const leftSeg = new Segment(lx, ly, angle, cellSize, 0);
                leftSeg.theme = theme;
                state.walls.push(leftSeg);
                state.wallSpatialHash.insert(leftSeg);
                
                const rx = cx - nx * halfWidth;
                const ry = cy - ny * halfWidth;
                const rightSeg = new Segment(rx, ry, angle, cellSize, 0);
                rightSeg.theme = theme;
                state.walls.push(rightSeg);
                state.wallSpatialHash.insert(rightSeg);
            }
        }
    }
}
