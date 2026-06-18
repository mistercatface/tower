import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateKineticFrame } from "./populateKineticFrame.js";
import { wakeKineticBody } from "../../Libraries/Motion/kineticSleep.js";
/**
 * Kinetic spatial frame — populates SpatialFrameCore from GameState.
 *
 * Lifecycle:
 *   const frame = kineticSpatial.begin(state);
 *   ... pass frame to systems ...
 *   // invalid after the next begin()
 */
export class KineticSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        /** Every kinetic body in the sim (sleeping + awake) — occupancy, sleep eval. */
        this._kineticBodies = [];
        /** Awake kinetic bodies only — reindex, pair loop, wall resolve substeps. */
        this._activeKineticBodies = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = -1;
    }
    begin(state) {
        populateKineticFrame(this, state, this._kineticBodies);
        this.syncActiveKineticBodies();
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    syncActiveKineticBodies() {
        const active = this._activeKineticBodies;
        active.length = 0;
        const all = this._kineticBodies;
        for (let i = 0; i < all.length; i++) {
            const prop = all[i];
            if (!prop.isSleeping) active.push(prop);
        }
    }
    activateKineticBody(prop) {
        if (prop.isSleeping) wakeKineticBody(prop);
        const active = this._activeKineticBodies;
        for (let i = 0; i < active.length; i++) if (active[i] === prop) return;
        active.push(prop);
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
