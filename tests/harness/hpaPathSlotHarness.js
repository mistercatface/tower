import { worldIdxAtCell } from "./testGridUtils.js";

export function mockHpaPathWorker(path, grid) {
    return {
        pathIdx(_slot, i) {
            return worldIdxAtCell(grid, path[i].col, path[i].row);
        },
    };
}
