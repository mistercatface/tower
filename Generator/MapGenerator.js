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
            nodesPerLayerMin,
            nodesPerLayerMax,
            wavesTotalMin,
            wavesTotalMax,
            extraConnectionChance,
        } = mapGenerationSettings;

        let nodeIdCounter = 0;
        let layers = [];

        state.mapNodes.push({ id: nodeIdCounter++, x: 0, y: 0, connections: [], completed: false, wavesTotal: startNodeWaves, reward: null, type: "combat", layer: 0 });
        layers.push([state.mapNodes[0]]);

        for (let l = 1; l < numLayers; l++) {
            let layerNodes = [];
            let numNodesInLayer = Math.floor(Math.random() * (nodesPerLayerMax - nodesPerLayerMin + 1)) + nodesPerLayerMin;
            let startX = -((numNodesInLayer - 1) * xSpacing) / 2;

            for (let i = 0; i < numNodesInLayer; i++) {
                let jitterX = (Math.random() - 0.5) * nodeJitter * 2;
                let jitterY = (Math.random() - 0.5) * nodeJitter * 2;

                let type = "combat";
                let reward = { type: "random_permanent_upgrade" };

                let node = {
                    id: nodeIdCounter++,
                    x: startX + i * xSpacing + jitterX,
                    y: -l * layerSpacing + jitterY,
                    connections: [],
                    completed: false,
                    wavesTotal: Math.floor(Math.random() * (wavesTotalMax - wavesTotalMin + 1)) + wavesTotalMin,
                    reward: reward,
                    type: type,
                    layer: l,
                };
                layerNodes.push(node);
                state.mapNodes.push(node);
            }
            layers.push(layerNodes);
        }

        for (let l = 0; l < numLayers - 1; l++) {
            let currentLayer = layers[l];
            let nextLayer = layers[l + 1];

            currentLayer.forEach((node, i) => {
                let targetIndex = Math.floor((i / currentLayer.length) * nextLayer.length);
                node.connections.push(nextLayer[targetIndex].id);
            });

            nextLayer.forEach((nextNode, j) => {
                let hasIncoming = currentLayer.some((n) => n.connections.includes(nextNode.id));
                if (!hasIncoming) {
                    let closestNode = currentLayer[Math.floor((j / nextLayer.length) * currentLayer.length)];
                    if (!closestNode.connections.includes(nextNode.id)) {
                        closestNode.connections.push(nextNode.id);
                    }
                }
            });

            currentLayer.forEach((node, i) => {
                if (Math.random() < extraConnectionChance) {
                    let targetIndex = Math.floor((i / currentLayer.length) * nextLayer.length);
                    let altTarget = targetIndex + (Math.random() < 0.5 ? 1 : -1);
                    if (altTarget >= 0 && altTarget < nextLayer.length) {
                        if (!node.connections.includes(nextLayer[altTarget].id)) {
                            node.connections.push(nextLayer[altTarget].id);
                        }
                    }
                }
            });
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
}
