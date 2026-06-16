import { isPassagePowerConductorEdge } from "../Spatial/grid/CellEdge.js";
import { isPassagePowered, setPassagePowered } from "../Spatial/grid/boundaryOccupancy.js";
import { emptyCellBounds, growCellBounds, isEmptyCellBounds } from "../DataStructures/CellRect.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { canonicalEdgeCellKey, edgeNeighbor, forEachCellEdge } from "../Spatial/grid/gridCellTopology.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive } from "./buttonInput.js";
import { GRID_NAV_EPOCH, setGridPassagePowerNavKey } from "../Spatial/grid/gridNavEpoch.js";
/** @typedef {{ col: number, row: number, side: number, key: number }} PassageEdgeRef */
/** Cardinal edge endpoints as grid vertices (cell-corner coordinates). */
export function passageEdgeVertexCoords(col, row, side) {
    if (side === 0) return [col, row, col + 1, row];
    if (side === 1) return [col + 1, row, col + 1, row + 1];
    if (side === 2) return [col, row + 1, col + 1, row + 1];
    return [col, row, col, row + 1];
}
function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
/** Four corner vertices for a source cell — flood seeds when the cell is energized. */
export function passagePowerSourceSeedVertexKeys(col, row, cols) {
    return [packVertexKey(col, row, cols), packVertexKey(col + 1, row, cols), packVertexKey(col + 1, row + 1, cols), packVertexKey(col, row + 1, cols)];
}
/** Canonical edge keys for the two cardinal edges meeting at each cell corner. */
export function passagePowerCornerTapEdgeKeys(grid, col, row) {
    /** @type {number[]} */
    const keys = [];
    const corners = [
        [col, row, 3, 0],
        [col, row, 0, 1],
        [col, row, 1, 2],
        [col, row, 2, 3],
    ];
    for (let i = 0; i < corners.length; i++) {
        const cCol = corners[i][0];
        const cRow = corners[i][1];
        keys.push(canonicalEdgeCellKey(grid, cCol, cRow, corners[i][2]));
        keys.push(canonicalEdgeCellKey(grid, cCol, cRow, corners[i][3]));
    }
    return keys;
}
function buildPassagePowerGraph(grid) {
    /** @type {Map<number, PassageEdgeRef[]>} */
    const vertexEdges = new Map();
    /** @type {Map<number, PassageEdgeRef>} */
    const edgeByKey = new Map();
    forEachCellEdge(
        grid,
        (col, row, side) => {
            const key = canonicalEdgeCellKey(grid, col, row, side);
            if (edgeByKey.has(key)) return;
            const ref = { col, row, side, key };
            edgeByKey.set(key, ref);
            const [vx0, vy0, vx1, vy1] = passageEdgeVertexCoords(col, row, side);
            const v0 = packVertexKey(vx0, vy0, grid.cols);
            const v1 = packVertexKey(vx1, vy1, grid.cols);
            let list = vertexEdges.get(v0);
            if (!list) {
                list = [];
                vertexEdges.set(v0, list);
            }
            list.push(ref);
            list = vertexEdges.get(v1);
            if (!list) {
                list = [];
                vertexEdges.set(v1, list);
            }
            list.push(ref);
        },
        { filter: isPassagePowerConductorEdge },
    );
    return { vertexEdges, edgeByKey };
}
function collectEnergizedSourceCells(grid, state) {
    /** @type {Set<number>} */
    const energized = new Set();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) continue;
        if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) energized.add(idx);
    }
    const half = grid.cellHalfSize;
    forEachButtonEntity(state, (button) => {
        const signal = buttonEffectiveActive(state, button);
        if (!signal) return;
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "gridCell") continue;
            const { col, row } = grid.worldToGrid(link.globalCol * grid.cellSize + half, link.globalRow * grid.cellSize + half);
            if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
            const idx = colRowToIndex(col, row, grid.cols);
            if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) continue;
            energized.add(idx);
        }
    });
    return energized;
}
/** Flood from energized source corner vertices through shared-endpoint passage edges. */
function floodNetworkPoweredEdgeKeys(grid, energizedSourceIdx, graph) {
    const poweredEdgeKeys = new Set();
    const poweredVerts = new Set();
    const queue = [];
    for (const idx of energizedSourceIdx) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const seeds = passagePowerSourceSeedVertexKeys(col, row, grid.cols);
        for (let i = 0; i < seeds.length; i++) {
            const v = seeds[i];
            if (poweredVerts.has(v)) continue;
            poweredVerts.add(v);
            queue.push(v);
        }
    }
    while (queue.length) {
        const v = queue.pop();
        const edges = graph.vertexEdges.get(v);
        if (!edges) continue;
        for (let i = 0; i < edges.length; i++) {
            const ref = edges[i];
            if (poweredEdgeKeys.has(ref.key)) continue;
            poweredEdgeKeys.add(ref.key);
            const [vx0, vy0, vx1, vy1] = passageEdgeVertexCoords(ref.col, ref.row, ref.side);
            const v0 = packVertexKey(vx0, vy0, grid.cols);
            const v1 = packVertexKey(vx1, vy1, grid.cols);
            const other = v === v0 ? v1 : v0;
            if (poweredVerts.has(other)) continue;
            poweredVerts.add(other);
            queue.push(other);
        }
    }
    return poweredEdgeKeys;
}
function computePoweredEdgeNetworkIds(graph, poweredEdgeKeys, cols) {
    /** @type {Map<number, number>} */
    const networkIdByKey = new Map();
    let nextId = 0;
    for (const key of poweredEdgeKeys) {
        if (networkIdByKey.has(key)) continue;
        const id = nextId++;
        /** @type {number[]} */
        const queue = [key];
        while (queue.length) {
            const edgeKey = queue.pop();
            if (networkIdByKey.has(edgeKey)) continue;
            networkIdByKey.set(edgeKey, id);
            const ref = graph.edgeByKey.get(edgeKey);
            if (!ref) continue;
            const [vx0, vy0, vx1, vy1] = passageEdgeVertexCoords(ref.col, ref.row, ref.side);
            const verts = [packVertexKey(vx0, vy0, cols), packVertexKey(vx1, vy1, cols)];
            for (let vi = 0; vi < 2; vi++) {
                const edges = graph.vertexEdges.get(verts[vi]);
                if (!edges) continue;
                for (let i = 0; i < edges.length; i++) {
                    const next = edges[i].key;
                    if (!poweredEdgeKeys.has(next) || networkIdByKey.has(next)) continue;
                    queue.push(next);
                }
            }
        }
    }
    return networkIdByKey;
}
export function isPassagePowerSourceEnergized(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return false;
    if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) return true;
    const half = grid.cellHalfSize;
    let energized = false;
    forEachButtonEntity(state, (button) => {
        if (energized || !buttonEffectiveActive(state, button)) return;
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "gridCell") continue;
            const { col: linkCol, row: linkRow } = grid.worldToGrid(link.globalCol * grid.cellSize + half, link.globalRow * grid.cellSize + half);
            if (linkCol === col && linkRow === row) {
                energized = true;
                return;
            }
        }
    });
    return energized;
}
export function getPassageEdgeNetworkId(grid, col, row, side) {
    const networkIdByKey = grid._passageNetworkIdByKey;
    if (!networkIdByKey) return -1;
    const key = canonicalEdgeCellKey(grid, col, row, side);
    if (!networkIdByKey.has(key)) return -1;
    return networkIdByKey.get(key) ?? -1;
}
export function passagePowerNavKey(state) {
    const grid = state.obstacleGrid;
    const energized = collectEnergizedSourceCells(grid, state);
    const parts = [];
    for (const idx of energized) parts.push(idx);
    parts.sort((a, b) => a - b);
    return `${grid.edgeStore.passageEdgeCount}:${parts.join(",")}`;
}
/** Recompute passage-power keys on grid (no nav notify). Called before worker policy pack. */
export function recomputePassagePowerNetwork(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return null;
    const graph = buildPassagePowerGraph(grid);
    const energizedSources = collectEnergizedSourceCells(grid, state);
    const poweredKeys = floodNetworkPoweredEdgeKeys(grid, energizedSources, graph);
    const networkIdByKey = computePoweredEdgeNetworkIds(graph, poweredKeys, grid.cols);
    grid._passagePoweredKeys = poweredKeys;
    grid._passageNetworkIdByKey = networkIdByKey;
    setGridPassagePowerNavKey(grid, passagePowerNavKey(state));
    return { graph, poweredKeys, networkIdByKey };
}
/** @returns {{ bounds: import("../DataStructures/CellRect.js").CellBounds, needsNavSync: boolean }} */
export function applyPassagePowerGridState(state) {
    const grid = state.obstacleGrid;
    const empty = emptyCellBounds();
    if (!grid.cols) return { bounds: empty, needsNavSync: false };
    const prevPowerKey = grid._passagePowerNavKey;
    const computed = recomputePassagePowerNetwork(state);
    if (!computed) return { bounds: empty, needsNavSync: false };
    const { graph, poweredKeys } = computed;
    const bounds = emptyCellBounds();
    for (const ref of graph.edgeByKey.values()) {
        const { col, row, side, key } = ref;
        const powered = poweredKeys.has(key);
        if (isPassagePowered(grid, col, row, side) === powered) continue;
        setPassagePowered(grid, col, row, side, powered);
        growCellBounds(bounds, col, row);
        const { nc, nr } = edgeNeighbor(col, row, side);
        if (cellInRect(nc, nr, grid.cols, grid.rows)) growCellBounds(bounds, nc, nr);
    }
    const powerKeyChanged = grid._passagePowerNavKey !== prevPowerKey;
    const needsNavSync = !isEmptyCellBounds(bounds) || powerKeyChanged;
    return { bounds, needsNavSync };
}
export function syncPassagePowerNetwork(state) {
    const { bounds, needsNavSync } = applyPassagePowerGridState(state);
    if (!needsNavSync) return Promise.resolve();
    const navBounds = isEmptyCellBounds(bounds) ? null : bounds;
    return state.navigation.onObstaclesChanged(navBounds);
}
