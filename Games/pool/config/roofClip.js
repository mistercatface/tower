import { gridSettings } from "../../../Config/Config.js";
import { TABLE_RAIL_CELLS } from "./tableLayout.js";

/**
 * Rail-ring clip regions for roof chunks — excludes the open playfield interior.
 *
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} layout
 * @param {number} [cellSize]
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }[]}
 */
export function buildPoolRailRoofClipRegions(layout, cellSize = gridSettings.cellSize) {
    if (layout?.minX == null) return [];

    const rail = TABLE_RAIL_CELLS * cellSize;
    const { minX, minY, maxX, maxY } = layout;
    const innerMinX = minX + rail;
    const innerMaxX = maxX - rail;
    const innerMinY = minY + rail;
    const innerMaxY = maxY - rail;

    return [
        { minX, minY, maxX, maxY: innerMinY },
        { minX, minY: innerMaxY, maxX, maxY },
        { minX, minY: innerMinY, maxX: innerMinX, maxY: innerMaxY },
        { minX: innerMaxX, minY: innerMinY, maxX, maxY: innerMaxY },
    ];
}
