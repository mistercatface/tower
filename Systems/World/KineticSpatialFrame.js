import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { populateKineticFrame } from "./populateKineticFrame.js";
import { wakeKineticBody } from "../../Libraries/Motion/kineticSleep.js";
import { islandRootByPhysId } from "../../Libraries/Motion/kineticIslands.js";
import { bumpKineticTopologyGeneration } from "../../Libraries/Motion/kineticTopology.js";
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
        this._activationScheduled = new Set();
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
        bumpKineticTopologyGeneration(state.sandbox);
    }
    syncActiveKineticBodies() {
        const active = this._activeKineticBodies;
        active.length = 0;
        const all = this._kineticBodies;
        for (let i = 0; i < all.length; i++) {
            const prop = all[i];
            if (prop._physId === undefined) {
                prop._activeSlot = -1;
                continue;
            }
            if (!prop.isSleeping) {
                prop._activeSlot = active.length;
                active.push(prop);
            } else prop._activeSlot = -1;
        }
    }
    _ensureActive(prop) {
        if (prop._physId === undefined) return;
        const active = this._activeKineticBodies;
        if (prop._activeSlot >= 0 && active[prop._activeSlot] === prop) return;
        prop._activeSlot = active.length;
        active.push(prop);
    }
    _removeFromActive(prop) {
        const slot = prop._activeSlot;
        if (slot == null || slot < 0) return;
        const active = this._activeKineticBodies;
        const last = active.pop();
        if (last !== prop) {
            active[slot] = last;
            last._activeSlot = slot;
        }
        prop._activeSlot = -1;
    }
    scheduleKineticActivation(prop) {
        if (prop._physId === undefined) return;
        wakeKineticBody(prop);
        this._activationScheduled.add(prop);
    }
    _wakeConstraintLinkedPeers(prop) {
        const linked = prop._kineticLinkNeighbors;
        if (linked?.length) {
            for (let i = 0; i < linked.length; i++) {
                const peer = linked[i];
                if (peer === prop || peer._physId === undefined) continue;
                if (peer.isSleeping) wakeKineticBody(peer);
                this._ensureActive(peer);
            }
            return;
        }
        const peers = prop._kineticIslandPeers;
        if (!peers) return;
        for (let i = 0; i < peers.length; i++) {
            const peer = peers[i];
            if (peer === prop || peer._physId === undefined) continue;
            if (peer.isSleeping) wakeKineticBody(peer);
            this._ensureActive(peer);
        }
    }
    flushScheduledKineticActivations() {
        const scheduled = this._activationScheduled;
        if (scheduled.size === 0) return;
        for (const prop of scheduled) {
            this._ensureActive(prop);
            this._wakeConstraintLinkedPeers(prop);
        }
        scheduled.clear();
    }
    activateKineticBody(prop) {
        if (prop._physId === undefined) return;
        if (prop.isSleeping) wakeKineticBody(prop);
        this._ensureActive(prop);
        this._wakeConstraintLinkedPeers(prop);
    }
    reindexKineticBodies(bodies) {
        if (!bodies?.length) return;
        for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i]._physId === undefined) bodies.splice(i, 1);
        if (!bodies.length) return;
        super.reindexKineticBodies(bodies);
    }
    evictKineticProp(prop, state) {
        if (!prop || prop._physId === undefined) return;
        islandRootByPhysId[prop._physId] = -1;
        this.entityGrid.remove(prop);
        const all = this._kineticBodies;
        for (let i = all.length - 1; i >= 0; i--) if (all[i] === prop) all.splice(i, 1);
        this._removeFromActive(prop);
        this._activationScheduled.delete(prop);
        delete prop._physId;
        prop._neighborsFrameId = -1;
        if (prop._neighbors) prop._neighbors.length = 0;
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
        if (state) bumpKineticTopologyGeneration(state.sandbox);
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
