let nextEntityId = 1;

export class Entity {
    constructor(x, y, angle = 0, isDead = false) {
        this.id = nextEntityId++;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.isDead = isDead;
        this.zIndex = 0;
    }

    reset(x, y, angle = 0, isDead = false) {
        this.id = nextEntityId++;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.isDead = isDead;
        this.zIndex = 0;
    }

    render(ctx, ...caches) {
    }

    getBoundingRadius() {
        return this.radius || 0;
    }

    isVisible(viewport) {
        if (!viewport) return true;
        return viewport.isVisible(this.x, this.y, this.getBoundingRadius());
    }

    renderCachedSprite(ctx, cache, cacheKey, generateFn, ...generateArgs) {
        const cachedSprite = cache.get(cacheKey, generateFn, ...generateArgs);
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.angle !== 0) {
            ctx.rotate(this.angle);
        }
        const img = cachedSprite.offCanvas || cachedSprite;
        const cx = cachedSprite.cx !== undefined ? cachedSprite.cx : img.width / 2;
        const cy = cachedSprite.cy !== undefined ? cachedSprite.cy : img.height / 2;
        ctx.drawImage(img, -cx, -cy);
        ctx.restore();
        return cachedSprite;
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