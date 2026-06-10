import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populatePushableFrame } from "./populatePushableFrame.js";
import { getInteractionPairFilter } from "../../Core/interactionPairFilters.js";
/** Spatial frame for pushable-only sim ticks (no combatants). */
export class PushableSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        this._pushables = [];
        this._combatants = [];
    }
    begin(state) {
        populatePushableFrame(this, state, this._pushables);
        return this;
    }
    forEachPushablePair(fn) {
        this.forEachGroupNeighborPair(this._pushables, (p1, p2) => getInteractionPairFilter("pushable").allows(p1, p2), fn);
    }
}
export const pushableSpatial = new PushableSpatialFrame(50);
