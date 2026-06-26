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
        this.shape = null;
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
}
