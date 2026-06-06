import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateCombatFrame } from "./populateCombatFrame.js";
import { getInteractionPairFilter } from "../../Core/GamePorts.js";
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
    }
    begin(state) {
        populateCombatFrame(this, state, this._combatants, this._pushables);
        return this;
    }
    forEachCombatantPair(fn) {
        this.forEachGroupNeighborPair(this._combatants, (a, b) => getInteractionPairFilter("combatant").allows(a, b), fn);
    }
    forEachActorPushablePair(fn) {
        this.forEachGroupNeighborPair(this._combatants, (actor, pickup) => getInteractionPairFilter("actorPushable").allows(actor, pickup), fn);
    }
    forEachPushablePair(fn) {
        this.forEachGroupNeighborPair(this._pushables, (p1, p2) => getInteractionPairFilter("pushable").allows(p1, p2), fn);
    }
}
/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new CombatSpatialFrame(50);
