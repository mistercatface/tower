/** Map with LRU eviction using insertion order (delete + re-set on access). */
export class LruMap {
    /**
     * @param {number} [maxSize]
     * @param {{ onEvict?: (key: any, value: any) => void }} [options]
     */
    constructor(maxSize = Infinity, options = {}) {
        this.maxSize = maxSize;
        this.onEvict = options.onEvict ?? null;
        this._map = new Map();
        this._head = null;
        this._tail = null;
    }
    get size() {
        return this._map.size;
    }
    has(key) {
        return this._map.has(key);
    }
    peek(key) {
        return this._map.get(key)?.value;
    }
    get(key) {
        const node = this._map.get(key);
        if (node === undefined) return undefined;
        this._touch(node);
        return node.value;
    }
    set(key, value) {
        let node = this._map.get(key);
        if (node !== undefined) {
            node.value = value;
            this._touch(node);
            return value;
        }
        if (this.maxSize !== Infinity && this._map.size >= this.maxSize) {
            const oldest = this._head;
            if (oldest) {
                this._removeNode(oldest);
                this._map.delete(oldest.key);
                this.onEvict?.(oldest.key, oldest.value);
            }
        }
        node = { key, value, prev: null, next: null };
        this._map.set(key, node);
        this._appendNode(node);
        return value;
    }
    delete(key) {
        const node = this._map.get(key);
        if (node !== undefined) {
            this._removeNode(node);
            this._map.delete(key);
            return true;
        }
        return false;
    }
    clear() {
        this._map.clear();
        this._head = null;
        this._tail = null;
    }
    *keys() {
        let curr = this._head;
        while (curr) {
            yield curr.key;
            curr = curr.next;
        }
    }
    *values() {
        let curr = this._head;
        while (curr) {
            yield curr.value;
            curr = curr.next;
        }
    }
    *entries() {
        let curr = this._head;
        while (curr) {
            yield [curr.key, curr.value];
            curr = curr.next;
        }
    }
    _removeNode(node) {
        if (node.prev) node.prev.next = node.next;
        else this._head = node.next;
        if (node.next) node.next.prev = node.prev;
        else this._tail = node.prev;
    }
    _appendNode(node) {
        node.prev = this._tail;
        node.next = null;
        if (this._tail) this._tail.next = node;
        this._tail = node;
        if (!this._head) this._head = node;
    }
    _touch(node) {
        if (node === this._tail) return;
        this._removeNode(node);
        this._appendNode(node);
    }
}
