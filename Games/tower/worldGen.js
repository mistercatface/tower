import { StartGameBuildingStrategy, getStartGameLayout } from "./tutorial/StartGameBuilding.js";

/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const towerWorldGen = {
    startMapNodeId: 0,
    startNodeStrategyKey: "StartGameBuildingStrategy",
    startNodeStrategyLabel: "StartGameBuilding",

    strategies: {
        StartGameBuildingStrategy,
    },

    getStartLayout(px, py, cellSize) {
        return getStartGameLayout(px, py, cellSize);
    },
};
