export class Entity {
    constructor(x, y, angle = 0, isDead = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.isDead = isDead;
    }
}

export class DestructibleEntity extends Entity {
    constructor(x, y, angle = 0, maxHealth = 1, health = maxHealth, isDead = false) {
        super(x, y, angle, isDead);
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
}