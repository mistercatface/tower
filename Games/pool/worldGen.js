import { buildPoolStartLayout } from "./config/tableLayout.js";
import { PoolTableStrategy } from "./PoolTableStrategy.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const poolWorldGen = {
    startMapNodeId: 0,
    startNodeStrategyKey: "PoolTableStrategy",
    startNodeStrategyLabel: "PoolTable",
    skipStartPickups: true,
    strategies: { PoolTableStrategy },
    getStartLayout(px, py, cellSize) {
        return buildPoolStartLayout(px, py, cellSize);
    },
};
