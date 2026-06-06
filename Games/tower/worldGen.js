import { createRoguelikeMapWorldGenPort } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { StartGameBuildingStrategy, getStartGameLayout } from "./tutorial/StartGameBuilding.js";
import { TOWER_MAP_TOPOLOGY } from "./mapTopology.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const towerWorldGen = createRoguelikeMapWorldGenPort(TOWER_MAP_TOPOLOGY, {
    startMapNodeId: 0,
    startNodeStrategyKey: "StartGameBuildingStrategy",
    startNodeStrategyLabel: "StartGameBuilding",
    strategies: { StartGameBuildingStrategy },
    getStartLayout(px, py, cellSize) {
        return getStartGameLayout(px, py, cellSize);
    },
});
