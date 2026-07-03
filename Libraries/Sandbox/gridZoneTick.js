import { tickGridZoneMembership } from "../Spatial/zones/gridZoneMembership.js";
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
    if (!grid.cols) return { cells };
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) if (grid.floorStore.isBeltKindAtIdx(idx)) cells.add(idx);
    return { cells };
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
    state.sandbox.beltZoneEvents.push({ at: state.gameTime, phase, idx: event.idx, entityId: event.entity.id });
    if (state.sandbox.beltZoneEvents.length > 32) state.sandbox.beltZoneEvents.shift();
}
/** @param {object} state @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame */
export function tickGridZones(state, spatialFrame) {
    const subscriptions = ensureGridZoneSubscriptions(state);
    if (!subscriptions.cells.size) return;
    tickGridZoneMembership(spatialFrame, state.obstacleGrid, subscriptions, {
        onEnter(event) {
            onBeltCellZoneEvent(state, event, "enter");
        },
        onOn(event) {
            onBeltCellZoneEvent(state, event, "on");
        },
        onExit(event) {
            onBeltCellZoneEvent(state, event, "exit");
        },
    });
}
