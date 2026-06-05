import { SeparationEngine } from "../../Libraries/Motion/SeparationEngine.js";

const defaultEngine = new SeparationEngine();

export class Separation {
    constructor(engine = defaultEngine) {
        this._engine = engine;
        this.x = 0;
        this.y = 0;
        this.pushX = 0;
        this.pushY = 0;
    }

    update(entity, spatialFrame) {
        const acc = this._engine.compute(entity, spatialFrame.getNeighbors(entity));
        this.x = acc.x;
        this.y = acc.y;
        this.pushX = acc.pushX;
        this.pushY = acc.pushY;
    }
}
