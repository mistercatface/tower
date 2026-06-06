import { gridSettings } from "../../Config/Config.js";
import { createSingleArenaWorldGenPort } from "../../Libraries/WorldGen/presets/singleArena.js";
import { buildPoolStartLayout } from "./config/tableLayout.js";
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
    resolveFocus(state, origin) {
        const layout = buildPoolStartLayout(origin.x, origin.y, gridSettings.cellSize);
        return { centerX: layout.tableCenterX, centerY: layout.tableCenterY };
    },
    getPlayBounds(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const coords = state.getNodeWorldCoords(mapNode);
        const layout = buildPoolStartLayout(coords.x, coords.y, gridSettings.cellSize);
        const pad = 8;
        return { minX: layout.minX - pad, minY: layout.minY - pad, maxX: layout.maxX + pad, maxY: layout.maxY + pad };
    },
    getStartLayout(px, py, cellSize) {
        return buildPoolStartLayout(px, py, cellSize);
    },
    skipStartPickups: true,
    strategies: { PoolTableStrategy },
});
