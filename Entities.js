export class Pickup {
    constructor(x, y, radius, type) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.type = type;
        this.isDead = false;
        this.cachedSprite = null;
    }

    update(dt) {
    }
}

export class Projectile {
    
    static updateAll(state, dt) {
        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.update(dt, state.canvasBounds);
            if (p.isDead) state.projectiles.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, target, angle = null, damage = 0, faction = "player") {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.damage = damage;
        this.faction = faction;
        this.isDead = false;

        if (angle !== null && angle !== undefined) {
            this.angle = angle;
        } else if (target) {
            this.angle = Math.atan2(target.y - y, target.x - x);
        } else {
            this.angle = 0;
        }
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
    }
}