import { hasLineOfSight } from "../Libraries/Spatial/query/lineOfSight.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
let nextEntityId = 1;
export class Entity {
    constructor(x, y, angle = 0, isDead = false) {
        this.id = nextEntityId++;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.isDead = isDead;
        this.zIndex = 0;
        this._distSq = 0;
        this.shape = null;
    }
    reset(x, y, angle = 0, isDead = false) {
        this.id = nextEntityId++;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.isDead = isDead;
        this.zIndex = 0;
        this._distSq = 0;
        this.shape = null;
    }
    render(ctx, ...caches) {}
    getShape() {
        if (!this.shape) this.shape = new CircleShape(this.radius || 0);
        return this.shape;
    }
    getBoundingRadius() {
        if (this.shape) return this.shape.getBoundingRadius();
        return this.radius || 0;
    }
    isVisible(viewport) {
        return viewport.isVisible(this.x, this.y, this.getBoundingRadius());
    }
    hasLineOfSightFromPoint(x, y, state, { sourceRadius = 0 } = {}) {
        return hasLineOfSight(x, y, this.x, this.y, state.obstacleGrid, sourceRadius, this.radius ?? 0);
    }
    hasLineOfSightTo(other, state) {
        if (!other) return false;
        return hasLineOfSight(this.x, this.y, other.x, other.y, state.obstacleGrid, this.radius ?? 0, other.radius ?? 0);
    }
}
