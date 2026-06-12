import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateCombatFrame } from "./populateCombatFrame.js";
import { getInteractionPairFilter } from "../../Core/interactionPairFilters.js";
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
        this._combatants = [];
        this._pushables = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = -1;
    }
    begin(state) {
        populateCombatFrame(this, state, this._combatants, this._pushables);
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    forEachCombatantPair(fn) {
        this.forEachGroupNeighborPair(this._combatants, (a, b) => getInteractionPairFilter("combatant").allows(a, b), fn);
    }
    forEachActorPushablePair(fn) {
        this.forEachGroupNeighborPair(this._combatants, (actor, prop) => getInteractionPairFilter("actorPushable").allows(actor, prop), fn);
    }
    forEachPushablePair(fn) {
        this.forEachGroupNeighborPair(this._pushables, (p1, p2) => getInteractionPairFilter("pushable").allows(p1, p2), fn);
    }
}
/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new CombatSpatialFrame(50);
