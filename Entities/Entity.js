import { hasLineOfSight } from "../Libraries/Spatial/query/lineOfSight.js";
import { wallContextFromState } from "../Libraries/Spatial/query/wallContext.js";
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
        this.shape = null; // initialized lazily or by subclasses
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
    resolveWallContext(state) {
        return wallContextFromState(state);
    }
    hasLineOfSightFromPoint(x, y, state, { sourceRadius = 0 } = {}) {
        const wallCtx = this.resolveWallContext(state);
        if (!wallCtx) return true;
        return hasLineOfSight(x, y, this.x, this.y, wallCtx, sourceRadius, this.radius ?? 0);
    }
    hasLineOfSightTo(other, state) {
        if (!other) return false;
        const wallCtx = this.resolveWallContext(state);
        if (!wallCtx) return true;
        return hasLineOfSight(this.x, this.y, other.x, other.y, wallCtx, this.radius ?? 0, other.radius ?? 0);
    }
}
