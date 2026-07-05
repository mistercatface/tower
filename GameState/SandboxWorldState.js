import { SandboxEntityMetaStore } from "./sandboxEntityMeta.js";
import {  CellPropIndex  } from "../Libraries/Spatial/spatial.js";
/** Sandbox playfield data — per-entity editor metadata. */
export class SandboxWorldState {
    constructor() {
        this.entityMeta = new SandboxEntityMetaStore();
        /** @type {object | null} */
        this.controller = null;
        /** @type {import("../Libraries/Spatial/zones/gridZoneMembership.js").GridZoneSubscriptions | null} */
        this.gridZoneSubscriptions = null;
        this.gridZoneSubscriptionsDirty = true;
        /** @type {Set<number>} canonical edge keys with a prop on the beam while powered */
        this.tripwireTriggeredKeys = new Set();
        /** @type {object[]} recent belt cell zone events for future train-style consumers */
        this.beltZoneEvents = [];
        /** @type {Map<string, CellPropIndex>} */
        this.propCategoryIndexes = new Map();
    }
}
export function getPropCategoryIndex(state, categoryId) {
    let index = state.sandbox.propCategoryIndexes.get(categoryId);
    if (!index) {
        index = new CellPropIndex();
        state.sandbox.propCategoryIndexes.set(categoryId, index);
        if (!state.obstacleGrid.onBoundsResync)
            state.obstacleGrid.onBoundsResync = (grid) => {
                for (const idx of state.sandbox.propCategoryIndexes.values()) idx.syncBounds(grid);
            };
        index.syncBounds(state.obstacleGrid);
    }
    return index;
}
export function unregisterPropFromCategoryIndexes(state, prop) {
    if (!state.sandbox?.propCategoryIndexes) return;
    for (const index of state.sandbox.propCategoryIndexes.values()) index.unregister(prop);
}
