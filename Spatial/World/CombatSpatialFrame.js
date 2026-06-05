import { SpatialFrameCore } from "../../Libraries/Spatial/world/SpatialFrameCore.js";
import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
import { isMovingEntity, shouldResolveActorPushable } from "../../Libraries/Spatial/collision/entityBroadphase.js";
import { Actor } from "../../Entities/Actor.js";

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
        this.resetFrame(state.obstacleGrid);
        this.setWallContext(wallContextFromState(state));
        this._combatants.length = 0;
        this._pushables.length = 0;

        let physIdCounter = 0;

        for (const actor of state.getCombatants()) {
            if (!actor?.isDead) {
                this.insertEntity(actor, physIdCounter++);
                this._combatants.push(actor);
            }
        }
        for (const pickup of state.pickups) {
            if (pickup.isDead) continue;
            this.insertEntity(pickup, physIdCounter++);
            if (pickup.strategy?.isPushable && !pickup.isSleeping) {
                this._pushables.push(pickup);
            }
        }
        return this;
    }

    forEachCombatantPair(fn) {
        this.forEachGroupNeighborPair(
            this._combatants,
            (a, b) => !(b instanceof Actor) || b.isDead || a.id >= b.id,
            fn,
        );
    }

    forEachActorPushablePair(fn) {
        this.forEachGroupNeighborPair(
            this._combatants,
            (actor, pickup) => {
                if (pickup.isDead || !pickup.strategy?.isPushable) return false;
                return shouldResolveActorPushable(actor, pickup);
            },
            fn,
        );
    }

    forEachPushablePair(fn) {
        this.forEachGroupNeighborPair(
            this._pushables,
            (p1, p2) => {
                if (p2 === p1 || p2.isDead || !p2.strategy?.isPushable || p1.id >= p2.id) return false;
                return isMovingEntity(p1) || isMovingEntity(p2);
            },
            fn,
        );
    }
}

/** Shared frame for combat and map-transition ticks. Call begin() once per update. */
export const combatSpatial = new CombatSpatialFrame(50);
