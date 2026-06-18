import { createSpatialCellMemory } from "./spatialCellMemory.js";
export function createBrain({ spatialMemoryCapacity = 64 } = {}) {
    const spatial = createSpatialCellMemory({ capacity: spatialMemoryCapacity });
    return {
        spatial,
        stampSeenCells(cells) {
            spatial.stampCells(cells);
        },
        stampArrival(col, row) {
            spatial.stamp(col, row);
        },
        clearMemory() {
            spatial.clear();
        },
    };
}
