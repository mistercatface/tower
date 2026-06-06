import { gridSettings } from "../../Config/Config.js";
import { buildPoolStartLayout } from "./config/tableLayout.js";
import { generatePoolWorld } from "./generatePoolWorld.js";
import { PoolTableStrategy } from "./PoolTableStrategy.js";
/** @type {import("../../Core/GameDefinitionTypes.js").WorldGenPort} */
export const poolWorldGen = {
    generateWorld: generatePoolWorld,
    getPlayBounds(state) {
        const mapNode = state.getStartMapNode?.();
        if (!mapNode) return null;
        const coords = state.getNodeWorldCoords(mapNode);
        const layout = buildPoolStartLayout(coords.x, coords.y, gridSettings.cellSize);
        const pad = 8;
        return { minX: layout.minX - pad, minY: layout.minY - pad, maxX: layout.maxX + pad, maxY: layout.maxY + pad };
    },
    startMapNodeId: 0,
    skipStartPickups: true,
    strategies: { PoolTableStrategy },
    getStartLayout(px, py, cellSize) {
        return buildPoolStartLayout(px, py, cellSize);
    },
};
