export class SpriteCache {
    constructor() {
        this.cache = new Map();
    }

    get(key, generateFn) {
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = generateFn();
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    clear() {
        this.cache.clear();
    }
}