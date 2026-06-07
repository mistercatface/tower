import { playBoundsFromObstacleGrid } from "../playBounds.js";
import { assembleRoguelikeWallsPhase, buildCellularBackdropPhase, buildRoguelikeMapGraphPhase, finalizeWorldPhase, initMapSpawnPhase, pregenerateRoguelikeNodeRoomsPhase } from "../phases.js";
import { createWorldGenPort } from "../WorldGenPipeline.js";
/** @typedef {import("../topology.js").RoguelikeMapTopology} RoguelikeMapTopology */
/** @typedef {import("../../../Core/GameDefinitionTypes.js").WorldGenPort} WorldGenPort */
export const ROGUELIKE_MAP_TOPOLOGY = /** @type {RoguelikeMapTopology} */ ({
    numLayers: 5,
    layerSpacing: 170,
    xSpacing: 170,
    nodeJitter: 0,
    extraConnectionChance: 0.3,
    backdropMargin: 800,
    roomZoneRadius: 548,
    caFillChance: 0.45,
    caIterations: 3,
    nodeRoomSerializeRadius: 480,
});
/**
 * @param {RoguelikeMapTopology} topology
 * @returns {import("../phases.js").WorldGenPhase[]}
 */
export function buildRoguelikeMapPhases(topology) {
    return [
        initMapSpawnPhase,
        buildRoguelikeMapGraphPhase(topology),
        buildCellularBackdropPhase(topology),
        pregenerateRoguelikeNodeRoomsPhase(topology),
        assembleRoguelikeWallsPhase,
        finalizeWorldPhase,
    ];
}
/**
 * @param {RoguelikeMapTopology} topology
 * @param {Omit<WorldGenPort, "generateWorld" | "getPlayBounds"> & { getPlayBounds?: WorldGenPort["getPlayBounds"] }} portOptions
 * @returns {WorldGenPort}
 */
function createRoguelikeMapWorldGenPort(topology, portOptions) {
    return createWorldGenPort(buildRoguelikeMapPhases(topology), {
        getPlayBounds(state) {
            return playBoundsFromObstacleGrid(state.obstacleGrid);
        },
        ...portOptions,
    });
}
/**
 * @param {number} px
 * @param {number} py
 * @param {number} _cellSize
 */
function nodeCenterStartLayout(px, py, _cellSize) {
    return {
        spawnX: px,
        spawnY: py,
        spawnClearRadius: 48,
        spawnSlots: { center: { x: px, y: py } },
    };
}
/**
 * Roguelike map — graph, rooms, backdrop, obstacle grid, HPA init. All games use this.
 *
 * @param {{ topology?: RoguelikeMapTopology }} [options]
 * @returns {WorldGenPort}
 */
export function createRoguelikeWorldGenPort(options = {}) {
    const { topology = ROGUELIKE_MAP_TOPOLOGY } = options;
    return createRoguelikeMapWorldGenPort(topology, {
        nodeWorldCoordScale: 7.0,
        startMapNodeId: 0,
        getStartLayout: nodeCenterStartLayout,
    });
}
