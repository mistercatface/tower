import { Segment } from "../Entities/Wall.js";
import { GeneratorStrategies } from "../Generator/GeneratorStrategies.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { FlowFieldGrid } from "../Spatial/Navigation/FlowFieldGrid.js";
import { mapSettings, gridSettings } from "../Config/Config.js";

const THEME_COLORS = [
    { r: 0, g: 188, b: 212 },
    { r: 76, g: 175, b: 80 },
    { r: 255, g: 152, b: 0 },
    { r: 156, g: 39, b: 176 },
    { r: 63, g: 81, b: 181 },
    { r: 244, g: 67, b: 54 },
    { r: 233, g: 30, b: 99 },
    { r: 0, g: 150, b: 136 },
    { r: 205, g: 220, b: 57 },
    { r: 121, g: 85, b: 72 }
];

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
            maxHealth: w.maxHealth || 30
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
    static getNodeCombatCoords(state, node) {
        if (!node) return { x: 0, y: 0 };
        const scale = mapSettings.combatCoordScale;
        const baseSpawnX = state.mapBaseSpawnX !== undefined ? state.mapBaseSpawnX : (state.canvasBounds.width > 0 ? state.canvasBounds.width / 2 : 225);
        const baseSpawnY = state.mapBaseSpawnY !== undefined ? state.mapBaseSpawnY : (state.canvasBounds.height > 0 ? state.canvasBounds.height / 2 : 225);
        return {
            x: baseSpawnX + node.x * scale,
            y: baseSpawnY + node.y * scale
        };
    }

    static generateMap(state) {
        state.mapBaseSpawnX = state.canvasBounds.width > 0 ? state.canvasBounds.width / 2 : 225;
        state.mapBaseSpawnY = state.canvasBounds.height > 0 ? state.canvasBounds.height / 2 : 225;

        state.mapNodes = [];
        const numLayers = mapSettings.numLayers;
        const layerSpacing = mapSettings.layerSpacing;
        const xSpacing = mapSettings.xSpacing;
        const nodeJitter = mapSettings.nodeJitter ?? 20;

        let nodeIdCounter = 0;
        let layers = [];

        state.mapNodes.push({ id: nodeIdCounter++, x: 0, y: 0, connections: [], completed: false, wavesTotal: 1, reward: null, type: "combat", layer: 0 });
        layers.push([state.mapNodes[0]]);

        for (let l = 1; l < numLayers; l++) {
            let layerNodes = [];
            let numNodesInLayer = Math.floor(Math.random() * 3) + 2;
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
                    wavesTotal: Math.floor(Math.random() * 5) + 1,
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
                if (Math.random() < 0.3) {
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

        MapGenerator.pregenerateAllCombatData(state);

        state.walls = [];
        state.walls.spatialHash = state.wallSpatialHash;
        state.wallSpatialHash.clear();
        for (const node of state.mapNodes) {
            if (node.wallsData) {
                for (const w of node.wallsData) {
                    const segment = new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth);
                    segment.theme = node.wallTheme || { r: 0, g: 188, b: 212 };
                    state.walls.push(segment);
                    state.wallSpatialHash.insert(segment);
                }
            }
        }
        state.walls.obstacleGrid = state.obstacleGrid;
        state.obstacleGrid.rebuild(state.walls);
        state.hierarchicalNavigator.initialize();
    }

    static pregenerateAllCombatData(state) {
        const { tempObstacleGrid, tempFlowFieldGrid } = getTempGrids();
        const incomingByNodeId = buildIncomingNodesMap(state.mapNodes);

        const startNode = state.mapNodes.find(n => n.id === 0);
        if (startNode) {
            const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
            const theme = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)];
            const coords = MapGenerator.getNodeCombatCoords(state, startNode);

            tempFlowFieldGrid.centerX = coords.x;
            tempFlowFieldGrid.centerY = coords.y;
            const mockState = {
                walls: [],
                obstacleGrid: tempObstacleGrid,
                flowFieldGrid: tempFlowFieldGrid,
                waveManager: state.waveManager
            };

            GeneratorStrategies[strategy].generate(mockState, coords.x, coords.y);

            startNode.wallsData = serializeWalls(mockState.walls);
            startNode.wallTheme = theme;
            startNode.strategy = strategy;
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
                    const coordsB = MapGenerator.getNodeCombatCoords(state, nodeB);

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
            }
        }
    }

    static checkPathability(state, nodeA, nodeB, wallsA, wallsB, tempObstacleGrid, tempFlowFieldGrid) {
        const coordsA = MapGenerator.getNodeCombatCoords(state, nodeA);
        const coordsB = MapGenerator.getNodeCombatCoords(state, nodeB);
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

        tempFlowFieldGrid.refresh(coordsB.x, coordsB.y);

        const startPos = tempFlowFieldGrid.worldToGrid(coordsA.x, coordsA.y);
        if (startPos.col < 0 || startPos.col >= tempFlowFieldGrid.cols || startPos.row < 0 || startPos.row >= tempFlowFieldGrid.rows) {
            return false;
        }
        const idx = startPos.row * tempFlowFieldGrid.cols + startPos.col;
        return tempFlowFieldGrid.flowFieldDist[idx] < 999999;
    }
}
