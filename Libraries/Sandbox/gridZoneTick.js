import { isPassageTripwireEdge, PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import { tickGridZoneMembership } from "../Spatial/zones/gridZoneMembership.js";
import { isPassagePowered } from "../Spatial/grid/boundaryOccupancy.js";
import { canonicalEdgeCellKey, forEachGridEdge } from "../World/wallGridCells.js";
/** @typedef {import("../Spatial/zones/gridZoneMembership.js").GridZoneSubscriptions} GridZoneSubscriptions */
/** @typedef {import("../Spatial/zones/gridZoneMembership.js").GridZoneEvent} GridZoneEvent */
/** @param {object} state */
export function markGridZoneSubscriptionsDirty(state) {
    state.sandbox.gridZoneSubscriptionsDirty = true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function buildGridZoneSubscriptions(grid) {
    /** @type {Set<number>} */
    const cells = new Set();
    /** @type {Map<number, { col: number, row: number, side: number, mode: string }>} */
    const edges = new Map();
    if (!grid.cols) return { cells, edges };
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) if (grid.floorStore.isBeltKindAtIdx(idx)) cells.add(idx);
    forEachGridEdge(
        grid,
        (col, row, side) => {
            const key = canonicalEdgeCellKey(grid, col, row, side);
            if (edges.has(key)) return;
            edges.set(key, { col, row, side, mode: PASSAGE_MODE.Tripwire });
        },
        { filter: isPassageTripwireEdge },
    );
    return { cells, edges };
}
/** @param {object} state */
function ensureGridZoneSubscriptions(state) {
    if (!state.sandbox.gridZoneSubscriptionsDirty && state.sandbox.gridZoneSubscriptions) return state.sandbox.gridZoneSubscriptions;
    state.sandbox.gridZoneSubscriptions = buildGridZoneSubscriptions(state.obstacleGrid);
    state.sandbox.gridZoneSubscriptionsDirty = false;
    return state.sandbox.gridZoneSubscriptions;
}
/** @param {object} state @param {GridZoneEvent} event @param {"enter" | "on" | "exit"} phase */
function onBeltCellZoneEvent(state, event, phase) {
    if (phase === "on") return;
    state.sandbox.beltZoneEvents.push({ at: state.gameTime, phase, col: event.col, row: event.row, entityId: event.entity.id });
    if (state.sandbox.beltZoneEvents.length > 32) state.sandbox.beltZoneEvents.shift();
}
/** @param {object} state @param {GridZoneEvent} event */
function markTripwireTriggered(state, event) {
    if (!isPassagePowered(state.obstacleGrid, event.col, event.row, event.side)) return;
    state.sandbox.tripwireTriggeredKeys.add(event.key);
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame */
export function tickGridZones(state, spatialFrame) {
    const subscriptions = ensureGridZoneSubscriptions(state);
    state.sandbox.tripwireTriggeredKeys.clear();
    if (!subscriptions.cells.size && !subscriptions.edges.size) return;
    tickGridZoneMembership(spatialFrame, state.obstacleGrid, subscriptions, {
        onEnter(event) {
            if (event.kind === "cell") onBeltCellZoneEvent(state, event, "enter");
            else markTripwireTriggered(state, event);
        },
        onOn(event) {
            if (event.kind === "cell") onBeltCellZoneEvent(state, event, "on");
            else markTripwireTriggered(state, event);
        },
        onExit(event) {
            if (event.kind === "cell") onBeltCellZoneEvent(state, event, "exit");
        },
    });
}
