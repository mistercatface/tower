export class GhostTrail {
    constructor(config = {}) {
        this.history = [];
        this.length = config.length ?? 5;
        this.alpha = config.alpha ?? 0.3;
        this.shrink = config.shrink !== undefined ? config.shrink : true;
        this.minDistance = config.minDistance ?? 2;
        this.lifetime = config.lifetime ?? 250; // lifetime of each trail point in ms
    }

    update(dt, x, y, angle) {
        // Increment age of all existing points by game delta time (dt)
        for (const pt of this.history) {
            pt.age += dt;
        }

        // Remove expired points
        this.history = this.history.filter(pt => pt.age < this.lifetime);

        const lastPoint = this.history[this.history.length - 1];
        const dist = lastPoint ? Math.hypot(x - lastPoint.x, y - lastPoint.y) : Infinity;

        if (dist >= this.minDistance) {
            this.history.push({ x, y, angle, age: 0 });

            while (this.history.length > this.length) {
                this.history.shift();
            }
        }
    }

    render(ctx, cache, cacheKey, generateFn, ...generateArgs) {
        if (this.history.length === 0) return;

        const cachedSprite = cache.get(cacheKey, generateFn, ...generateArgs);
        const img = cachedSprite.offCanvas || cachedSprite;
        const cx = cachedSprite.cx !== undefined ? cachedSprite.cx : img.width / 2;
        const cy = cachedSprite.cy !== undefined ? cachedSprite.cy : img.height / 2;

        ctx.save();
        for (let i = 0; i < this.history.length; i++) {
            const pt = this.history[i];
            const ageRatio = Math.max(0, 1 - pt.age / this.lifetime);
            
            // Calculate alpha based purely on remaining lifetime (avoiding double-fading)
            const alpha = ageRatio * this.alpha;

            if (alpha <= 0.01) continue;

            ctx.globalAlpha = alpha;
            ctx.save();
            ctx.translate(pt.x, pt.y);
            if (pt.angle !== 0) {
                ctx.rotate(pt.angle);
            }
            if (this.shrink) {
                const scale = 0.4 + 0.6 * ageRatio;
                ctx.scale(scale, scale);
            }
            ctx.drawImage(img, -cx, -cy);
            ctx.restore();
        }
        ctx.restore();
    }

    reset() {
        this.history = [];
    }
}
