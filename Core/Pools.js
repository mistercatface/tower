class ObjectPool {
    constructor(createFn, initialSize = 0) {
        this.createFn = createFn;
        this.pool = [];
        this.initialSize = initialSize;
    }

    initPool() {
        if (this.pool.length === 0 && this.createFn) {
            for (let i = 0; i < this.initialSize; i++) {
                this.pool.push(this.createFn());
            }
        }
    }

    acquire(...args) {
        this.initPool();
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        obj.reset(...args);
        return obj;
    }

    release(obj) {
        if (obj && !this.pool.includes(obj)) {
            this.pool.push(obj);
        }
    }
}

export const Pools = {
    projectiles: new ObjectPool(null, 100),
    // To pool walls/enemies later, simply uncomment these and register their factory functions:
    // enemies: new ObjectPool(null, 20),
    // walls: new ObjectPool(null, 200),
};
