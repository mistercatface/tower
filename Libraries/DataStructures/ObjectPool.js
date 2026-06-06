export class ObjectPool {
    constructor(createFn, initialSize = 0) {
        this.createFn = createFn;
        this.pool = [];
        this.initialSize = initialSize;
    }
    initPool() {
        if (this.pool.length === 0 && this.createFn)
            for (let i = 0; i < this.initialSize; i++) {
                const obj = this.createFn();
                obj._inPool = true;
                this.pool.push(obj);
            }
    }
    acquire(...args) {
        this.initPool();
        let obj;
        if (this.pool.length > 0) obj = this.pool.pop();
        else obj = this.createFn();
        obj._inPool = false;
        obj.reset(...args);
        return obj;
    }
    release(obj) {
        if (obj && !obj._inPool) {
            obj._inPool = true;
            this.pool.push(obj);
        }
    }
}
