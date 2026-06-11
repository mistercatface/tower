import { Segment } from "../../Entities/Wall.js";
import { engine } from "../../Apps/Editor/engine.js";
import { BaseGeneratorStrategies } from "../../Generator/GeneratorStrategies.js";
import { gridSettings } from "../../Config/Config.js";
import { resolveSurfaceProfileId } from "../../Config/procedural/profiles.js";
import { fillRandomGrid, runCellularAutomata } from "../CA/index.js";
import { finalizeGeneratedWorld } from "./finalizeGeneratedWorld.js";
import { beginWorldGenRuntime } from "./WorldGenRuntime.js";
import { buildIncomingNodesMap, checkNodePathability, getWorldGenTempGrids, serializeWalls } from "./worldGenUtils.js";
/**
 * @typedef {object} WorldGenContext
 * @property {object} state
 * @property {import("./WorldGenRuntime.js").WorldGenRuntime} runtime
 */
/** @typedef {{ run: (ctx: WorldGenContext) => void }} WorldGenPhase */
/** @param {object} state */
function defaultWorldFocus(state) {
    const startNode = state.getMapNode?.(0);
    const coords = startNode ? state.getNodeWorldCoords(startNode) : state.getMapSpawnOrigin();
    return { centerX: coords.x, centerY: coords.y };
}
/** @type {WorldGenPhase} */
export const initMapSpawnPhase = {
    run(ctx) {
        const { state } = ctx;
        state.mapBaseSpawnX = state.viewport.width / 2;
        state.mapBaseSpawnY = state.viewport.height / 2;
    },
};
/** @type {WorldGenPhase} */
export const singleNodeGraphPhase = {
    run(ctx) {
        const { state } = ctx;
        state.mapNodes = [{ id: 0, x: 0, y: 0, connections: [], layer: 0 }];
        state.rebuildMapNodeIndex();
        state.currentNodeId = 0;
    },
};
/**
 * @param {import("./topology.js").RoguelikeMapTopology} [topology]
 * @returns {WorldGenPhase}
 */
/** @param {import("./topology.js").RoguelikeMapTopology} topology */
export function buildRoguelikeMapGraphPhase(topology) {
    return {
        run(ctx) {
            const { state, runtime } = ctx;
            state.mapNodes = [];
            const { numLayers, layerSpacing, xSpacing, nodeJitter, extraConnectionChance } = topology;
            let nodeIdCounter = 0;
            const layers = [];
            const startNode = { id: nodeIdCounter++, x: 0, y: 0, connections: [], layer: 0 };
            state.mapNodes.push(startNode);
            layers.push([startNode]);
            const dirVectors = [
                { dx: 0, dy: -1 },
                { dx: 1, dy: -1 },
                { dx: 1, dy: 0 },
                { dx: 1, dy: 1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 1 },
                { dx: -1, dy: 0 },
                { dx: -1, dy: -1 },
            ];
            for (let l = 1; l < numLayers; l++) {
                const layerNodes = [];
                for (let dir = 0; dir < 8; dir++) {
                    const vector = dirVectors[dir];
                    const jitterX = (Math.random() - 0.5) * nodeJitter * 2;
                    const jitterY = (Math.random() - 0.5) * nodeJitter * 2;
                    const node = { id: nodeIdCounter++, x: vector.dx * l * xSpacing + jitterX, y: vector.dy * l * layerSpacing + jitterY, connections: [], layer: l };
                    layerNodes.push(node);
                    state.mapNodes.push(node);
                }
                layers.push(layerNodes);
            }
            if (numLayers > 1) for (const nextNode of layers[1]) startNode.connections.push(nextNode.id);
            for (let l = 1; l < numLayers - 1; l++) {
                const currentLayerNodes = layers[l];
                const nextLayerNodes = layers[l + 1];
                for (let dir = 0; dir < 8; dir++) {
                    const node = currentLayerNodes[dir];
                    node.connections.push(nextLayerNodes[dir].id);
                    if (Math.random() < extraConnectionChance) {
                        const leftDir = (dir - 1 + 8) % 8;
                        node.connections.push(nextLayerNodes[leftDir].id);
                    }
                    if (Math.random() < extraConnectionChance) {
                        const rightDir = (dir + 1) % 8;
                        node.connections.push(nextLayerNodes[rightDir].id);
                    }
                }
            }
            state.rebuildMapNodeIndex();
            runtime.layers = layers;
        },
    };
}
/**
 * @param {import("./topology.js").RoguelikeMapTopology} [topology]
 * @returns {WorldGenPhase}
 */
/** @param {import("./topology.js").RoguelikeMapTopology} topology */
export function buildCellularBackdropPhase(topology) {
    return {
        run(ctx) {
            const { state, runtime } = ctx;
            const { backdropMargin, roomZoneRadius, caFillChance, caIterations } = topology;
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (const node of state.mapNodes) {
                const coords = state.getNodeWorldCoords(node);
                minX = Math.min(minX, coords.x);
                maxX = Math.max(maxX, coords.x);
                minY = Math.min(minY, coords.y);
                maxY = Math.max(maxY, coords.y);
            }
            const cellSize = gridSettings.cellSize;
            const caMinX = Math.floor((minX - backdropMargin) / cellSize) * cellSize;
            const caMinY = Math.floor((minY - backdropMargin) / cellSize) * cellSize;
            const caMaxX = Math.ceil((maxX + backdropMargin) / cellSize) * cellSize;
            const caMaxY = Math.ceil((maxY + backdropMargin) / cellSize) * cellSize;
            const cols = (caMaxX - caMinX) / cellSize;
            const rows = (caMaxY - caMinY) / cellSize;
            let grid = fillRandomGrid(cols, rows, caFillChance);
            grid = runCellularAutomata(cols, rows, grid, { iterations: caIterations, scratch: new Uint8Array(cols * rows) });
            const roomZoneRadiusSq = roomZoneRadius * roomZoneRadius;
            const nodeCoords = state.mapNodes.map((node) => state.getNodeWorldCoords(node));
            const caWalls = [];
            state.walls = [];
            state.wallSpatialIndex.clear();
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++) {
                    if (grid[r * cols + c] !== 1) continue;
                    const wx = caMinX + c * cellSize + cellSize / 2;
                    const wy = caMinY + r * cellSize + cellSize / 2;
                    let inRoomZone = false;
                    for (let i = 0; i < nodeCoords.length; i++) {
                        const distSq = (wx - nodeCoords[i].x) ** 2 + (wy - nodeCoords[i].y) ** 2;
                        if (distSq < roomZoneRadiusSq) {
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
            runtime.caWalls = caWalls;
        },
    };
}
/**
 * @param {import("./topology.js").RoguelikeMapTopology} [topology]
 * @returns {WorldGenPhase}
 */
/** @param {import("./topology.js").RoguelikeMapTopology} topology */
export function pregenerateRoguelikeNodeRoomsPhase(topology) {
    return {
        run(ctx) {
            const { state } = ctx;
            const { tempObstacleGrid, tempFlowFieldGrid } = getWorldGenTempGrids();
            const incomingByNodeId = buildIncomingNodesMap(state.mapNodes);
            const strategies = { ...BaseGeneratorStrategies, ...engine.worldGen.strategies };
            const strategyKeys = Object.keys(BaseGeneratorStrategies);
            const serializeRadius = topology.nodeRoomSerializeRadius;
            const { numLayers } = topology;
            for (let l = 0; l < numLayers; l++) {
                const layerNodes = state.mapNodes.filter((n) => n.layer === l);
                for (const nodeB of layerNodes) {
                    const incomingNodes = incomingByNodeId.get(nodeB.id) || [];
                    let attempts = 0;
                    let success = false;
                    let chosenWalls = [];
                    let chosenStrategy = null;
                    while (!success && attempts < 50) {
                        attempts++;
                        const strategy = strategyKeys[Math.floor(Math.random() * strategyKeys.length)];
                        const coordsB = state.getNodeWorldCoords(nodeB);
                        tempFlowFieldGrid.centerX = coordsB.x;
                        tempFlowFieldGrid.centerY = coordsB.y;
                        const mockState = { walls: [], obstacleGrid: tempObstacleGrid, flowFieldGrid: tempFlowFieldGrid };
                        strategies[strategy].generate(mockState, coordsB.x, coordsB.y);
                        let allPathable = true;
                        for (const nodeA of incomingNodes)
                            if (!checkNodePathability(state, nodeA, nodeB, nodeA.wallsData || [], mockState.walls, tempObstacleGrid, tempFlowFieldGrid)) {
                                allPathable = false;
                                break;
                            }
                        if (allPathable) {
                            chosenWalls = serializeWalls(mockState.walls, coordsB.x, coordsB.y, serializeRadius);
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
                    nodeB.surfaceProfileId = chosenStrategy === "None" ? resolveSurfaceProfileId({ layer: 0 }) : resolveSurfaceProfileId({ layer: l, strategy: chosenStrategy });
                }
            }
        },
    };
}
/** @type {WorldGenPhase} */
export const assembleRoguelikeWallsPhase = {
    run(ctx) {
        const { state, runtime } = ctx;
        state.walls = [];
        state.wallSpatialIndex.clear();
        for (const node of state.mapNodes) {
            if (!node.wallsData) continue;
            for (const w of node.wallsData) {
                const segment = new Segment(w.x, w.y, w.angle, w.size, w.padding ?? 0, w.maxHealth, w.maxHealth, false, w.wallHeight);
                state.walls.push(segment);
                state.wallSpatialIndex.insert(segment);
            }
        }
        for (const seg of runtime.caWalls) {
            state.walls.push(seg);
            state.wallSpatialIndex.insert(seg);
        }
    },
};
/**
 * Build walls from a game-specific arena generator (pool table, yard, etc.).
 *
 * @param {(state: object, px: number, py: number) => void} generateArena
 * @param {{ onNodeReady?: (state: object) => void, resolveFocus?: (state: object, origin: { x: number, y: number }) => { centerX: number, centerY: number } }} [hooks]
 * @returns {WorldGenPhase}
 */
export function createArenaPhase(generateArena, hooks = {}) {
    return {
        run(ctx) {
            const { state, runtime } = ctx;
            state.walls = [];
            state.wallSpatialIndex.clear();
            const origin = state.getMapSpawnOrigin();
            generateArena(state, origin.x, origin.y);
            for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
            hooks.onNodeReady?.(state);
            const focus = hooks.resolveFocus?.(state, origin) ?? defaultWorldFocus(state);
            runtime.worldFocus = { centerX: focus.centerX, centerY: focus.centerY };
        },
    };
}
/** @type {WorldGenPhase} */
export const finalizeWorldPhase = {
    run(ctx) {
        const { state, runtime } = ctx;
        const focus = runtime.worldFocus ?? defaultWorldFocus(state);
        finalizeGeneratedWorld(state, { centerX: focus.centerX, centerY: focus.centerY, gridBounds: null });
    },
};
/** @param {object} state @returns {WorldGenContext} */
export function createWorldGenContext(state) {
    return { state, runtime: beginWorldGenRuntime() };
}
