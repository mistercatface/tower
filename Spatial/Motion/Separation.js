import { inferFaction } from "../../Combat/Targeting.js";
import { NEIGHBOR_QUERY_PAD } from "../Collision/PairBroadphase.js";
import { accumulateSeparationFromPair, clampSeparationAccum, createSeparationAccum } from "../../Libraries/Motion/separationForce.js";

export class Separation {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.pushX = 0;
        this.pushY = 0;
    }

    update(entity, spatialFrame) {
        const acc = createSeparationAccum();
        spatialFrame.forEachNeighbor(entity, (other) => {
            if (other.isDead || other.faction === undefined) return;
            if (entity.teamId != null && other.teamId != null && entity.teamId === other.teamId) return;
            if (inferFaction(other) === "player" && entity.attackType === "charge") return;
            if (inferFaction(entity) === "player" && other.attackType === "charge") return;
            accumulateSeparationFromPair(acc, entity.x, entity.y, entity.radius, other.x, other.y, other.radius, NEIGHBOR_QUERY_PAD);
        });

        clampSeparationAccum(acc);
        this.x = acc.x;
        this.y = acc.y;
        this.pushX = acc.pushX;
        this.pushY = acc.pushY;
    }
}
