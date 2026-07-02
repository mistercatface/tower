import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { wakeKineticBody } from "../../Libraries/Motion/kineticSleep.js";
import { islandRootByPhysId } from "../../Libraries/Motion/kineticIslands.js";
import { bumpKineticTopologyGeneration } from "../../Libraries/Motion/kineticTopology.js";
import { getBroadphaseBounds } from "../../Libraries/Spatial/collision/entityBroadphase.js";
import { MAX_ENTITIES } from "../../Core/engineLimits.js";
import {
    appendActiveKineticBodySlabPhysId,
    clearActiveKineticBodySlab,
    kineticDynamicSlab,
    writeActiveKineticBodySlabPose,
    writeBroadphaseFromBounds,
    writeStaticKineticSlabSlot,
} from "../../Libraries/Spatial/collision/kineticBodySlab.js";
function writeKineticBodySlabSnapshot(prop) {
    writeStaticKineticSlabSlot(prop);
    writeActiveKineticBodySlabPose(prop);
    writeBroadphaseFromBounds(prop._physId, getBroadphaseBounds(prop));
}
export class KineticSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        /** Every kinetic body in the sim (sleeping + awake) — occupancy, sleep eval. */
        this._kineticBodies = [];
        /** Awake kinetic bodies only — reindex, pair loop, wall resolve substeps. */
        this._activeKineticBodies = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = 0;
        this._nextPhysId = 0;
        this._activationScheduled = new Set();
    }
    begin(state) {
        this.resetFrame(state.obstacleGrid);
        this._kineticBodies.length = 0;
        let physIdCounter = 0;
        const worldProps = state.worldProps;
        for (let i = 0; i < worldProps.length; i++) {
            const prop = worldProps[i];
            if (prop.strategy?.spatialRole === "trigger") continue;
            this.insertEntity(prop, physIdCounter++);
            if (prop.strategy?.isKinetic) {
                this._kineticBodies.push(prop);
                writeKineticBodySlabSnapshot(prop);
            }
        }
        const projectiles = state.projectiles || [];
        for (let i = 0; i < projectiles.length; i++) {
            const proj = projectiles[i];
            this.insertEntity(proj, physIdCounter++);
            if (proj.strategy?.isKinetic) {
                this._kineticBodies.push(proj);
                writeKineticBodySlabSnapshot(proj);
            }
        }
        this._nextPhysId = physIdCounter;
        this.syncActiveKineticBodies();
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    /**
     * Insert or re-insert a kinetic prop after mid-tick spawn or geometry change.
     * Keeps broadphase, neighbor queries, and registry view gen in sync for the rest of the frame.
     */
    admitKineticProp(prop, world) {
        if (!prop || prop.strategy?.spatialRole === "trigger") return;
        const isNew = prop._physId === undefined;
        if (isNew) {
            prop._physId = this._nextPhysId++;
            if (prop._physId >= MAX_ENTITIES) throw new Error(`PhysId limit exceeded: ${prop._physId} >= ${MAX_ENTITIES}`);
            this._kineticBodies.push(prop);
        } else this.entityGrid.remove(prop);
        this.entityGrid.insert(prop);
        prop._neighborsFrameId = -1;
        this.frameId = (this.frameId + 1) | 0;
        if (prop.strategy?.isKinetic) {
            this.activateKineticBody(prop);
            writeKineticBodySlabSnapshot(prop);
        }
        this.populatedMembershipGen = world.entityRegistry.membershipGen;
        bumpKineticTopologyGeneration(world.kinetic);
    }
    /**
     * Batch admit multiple props.
     */
    admitKineticProps(props, world) {
        let anyAdmitted = false;
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            if (!prop || prop.strategy?.spatialRole === "trigger") continue;
            const isNew = prop._physId === undefined;
            if (isNew) {
                prop._physId = this._nextPhysId++;
                if (prop._physId >= MAX_ENTITIES) throw new Error(`PhysId limit exceeded: ${prop._physId} >= ${MAX_ENTITIES}`);
                this._kineticBodies.push(prop);
            } else this.entityGrid.remove(prop);
            this.entityGrid.insert(prop);
            prop._neighborsFrameId = -1;
            if (prop.strategy?.isKinetic) {
                this.activateKineticBody(prop);
                writeKineticBodySlabSnapshot(prop);
            }
            anyAdmitted = true;
        }
        if (anyAdmitted) {
            this.frameId = (this.frameId + 1) | 0;
            this.populatedMembershipGen = world.entityRegistry.membershipGen;
            bumpKineticTopologyGeneration(world.kinetic);
        }
    }
    syncActiveKineticBodies() {
        const active = this._activeKineticBodies;
        active.length = 0;
        clearActiveKineticBodySlab();
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
                appendActiveKineticBodySlabPhysId(prop._physId);
            } else prop._activeSlot = -1;
        }
    }
    _ensureActive(prop) {
        if (prop._physId === undefined) return;
        const active = this._activeKineticBodies;
        if (prop._activeSlot >= 0 && active[prop._activeSlot] === prop) return;
        prop._activeSlot = active.length;
        active.push(prop);
        appendActiveKineticBodySlabPhysId(prop._physId);
        writeKineticBodySlabSnapshot(prop);
    }
    _removeFromActive(prop) {
        const slot = prop._activeSlot;
        if (slot == null || slot < 0) return;
        const active = this._activeKineticBodies;
        if (slot >= active.length || active[slot] !== prop) return;
        const last = active.pop();
        if (last && last !== prop) {
            active[slot] = last;
            last._activeSlot = slot;
            kineticDynamicSlab.activePhysIds[slot] = last._physId;
            kineticDynamicSlab.activeSlot[last._physId] = slot;
        }
        prop._activeSlot = -1;
        kineticDynamicSlab.activeSlot[prop._physId] = -1;
        kineticDynamicSlab.activePhysCount = active.length;
    }
    scheduleKineticActivation(prop) {
        if (prop._physId === undefined) return;
        wakeKineticBody(prop);
        this._activationScheduled.add(prop);
    }
    _wakeConstraintLinkedPeers(prop, patchOut) {
        const linked = prop._kineticLinkNeighbors;
        if (linked?.length) {
            for (let i = 0; i < linked.length; i++) {
                const peer = linked[i];
                if (peer === prop || peer._physId === undefined) continue;
                if (peer.isSleeping) wakeKineticBody(peer);
                this._ensureActive(peer);
                if (patchOut) patchOut.push(peer);
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
            if (patchOut) patchOut.push(peer);
        }
    }
    flushScheduledKineticActivations(patchOut) {
        const scheduled = this._activationScheduled;
        if (scheduled.size === 0) return;
        for (const prop of scheduled) {
            this._ensureActive(prop);
            this._wakeConstraintLinkedPeers(prop, patchOut);
            if (patchOut) patchOut.push(prop);
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
    evictKineticProp(prop, session) {
        if (!prop || prop._physId === undefined) return;
        const physId = prop._physId;
        prop.x = kineticDynamicSlab.x[physId];
        prop.y = kineticDynamicSlab.y[physId];
        prop.vx = kineticDynamicSlab.vx[physId];
        prop.vy = kineticDynamicSlab.vy[physId];
        prop.angularVelocity = kineticDynamicSlab.w[physId];
        islandRootByPhysId[physId] = -1;
        this.entityGrid.remove(prop);
        const all = this._kineticBodies;
        for (let i = all.length - 1; i >= 0; i--) if (all[i] === prop) all.splice(i, 1);
        this._removeFromActive(prop);
        this._activationScheduled.delete(prop);
        delete prop._physId;
        prop._neighborsFrameId = -1;
        if (prop._neighbors) prop._neighbors.length = 0;
        this.frameId = (this.frameId + 1) | 0;
        if (session) bumpKineticTopologyGeneration(session);
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
