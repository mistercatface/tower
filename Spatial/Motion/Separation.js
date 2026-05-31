import { inferFaction } from "../../Combat/Targeting.js";

export class Separation {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.pushX = 0;
        this.pushY = 0;
    }

    update(entity, spatialFrame) {
        this.x = 0;
        this.y = 0;
        this.pushX = 0;
        this.pushY = 0;

        spatialFrame.forEachNeighbor(entity, (other) => {
            if (other.isDead) return;
            if (typeof entity.shouldSeparateFrom === "function" && !entity.shouldSeparateFrom(other)) return;
            if (inferFaction(other) === "player" && entity.attackType === "charge") return;
            if (inferFaction(entity) === "player" && other.attackType === "charge") return;

            let dx = entity.x - other.x;
            let dy = entity.y - other.y;
            let dist = Math.hypot(dx, dy);

            if (dist === 0) {
                dx = Math.random() - 0.5;
                dy = Math.random() - 0.5;
                dist = Math.hypot(dx, dy);
            } else if (dist < entity.radius + other.radius + 5) {
                dx += (Math.random() - 0.5) * 0.5;
                dy += (Math.random() - 0.5) * 0.5;
            }

            const avoidRadius = entity.radius + other.radius + 15;
            if (dist < avoidRadius) {
                const weight = 1 - dist / avoidRadius;
                this.x += (dx / dist) * weight;
                this.y += (dy / dist) * weight;
            }

            const minSep = entity.radius + other.radius + 0.1;
            if (dist < minSep) {
                const overlap = minSep - dist;
                this.pushX += (dx / dist) * overlap * 0.5;
                this.pushY += (dy / dist) * overlap * 0.5;
            }
        });

        let sepLen = Math.hypot(this.x, this.y);
        if (sepLen > 1.0) {
            this.x = (this.x / sepLen) * 1.0;
            this.y = (this.y / sepLen) * 1.0;
        }

        let pushLen = Math.hypot(this.pushX, this.pushY);
        if (pushLen > 3.0) {
            this.pushX = (this.pushX / pushLen) * 3.0;
            this.pushY = (this.pushY / pushLen) * 3.0;
        }
    }
}
