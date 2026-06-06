import { playBoundsFromObstacleGrid } from "../playBounds.js";
import { assembleRoguelikeWallsPhase, buildCellularBackdropPhase, buildRoguelikeMapGraphPhase, finalizeWorldPhase, initMapSpawnPhase, pregenerateRoguelikeNodeRoomsPhase } from "../phases.js";
import { createWorldGenPort } from "../WorldGenPipeline.js";
/** @typedef {import("../topology.js").RoguelikeMapTopology} RoguelikeMapTopology */
/** @typedef {import("../../../Core/GameDefinitionTypes.js").WorldGenPort} WorldGenPort */
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
export function createRoguelikeMapWorldGenPort(topology, portOptions) {
    return createWorldGenPort(buildRoguelikeMapPhases(topology), {
        getPlayBounds(state) {
            return playBoundsFromObstacleGrid(state.obstacleGrid);
        },
        ...portOptions,
    });
}
