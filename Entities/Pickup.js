import { Entity } from "./Entity.js";

export class Pickup extends Entity {
    constructor(x, y, radius, type) {
        super(x, y, 0, false);
        this.radius = radius;
        this.type = type;
        this.cachedSprite = null;
    }

    update(dt) {
    }
}