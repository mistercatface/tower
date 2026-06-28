import { isEdgeZoneKey } from "../../DataStructures/CellKey.js";
import { cellInRect, colRowToIndex } from "../grid/GridUtils.js";
import { isPassagePowered } from "../grid/boundaryOccupancy.js";
import { canonicalEdgeCellKey } from "../grid/gridCellTopology.js";
/** @typedef {{ idx: number, side: number, mode: string }} GridEdgeSubscription */
/** @typedef {{ cells: Set<number>, edges: Map<number, GridEdgeSubscription> }} GridZoneSubscriptions */
/**
 * @typedef {object} GridZoneEvent
 * @property {"cell" | "edge"} kind
 * @property {number} key
 * @property {object} entity
 * @property {number} idx
 * @property {number} [side]
 * @property {GridEdgeSubscription} [edgeMeta]
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
/** @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} x @param {number} y @param {number} col @param {number} row @param {number} side @param {number} band */
export function entityInGridEdgeBand(grid, x, y, col, row, side, band) {
    const bounds = grid.getCellBounds(col, row);
    if (side === 0) return Math.abs(y - bounds.minY) <= band;
    if (side === 1) return Math.abs(x - bounds.maxX) <= band;
    if (side === 2) return Math.abs(y - bounds.maxY) <= band;
    return Math.abs(x - bounds.minX) <= band;
}
/** @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} key @param {Map<number, GridEdgeSubscription>} subscribedEdges */
function addPoweredSubscribedEdgeKey(grid, key, subscribedEdges, out) {
    if (!subscribedEdges.has(key)) return;
    const meta = subscribedEdges.get(key);
    if (isPassagePowered(grid, meta.idx, meta.side)) out.add(key);
}
/** @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} prevCol @param {number} prevRow @param {number} col @param {number} row @param {Map<number, GridEdgeSubscription>} subscribedEdges @param {Set<number>} out */
export function appendCrossedEdgeZoneKeys(grid, prevCol, prevRow, col, row, subscribedEdges, out) {
    if (prevCol === col && prevRow === row) return;
    if (col !== prevCol) {
        const side = col > prevCol ? 1 : 3;
        addPoweredSubscribedEdgeKey(grid, canonicalEdgeCellKey(grid, prevCol, prevRow, side), subscribedEdges, out);
    }
    if (row !== prevRow) {
        const side = row > prevRow ? 2 : 0;
        addPoweredSubscribedEdgeKey(grid, canonicalEdgeCellKey(grid, prevCol, prevRow, side), subscribedEdges, out);
    }
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
        cellIdx = colRowToIndex(col, row, grid.cols);
        if (subscriptions.cells.has(cellIdx)) out.add(cellIdx);
    }
    const prevCellIdx = entity._gridZonePrevCellIdx;
    if (prevCellIdx != null && prevCellIdx >= 0 && cellIdx !== prevCellIdx) {
        const prevCol = prevCellIdx % grid.cols;
        const prevRow = (prevCellIdx / grid.cols) | 0;
        appendCrossedEdgeZoneKeys(grid, prevCol, prevRow, col, row, subscriptions.edges, out);
    }
    if (subscriptions.edges.size && col >= 0 && col < grid.cols && row >= 0 && row < grid.rows)
        for (let dc = -1; dc <= 1; dc++)
            for (let dr = -1; dr <= 1; dr++) {
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, grid.cols, grid.rows)) continue;
                for (let side = 0; side < 4; side++) {
                    const key = canonicalEdgeCellKey(grid, nc, nr, side);
                    if (!subscriptions.edges.has(key)) continue;
                    if (!isPassagePowered(grid, nc + nr * grid.cols, side)) continue;
                    if (entityInGridEdgeBand(grid, x, y, nc, nr, side, band)) out.add(key);
                }
            }
    if (cellIdx >= 0) entity._gridZonePrevCellIdx = cellIdx;
    else entity._gridZonePrevCellIdx = -1;
}
/**
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {GridZoneSubscriptions} subscriptions
 * @param {GridZoneHandlers} handlers
 */
export function tickGridZoneMembership(spatialFrame, grid, subscriptions, handlers) {
    if (!subscriptions.cells.size && !subscriptions.edges.size) return;
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
            if (isEdgeZoneKey(key)) {
                const meta = subscriptions.edges.get(key);
                handlers.onEnter({ kind: "edge", key, entity, idx: meta.idx, side: meta.side, edgeMeta: meta });
            } else handlers.onEnter({ kind: "cell", key, entity, idx: key });
        }
        for (const key of next)
            if (isEdgeZoneKey(key)) {
                const meta = subscriptions.edges.get(key);
                handlers.onOn({ kind: "edge", key, entity, idx: meta.idx, side: meta.side, edgeMeta: meta });
            } else handlers.onOn({ kind: "cell", key, entity, idx: key });
        for (let j = 0; j < exited.length; j++) {
            const key = exited[j];
            if (isEdgeZoneKey(key)) {
                const meta = subscriptions.edges.get(key);
                handlers.onExit({ kind: "edge", key, entity, idx: meta.idx, side: meta.side, edgeMeta: meta });
            } else handlers.onExit({ kind: "cell", key, entity, idx: key });
        }
        entity._gridZoneKeys = next;
        entity._gridZoneNextKeys = prev;
    }
}
