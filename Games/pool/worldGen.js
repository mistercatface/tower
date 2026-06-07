import { createSingleArenaWorldGenPort } from "../../Libraries/WorldGen/presets/singleArena.js";
import { buildPoolStartLayout, getPoolLayout } from "./config/tableLayout.js";
import { generatePoolTable, PoolTableStrategy } from "./PoolTableStrategy.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const poolWorldGen = createSingleArenaWorldGenPort({
    generateArena: generatePoolTable,
    resolveFocus(state) {
        const layout = getPoolLayout(state);
        return { centerX: layout.tableCenterX, centerY: layout.tableCenterY };
    },
    getPlayBounds(state) {
        const { minX, minY, maxX, maxY } = getPoolLayout(state);
        return { minX, minY, maxX, maxY };
    },
    getStartLayout: buildPoolStartLayout,
    skipStartPickups: true,
    strategies: { PoolTableStrategy },
});
