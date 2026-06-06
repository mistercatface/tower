import { MapGenerator } from "../../Generator/MapGenerator.js";
import { playBoundsFromObstacleGrid } from "../../Libraries/WorldGen/playBounds.js";
import { StartGameBuildingStrategy, getStartGameLayout } from "./tutorial/StartGameBuilding.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const towerWorldGen = {
    generateWorld(state) {
        MapGenerator.generateMap(state);
    },
    getPlayBounds(state) {
        return playBoundsFromObstacleGrid(state.obstacleGrid);
    },
    startMapNodeId: 0,
    startNodeStrategyKey: "StartGameBuildingStrategy",
    startNodeStrategyLabel: "StartGameBuilding",
    strategies: { StartGameBuildingStrategy },
    getStartLayout(px, py, cellSize) {
        return getStartGameLayout(px, py, cellSize);
    },
};
