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
    resolveWallContext(stateOrWalls) {
        if (!stateOrWalls) return null;
        if (stateOrWalls.walls) return wallContextFromState(stateOrWalls);
        return { walls: stateOrWalls, wallSpatialIndex: null, obstacleGrid: null };
    }
    hasLineOfSightFromPoint(x, y, stateOrWalls, { sourceRadius = 0 } = {}) {
        const wallCtx = this.resolveWallContext(stateOrWalls);
        if (!wallCtx) return true;
        return hasLineOfSight(x, y, this.x, this.y, wallCtx, sourceRadius, this.radius ?? 0);
    }
    hasLineOfSightTo(other, stateOrWalls) {
        if (!other) return false;
        const wallCtx = this.resolveWallContext(stateOrWalls);
        if (!wallCtx) return true;
        return hasLineOfSight(this.x, this.y, other.x, other.y, wallCtx, this.radius ?? 0, other.radius ?? 0);
    }
}
export class DestructibleEntity extends Entity {
    constructor(x, y, angle = 0, maxHealth = 1, health = maxHealth, isDead = false) {
        super(x, y, angle, isDead);
        this.maxHealth = maxHealth;
        this.health = health;
    }
    reset(x, y, angle = 0, maxHealth = 1, health = maxHealth, isDead = false) {
        super.reset(x, y, angle, isDead);
        this.maxHealth = maxHealth;
        this.health = health;
    }
    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0 && !this.isDead) {
            this.isDead = true;
            return true;
        }
        return false;
    }
    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
    fullHeal() {
        this.health = this.maxHealth;
    }
    updateMaxHealth(newMaxHealth) {
        this.maxHealth = newMaxHealth;
        this.health = Math.min(this.health, this.maxHealth);
    }
}
