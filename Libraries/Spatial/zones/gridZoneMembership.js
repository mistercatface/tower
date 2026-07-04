/** @typedef {{ cells: Set<number> }} GridZoneSubscriptions */
/**
 * @typedef {object} GridZoneEvent
 * @property {"cell"} kind
 * @property {number} key
 * @property {object} entity
 * @property {number} idx
 */
/**
 * @typedef {object} GridZoneHandlers
 * @property {(event: GridZoneEvent) => void} onEnter
 * @property {(event: GridZoneEvent) => void} onOn
 * @property {(event: GridZoneEvent) => void} onExit
 */
/** @param {Set<number>} prev @param {Set<number>} next */
export function diffGridZoneKeys(prev, next) {
    /** @type {number[]} */
    const entered = [];
    /** @type {number[]} */
    const exited = [];
    for (const key of next) if (!prev.has(key)) entered.push(key);
    for (const key of prev) if (!next.has(key)) exited.push(key);
    return { entered, exited };
}
/**
 * @param {object} entity
 * @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {GridZoneSubscriptions} subscriptions
 * @param {Set<number>} out
 */
export function resolveEntityGridZoneKeys(entity, grid, subscriptions, out) {
    out.clear();
    const { x, y } = entity;
    const radius = entity.radius ?? 0;
    const band = radius + grid.cellSize * 0.12;
    const col = grid.worldCol(x);
    const row = grid.worldRow(y);
    let cellIdx = -1;
    if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) {
        cellIdx = row * grid.cols + col;
        if (subscriptions.cells.has(cellIdx)) out.add(cellIdx);
    }
}
/**
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {GridZoneSubscriptions} subscriptions
 * @param {GridZoneHandlers} handlers
 */
export function tickGridZoneMembership(spatialFrame, grid, subscriptions, handlers) {
    if (!subscriptions.cells.size) return;
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies?.length) return;
    for (let i = 0; i < kineticBodies.length; i++) {
        const entity = kineticBodies[i];
        if (!entity._gridZoneKeys) entity._gridZoneKeys = new Set();
        if (!entity._gridZoneNextKeys) entity._gridZoneNextKeys = new Set();
        const prev = entity._gridZoneKeys;
        const next = entity._gridZoneNextKeys;
        resolveEntityGridZoneKeys(entity, grid, subscriptions, next);
        const { entered, exited } = diffGridZoneKeys(prev, next);
        for (let j = 0; j < entered.length; j++) {
            const key = entered[j];
            handlers.onEnter({ kind: "cell", key, entity, idx: key });
        }
        for (const key of next) handlers.onOn({ kind: "cell", key, entity, idx: key });
        for (let j = 0; j < exited.length; j++) {
            const key = exited[j];
            handlers.onExit({ kind: "cell", key, entity, idx: key });
        }
        entity._gridZoneKeys = next;
        entity._gridZoneNextKeys = prev;
    }
}
