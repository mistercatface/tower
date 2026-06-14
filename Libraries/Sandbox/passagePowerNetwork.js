import { isPassagePowerConductorEdge, isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { isPassagePowered, setPassagePowered } from "../Spatial/grid/boundaryOccupancy.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { canonicalEdgeCellKey, gridWallEdgeNeighbor, isCanonicalEdgeRepresentative } from "../World/wallGridCells.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive } from "./buttonInput.js";
import { resolvePortalPartner, unlinkPortalEdge } from "./portalLinks.js";
/** @typedef {{ col: number, row: number, side: number, key: number }} PassageEdgeRef */
/**
 * Cardinal edge endpoints as grid vertices (cell-corner coordinates).
 * Side 0=N, 1=E, 2=S, 3=W on cell (col, row).
 *
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @returns {readonly [number, number, number, number]} vx0, vy0, vx1, vy1
 */
export function passageEdgeVertexCoords(col, row, side) {
    if (side === 0) return [col, row, col + 1, row];
    if (side === 1) return [col + 1, row, col + 1, row + 1];
    if (side === 2) return [col, row + 1, col + 1, row + 1];
    return [col, row, col, row + 1];
}
/** @param {number} vx @param {number} vy @param {number} cols */
function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
/** Four corner vertices for a source cell — flood seeds when the cell is energized. */
export function passagePowerSourceSeedVertexKeys(col, row, cols) {
    return [packVertexKey(col, row, cols), packVertexKey(col + 1, row, cols), packVertexKey(col + 1, row + 1, cols), packVertexKey(col, row + 1, cols)];
}
/**
 * Canonical edge keys for the two cardinal edges meeting at each cell corner.
 * Used for docs/tests; flood runs on shared vertices, not this list directly.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @returns {number[]}
 */
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
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {{ vertexEdges: Map<number, PassageEdgeRef[]>, edgeByKey: Map<number, PassageEdgeRef> }}
 */
function buildPassagePowerGraph(grid) {
    /** @type {Map<number, PassageEdgeRef[]>} */
    const vertexEdges = new Map();
    /** @type {Map<number, PassageEdgeRef>} */
    const edgeByKey = new Map();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            if (!isPassagePowerConductorEdge(edge)) continue;
            const key = canonicalEdgeCellKey(grid, col, row, side);
            if (edgeByKey.has(key)) continue;
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
        }
    }
    return { vertexEdges, edgeByKey };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {object} state */
function collectEnergizedSourceCells(grid, state) {
    /** @type {Set<number>} */
    const energized = new Set();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) continue;
        if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) energized.add(idx);
    }
    const half = grid.cellSize * 0.5;
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
/**
 * Flood from energized source corner vertices through shared-endpoint passage edges.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {Set<number>} energizedSourceIdx
 * @param {{ vertexEdges: Map<number, PassageEdgeRef[]>, edgeByKey: Map<number, PassageEdgeRef> }} graph
 * @returns {Set<number>}
 */
function floodNetworkPoweredEdgeKeys(grid, energizedSourceIdx, graph) {
    /** @type {Set<number>} */
    const poweredEdgeKeys = new Set();
    /** @type {Set<number>} */
    const poweredVerts = new Set();
    /** @type {number[]} */
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
/**
 * @param {{ vertexEdges: Map<number, PassageEdgeRef[]>, edgeByKey: Map<number, PassageEdgeRef> }} graph
 * @param {Set<number>} poweredEdgeKeys
 * @param {number} cols
 * @returns {Map<number, number>}
 */
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
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {Set<number>} poweredEdgeKeys
 * @param {Map<number, number>} networkIdByKey
 * @returns {boolean}
 */
function splitInvalidPortalLinks(grid, poweredEdgeKeys, networkIdByKey) {
    let changed = false;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            if (!isPortalEdge(edge)) continue;
            const partner = resolvePortalPartner(grid, col, row, side);
            if (!partner) continue;
            const keyA = canonicalEdgeCellKey(grid, col, row, side);
            const keyB = canonicalEdgeCellKey(grid, partner.col, partner.row, partner.side);
            const poweredA = poweredEdgeKeys.has(keyA);
            const poweredB = poweredEdgeKeys.has(keyB);
            const netA = networkIdByKey.get(keyA);
            const netB = networkIdByKey.get(keyB);
            if (poweredA && poweredB && netA != null && netA === netB) continue;
            if (unlinkPortalEdge(grid, col, row, side)) changed = true;
        }
    }
    return changed;
}
/** @param {object} state @param {number} col @param {number} row */
export function isPassagePowerSourceEnergized(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return false;
    if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) return true;
    const half = grid.cellSize * 0.5;
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
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function getPassageEdgeNetworkId(state, grid, col, row, side) {
    const cache = state.sandbox.passagePower;
    if (!cache) return -1;
    const key = canonicalEdgeCellKey(grid, col, row, side);
    if (!cache.poweredKeys.has(key)) return -1;
    return cache.networkIdByKey.get(key) ?? -1;
}
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function isPassageEdgeNetworkPowered(state, grid, col, row, side) {
    const cache = state.sandbox.passagePower;
    if (!cache) return false;
    return cache.poweredKeys.has(canonicalEdgeCellKey(grid, col, row, side));
}
/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} colA
 * @param {number} rowA
 * @param {number} sideA
 * @param {number} colB
 * @param {number} rowB
 * @param {number} sideB
 */
export function canLinkPortalsOnNetwork(state, grid, colA, rowA, sideA, colB, rowB, sideB) {
    const netA = getPassageEdgeNetworkId(state, grid, colA, rowA, sideA);
    if (netA < 0) return false;
    return netA === getPassageEdgeNetworkId(state, grid, colB, rowB, sideB);
}
/** @param {object} state */
export function syncPassagePowerNetwork(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const graph = buildPassagePowerGraph(grid);
    const energizedSources = collectEnergizedSourceCells(grid, state);
    const poweredKeys = floodNetworkPoweredEdgeKeys(grid, energizedSources, graph);
    const networkIdByKey = computePoweredEdgeNetworkIds(graph, poweredKeys, grid.cols);
    state.sandbox.passagePower = { poweredKeys, networkIdByKey };
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    /** @param {number} col @param {number} row */
    const mark = (col, row) => {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    };
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            if (!isPassagePowerConductorEdge(edge)) continue;
            const key = canonicalEdgeCellKey(grid, col, row, side);
            const ref = graph.edgeByKey.get(key);
            if (!ref || ref.col !== col || ref.row !== row || ref.side !== side) continue;
            const powered = poweredKeys.has(key);
            if (isPassagePowered(grid, col, row, side) === powered) continue;
            setPassagePowered(grid, col, row, side, powered);
            mark(col, row);
            const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
            if (cellInRect(nc, nr, grid.cols, grid.rows)) mark(nc, nr);
        }
    }
    if (splitInvalidPortalLinks(grid, poweredKeys, networkIdByKey)) grid.bumpWallGridRevision();
    if (minCol === Infinity) return;
    state.navigation.onObstaclesChanged({ startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });
}
