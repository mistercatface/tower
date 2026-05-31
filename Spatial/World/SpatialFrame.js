import { SpatialHash } from "./SpatialHash.js";
import { SpatialQuery } from "./SpatialQuery.js";
import { wallContextFromState } from "./WallContext.js";
import { Actor } from "../../Entities/Actor.js";

/**
 * Per-tick spatial context for combat.
 *
 * Lifecycle:
 *   const frame = spatialFrame.begin(state);  // once at top of CombatState.update
 *   ... pass frame to systems ...
 *   // frame is invalid after the next begin()
 *
 * Do not store frame or neighbor references past the tick.
 */
export class SpatialFrame {
    constructor(cellSize = 50) {
        this.entityHash = new SpatialHash(cellSize);
        this.entityQuery = new SpatialQuery();
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

        this.entityHash.clear();
        for (const actor of state.getCombatants()) {
            if (!actor?.isDead) {
                this.entityHash.insert(actor);
                this._combatants.push(actor);
            }
        }
        for (const pickup of state.pickups) {
            if (pickup.isDead) continue;
            this.entityHash.insert(pickup);
            if (pickup.strategy?.isPushable) {
                this._pushables.push(pickup);
            }
        }
        return this;
    }

    forEachNeighbor(entity, fn) {
        this.entityQuery.forEachInHash(
            this.entityHash,
            this.entityHash.getNeighborQueryBounds(entity),
            fn,
            entity,
        );
    }

    getWallCandidates(entity, state) {
        const cached = this._wallCache.get(entity.id);
        if (cached) {
            return cached;
        }

        const wallCtx = wallContextFromState(state);
        let segments;
        if (!wallCtx) {
            segments = [];
        } else if (wallCtx.spatialHash) {
            segments = this.wallQuery.collectInHash(
                wallCtx.spatialHash,
                wallCtx.spatialHash.getNeighborQueryBounds(entity),
            ).slice();
        } else if (wallCtx.obstacleGrid) {
            segments = wallCtx.obstacleGrid.getNearbySegments(entity);
        } else {
            segments = wallCtx.walls;
        }

        this._wallCache.set(entity.id, segments);
        return segments;
    }

    forEachCombatantPair(fn) {
        for (let i = 0; i < this._combatants.length; i++) {
            const a = this._combatants[i];
            if (a.isDead) continue;
            this.forEachNeighbor(a, (b) => {
                if (!(b instanceof Actor) || b.isDead || a.id >= b.id) return;
                fn(a, b);
            });
        }
    }

    forEachActorPushablePair(fn) {
        for (let i = 0; i < this._combatants.length; i++) {
            const actor = this._combatants[i];
            if (actor.isDead) continue;
            this.forEachNeighbor(actor, (pickup) => {
                if (pickup.isDead || !pickup.strategy?.isPushable) return;
                fn(actor, pickup);
            });
        }
    }

    forEachPushablePair(fn) {
        for (let i = 0; i < this._pushables.length; i++) {
            const p1 = this._pushables[i];
            if (p1.isDead) continue;
            this.forEachNeighbor(p1, (p2) => {
                if (p2 === p1 || p2.isDead || !p2.strategy?.isPushable || p1.id >= p2.id) return;
                fn(p1, p2);
            });
        }
    }
}
