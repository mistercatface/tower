import { gridSettings } from "../../Config/Config.js";
import { createSingleArenaWorldGenPort } from "../../Libraries/WorldGen/presets/singleArena.js";
import { buildPoolStartLayout, getPoolLayout } from "./config/tableLayout.js";
import { poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { generatePoolTable, PoolTableStrategy } from "./PoolTableStrategy.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const poolWorldGen = createSingleArenaWorldGenPort({
    generateArena: generatePoolTable,
    onNodeReady(state) {
        const startNode = state.getMapNode(0);
        if (startNode) {
            startNode.strategy = "PoolTable";
            startNode.surfaceProfileId = poolSurfaceProfileId;
        }
    },
    resolveFocus(_state, origin) {
        const layout = buildPoolStartLayout(origin.x, origin.y, gridSettings.cellSize);
        return { centerX: layout.tableCenterX, centerY: layout.tableCenterY };
    },
    getObstacleGridBounds(state) {
        const layout = getPoolLayout(state);
        return { centerX: layout.tableCenterX, centerY: layout.tableCenterY, width: layout.tableWidth, height: layout.tableHeight };
    },
    getPlayBounds(state) {
        const layout = getPoolLayout(state);
        return { minX: layout.minX, minY: layout.minY, maxX: layout.maxX, maxY: layout.maxY };
    },
    getStartLayout(px, py, cellSize) {
        return buildPoolStartLayout(px, py, cellSize);
    },
    skipStartPickups: true,
    strategies: { PoolTableStrategy },
});
