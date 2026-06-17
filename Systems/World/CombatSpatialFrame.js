import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateCombatFrame } from "./populateCombatFrame.js";
import { allowsPushableCollisionPair, pairBroadphaseOverlap } from "../../Libraries/Spatial/collision/entityBroadphase.js";
import { wakePushableBody } from "../../Libraries/Motion/pushableSleep.js";
/**
 * Combat/map-transition spatial frame — populates SpatialFrameCore from GameState.
 *
 * Lifecycle:
 *   const frame = combatSpatial.begin(state);
 *   ... pass frame to systems ...
 *   // invalid after the next begin()
 */
export class CombatSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        /** Every pushable in the sim (sleeping + awake) — occupancy, sleep eval. */
        this._pushables = [];
        /** Awake pushables only — reindex, pair loop, wall resolve substeps. */
        this._activePushables = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = -1;
    }
    begin(state) {
        populateCombatFrame(this, state, this._pushables);
        this.syncActivePushables();
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    syncActivePushables() {
        const active = this._activePushables;
        active.length = 0;
        const all = this._pushables;
        for (let i = 0; i < all.length; i++) {
            const prop = all[i];
            if (!prop.isSleeping) active.push(prop);
        }
    }
    activatePushable(prop) {
        if (prop.isSleeping) wakePushableBody(prop);
        const active = this._activePushables;
        for (let i = 0; i < active.length; i++) if (active[i] === prop) return;
        active.push(prop);
    }
    forEachPushablePair(fn) {
        const frame = this;
        this.forEachGroupNeighborPair(
            this._activePushables,
            (primary, neighbor) => {
                if (neighbor.isSleeping && pairBroadphaseOverlap(primary, neighbor)) frame.activatePushable(neighbor);
                return allowsPushableCollisionPair(primary, neighbor);
            },
            fn,
        );
    }
}
/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new CombatSpatialFrame(50);
