import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateCombatFrame } from "./populateCombatFrame.js";
import { allowsPushableCollisionPair } from "../../Libraries/Spatial/collision/entityBroadphase.js";
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
        this._pushables = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = -1;
    }
    begin(state) {
        populateCombatFrame(this, state, this._pushables);
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    forEachPushablePair(fn) {
        this.forEachGroupNeighborPair(this._pushables, allowsPushableCollisionPair, fn);
    }
}
/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new CombatSpatialFrame(50);
