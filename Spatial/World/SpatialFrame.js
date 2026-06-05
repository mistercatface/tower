import { EntityGrid } from "../../Libraries/Spatial/indexes/EntityGrid.js";
import { collectWallSegmentsForEntity } from "../../Libraries/Spatial/query/wallSegmentQuery.js";
import { SpatialQuery } from "../../Libraries/Spatial/query/SpatialQuery.js";
import { wallContextFromState } from "./WallContext.js";
import { Actor } from "../../Entities/Actor.js";
import { isMovingEntity, shouldResolveActorPushable } from "../Collision/PairBroadphase.js";

/**
 * Per-tick spatial context for combat.
 *
 * Lifecycle:
 *   const frame = combatSpatial.begin(state);  // once per combat/map-transition tick
 *   ... pass frame to systems ...
 *   // frame is invalid after the next begin()
 *
 * Do not store frame or neighbor references past the tick.
 */
export class SpatialFrame {
    constructor(cellSize = 50) {
        this.entityGrid = new EntityGrid(cellSize);
        this.wallQuery = new SpatialQuery();
        this.frameId = 0;
        this._wallCache = new Map();
        this._combatants = [];
        this._pushables = [];
    }

    begin(state) {
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
        this._combatants.length = 0;
        this._pushables.length = 0;

        this.entityGrid.syncBounds(state.obstacleGrid);
        this.entityGrid.clear();
        
        let physIdCounter = 0;
        
        for (const actor of state.getCombatants()) {
            if (!actor?.isDead) {
                actor._physId = physIdCounter++;
                this.entityGrid.insert(actor);
                this._combatants.push(actor);
            }
        }
        for (const pickup of state.pickups) {
            if (pickup.isDead) continue;
            pickup._physId = physIdCounter++;
            this.entityGrid.insert(pickup);
            if (pickup.strategy?.isPushable && !pickup.isSleeping) {
                this._pushables.push(pickup);
            }
        }
        return this;
    }

    getNeighbors(entity) {
        if (entity._neighborsFrameId === this.frameId) {
            return entity._neighbors;
        }

        if (!entity._neighbors) {
            entity._neighbors = [];
        } else {
            entity._neighbors.length = 0;
        }

        const res = this.entityGrid.collectNearby(entity);

        for (let i = 0; i < res.length; i++) {
            entity._neighbors.push(res[i]);
        }

        entity._neighborsFrameId = this.frameId;
        return entity._neighbors;
    }

    forEachNeighbor(entity, fn) {
        const neighbors = this.getNeighbors(entity);
        for (let i = 0; i < neighbors.length; i++) {
            fn(neighbors[i]);
        }
    }

    getWallCandidates(entity, state) {
        const cached = this._wallCache.get(entity.id);
        if (cached) {
            return cached;
        }

        const segments = collectWallSegmentsForEntity(
            this.wallQuery,
            wallContextFromState(state),
            entity,
        );

        this._wallCache.set(entity.id, segments);
        return segments;
    }

    forEachCombatantPair(fn) {
        for (let i = 0; i < this._combatants.length; i++) {
            const a = this._combatants[i];
            if (a.isDead) continue;
            const neighbors = this.getNeighbors(a);
            for (let j = 0; j < neighbors.length; j++) {
                const b = neighbors[j];
                if (!(b instanceof Actor) || b.isDead || a.id >= b.id) continue;
                fn(a, b);
            }
        }
    }

    forEachActorPushablePair(fn) {
        for (let i = 0; i < this._combatants.length; i++) {
            const actor = this._combatants[i];
            if (actor.isDead) continue;
            const neighbors = this.getNeighbors(actor);
            for (let j = 0; j < neighbors.length; j++) {
                const pickup = neighbors[j];
                if (pickup.isDead || !pickup.strategy?.isPushable) continue;
                if (!shouldResolveActorPushable(actor, pickup)) continue;
                fn(actor, pickup);
            }
        }
    }

    forEachPushablePair(fn) {
        for (let i = 0; i < this._pushables.length; i++) {
            const p1 = this._pushables[i];
            if (p1.isDead) continue;
            const neighbors = this.getNeighbors(p1);
            for (let j = 0; j < neighbors.length; j++) {
                const p2 = neighbors[j];
                if (p2 === p1 || p2.isDead || !p2.strategy?.isPushable || p1.id >= p2.id) continue;
                if (isMovingEntity(p1) || isMovingEntity(p2)) {
                    fn(p1, p2);
                }
            }
        }
    }
}

/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new SpatialFrame(50);
