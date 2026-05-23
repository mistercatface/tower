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

export class Projectile extends Entity {
    static updateAll(state, dt) {
        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.update(dt, state.canvasBounds);
            if (p.isDead) state.projectiles.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, target, angle = null, damage = 0, faction = "player") {
        let initialAngle = 0;
        if (angle !== null && angle !== undefined) {
            initialAngle = angle;
        } else if (target) {
            initialAngle = Math.atan2(target.y - y, target.x - x);
        }
        
        super(x, y, initialAngle, false);
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.damage = damage;
        this.faction = faction;
    }

    move(dt) {
        this.x += Math.cos(this.angle) * this.speed * (dt / 1000);
        this.y += Math.sin(this.angle) * this.speed * (dt / 1000);
    }

    checkOutOfBounds(canvasBounds) {
        const padding = 500;
        if (this.x < -padding || this.x > canvasBounds.width + padding || this.y < -padding || this.y > canvasBounds.height + padding) {
            this.isDead = true;
            return true;
        }
        return false;
    }

    update(dt, canvasBounds) {
        this.move(dt);
        this.checkOutOfBounds(canvasBounds);
    }
}

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = angle;
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }
}