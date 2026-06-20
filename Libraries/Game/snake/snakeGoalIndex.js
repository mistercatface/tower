import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { colRowToIndex, cellInRect } from "../../Spatial/grid/GridUtils.js";
import { visitLiveWorldProps } from "../../../GameState/EntityRegistry.js";
/** @typedef {{ id: number, col: number, row: number, cellIdx: number }} SnakeGoalIndexEntry */
export function createSnakeGoalIndex() {
    return {
        /** @type {Map<number, SnakeGoalIndexEntry>} */
        byId: new Map(),
        /** @type {Map<number, Set<number>>} */
        byCell: new Map(),
    };
}
/** @param {object} state */
export function getSnakeGoalIndex(state) {
    return state.sandbox?.snakeGame?.goalIndex ?? null;
}
/** @param {object} state */
export function ensureSnakeGoalIndex(state) {
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return null;
    if (!snakeGame.goalIndex) snakeGame.goalIndex = createSnakeGoalIndex();
    return snakeGame.goalIndex;
}
function addToCellBucket(index, cellIdx, propId) {
    let bucket = index.byCell.get(cellIdx);
    if (!bucket) {
        bucket = new Set();
        index.byCell.set(cellIdx, bucket);
    }
    bucket.add(propId);
}
function removeFromCellBucket(index, cellIdx, propId) {
    const bucket = index.byCell.get(cellIdx);
    if (!bucket) return;
    bucket.delete(propId);
    if (!bucket.size) index.byCell.delete(cellIdx);
}
/** @param {ReturnType<typeof createSnakeGoalIndex>} index @param {object} prop @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function registerSnakeGoal(index, prop, grid) {
    if (!prop || prop.isDead) return;
    const { col, row } = grid.worldToGrid(prop.x, prop.y);
    const cellIdx = colRowToIndex(col, row, grid.cols);
    const prev = index.byId.get(prop.id);
    if (prev) removeFromCellBucket(index, prev.cellIdx, prop.id);
    index.byId.set(prop.id, { id: prop.id, col, row, cellIdx });
    addToCellBucket(index, cellIdx, prop.id);
}
/** @param {ReturnType<typeof createSnakeGoalIndex>} index @param {number} propId */
export function unregisterSnakeGoal(index, propId) {
    const entry = index.byId.get(propId);
    if (!entry) return;
    removeFromCellBucket(index, entry.cellIdx, propId);
    index.byId.delete(propId);
}
/** @param {object} state */
export function rebuildSnakeGoalIndex(state) {
    const index = ensureSnakeGoalIndex(state);
    if (!index) return null;
    index.byId.clear();
    index.byCell.clear();
    const goalPropId = getSnakeGameConfig().goalPropId;
    const grid = state.obstacleGrid;
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (prop.type !== goalPropId) return;
        registerSnakeGoal(index, prop, grid);
    });
    return index;
}
/** @param {ReturnType<typeof createSnakeGoalIndex>} index */
export function countSnakeGoals(index) {
    return index.byId.size;
}
/**
 * @param {ReturnType<typeof createSnakeGoalIndex>} index
 * @param {import("../../../GameState/EntityRegistry.js").EntityRegistry} entityRegistry
 * @param {number} minCol @param {number} maxCol @param {number} minRow @param {number} maxRow
 */
export function collectSnakeGoalsInRect(index, entityRegistry, minCol, maxCol, minRow, maxRow, cols, rows) {
    const out = [];
    for (let row = minRow; row <= maxRow; row++)
        for (let col = minCol; col <= maxCol; col++) {
            if (!cellInRect(col, row, cols, rows)) continue;
            const bucket = index.byCell.get(colRowToIndex(col, row, cols));
            if (!bucket) continue;
            for (const propId of bucket) {
                const prop = entityRegistry.getLive(propId);
                if (prop && !prop.isDead) out.push(prop);
            }
        }
    return out;
}
/** @param {ReturnType<typeof createSnakeGoalIndex>} index @param {import("../../../GameState/EntityRegistry.js").EntityRegistry} entityRegistry */
export function collectAllSnakeGoals(index, entityRegistry) {
    const out = [];
    for (const entry of index.byId.values()) {
        const prop = entityRegistry.getLive(entry.id);
        if (prop && !prop.isDead) out.push(prop);
    }
    return out;
}
