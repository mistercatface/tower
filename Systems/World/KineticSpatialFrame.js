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
        this._nextPhysId = this._kineticBodies.length;
        this.syncActiveKineticBodies();
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    /**
     * Insert or re-insert a kinetic prop after mid-tick spawn or geometry change.
     * Keeps broadphase, neighbor queries, and registry view gen in sync for the rest of the frame.
     */
    admitKineticProp(prop, state) {
        if (!prop || prop.strategy?.spatialRole === "trigger") return;
        const isNew = prop._physId === undefined;
        if (isNew) {
            prop._physId = this._nextPhysId++;
            this._kineticBodies.push(prop);
        } else this.entityGrid.remove(prop);
        this.entityGrid.insert(prop);
        prop._neighborsFrameId = -1;
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
        if (prop.strategy?.isKinetic) this.activateKineticBody(prop);
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
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
    _ensureActive(prop) {
        const active = this._activeKineticBodies;
        for (let i = 0; i < active.length; i++) if (active[i] === prop) return;
        active.push(prop);
    }
    activateKineticBody(prop) {
        if (prop.isSleeping) wakeKineticBody(prop);
        this._ensureActive(prop);
        const peers = prop._kineticIslandPeers;
        if (!peers) return;
        for (let i = 0; i < peers.length; i++) {
            const peer = peers[i];
            if (peer === prop) continue;
            if (peer.isSleeping) wakeKineticBody(peer);
            this._ensureActive(peer);
        }
    }
    evictKineticProp(prop) {
        if (!prop || prop._physId === undefined) return;
        this.entityGrid.remove(prop);
        const all = this._kineticBodies;
        for (let i = all.length - 1; i >= 0; i--) if (all[i] === prop) all.splice(i, 1);
        const active = this._activeKineticBodies;
        for (let i = active.length - 1; i >= 0; i--) if (active[i] === prop) active.splice(i, 1);
        delete prop._physId;
        prop._neighborsFrameId = -1;
        if (prop._neighbors) prop._neighbors.length = 0;
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
